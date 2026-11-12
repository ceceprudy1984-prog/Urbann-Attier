-- Midtrans Snap: persist order/payment state and process server-verified notifications.
-- Apply only to the dedicated Urbann Attier Supabase project.
begin;

alter table public.inventory
  add column if not exists reserved_quantity integer not null default 0;
alter table public.orders
  add column if not exists stock_reserved_at timestamptz,
  add column if not exists stock_deducted_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'inventory_reserved_quantity_check'
      and conrelid = 'public.inventory'::regclass
  ) then
    alter table public.inventory
      add constraint inventory_reserved_quantity_check
      check (reserved_quantity >= 0 and (reserved_quantity = 0 or (stock_quantity is not null and reserved_quantity <= stock_quantity)));
  end if;
end;
$$;

create or replace function private.guard_inventory_against_holds()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_stock_decrease integer;
  v_reservation_release integer;
begin
  if new.reserved_quantity < 0 then
    raise exception 'Jumlah stok yang dicadangkan tidak boleh negatif.';
  end if;
  if new.reserved_quantity > 0 and (new.stock_quantity is null or new.reserved_quantity > new.stock_quantity) then
    raise exception 'Stok fisik tidak boleh diubah di bawah jumlah yang sedang dicadangkan.';
  end if;
  if tg_op = 'UPDATE' and old.stock_quantity is not null and new.stock_quantity is not null
     and new.stock_quantity < old.stock_quantity then
    v_stock_decrease := old.stock_quantity - new.stock_quantity;
    v_reservation_release := greatest(old.reserved_quantity - new.reserved_quantity, 0);
    if v_stock_decrease > (old.stock_quantity - old.reserved_quantity + v_reservation_release) then
      raise exception 'Stok tersebut sedang dicadangkan untuk pesanan yang menunggu pembayaran.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_guard_holds on public.inventory;
create trigger inventory_guard_holds
before insert or update of stock_quantity, reserved_quantity on public.inventory
for each row execute function private.guard_inventory_against_holds();

create or replace function private.prevent_delete_reserved_inventory()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if old.reserved_quantity > 0 then
    raise exception 'Kombinasi warna dan ukuran ini sedang dicadangkan untuk pembayaran. Batalkan atau selesaikan pesanan terlebih dahulu.';
  end if;
  return old;
end;
$$;

drop trigger if exists inventory_prevent_delete_reserved on public.inventory;
create trigger inventory_prevent_delete_reserved
before delete on public.inventory
for each row execute function private.prevent_delete_reserved_inventory();

create or replace function private.restore_stock_when_order_cancelled()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_item record;
  v_product_id bigint;
begin
  if old.status is distinct from 'cancelled' and new.status = 'cancelled' then
    for v_item in
      select oi.variant_id, oi.size_id, sum(oi.quantity)::integer as quantity
      from public.order_items oi
      where oi.order_id = new.id
      group by oi.variant_id, oi.size_id
      order by oi.variant_id, oi.size_id
    loop
      if v_item.variant_id is null or v_item.size_id is null then
        raise exception 'Stok tidak dapat dipulihkan karena varian atau ukuran pada rincian pesanan sudah tidak tersedia.';
      end if;
      select product_id into v_product_id from public.product_variants where id = v_item.variant_id;
      if v_product_id is null then
        raise exception 'Stok tidak dapat dipulihkan karena varian produk sudah dihapus.';
      end if;

      if new.payment_method = 'midtrans_snap' and old.stock_reserved_at is not null and old.stock_deducted_at is null then
        update public.inventory
        set reserved_quantity = reserved_quantity - v_item.quantity, updated_at = now()
        where variant_id = v_item.variant_id and size_id = v_item.size_id
          and reserved_quantity >= v_item.quantity;
        if not found then raise exception 'Reservasi stok tidak dapat dilepas dengan aman.'; end if;
      elsif new.payment_method <> 'midtrans_snap' or old.stock_deducted_at is not null then
        insert into public.inventory as existing_inventory (product_id, variant_id, size_id, stock_quantity)
        values (v_product_id, v_item.variant_id, v_item.size_id, v_item.quantity)
        on conflict (variant_id, size_id) do update
          set stock_quantity = coalesce(existing_inventory.stock_quantity, 0) + excluded.stock_quantity,
              updated_at = now();
      end if;
    end loop;
    if new.payment_method = 'midtrans_snap' and old.stock_reserved_at is not null and old.stock_deducted_at is null then
      update public.orders set stock_reserved_at = null where id = new.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_restore_stock_on_cancel on public.orders;
create trigger orders_restore_stock_on_cancel
after update of status on public.orders
for each row execute function private.restore_stock_when_order_cancelled();

create unique index if not exists payments_midtrans_order_uidx
  on public.payments (order_id)
  where provider = 'midtrans';

create or replace function public.prepare_midtrans_order(
  p_checkout_token uuid,
  p_customer jsonb,
  p_items jsonb,
  p_shipping jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_result jsonb;
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_stock_item record;
begin
  v_result := public.create_whatsapp_order_with_shipping(
    p_checkout_token, p_customer, p_items, p_shipping
  );

  select * into v_order
  from public.orders
  where checkout_token = p_checkout_token
  for update;

  if not found or v_order.status = 'cancelled' then
    raise exception 'Pesanan ini sudah dibatalkan. Muat ulang checkout untuk membuat pesanan baru.';
  end if;
  if v_order.shipping_fee is null or v_order.total_amount is null then
    raise exception 'Tarif pengiriman atau total pesanan belum tersedia.';
  end if;

  -- Convert the legacy RPC's transactional stock decrement into a temporary hold.
  if v_order.stock_reserved_at is null and v_order.stock_deducted_at is null
     and v_order.payment_status <> 'paid' then
    for v_stock_item in
      select variant_id, size_id, sum(quantity)::integer as quantity
      from public.order_items
      where order_id = v_order.id
      group by variant_id, size_id
      order by variant_id, size_id
    loop
      update public.inventory
      set stock_quantity = stock_quantity + v_stock_item.quantity,
          reserved_quantity = reserved_quantity + v_stock_item.quantity,
          updated_at = now()
      where variant_id = v_stock_item.variant_id and size_id = v_stock_item.size_id;
      if not found then raise exception 'Stok pesanan tidak dapat dicadangkan. Muat ulang checkout.'; end if;
    end loop;
    update public.orders set stock_reserved_at = now() where id = v_order.id returning * into v_order;
  end if;

  update public.orders
  set payment_method = 'midtrans_snap',
      status = case when status in ('needs_confirmation', 'awaiting_payment') then 'awaiting_payment' else status end,
      payment_status = case when payment_status in ('unpaid', 'waiting_confirmation') then 'waiting_confirmation' else payment_status end,
      shipping_status = 'ready_to_ship',
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  select * into v_payment
  from public.payments
  where order_id = v_order.id and provider = 'midtrans'
  for update;

  if not found then
    insert into public.payments (order_id, provider, status, amount)
    values (v_order.id, 'midtrans', 'pending', v_order.total_amount)
    returning * into v_payment;
  elsif v_payment.amount <> v_order.total_amount then
    raise exception 'Nilai pembayaran pesanan berubah. Buat checkout baru.';
  end if;

  return v_result || jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'amount', v_order.total_amount,
    'payment_id', v_payment.id,
    'payment_reference', v_payment.payment_reference,
    'payment_status', v_payment.status
  );
end;
$$;

create or replace function public.save_midtrans_snap_token(
  p_payment_id uuid,
  p_snap_token text,
  p_redirect_url text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_snap_token is null or length(p_snap_token) > 500
     or p_redirect_url is null or length(p_redirect_url) > 2000 then
    raise exception 'Respons pembayaran Midtrans tidak valid.';
  end if;

  update public.payments
  set payment_reference = p_snap_token,
      updated_at = now()
  where id = p_payment_id
    and provider = 'midtrans'
    and status = 'pending';

  if not found then
    raise exception 'Data pembayaran tidak ditemukan atau sudah diproses.';
  end if;
end;
$$;

create or replace function public.apply_midtrans_notification(
  p_order_number text,
  p_transaction_id text,
  p_transaction_status text,
  p_fraud_status text,
  p_payment_type text,
  p_gross_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_next_payment text;
  v_is_paid boolean := false;
  v_is_terminal_failure boolean := false;
  v_stock_item record;
begin
  if coalesce(p_order_number, '') = '' or coalesce(p_transaction_id, '') = ''
     or p_gross_amount is null or p_gross_amount < 0 then
    raise exception 'Notifikasi pembayaran tidak lengkap.';
  end if;

  select * into v_order
  from public.orders
  where order_number = p_order_number and payment_method = 'midtrans_snap'
  for update;
  if not found then
    raise exception 'Pesanan Midtrans tidak ditemukan.';
  end if;
  if p_gross_amount <> v_order.total_amount then
    raise exception 'Nominal notifikasi berbeda dari total pesanan.';
  end if;

  select * into v_payment
  from public.payments
  where order_id = v_order.id and provider = 'midtrans'
  for update;
  if not found then
    raise exception 'Catatan pembayaran Midtrans tidak ditemukan.';
  end if;

  v_is_paid := p_transaction_status = 'settlement'
    or (p_transaction_status = 'capture' and p_fraud_status = 'accept');
  v_is_terminal_failure := p_transaction_status in ('deny', 'cancel', 'expire');
  v_next_payment := case
    when v_is_paid then 'paid'
    when p_transaction_status = 'expire' then 'expired'
    when v_is_terminal_failure then 'failed'
    else 'pending'
  end;

  -- Prevent delayed or duplicate notifications from downgrading a completed payment.
  if v_payment.status = 'paid' and not v_is_paid then
    return jsonb_build_object(
      'order_number', v_order.order_number,
      'payment_status', 'paid',
      'order_status', v_order.status
    );
  end if;
  if v_payment.status in ('failed', 'expired') and p_transaction_status = 'pending' then
    return jsonb_build_object(
      'order_number', v_order.order_number,
      'payment_status', v_payment.status,
      'order_status', v_order.status
    );
  end if;

  if v_is_paid and v_order.status <> 'cancelled' and v_order.stock_deducted_at is null then
    if v_order.stock_reserved_at is null then
      raise exception 'Reservasi stok pesanan tidak ditemukan.';
    end if;
    for v_stock_item in
      select variant_id, size_id, sum(quantity)::integer as quantity
      from public.order_items
      where order_id = v_order.id
      group by variant_id, size_id
      order by variant_id, size_id
    loop
      update public.inventory
      set stock_quantity = stock_quantity - v_stock_item.quantity,
          reserved_quantity = reserved_quantity - v_stock_item.quantity,
          updated_at = now()
      where variant_id = v_stock_item.variant_id and size_id = v_stock_item.size_id
        and stock_quantity >= v_stock_item.quantity
        and reserved_quantity >= v_stock_item.quantity;
      if not found then
        raise exception 'Stok yang dicadangkan tidak cocok. Periksa inventaris sebelum memproses pesanan.';
      end if;
    end loop;
  end if;

  update public.payments
  set status = v_next_payment,
      provider_transaction_id = p_transaction_id,
      payment_method = nullif(p_payment_type, ''),
      paid_at = case when v_is_paid then coalesce(paid_at, now()) else paid_at end,
      updated_at = now()
  where id = v_payment.id;

  if v_is_paid then
    -- A very late success after a cancellation is still recorded as paid for
    -- reconciliation, but the cancelled order is not reopened automatically.
    if v_order.status <> 'cancelled' then
      update public.orders
      set status = 'paid', payment_status = 'paid',
          paid_at = coalesce(paid_at, now()),
          confirmed_at = coalesce(confirmed_at, now()),
          stock_reserved_at = null,
          stock_deducted_at = coalesce(stock_deducted_at, now()),
          updated_at = now()
      where id = v_order.id;
    else
      update public.orders
      set payment_status = 'paid', paid_at = coalesce(paid_at, now()), updated_at = now()
      where id = v_order.id;
    end if;
  elsif v_is_terminal_failure and v_order.status <> 'cancelled' then
    update public.orders
    set status = 'cancelled', payment_status = 'rejected', updated_at = now()
    where id = v_order.id;
  elsif p_transaction_status = 'pending' and v_order.status <> 'cancelled' then
    update public.orders
    set status = 'awaiting_payment', payment_status = 'waiting_confirmation', updated_at = now()
    where id = v_order.id;
  end if;

  return jsonb_build_object(
    'order_number', v_order.order_number,
    'payment_status', v_next_payment,
    'order_status', case when v_is_paid and v_order.status = 'cancelled' then 'cancelled'
      when v_is_paid then 'paid'
      when v_is_terminal_failure then 'cancelled'
      else 'awaiting_payment' end
  );
end;
$$;

revoke all on function public.prepare_midtrans_order(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.save_midtrans_snap_token(uuid, text, text) from public, anon, authenticated;
revoke all on function public.apply_midtrans_notification(text, text, text, text, text, numeric) from public, anon, authenticated;
revoke all on function private.guard_inventory_against_holds() from public, anon, authenticated;
revoke all on function private.prevent_delete_reserved_inventory() from public, anon, authenticated;
revoke all on function private.restore_stock_when_order_cancelled() from public, anon, authenticated;
grant execute on function public.prepare_midtrans_order(uuid, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.save_midtrans_snap_token(uuid, text, text) to service_role;
grant execute on function public.apply_midtrans_notification(text, text, text, text, text, numeric) to service_role;

commit;

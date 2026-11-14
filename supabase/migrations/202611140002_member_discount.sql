-- Diskon member 5% untuk lima kuota pesanan harga ecer.
-- Kuota dicadangkan ketika checkout dan hanya dianggap terpakai setelah pembayaran sukses.
begin;

alter table public.orders
  add column if not exists discount_base_amount bigint not null default 0,
  add column if not exists discount_tokens_remaining smallint;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'orders_discount_base_amount_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders add constraint orders_discount_base_amount_check
      check (discount_base_amount >= 0 and discount_base_amount <= subtotal_amount);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'orders_discount_tokens_remaining_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders add constraint orders_discount_tokens_remaining_check
      check (discount_tokens_remaining is null or discount_tokens_remaining between 0 and 5);
  end if;
end;
$$;

-- Make sure older auth users also have a customer profile row.
insert into public.customer_profiles (user_id, full_name, phone, email_marketing_opt_in,
  email_marketing_opted_in_at, email_marketing_unsubscribed_at)
select u.id,
  left(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), 160),
  left(btrim(coalesce(u.raw_user_meta_data ->> 'phone', '')), 32),
  coalesce(u.raw_user_meta_data ->> 'email_marketing_opt_in', 'false') = 'true',
  case when coalesce(u.raw_user_meta_data ->> 'email_marketing_opt_in', 'false') = 'true' then u.created_at else null end,
  null
from auth.users as u
on conflict (user_id) do nothing;

create index if not exists orders_member_discount_reservation_idx
  on public.orders (customer_id, discount_order_number, payment_status, status)
  where customer_id is not null and discount_order_number is not null;

create or replace function private.refresh_customer_discount_tokens_remaining()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_customer_id uuid := coalesce(new.customer_id, old.customer_id);
  v_active_tokens integer;
begin
  if v_customer_id is null then return new; end if;

  select count(distinct o.discount_order_number)::integer into v_active_tokens
  from public.orders as o
  where o.customer_id = v_customer_id
    and o.discount_order_number between 1 and 5
    and (
      o.payment_status = 'paid'
      or (o.status <> 'cancelled'
        and o.payment_status in ('unpaid', 'waiting_confirmation')
        and o.discount_amount > 0)
    );

  -- Simpan sisa kuota pada pesanan yang statusnya berubah. Invoice pesanan
  -- lama tetap menyimpan sisa kuota saat pesanan tersebut dibuat.
  if new.status = 'cancelled' or new.payment_status in ('rejected', 'refunded') then
    update public.orders as o
    set discount_tokens_remaining = greatest(5 - v_active_tokens, 0)
    where o.id = new.id
      and o.customer_id = v_customer_id
      and o.discount_tokens_remaining is distinct from greatest(5 - v_active_tokens, 0);
  end if;

  return new;
end;
$$;

drop trigger if exists orders_refresh_member_discount_tokens on public.orders;
create trigger orders_refresh_member_discount_tokens
after update of status, payment_status on public.orders
for each row
when (old.status is distinct from new.status or old.payment_status is distinct from new.payment_status)
execute function private.refresh_customer_discount_tokens_remaining();

create or replace function public.create_whatsapp_order_with_shipping(
  p_checkout_token uuid,
  p_customer jsonb,
  p_items jsonb,
  p_shipping jsonb,
  p_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  order_result jsonb;
  order_row public.orders%rowtype;
  existing_order public.orders%rowtype;
  customer_profile public.customer_profiles%rowtype;
  provider_code text;
  provider_name text;
  service_name text;
  shipping_amount bigint;
  destination_id integer;
  package_weight integer;
  customer_email_value text;
  eligible_subtotal bigint := 0;
  member_discount bigint := 0;
  active_tokens integer := 0;
  available_slot smallint;
  remaining_tokens smallint;
  already_existed boolean := false;
  should_calculate_discount boolean := false;
begin
  provider_code := lower(btrim(coalesce(p_shipping->>'provider_code', '')));
  service_name := btrim(coalesce(p_shipping->>'service', ''));

  if provider_code not in ('jnt', 'jne', 'sicepat', 'spx', 'lion') then
    raise exception 'Pilihan ekspedisi tidak valid.';
  end if;
  if service_name = '' or length(service_name) > 120 then
    raise exception 'Layanan ekspedisi tidak valid.';
  end if;
  if coalesce(p_shipping->>'fee', '') !~ '^[0-9]{1,12}$' then
    raise exception 'Tarif pengiriman tidak valid.';
  end if;
  if coalesce(p_shipping->>'destination_id', '') !~ '^[1-9][0-9]{0,11}$' then
    raise exception 'Wilayah tujuan ongkir tidak valid.';
  end if;
  if coalesce(p_shipping->>'weight_grams', '') !~ '^[1-9][0-9]{0,5}$' then
    raise exception 'Berat paket tidak valid.';
  end if;

  shipping_amount := (p_shipping->>'fee')::bigint;
  destination_id := (p_shipping->>'destination_id')::integer;
  package_weight := (p_shipping->>'weight_grams')::integer;
  provider_name := case provider_code
    when 'jnt' then 'J&T Express'
    when 'jne' then 'JNE Express'
    when 'sicepat' then 'SiCepat Ekspres'
    when 'spx' then 'SPX Express'
    when 'lion' then 'Lion Parcel'
  end;

  select * into existing_order
  from public.orders
  where checkout_token = p_checkout_token
  for update;
  already_existed := found;

  order_result := public.create_whatsapp_order(p_checkout_token, p_customer, p_items);

  select * into order_row
  from public.orders
  where checkout_token = p_checkout_token
  for update;
  if not found or order_row.status = 'cancelled' then
    raise exception 'Pesanan tidak dapat diperbarui dengan pilihan pengiriman ini.';
  end if;

  if already_existed and order_row.customer_id is distinct from p_customer_id then
    raise exception 'Status login berubah setelah checkout dibuat. Muat ulang checkout sebelum membayar.';
  end if;
  if not already_existed and order_row.customer_id is not null
     and order_row.customer_id is distinct from p_customer_id then
    raise exception 'Checkout ini sedang digunakan oleh akun lain. Muat ulang checkout.';
  end if;

  if not already_existed and p_customer_id is not null and order_row.customer_id is null then
    select * into customer_profile
    from public.customer_profiles
    where user_id = p_customer_id
    for update;
    if not found then raise exception 'Profil member belum siap. Keluar lalu masuk kembali ke akun Anda.'; end if;

    select u.email into customer_email_value
    from auth.users as u
    where u.id = p_customer_id;
    if customer_email_value is null then raise exception 'Akun member tidak ditemukan.'; end if;

    update public.orders
    set customer_id = p_customer_id,
        customer_email = customer_email_value,
        updated_at = now()
    where id = order_row.id
    returning * into order_row;
    should_calculate_discount := true;
  end if;

  update public.orders
  set shipping_fee = shipping_amount,
      shipping_provider = provider_name,
      shipping_service = service_name,
      shipping_destination_id = destination_id,
      shipping_quote_weight_grams = package_weight,
      shipping_quote_created_at = now(),
      shipping_status = 'waiting_quote',
      total_amount = subtotal_amount - discount_amount + packaging_fee + shipping_amount,
      updated_at = now()
  where id = order_row.id
  returning * into order_row;

  if should_calculate_discount and p_customer_id is not null then
    select coalesce(sum(oi.line_total), 0)::bigint into eligible_subtotal
    from public.order_items as oi
    where oi.order_id = order_row.id
      and oi.purchase_mode = 'ecer'
      and oi.pricing_tier = 'ecer';

    select count(distinct o.discount_order_number)::integer into active_tokens
    from public.orders as o
    where o.customer_id = p_customer_id
      and o.id <> order_row.id
      and o.discount_order_number between 1 and 5
      and (
        o.payment_status = 'paid'
        or (o.status <> 'cancelled'
          and o.payment_status in ('unpaid', 'waiting_confirmation')
          and o.discount_amount > 0)
      );

    if eligible_subtotal > 0 and active_tokens < 5 then
      select slot_number::smallint into available_slot
      from pg_catalog.generate_series(1, 5) as slot_number
      where not exists (
        select 1 from public.orders as o
        where o.customer_id = p_customer_id
          and o.id <> order_row.id
          and o.discount_order_number = slot_number
          and (
            o.payment_status = 'paid'
            or (o.status <> 'cancelled'
              and o.payment_status in ('unpaid', 'waiting_confirmation')
              and o.discount_amount > 0)
          )
      )
      order by slot_number
      limit 1;
      member_discount := pg_catalog.round(eligible_subtotal * 0.05)::bigint;
      if available_slot is not null and member_discount > 0 then
        update public.orders
        set discount_base_amount = eligible_subtotal,
            discount_amount = member_discount,
            discount_percent = 5,
            discount_order_number = available_slot
        where id = order_row.id
        returning * into order_row;
      end if;
    end if;

    select count(distinct o.discount_order_number)::integer into active_tokens
    from public.orders as o
    where o.customer_id = p_customer_id
      and o.discount_order_number between 1 and 5
      and (
        o.payment_status = 'paid'
        or (o.status <> 'cancelled'
          and o.payment_status in ('unpaid', 'waiting_confirmation')
          and o.discount_amount > 0)
      );
    remaining_tokens := greatest(5 - active_tokens, 0)::smallint;
    update public.orders
    set discount_tokens_remaining = remaining_tokens,
        total_amount = subtotal_amount - discount_amount + packaging_fee + shipping_amount
    where id = order_row.id
    returning * into order_row;
  end if;

  return order_result || pg_catalog.jsonb_build_object(
    'order_id', order_row.id,
    'order_number', order_row.order_number,
    'subtotal_amount', order_row.subtotal_amount,
    'discount_base_amount', order_row.discount_base_amount,
    'discount_amount', order_row.discount_amount,
    'discount_percent', order_row.discount_percent,
    'discount_order_number', order_row.discount_order_number,
    'discount_tokens_remaining', order_row.discount_tokens_remaining,
    'packaging_fee', order_row.packaging_fee,
    'shipping_fee', order_row.shipping_fee,
    'total_with_shipping', order_row.total_amount
  );
end;
$$;

create or replace function public.prepare_midtrans_order(
  p_checkout_token uuid,
  p_customer jsonb,
  p_items jsonb,
  p_shipping jsonb,
  p_customer_id uuid
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
    p_checkout_token, p_customer, p_items, p_shipping, p_customer_id
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
    update public.orders set stock_reserved_at = now() where id = v_order.id;
  end if;

  update public.orders
  set payment_method = 'midtrans_snap',
      status = case when status in ('needs_confirmation', 'awaiting_payment') then 'awaiting_payment' else status end,
      payment_status = case when payment_status in ('unpaid', 'waiting_confirmation') then 'waiting_confirmation' else payment_status end,
      shipping_status = 'ready_to_ship',
      updated_at = now()
  where id = v_order.id;

  select * into v_order from public.orders where id = v_order.id;
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

  return v_result || pg_catalog.jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'amount', v_order.total_amount,
    'payment_id', v_payment.id,
    'payment_reference', v_payment.payment_reference,
    'payment_status', v_payment.status,
    'customer_id', v_order.customer_id,
    'discount_base_amount', v_order.discount_base_amount,
    'discount_amount', v_order.discount_amount,
    'discount_percent', v_order.discount_percent,
    'discount_order_number', v_order.discount_order_number,
    'discount_tokens_remaining', v_order.discount_tokens_remaining
  );
end;
$$;

revoke all on function public.create_whatsapp_order_with_shipping(uuid, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.prepare_midtrans_order(uuid, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.prepare_midtrans_order(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.create_whatsapp_order_with_shipping(uuid, jsonb, jsonb, jsonb) from service_role;
revoke all on function private.refresh_customer_discount_tokens_remaining() from public, anon, authenticated;
grant execute on function public.create_whatsapp_order_with_shipping(uuid, jsonb, jsonb, jsonb, uuid) to service_role;
grant execute on function public.prepare_midtrans_order(uuid, jsonb, jsonb, jsonb, uuid) to service_role;

commit;

-- Catatan admin untuk konfirmasi pesanan/pembayaran dan pemulihan stok saat pembatalan.
begin;

alter table public.orders
  add column if not exists confirmed_by uuid references auth.users (id) on delete set null,
  add column if not exists confirmed_by_email text,
  add column if not exists paid_confirmed_by uuid references auth.users (id) on delete set null,
  add column if not exists paid_confirmed_by_email text;

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
    ) then
      execute 'alter publication supabase_realtime add table public.orders';
    end if;
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_items'
    ) then
      execute 'alter publication supabase_realtime add table public.order_items';
    end if;
  end if;
end;
$$;

create or replace function private.prevent_reopening_cancelled_order()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'Pesanan yang sudah dibatalkan tidak dapat dibuka kembali. Buat pesanan baru bila diperlukan.';
  end if;
  return new;
end;
$$;

create or replace function private.restore_stock_when_order_cancelled()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_item record;
  v_product_id bigint;
  v_size_product_id bigint;
begin
  if old.status is distinct from 'cancelled' and new.status = 'cancelled' then
    for v_item in
      select variant_id, size_id, quantity
      from public.order_items
      where order_id = new.id
      for update
    loop
      if v_item.variant_id is null or v_item.size_id is null then
        raise exception 'Stok tidak dapat dipulihkan karena varian atau ukuran pada rincian pesanan sudah tidak tersedia.';
      end if;

      select product_id into v_product_id
      from public.product_variants
      where id = v_item.variant_id;
      select product_id into v_size_product_id
      from public.product_sizes
      where id = v_item.size_id;

      if v_product_id is null or v_size_product_id is distinct from v_product_id then
        raise exception 'Stok tidak dapat dipulihkan karena data varian atau ukuran sudah berubah.';
      end if;

      insert into public.inventory as existing_inventory (product_id, variant_id, size_id, stock_quantity)
      values (v_product_id, v_item.variant_id, v_item.size_id, v_item.quantity)
      on conflict (variant_id, size_id) do update
        set stock_quantity = coalesce(existing_inventory.stock_quantity, 0) + excluded.stock_quantity,
            updated_at = now();
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_prevent_reopen_cancelled on public.orders;
create trigger orders_prevent_reopen_cancelled
before update of status on public.orders
for each row execute function private.prevent_reopening_cancelled_order();

drop trigger if exists orders_restore_stock_on_cancel on public.orders;
create trigger orders_restore_stock_on_cancel
after update of status on public.orders
for each row execute function private.restore_stock_when_order_cancelled();

revoke all on function private.prevent_reopening_cancelled_order() from public, anon, authenticated;
revoke all on function private.restore_stock_when_order_cancelled() from public, anon, authenticated;

commit;

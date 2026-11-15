-- Menampilkan peringkat produk dari jumlah barang pada pesanan yang lunas.
-- Fungsi hanya mengembalikan ID produk aktif, bukan data pelanggan atau pesanan.
begin;

create or replace function public.storefront_bestseller_product_ids(p_limit integer default 3)
returns table (product_id bigint)
language sql
stable
security definer
set search_path = ''
as $function$
  select oi.product_id
  from public.order_items as oi
  join public.orders as o on o.id = oi.order_id
  join public.products as p on p.id = oi.product_id
  where o.payment_status = 'paid'
    and p.is_active = true
  group by oi.product_id, p.created_at
  order by sum(oi.quantity) desc, p.created_at desc, oi.product_id desc
  limit greatest(1, least(coalesce(p_limit, 3), 6));
$function$;

revoke all on function public.storefront_bestseller_product_ids(integer) from public, anon;
grant execute on function public.storefront_bestseller_product_ids(integer) to anon, authenticated;

commit;

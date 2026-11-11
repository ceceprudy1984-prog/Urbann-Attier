begin;

alter table public.orders
  add column if not exists shipping_destination_id integer,
  add column if not exists shipping_quote_weight_grams integer,
  add column if not exists shipping_quote_created_at timestamptz;

alter table public.orders
  drop constraint if exists orders_shipping_quote_weight_check;

alter table public.orders
  add constraint orders_shipping_quote_weight_check
  check (shipping_quote_weight_grams is null or shipping_quote_weight_grams > 0);

create or replace function public.create_whatsapp_order_with_shipping(
  p_checkout_token uuid,
  p_customer jsonb,
  p_items jsonb,
  p_shipping jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_result jsonb;
  order_row public.orders%rowtype;
  provider_code text;
  provider_name text;
  service_name text;
  shipping_amount bigint;
  destination_id integer;
  package_weight integer;
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

  -- Memanggil fungsi checkout lama agar pemeriksaan harga dan stok tetap dilakukan
  -- dalam transaksi database yang sama dengan penyimpanan pilihan ongkir.
  order_result := public.create_whatsapp_order(p_checkout_token, p_customer, p_items);

  select * into order_row
  from public.orders
  where checkout_token = p_checkout_token
  for update;

  if not found or order_row.status = 'cancelled' then
    raise exception 'Pesanan tidak dapat diperbarui dengan pilihan pengiriman ini.';
  end if;

  update public.orders
  set shipping_fee = shipping_amount,
      shipping_provider = provider_name,
      shipping_service = service_name,
      shipping_destination_id = destination_id,
      shipping_quote_weight_grams = package_weight,
      shipping_quote_created_at = now(),
      shipping_status = 'waiting_quote',
      total_amount = subtotal_amount + packaging_fee + shipping_amount,
      updated_at = now()
  where id = order_row.id
  returning * into order_row;

  return order_result || jsonb_build_object(
    'shipping_fee', order_row.shipping_fee,
    'shipping_provider', order_row.shipping_provider,
    'shipping_service', order_row.shipping_service,
    'total_with_shipping', order_row.total_amount
  );
end;
$$;

revoke all on function public.create_whatsapp_order_with_shipping(uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.create_whatsapp_order_with_shipping(uuid, jsonb, jsonb, jsonb) to anon, authenticated;

commit;

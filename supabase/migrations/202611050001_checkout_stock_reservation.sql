-- Checkout WhatsApp: validasi, pencatatan pesanan, dan pengurangan stok secara atomik.
-- Jalankan sekali di SQL Editor project Supabase Urbann Attier.
begin;

alter table public.orders
  add column if not exists checkout_token uuid,
  add column if not exists checkout_signature text;

create unique index if not exists orders_checkout_token_uidx
  on public.orders (checkout_token)
  where checkout_token is not null;

create or replace function public.create_whatsapp_order(
  p_checkout_token uuid,
  p_customer jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  cart_item jsonb;
  product_row public.products%rowtype;
  selected_variant public.product_variants%rowtype;
  selected_size public.product_sizes%rowtype;
  color_row public.product_variants%rowtype;
  size_row public.product_sizes%rowtype;
  existing_order public.orders%rowtype;
  v_order_id uuid;
  v_order_number text;
  v_request_signature text;
  v_customer_name text;
  v_customer_phone text;
  v_address_line text;
  v_customer_province text;
  v_customer_city text;
  v_customer_district text;
  v_customer_postal_code text;
  v_customer_note text;
  item_product_id bigint;
  item_quantity integer;
  color_count integer;
  size_count integer;
  quantity_per_variant integer;
  quantity_per_size integer;
  available_quantity integer;
  v_unit_price bigint;
  v_line_subtotal bigint;
  v_total_subtotal bigint := 0;
  packaging_amount bigint;
  v_pricing_name text;
begin
  if p_checkout_token is null then
    raise exception 'Token checkout tidak tersedia. Muat ulang halaman checkout.';
  end if;
  if jsonb_typeof(p_customer) is distinct from 'object' then
    raise exception 'Data penerima tidak valid.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Keranjang kosong atau format keranjang tidak valid.';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Keranjang kosong atau jumlah jenis produk melebihi batas.';
  end if;

  v_customer_name := btrim(coalesce(p_customer->>'name', ''));
  v_customer_phone := btrim(coalesce(p_customer->>'phone', ''));
  v_address_line := btrim(coalesce(p_customer->>'address', ''));
  v_customer_province := btrim(coalesce(p_customer->>'province', ''));
  v_customer_city := btrim(coalesce(p_customer->>'city', ''));
  v_customer_district := btrim(coalesce(p_customer->>'district', ''));
  v_customer_postal_code := btrim(coalesce(p_customer->>'postal_code', ''));
  v_customer_note := nullif(btrim(coalesce(p_customer->>'note', '')), '');

  if v_customer_name = '' or v_customer_phone = '' or v_address_line = ''
     or v_customer_province = '' or v_customer_city = ''
     or v_customer_district = '' or v_customer_postal_code = '' then
    raise exception 'Lengkapi seluruh data penerima sebelum mengirim pesanan.';
  end if;
  if length(v_customer_name) > 160 or length(v_customer_phone) > 32
     or length(v_address_line) > 1000 or length(v_customer_province) > 120
     or length(v_customer_city) > 120 or length(v_customer_district) > 120
     or length(v_customer_postal_code) > 20 or length(coalesce(v_customer_note, '')) > 1000 then
    raise exception 'Ada data penerima yang terlalu panjang.';
  end if;

  v_request_signature := md5(p_customer::text || E'\n' || p_items::text);
  select * into existing_order
  from public.orders
  where checkout_token = p_checkout_token;
  if found then
    if existing_order.checkout_signature is distinct from v_request_signature then
      raise exception 'Token checkout sudah dipakai untuk keranjang lain. Muat ulang halaman checkout.';
    end if;
    return jsonb_build_object(
      'order_id', existing_order.id,
      'order_number', existing_order.order_number,
      'subtotal_amount', existing_order.subtotal_amount,
      'packaging_fee', existing_order.packaging_fee,
      'total_before_shipping', existing_order.total_amount
    );
  end if;

  select packaging_fee into packaging_amount
  from public.store_public_settings
  where id = 1;
  packaging_amount := coalesce(packaging_amount, 5000);

  v_order_number := 'UA-' || to_char(clock_timestamp() at time zone 'utc', 'YYMMDD')
    || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.orders (
    order_number, checkout_token, checkout_signature,
    customer_name, customer_phone, address_line, province, city, district,
    postal_code, customer_note, subtotal_amount, packaging_fee, total_amount
  ) values (
    v_order_number, p_checkout_token, v_request_signature,
    v_customer_name, v_customer_phone, v_address_line, v_customer_province, v_customer_city,
    v_customer_district, v_customer_postal_code, v_customer_note, 0,
    packaging_amount, packaging_amount
  ) returning id into v_order_id;

  for cart_item in
    select item.value
    from jsonb_array_elements(p_items) as item(value)
    order by (item.value->>'product_id')::bigint,
      coalesce(item.value->>'mode', ''),
      lower(coalesce(item.value->>'color', '')),
      lower(coalesce(item.value->>'size', ''))
  loop
    if jsonb_typeof(cart_item) is distinct from 'object'
       or coalesce(cart_item->>'product_id', '') !~ '^[0-9]+$'
       or coalesce(cart_item->>'quantity', '') !~ '^[1-9][0-9]{0,3}$' then
      raise exception 'Ada produk atau jumlah di keranjang yang tidak valid.';
    end if;

    item_product_id := (cart_item->>'product_id')::bigint;
    item_quantity := (cart_item->>'quantity')::integer;
    if item_quantity > 1000 then
      raise exception 'Jumlah per jenis produk tidak boleh lebih dari 1000 pcs.';
    end if;

    select * into product_row
    from public.products
    where id = item_product_id and is_active = true;
    if not found then
      raise exception 'Salah satu produk di keranjang sudah tidak tersedia.';
    end if;

    select * into selected_variant
    from public.product_variants
    where product_id = item_product_id
      and lower(color_name) = lower(btrim(coalesce(cart_item->>'color', '')))
      and is_active = true
    order by sort_order, id
    limit 1;
    if not found then
      raise exception 'Warna produk % sudah tidak tersedia.', product_row.name;
    end if;

    select * into selected_size
    from public.product_sizes
    where product_id = item_product_id
      and lower(size_name) = lower(btrim(coalesce(cart_item->>'size', '')))
    order by sort_order, id
    limit 1;
    if not found then
      raise exception 'Ukuran produk % sudah tidak tersedia.', product_row.name;
    end if;

    if item_quantity >= product_row.wholesale_min_qty then
      v_pricing_name := 'grosir';
      v_unit_price := product_row.price_wholesale;
    elsif cart_item->>'mode' = 'ecer' then
      v_pricing_name := 'ecer';
      v_unit_price := product_row.price_retail;
    elsif cart_item->>'mode' in ('seri-warna', 'seri-ukuran') then
      v_pricing_name := 'serian';
      v_unit_price := product_row.price_series;
    else
      raise exception 'Jenis pembelian untuk produk % tidak dikenali.', product_row.name;
    end if;
    if v_unit_price is null then
      raise exception 'Harga % untuk produk % belum diisi.', v_pricing_name, product_row.name;
    end if;

    if cart_item->>'mode' = 'ecer' then
      update public.inventory
      set stock_quantity = stock_quantity - item_quantity,
          updated_at = now()
      where variant_id = selected_variant.id
        and size_id = selected_size.id
        and stock_quantity is not null
        and stock_quantity >= item_quantity
      returning stock_quantity into available_quantity;
      if not found then
        select stock_quantity into available_quantity
        from public.inventory
        where variant_id = selected_variant.id and size_id = selected_size.id;
        if not found or available_quantity is null then
          raise exception 'Stok % ukuran % belum diisi. Hubungi admin toko.', selected_variant.color_name, selected_size.size_name;
        end if;
        raise exception 'Stok % ukuran % hanya tersisa % pcs.', selected_variant.color_name, selected_size.size_name, available_quantity;
      end if;

      v_line_subtotal := v_unit_price * item_quantity;
      insert into public.order_items (
        order_id, product_id, variant_id, size_id, product_name, color_name,
        size_name, purchase_mode, pricing_tier, quantity, unit_price, line_total
      ) values (
        v_order_id, product_row.id, selected_variant.id, selected_size.id,
        product_row.name, selected_variant.color_name, selected_size.size_name,
        'ecer', v_pricing_name, item_quantity, v_unit_price, v_line_subtotal
      );

    elsif cart_item->>'mode' = 'seri-warna' then
      select count(*)::integer into color_count
      from public.product_variants
      where product_id = item_product_id and is_active = true;
      if color_count < 1 then
        raise exception 'Produk % belum memiliki varian warna aktif.', product_row.name;
      end if;
      if item_quantity % color_count <> 0 then
        raise exception 'Jumlah seri warna produk % harus kelipatan % pcs.', product_row.name, color_count;
      end if;
      quantity_per_variant := item_quantity / color_count;

      for color_row in
        select * from public.product_variants
        where product_id = item_product_id and is_active = true
        order by id
      loop
        update public.inventory
        set stock_quantity = stock_quantity - quantity_per_variant,
            updated_at = now()
        where variant_id = color_row.id
          and size_id = selected_size.id
          and stock_quantity is not null
          and stock_quantity >= quantity_per_variant
        returning stock_quantity into available_quantity;
        if not found then
          select stock_quantity into available_quantity
          from public.inventory
          where variant_id = color_row.id and size_id = selected_size.id;
          if not found or available_quantity is null then
            raise exception 'Stok % ukuran % belum diisi. Hubungi admin toko.', color_row.color_name, selected_size.size_name;
          end if;
          raise exception 'Stok % ukuran % hanya tersisa % pcs.', color_row.color_name, selected_size.size_name, available_quantity;
        end if;

        v_line_subtotal := v_unit_price * quantity_per_variant;
        insert into public.order_items (
          order_id, product_id, variant_id, size_id, product_name, color_name,
          size_name, purchase_mode, pricing_tier, quantity, unit_price, line_total
        ) values (
          v_order_id, product_row.id, color_row.id, selected_size.id,
          product_row.name, color_row.color_name, selected_size.size_name,
          'seri-warna', v_pricing_name, quantity_per_variant, v_unit_price, v_line_subtotal
        );
      end loop;

    elsif cart_item->>'mode' = 'seri-ukuran' then
      select count(*)::integer into size_count
      from public.product_sizes
      where product_id = item_product_id;
      if size_count < 1 then
        raise exception 'Produk % belum memiliki ukuran.', product_row.name;
      end if;
      if item_quantity % size_count <> 0 then
        raise exception 'Jumlah seri ukuran produk % harus kelipatan % pcs.', product_row.name, size_count;
      end if;
      quantity_per_size := item_quantity / size_count;

      for size_row in
        select * from public.product_sizes
        where product_id = item_product_id
        order by id
      loop
        update public.inventory
        set stock_quantity = stock_quantity - quantity_per_size,
            updated_at = now()
        where variant_id = selected_variant.id
          and size_id = size_row.id
          and stock_quantity is not null
          and stock_quantity >= quantity_per_size
        returning stock_quantity into available_quantity;
        if not found then
          select stock_quantity into available_quantity
          from public.inventory
          where variant_id = selected_variant.id and size_id = size_row.id;
          if not found or available_quantity is null then
            raise exception 'Stok % ukuran % belum diisi. Hubungi admin toko.', selected_variant.color_name, size_row.size_name;
          end if;
          raise exception 'Stok % ukuran % hanya tersisa % pcs.', selected_variant.color_name, size_row.size_name, available_quantity;
        end if;

        v_line_subtotal := v_unit_price * quantity_per_size;
        insert into public.order_items (
          order_id, product_id, variant_id, size_id, product_name, color_name,
          size_name, purchase_mode, pricing_tier, quantity, unit_price, line_total
        ) values (
          v_order_id, product_row.id, selected_variant.id, size_row.id,
          product_row.name, selected_variant.color_name, size_row.size_name,
          'seri-ukuran', v_pricing_name, quantity_per_size, v_unit_price, v_line_subtotal
        );
      end loop;
    end if;

    v_total_subtotal := v_total_subtotal + (v_unit_price * item_quantity);
  end loop;

  update public.orders
  set subtotal_amount = v_total_subtotal,
      total_amount = v_total_subtotal + packaging_amount,
      updated_at = now()
  where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'subtotal_amount', v_total_subtotal,
    'packaging_fee', packaging_amount,
    'total_before_shipping', v_total_subtotal + packaging_amount
  );
end;
$$;

revoke all on function public.create_whatsapp_order(uuid, jsonb, jsonb) from public;
grant execute on function public.create_whatsapp_order(uuid, jsonb, jsonb) to anon, authenticated;

commit;

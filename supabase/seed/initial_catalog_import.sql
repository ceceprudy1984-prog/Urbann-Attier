-- Impor satu kali katalog lama dari main.js ke Supabase.
-- Jalankan hanya jika public.products masih kosong. Foto lokal tetap memakai path assets/... .
begin;
do $$ begin
  if exists (select 1 from public.products) then raise exception 'Impor dibatalkan: tabel products sudah berisi data. Periksa katalog sebelum menjalankan script ini.'; end if;
end $$;

insert into public.products (id, sku, slug, name, category, description, material, model, care_notes, price_retail, price_series, price_wholesale, wholesale_min_qty, is_active, sort_order) values
  (0, 'UA-001', 'lunar-lace', 'Lunar Lace', 'Gamis', 'Teliti sebelum membeli baca deskripsi secara utuh untuk menghindari kesalahan pembelian.', null, null, null, 135000, 125000, 130000, 20, true, 0),
  (1, 'UA-002', 'ceongsam-sabrina', 'Ceongsam Sabrina', 'Gamis', 'Deskripsi produk akan ditambahkan.', null, null, null, 50000, null, null, 20, true, 1),
  (2, 'UA-003', 'abaya-turky', 'Abaya Turky', 'Gamis', 'Deskripsi produk akan ditambahkan.', null, null, null, 85000, null, null, 20, true, 2),
  (3, 'UA-004', 'delvina-dress', 'Delvina Dress', 'Gamis', 'Deskripsi produk akan ditambahkan.', null, null, null, 85000, null, null, 20, true, 3),
  (4, 'UA-005', 'delvina-couple', 'Delvina Couple', 'Gamis', 'Deskripsi produk akan ditambahkan.', null, null, null, 200000, null, null, 20, true, 4);

insert into public.product_variants (product_id, color_name, sort_order) values
  (0, 'Burgundy', 0),
  (0, 'Denim', 1),
  (0, 'Emerald', 2),
  (0, 'Hitam', 3),
  (0, 'Khaki', 4),
  (0, 'Navy', 5),
  (0, 'Sage', 6),
  (1, 'Hitam', 0),
  (1, 'Blue Emerald', 1),
  (1, 'Burgundy', 2),
  (1, 'Mahogany', 3),
  (1, 'Navy', 4),
  (2, 'Blue Emerald', 0),
  (2, 'Burgundy', 1),
  (2, 'Hitam', 2),
  (2, 'Mahogany', 3),
  (2, 'Navy', 4),
  (3, 'Blue Emerald', 0),
  (3, 'Burgundy', 1),
  (3, 'Denim', 2),
  (3, 'Dusty Pink', 3),
  (3, 'Hitam', 4),
  (3, 'Khaki', 5),
  (3, 'Mahogany', 6),
  (3, 'Navy', 7),
  (3, 'Sage', 8),
  (4, 'Burgundy', 0),
  (4, 'Denim', 1),
  (4, 'Dusty', 2),
  (4, 'Emerald', 3),
  (4, 'Hitam', 4),
  (4, 'Khaki', 5),
  (4, 'Mahogany', 6),
  (4, 'Navy', 7),
  (4, 'Sage', 8)
on conflict (product_id, color_name) do nothing;

insert into public.product_sizes (product_id, size_name, bust_cm, garment_length_cm, sleeve_length_cm, sort_order) values
  (0, 'M', null, null, null, 0),
  (0, 'L', null, null, null, 1),
  (0, 'XL', null, null, null, 2),
  (0, 'XXL', null, null, null, 3),
  (0, 'XXXL', null, null, null, 4),
  (1, 'S', null, null, null, 0),
  (1, 'M', null, null, null, 1),
  (1, 'L', null, null, null, 2),
  (2, 'S', null, null, null, 0),
  (2, 'M', null, null, null, 1),
  (2, 'L', null, null, null, 2),
  (3, 'S', null, null, null, 0),
  (3, 'M', null, null, null, 1),
  (3, 'L', null, null, null, 2),
  (4, 'S', null, null, null, 0),
  (4, 'M', null, null, null, 1),
  (4, 'L', null, null, null, 2)
on conflict (product_id, size_name) do nothing;

insert into public.product_images (product_id, variant_id, image_path, alt_text, sort_order)
select source.product_id, v.id, source.image_path, source.alt_text, source.sort_order
from (values
  (0::bigint, 'Burgundy'::text, 'assets/lunar lace/burgundy.jpeg'::text, 'Lunar Lace warna Burgundy'::text, 0::integer),
  (0::bigint, 'Denim'::text, 'assets/lunar lace/denim.jpeg'::text, 'Lunar Lace warna Denim'::text, 1::integer),
  (0::bigint, 'Emerald'::text, 'assets/lunar lace/emerald.jpeg'::text, 'Lunar Lace warna Emerald'::text, 2::integer),
  (0::bigint, 'Hitam'::text, 'assets/lunar lace/hitam.jpeg'::text, 'Lunar Lace warna Hitam'::text, 3::integer),
  (0::bigint, 'Khaki'::text, 'assets/lunar lace/khaki.jpeg'::text, 'Lunar Lace warna Khaki'::text, 4::integer),
  (0::bigint, 'Navy'::text, 'assets/lunar lace/navy.jpeg'::text, 'Lunar Lace warna Navy'::text, 5::integer),
  (0::bigint, 'Sage'::text, 'assets/lunar lace/sage.jpeg'::text, 'Lunar Lace warna Sage'::text, 6::integer),
  (1::bigint, 'Hitam'::text, 'assets/ceongsam/ceongsam-black.jpeg'::text, 'Ceongsam Sabrina warna Hitam'::text, 0::integer),
  (1::bigint, 'Blue Emerald'::text, 'assets/ceongsam/ceongsam-blue-emerald.jpeg'::text, 'Ceongsam Sabrina warna Blue Emerald'::text, 1::integer),
  (1::bigint, 'Burgundy'::text, 'assets/ceongsam/ceongsam-burgundy.jpeg'::text, 'Ceongsam Sabrina warna Burgundy'::text, 2::integer),
  (1::bigint, 'Mahogany'::text, 'assets/ceongsam/ceongsam-mahogany.jpeg'::text, 'Ceongsam Sabrina warna Mahogany'::text, 3::integer),
  (1::bigint, 'Navy'::text, 'assets/ceongsam/ceongsam-navy.jpeg'::text, 'Ceongsam Sabrina warna Navy'::text, 4::integer),
  (2::bigint, 'Blue Emerald'::text, 'assets/abaya turky/blue emerald.jpeg'::text, 'Abaya Turky warna Blue Emerald'::text, 0::integer),
  (2::bigint, 'Burgundy'::text, 'assets/abaya turky/burgundy.jpeg'::text, 'Abaya Turky warna Burgundy'::text, 1::integer),
  (2::bigint, 'Hitam'::text, 'assets/abaya turky/hitam.jpeg'::text, 'Abaya Turky warna Hitam'::text, 2::integer),
  (2::bigint, 'Mahogany'::text, 'assets/abaya turky/mahogany (1).jpeg'::text, 'Abaya Turky warna Mahogany'::text, 3::integer),
  (2::bigint, 'Navy'::text, 'assets/abaya turky/navy.jpeg'::text, 'Abaya Turky warna Navy'::text, 4::integer),
  (3::bigint, 'Blue Emerald'::text, 'assets/delvina/delvina-blueemerald.jpeg'::text, 'Delvina Dress warna Blue Emerald'::text, 0::integer),
  (3::bigint, 'Burgundy'::text, 'assets/delvina/delvina-burgundy.jpeg'::text, 'Delvina Dress warna Burgundy'::text, 1::integer),
  (3::bigint, 'Denim'::text, 'assets/delvina/delvina-denim.jpeg'::text, 'Delvina Dress warna Denim'::text, 2::integer),
  (3::bigint, 'Dusty Pink'::text, 'assets/delvina/delvina-dustypink.jpeg'::text, 'Delvina Dress warna Dusty Pink'::text, 3::integer),
  (3::bigint, 'Hitam'::text, 'assets/delvina/delvina-hitam.jpeg'::text, 'Delvina Dress warna Hitam'::text, 4::integer),
  (3::bigint, 'Khaki'::text, 'assets/delvina/delvina-khaky.jpeg'::text, 'Delvina Dress warna Khaki'::text, 5::integer),
  (3::bigint, 'Mahogany'::text, 'assets/delvina/delvina-mahogany.jpeg'::text, 'Delvina Dress warna Mahogany'::text, 6::integer),
  (3::bigint, 'Navy'::text, 'assets/delvina/delvina-navy.jpeg'::text, 'Delvina Dress warna Navy'::text, 7::integer),
  (3::bigint, 'Sage'::text, 'assets/delvina/delvina-sage.jpeg'::text, 'Delvina Dress warna Sage'::text, 8::integer),
  (4::bigint, 'Burgundy'::text, 'assets/delvina couple/burgundy.jpeg'::text, 'Delvina Couple warna Burgundy'::text, 0::integer),
  (4::bigint, 'Denim'::text, 'assets/delvina couple/denim (1).jpeg'::text, 'Delvina Couple warna Denim'::text, 1::integer),
  (4::bigint, 'Dusty'::text, 'assets/delvina couple/dusty.jpeg'::text, 'Delvina Couple warna Dusty'::text, 2::integer),
  (4::bigint, 'Emerald'::text, 'assets/delvina couple/emerald.jpeg'::text, 'Delvina Couple warna Emerald'::text, 3::integer),
  (4::bigint, 'Hitam'::text, 'assets/delvina couple/hitam.jpeg'::text, 'Delvina Couple warna Hitam'::text, 4::integer),
  (4::bigint, 'Khaki'::text, 'assets/delvina couple/khaki.jpeg'::text, 'Delvina Couple warna Khaki'::text, 5::integer),
  (4::bigint, 'Mahogany'::text, 'assets/delvina couple/mahogany.jpeg'::text, 'Delvina Couple warna Mahogany'::text, 6::integer),
  (4::bigint, 'Navy'::text, 'assets/delvina couple/navy.jpeg'::text, 'Delvina Couple warna Navy'::text, 7::integer),
  (4::bigint, 'Sage'::text, 'assets/delvina couple/sage.jpeg'::text, 'Delvina Couple warna Sage'::text, 8::integer)
) as source(product_id, color_name, image_path, alt_text, sort_order)
join public.product_variants v on v.product_id = source.product_id and v.color_name = source.color_name;

insert into public.inventory (product_id, variant_id, size_id, stock_quantity)
select v.product_id, v.id, s.id, null
from public.product_variants v
join public.product_sizes s on s.product_id = v.product_id
on conflict (variant_id, size_id) do nothing;

select setval(pg_get_serial_sequence('public.products', 'id'), (select greatest(coalesce(max(id), 1), 1) from public.products), true);
commit;

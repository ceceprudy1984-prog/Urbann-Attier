-- Bucket publik untuk foto katalog; hanya admin aktif yang boleh mengelola file.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_images_admin_insert on storage.objects;
drop policy if exists product_images_admin_update on storage.objects;
drop policy if exists product_images_admin_delete on storage.objects;

create policy product_images_admin_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'product-images' and (select private.is_admin()));

create policy product_images_admin_update
on storage.objects for update to authenticated
using (bucket_id = 'product-images' and (select private.is_admin()))
with check (bucket_id = 'product-images' and (select private.is_admin()));

create policy product_images_admin_delete
on storage.objects for delete to authenticated
using (bucket_id = 'product-images' and (select private.is_admin()));

commit;

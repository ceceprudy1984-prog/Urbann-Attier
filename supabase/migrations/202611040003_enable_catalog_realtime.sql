-- Aktifkan notifikasi perubahan katalog agar website yang sedang terbuka ikut diperbarui.
begin;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'Publication supabase_realtime belum tersedia. Aktifkan Realtime pada project Supabase lalu jalankan ulang file ini.';
  end if;

  if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products') then
    execute 'alter publication supabase_realtime add table public.products';
  end if;
  if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'product_variants') then
    execute 'alter publication supabase_realtime add table public.product_variants';
  end if;
  if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'product_images') then
    execute 'alter publication supabase_realtime add table public.product_images';
  end if;
  if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'product_sizes') then
    execute 'alter publication supabase_realtime add table public.product_sizes';
  end if;
  if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory') then
    execute 'alter publication supabase_realtime add table public.inventory';
  end if;
end;
$$;

commit;

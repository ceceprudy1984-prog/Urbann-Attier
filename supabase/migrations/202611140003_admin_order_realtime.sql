-- Kirim perubahan pesanan ke dashboard admin melalui Supabase Realtime.
begin;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'Publication supabase_realtime belum tersedia. Aktifkan Realtime pada project Supabase lalu jalankan ulang migrasi ini.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    execute 'alter publication supabase_realtime add table public.orders';
  end if;
end;
$$;

commit;

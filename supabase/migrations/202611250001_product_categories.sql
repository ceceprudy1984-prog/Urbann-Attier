-- Kategori katalog bertingkat untuk Gamis, One Set, dan jenis produk berikutnya.
-- Jalankan satu kali pada project Supabase Urbann Attier yang sudah aktif.
begin;

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  parent_id uuid references public.product_categories(id) on delete restrict,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);

create index if not exists product_categories_parent_order_idx
  on public.product_categories(parent_id, sort_order, name);

alter table public.product_categories enable row level security;
revoke all on public.product_categories from public, anon, authenticated;
grant select on public.product_categories to anon, authenticated;
grant insert, update on public.product_categories to authenticated;

drop policy if exists product_categories_public_read on public.product_categories;
create policy product_categories_public_read on public.product_categories
for select to anon, authenticated
using (is_active = true);

drop policy if exists product_categories_admin_manage on public.product_categories;
create policy product_categories_admin_manage on public.product_categories
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop trigger if exists product_categories_set_updated_at on public.product_categories;
create trigger product_categories_set_updated_at before update on public.product_categories
for each row execute function private.set_updated_at();

alter table public.products
  add column if not exists category_id uuid references public.product_categories(id) on delete set null;
create index if not exists products_category_active_order_idx
  on public.products(category_id, is_active, sort_order);

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'product_categories'
  ) then
    execute 'alter publication supabase_realtime add table public.product_categories';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
  ) then
    execute 'alter publication supabase_realtime add table public.products';
  end if;
exception when undefined_object then
  raise notice 'Publication supabase_realtime belum aktif; kategori tetap berfungsi, tetapi pembaruan live tidak tersedia.';
end;
$$;

insert into public.product_categories(id, name, slug, parent_id, sort_order) values
  ('25000000-0000-4000-8000-000000000001', 'Gamis', 'gamis', null, 10),
  ('25000000-0000-4000-8000-000000000002', 'One Set', 'one-set', null, 20),
  ('25000000-0000-4000-8000-000000000011', 'Gamis Anak', 'gamis-anak', '25000000-0000-4000-8000-000000000001', 10),
  ('25000000-0000-4000-8000-000000000012', 'Gamis Dewasa', 'gamis-dewasa', '25000000-0000-4000-8000-000000000001', 20),
  ('25000000-0000-4000-8000-000000000021', 'One Set Anak', 'one-set-anak', '25000000-0000-4000-8000-000000000002', 10)
on conflict (slug) do update set
  name = excluded.name,
  parent_id = excluded.parent_id,
  sort_order = excluded.sort_order;

-- Synchronize product foreign keys by slug so re-running a partially applied script is safe.
update public.products as product
set category_id = category.id
from public.product_categories as category
where product.category_id is null
  and lower(trim(product.category)) = lower(category.name)
  and category.parent_id is null;

-- Produk lama yang hanya berlabel "Gamis" tetap muncul saat induk Gamis dipilih.
update public.products
set category_id = '25000000-0000-4000-8000-000000000001'
where category_id is null and lower(trim(category)) = 'gamis';

commit;

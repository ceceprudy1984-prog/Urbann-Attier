-- Konten Coming Soon dan promo di section sorotan dapat diperbarui oleh admin.
begin;

alter table public.store_public_settings
  add column if not exists homepage_launch_active boolean not null default false,
  add column if not exists homepage_launch_title text not null default '',
  add column if not exists homepage_launch_message text not null default '',
  add column if not exists homepage_launch_image_url text,
  add column if not exists homepage_launch_at timestamptz,
  add column if not exists homepage_promo_active boolean not null default false,
  add column if not exists homepage_promo_badge text not null default 'PROMO',
  add column if not exists homepage_promo_title text not null default '',
  add column if not exists homepage_promo_description text not null default '',
  add column if not exists homepage_promo_image_url text,
  add column if not exists homepage_promo_cta_label text not null default 'Lihat promo',
  add column if not exists homepage_promo_cta_url text not null default '#produk',
  add column if not exists homepage_promo_starts_at timestamptz,
  add column if not exists homepage_promo_ends_at timestamptz;

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'store_public_settings'
    ) then
    alter publication supabase_realtime add table public.store_public_settings;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'storefront_launch_title_length'
      and conrelid = 'public.store_public_settings'::regclass
  ) then
    alter table public.store_public_settings
      add constraint storefront_launch_title_length check (char_length(homepage_launch_title) <= 120);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'storefront_launch_message_length'
      and conrelid = 'public.store_public_settings'::regclass
  ) then
    alter table public.store_public_settings
      add constraint storefront_launch_message_length check (char_length(homepage_launch_message) <= 600);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'storefront_promo_badge_length'
      and conrelid = 'public.store_public_settings'::regclass
  ) then
    alter table public.store_public_settings
      add constraint storefront_promo_badge_length check (char_length(homepage_promo_badge) <= 40);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'storefront_promo_title_length'
      and conrelid = 'public.store_public_settings'::regclass
  ) then
    alter table public.store_public_settings
      add constraint storefront_promo_title_length check (char_length(homepage_promo_title) <= 120);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'storefront_promo_description_length'
      and conrelid = 'public.store_public_settings'::regclass
  ) then
    alter table public.store_public_settings
      add constraint storefront_promo_description_length check (char_length(homepage_promo_description) <= 600);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'storefront_promo_cta_label_length'
      and conrelid = 'public.store_public_settings'::regclass
  ) then
    alter table public.store_public_settings
      add constraint storefront_promo_cta_label_length check (char_length(homepage_promo_cta_label) <= 40);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'storefront_promo_date_order'
      and conrelid = 'public.store_public_settings'::regclass
  ) then
    alter table public.store_public_settings
      add constraint storefront_promo_date_order check (
        homepage_promo_starts_at is null
        or homepage_promo_ends_at is null
        or homepage_promo_ends_at > homepage_promo_starts_at
      );
  end if;
end;
$$;

commit;

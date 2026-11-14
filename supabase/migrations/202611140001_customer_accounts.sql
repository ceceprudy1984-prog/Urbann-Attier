-- Fondasi akun pelanggan dan persetujuan email promosi.
-- Aman dijalankan satu kali pada project Urbann Attier yang sudah digunakan.
begin;

create table if not exists public.customer_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  email_marketing_opt_in boolean not null default false,
  email_marketing_opted_in_at timestamptz,
  email_marketing_unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_profiles_name_length check (char_length(full_name) <= 160),
  constraint customer_profiles_phone_length check (char_length(phone) <= 32)
);

alter table public.orders
  add column if not exists customer_id uuid references auth.users (id) on delete set null,
  add column if not exists discount_amount bigint not null default 0,
  add column if not exists discount_percent smallint not null default 0,
  add column if not exists discount_order_number smallint;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'orders_discount_amount_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders add constraint orders_discount_amount_check
      check (discount_amount >= 0 and discount_amount <= subtotal_amount);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'orders_discount_percent_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders add constraint orders_discount_percent_check
      check (discount_percent in (0, 5));
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'orders_discount_order_number_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders add constraint orders_discount_order_number_check
      check (discount_order_number is null or discount_order_number between 1 and 5);
  end if;
end;
$$;

create index if not exists customer_profiles_marketing_opt_in_idx
  on public.customer_profiles (created_at)
  where email_marketing_opt_in = true;
create index if not exists orders_customer_created_idx
  on public.orders (customer_id, created_at desc)
  where customer_id is not null;
create index if not exists orders_customer_discount_idx
  on public.orders (customer_id, payment_status, created_at desc)
  where discount_amount > 0;

alter table public.customer_profiles enable row level security;
revoke all on public.customer_profiles from public, anon, authenticated;
grant select on public.customer_profiles to authenticated;

drop policy if exists customer_profiles_select_self on public.customer_profiles;
create policy customer_profiles_select_self on public.customer_profiles
for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists orders_customer_read_own on public.orders;
create policy orders_customer_read_own on public.orders
for select to authenticated
using (customer_id = (select auth.uid()));

create or replace function private.create_customer_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_marketing_opt_in boolean := coalesce(new.raw_user_meta_data ->> 'email_marketing_opt_in', 'false') = 'true';
begin
  insert into public.customer_profiles (
    user_id, full_name, phone, email_marketing_opt_in,
    email_marketing_opted_in_at, email_marketing_unsubscribed_at
  ) values (
    new.id,
    left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 160),
    left(btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')), 32),
    v_marketing_opt_in,
    case when v_marketing_opt_in then now() else null end,
    null
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_customer_profile on auth.users;
create trigger on_auth_user_created_customer_profile
after insert on auth.users
for each row execute function private.create_customer_profile_from_auth_user();

create or replace function public.set_customer_email_marketing_consent(p_opted_in boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Masuk ke akun sebelum mengubah pilihan email.';
  end if;

  insert into public.customer_profiles (
    user_id, email_marketing_opt_in, email_marketing_opted_in_at,
    email_marketing_unsubscribed_at
  ) values (
    v_user_id,
    coalesce(p_opted_in, false),
    case when coalesce(p_opted_in, false) then now() else null end,
    case when coalesce(p_opted_in, false) then null else now() end
  )
  on conflict (user_id) do update
  set email_marketing_opt_in = coalesce(p_opted_in, false),
      email_marketing_opted_in_at = case
        when coalesce(p_opted_in, false) then coalesce(customer_profiles.email_marketing_opted_in_at, now())
        else customer_profiles.email_marketing_opted_in_at
      end,
      email_marketing_unsubscribed_at = case
        when coalesce(p_opted_in, false) then null
        else now()
      end,
      updated_at = now();
end;
$$;

revoke all on function private.create_customer_profile_from_auth_user() from public, anon, authenticated;
revoke all on function public.set_customer_email_marketing_consent(boolean) from public, anon;
grant execute on function public.set_customer_email_marketing_consent(boolean) to authenticated;

commit;

-- Profil pelanggan, alamat utama, dan ringkasan kuota diskon untuk halaman akun.
begin;

alter table public.customer_profiles
  add column if not exists address_line text not null default '',
  add column if not exists district text not null default '',
  add column if not exists city text not null default '',
  add column if not exists province text not null default '',
  add column if not exists postal_code text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'customer_profiles_address_lengths'
      and conrelid = 'public.customer_profiles'::regclass
  ) then
    alter table public.customer_profiles add constraint customer_profiles_address_lengths
      check (char_length(address_line) <= 1000 and char_length(district) <= 120
        and char_length(city) <= 120 and char_length(province) <= 120
        and char_length(postal_code) <= 20);
  end if;
end;
$$;

-- Isi alamat utama dari pesanan terbaru yang terhubung ke akun member.
with latest_member_address as (
  select distinct on (o.customer_id)
    o.customer_id, o.address_line, o.district, o.city, o.province, o.postal_code
  from public.orders as o
  where o.customer_id is not null
  order by o.customer_id, o.created_at desc
)
update public.customer_profiles as cp
set address_line = coalesce(a.address_line, ''),
    district = coalesce(a.district, ''),
    city = coalesce(a.city, ''),
    province = coalesce(a.province, ''),
    postal_code = coalesce(a.postal_code, ''),
    updated_at = now()
from latest_member_address as a
where cp.user_id = a.customer_id
  and cp.address_line = '';

create or replace function public.get_customer_account_summary()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.customer_profiles%rowtype;
  v_email_verified boolean := false;
  v_used integer := 0;
  v_reserved integer := 0;
begin
  if v_user_id is null then raise exception 'Masuk ke akun untuk melihat informasi member.'; end if;

  select * into v_profile
  from public.customer_profiles as cp
  where cp.user_id = v_user_id;
  if not found then raise exception 'Profil member belum tersedia untuk akun ini.'; end if;

  select (u.email_confirmed_at is not null) into v_email_verified
  from auth.users as u where u.id = v_user_id;

  select
    (count(distinct o.discount_order_number) filter (
      where o.payment_status = 'paid' and o.discount_amount > 0
    ))::integer,
    (count(distinct o.discount_order_number) filter (
      where o.status <> 'cancelled'
        and o.payment_status in ('unpaid', 'waiting_confirmation')
        and o.discount_amount > 0
    ))::integer
  into v_used, v_reserved
  from public.orders as o
  where o.customer_id = v_user_id
    and o.discount_order_number between 1 and 5;

  return jsonb_build_object(
    'full_name', v_profile.full_name,
    'phone', v_profile.phone,
    'address_line', v_profile.address_line,
    'district', v_profile.district,
    'city', v_profile.city,
    'province', v_profile.province,
    'postal_code', v_profile.postal_code,
    'created_at', v_profile.created_at,
    'email_marketing_opt_in', v_profile.email_marketing_opt_in,
    'email_verified', coalesce(v_email_verified, false),
    'discount_tokens_used', coalesce(v_used, 0),
    'discount_tokens_reserved', coalesce(v_reserved, 0),
    'discount_tokens_remaining', greatest(5 - coalesce(v_used, 0) - coalesce(v_reserved, 0), 0)
  );
end;
$$;

create or replace function public.update_customer_account_profile(
  p_full_name text,
  p_phone text,
  p_address_line text default '',
  p_district text default '',
  p_city text default '',
  p_province text default '',
  p_postal_code text default ''
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_address_line text := btrim(coalesce(p_address_line, ''));
  v_district text := btrim(coalesce(p_district, ''));
  v_city text := btrim(coalesce(p_city, ''));
  v_province text := btrim(coalesce(p_province, ''));
  v_postal_code text := btrim(coalesce(p_postal_code, ''));
begin
  if v_user_id is null then raise exception 'Masuk ke akun sebelum memperbarui profil.'; end if;
  if v_full_name = '' or v_phone = '' then raise exception 'Nama lengkap dan nomor WhatsApp wajib diisi.'; end if;
  if char_length(v_full_name) > 160 or char_length(v_phone) > 32
    or char_length(v_address_line) > 1000 or char_length(v_district) > 120
    or char_length(v_city) > 120 or char_length(v_province) > 120
    or char_length(v_postal_code) > 20 then
    raise exception 'Ada informasi profil yang melebihi batas panjang.';
  end if;

  insert into public.customer_profiles (
    user_id, full_name, phone, address_line, district, city, province, postal_code
  ) values (
    v_user_id, v_full_name, v_phone, v_address_line, v_district, v_city, v_province, v_postal_code
  )
  on conflict (user_id) do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    address_line = excluded.address_line,
    district = excluded.district,
    city = excluded.city,
    province = excluded.province,
    postal_code = excluded.postal_code,
    updated_at = now();
end;
$$;

revoke all on function public.get_customer_account_summary() from public, anon;
grant execute on function public.get_customer_account_summary() to authenticated;
revoke all on function public.update_customer_account_profile(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_customer_account_profile(text, text, text, text, text, text, text) to authenticated;

commit;

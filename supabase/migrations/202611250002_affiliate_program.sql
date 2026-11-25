-- Program affiliate Urbann Attier.
-- Jalankan satu kali setelah seluruh migrasi checkout, Midtrans, dan akun pelanggan.
begin;

create table if not exists public.affiliate_program_settings (
  id smallint primary key default 1 check (id = 1),
  commission_rate numeric(5,2) not null default 8.00 check (commission_rate between 0 and 100),
  referral_days integer not null default 30 check (referral_days between 1 and 365),
  minimum_payout bigint not null default 100000 check (minimum_payout >= 0),
  monthly_bonus_units integer not null default 500 check (monthly_bonus_units > 0),
  monthly_bonus_amount bigint not null default 500000 check (monthly_bonus_amount >= 0),
  return_window_days integer not null default 3 check (return_window_days between 1 and 30),
  terms_version text not null default '2026-11-v1',
  updated_at timestamptz not null default now()
);
insert into public.affiliate_program_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.affiliate_profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 160),
  phone text not null check (char_length(btrim(phone)) between 6 and 32),
  referral_code text not null unique check (referral_code ~ '^[A-Z0-9-]{5,24}$'),
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended','closure_requested','closed')),
  bank_name text not null default 'BCA' check (bank_name = 'BCA'),
  bank_account_name text,
  bank_account_number text,
  terms_version text not null,
  terms_accepted_at timestamptz not null default now(),
  applied_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  closure_reason text,
  closure_requested_at timestamptz,
  closed_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((bank_account_name is null and bank_account_number is null)
      or (char_length(btrim(bank_account_name)) between 2 and 160
        and bank_account_number ~ '^[0-9]{8,24}$')),
  check (closure_reason is null or char_length(closure_reason) <= 1000)
);

create table if not exists public.affiliate_attributions (
  token uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at)
);
create index if not exists affiliate_attributions_expiry_idx on public.affiliate_attributions(expires_at);

create table if not exists public.affiliate_click_events (
  id bigint generated always as identity primary key,
  affiliate_id uuid not null references public.affiliate_profiles(user_id) on delete restrict,
  visitor_token uuid not null,
  click_date date not null default (now() at time zone 'Asia/Jakarta')::date,
  created_at timestamptz not null default now(),
  unique (affiliate_id, visitor_token, click_date)
);
create index if not exists affiliate_click_events_affiliate_day_idx on public.affiliate_click_events(affiliate_id, click_date desc);

alter table public.orders
  add column if not exists affiliate_id uuid references public.affiliate_profiles(user_id) on delete restrict,
  add column if not exists affiliate_referral_code text,
  add column if not exists affiliate_attributed_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists return_requested_at timestamptz;
create index if not exists orders_affiliate_paid_idx on public.orders(affiliate_id, paid_at desc) where affiliate_id is not null;

create table if not exists public.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_profiles(user_id) on delete restrict,
  amount bigint not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','processing','paid','failed')),
  is_final boolean not null default false,
  bank_name text not null default 'BCA',
  bank_account_name text not null,
  bank_account_number text not null,
  payout_week date not null,
  transfer_reference text,
  admin_note text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null,
  unique (affiliate_id, payout_week, is_final),
  check (char_length(bank_account_name) between 2 and 160),
  check (bank_account_number ~ '^[0-9]{8,24}$')
);
create index if not exists affiliate_payouts_affiliate_date_idx on public.affiliate_payouts(affiliate_id, created_at desc);

create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_profiles(user_id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  product_amount bigint not null check (product_amount >= 0),
  commission_rate numeric(5,2) not null check (commission_rate between 0 and 100),
  amount bigint not null check (amount >= 0),
  status text not null default 'held' check (status in ('held','available','reversed')),
  payout_id uuid references public.affiliate_payouts(id) on delete restrict,
  hold_until timestamptz,
  available_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists affiliate_commissions_balance_idx on public.affiliate_commissions(affiliate_id, status, payout_id);

create table if not exists public.affiliate_bonus_awards (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_profiles(user_id) on delete restrict,
  period_month date not null,
  qualified_units integer not null check (qualified_units >= 500),
  amount bigint not null check (amount >= 0),
  status text not null default 'available' check (status in ('available','reversed')),
  payout_id uuid references public.affiliate_payouts(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (affiliate_id, period_month)
);

alter table public.affiliate_program_settings enable row level security;
alter table public.affiliate_profiles enable row level security;
alter table public.affiliate_attributions enable row level security;
alter table public.affiliate_click_events enable row level security;
alter table public.affiliate_commissions enable row level security;
alter table public.affiliate_bonus_awards enable row level security;
alter table public.affiliate_payouts enable row level security;
revoke all on public.affiliate_program_settings, public.affiliate_profiles, public.affiliate_attributions,
  public.affiliate_click_events, public.affiliate_commissions, public.affiliate_bonus_awards,
  public.affiliate_payouts from public, anon, authenticated;
grant select on public.affiliate_profiles, public.affiliate_commissions,
  public.affiliate_bonus_awards, public.affiliate_payouts to authenticated;
grant select on public.affiliate_program_settings to anon, authenticated;
grant insert on public.affiliate_click_events to service_role;

drop policy if exists affiliate_settings_admin_read on public.affiliate_program_settings;
create policy affiliate_settings_public_read on public.affiliate_program_settings for select to anon, authenticated using (id = 1);
drop policy if exists affiliate_profiles_self_or_admin_read on public.affiliate_profiles;
create policy affiliate_profiles_self_or_admin_read on public.affiliate_profiles for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy affiliate_commissions_self_or_admin_read on public.affiliate_commissions for select to authenticated
using (affiliate_id = (select auth.uid()) or (select private.is_admin()));
create policy affiliate_bonus_self_or_admin_read on public.affiliate_bonus_awards for select to authenticated
using (affiliate_id = (select auth.uid()) or (select private.is_admin()));
create policy affiliate_payouts_self_or_admin_read on public.affiliate_payouts for select to authenticated
using (affiliate_id = (select auth.uid()) or (select private.is_admin()));

create or replace function private.add_days(p_start timestamptz, p_days integer)
returns timestamptz
language sql immutable
set search_path = pg_catalog
as $$ select p_start + make_interval(days => greatest(p_days,0)) $$;

create or replace function private.normalize_affiliate_phone(p_phone text)
returns text language sql immutable set search_path = pg_catalog
as $$
  with digits as (select regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') as value)
  select case when left(value,2)='62' then '0'||substr(value,3) else value end from digits
$$;

create or replace function private.set_affiliate_attribution()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_token uuid; v_attribution public.affiliate_attributions%rowtype; v_profile public.affiliate_profiles%rowtype;
begin
  begin v_token := nullif(current_setting('app.affiliate_attribution_token', true), '')::uuid;
  exception when invalid_text_representation then v_token := null; end;
  if v_token is null then return new; end if;
  select * into v_attribution from public.affiliate_attributions
  where token = v_token and expires_at > now();
  if not found then return new; end if;
  select * into v_profile from public.affiliate_profiles
  where user_id = v_attribution.affiliate_id and status = 'approved';
  if not found or new.customer_id = v_profile.user_id then return new; end if;
  if private.normalize_affiliate_phone(new.customer_phone)
      = private.normalize_affiliate_phone(v_profile.phone) then return new; end if;
  new.affiliate_id := v_profile.user_id;
  new.affiliate_referral_code := v_profile.referral_code;
  new.affiliate_attributed_at := v_attribution.created_at;
  return new;
end;
$$;
drop trigger if exists orders_set_affiliate_attribution on public.orders;
create trigger orders_set_affiliate_attribution before insert on public.orders
for each row execute function private.set_affiliate_attribution();

create or replace function private.set_order_delivered_at()
returns trigger language plpgsql set search_path = pg_catalog
as $$
begin
  if new.shipping_status = 'delivered' and old.shipping_status is distinct from 'delivered' then
    new.delivered_at := coalesce(new.delivered_at, now());
  end if;
  return new;
end;
$$;
drop trigger if exists orders_set_delivered_at on public.orders;
create trigger orders_set_delivered_at before update of shipping_status on public.orders
for each row execute function private.set_order_delivered_at();

create or replace function private.sync_affiliate_commission()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_rate numeric(5,2); v_amount bigint;
begin
  if new.affiliate_id is null then return new; end if;
  if new.payment_status = 'paid' and new.status <> 'cancelled' then
    select commission_rate into v_rate from public.affiliate_program_settings where id = 1;
    v_amount := round(greatest(new.subtotal_amount - coalesce(new.discount_amount,0),0) * v_rate / 100)::bigint;
    insert into public.affiliate_commissions(affiliate_id, order_id, product_amount, commission_rate, amount, status)
    values (new.affiliate_id, new.id, greatest(new.subtotal_amount - coalesce(new.discount_amount,0),0), v_rate, v_amount, 'held')
    on conflict (order_id) do nothing;
  end if;
  if new.status = 'cancelled' or new.payment_status = 'refunded' or new.shipping_status = 'returned' then
    update public.affiliate_commissions set status = 'reversed', reversed_at = coalesce(reversed_at,now()), updated_at = now()
    where order_id = new.id and status in ('held','available') and payout_id is null;
  end if;
  return new;
end;
$$;
drop trigger if exists orders_sync_affiliate_commission on public.orders;
create trigger orders_sync_affiliate_commission after insert or update of status, payment_status, shipping_status on public.orders
for each row execute function private.sync_affiliate_commission();

create or replace function public.record_affiliate_referral(p_code text, p_visitor_token uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_profile public.affiliate_profiles%rowtype; v_token uuid; v_days integer;
begin
  select * into v_profile from public.affiliate_profiles
  where referral_code = upper(btrim(coalesce(p_code,''))) and status = 'approved';
  if not found or p_visitor_token is null then return jsonb_build_object('valid', false); end if;
  select referral_days into v_days from public.affiliate_program_settings where id = 1;
  insert into public.affiliate_attributions(affiliate_id,expires_at)
  values (v_profile.user_id, now() + make_interval(days => v_days)) returning token into v_token;
  insert into public.affiliate_click_events(affiliate_id, visitor_token)
  values (v_profile.user_id, p_visitor_token)
  on conflict (affiliate_id,visitor_token,click_date) do nothing;
  return jsonb_build_object('valid',true,'token',v_token,'expires_at',now()+make_interval(days=>v_days));
end;
$$;

create or replace function public.apply_affiliate_application(p_full_name text, p_phone text, p_terms_version text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare v_user uuid := auth.uid(); v_code text; v_profile public.affiliate_profiles%rowtype; v_terms text;
begin
  if v_user is null then raise exception 'Masuk atau buat akun terlebih dahulu.'; end if;
  if not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null) then raise exception 'Verifikasi email Anda terlebih dahulu sebelum mendaftar affiliate.'; end if;
  select terms_version into v_terms from public.affiliate_program_settings where id=1;
  if p_terms_version is distinct from v_terms then raise exception 'Syarat program berubah. Muat ulang halaman dan baca kembali.'; end if;
  if length(btrim(coalesce(p_full_name,''))) not between 2 and 160 or length(btrim(coalesce(p_phone,''))) not between 6 and 32 then
    raise exception 'Nama dan nomor WhatsApp belum valid.';
  end if;
  if exists(select 1 from public.admin_users where user_id=v_user and is_active) then raise exception 'Akun admin tidak dapat mendaftar sebagai affiliate.'; end if;
  select * into v_profile from public.affiliate_profiles where user_id=v_user;
  if found then return jsonb_build_object('status',v_profile.status,'referral_code',v_profile.referral_code); end if;
  loop
    v_code := 'UA' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    exit when not exists(select 1 from public.affiliate_profiles where referral_code=v_code);
  end loop;
  insert into public.affiliate_profiles(user_id,full_name,phone,referral_code,terms_version)
  values(v_user,btrim(p_full_name),btrim(p_phone),v_code,v_terms)
  returning * into v_profile;
  return jsonb_build_object('status',v_profile.status,'referral_code',v_profile.referral_code);
end;
$$;

create or replace function public.save_affiliate_bank_account(p_account_name text, p_account_number text)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then raise exception 'Masuk ke akun affiliate.'; end if;
  if length(btrim(coalesce(p_account_name,''))) not between 2 and 160
    or btrim(coalesce(p_account_number,'')) !~ '^[0-9]{8,24}$' then
    raise exception 'Nama pemilik atau nomor rekening BCA belum valid.';
  end if;
  update public.affiliate_profiles set bank_name='BCA', bank_account_name=btrim(p_account_name), bank_account_number=btrim(p_account_number), updated_at=now()
  where user_id=auth.uid() and status in ('approved','closure_requested');
  if not found then raise exception 'Data rekening hanya dapat disimpan oleh affiliate yang disetujui.'; end if;
end;
$$;

create or replace function public.request_affiliate_closure(p_reason text)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then raise exception 'Masuk ke akun affiliate.'; end if;
  if length(btrim(coalesce(p_reason,''))) not between 10 and 1000 then raise exception 'Tuliskan alasan penutupan akun dengan jelas (10–1.000 karakter).'; end if;
  update public.affiliate_profiles set status='closure_requested', closure_reason=btrim(p_reason), closure_requested_at=now(), updated_at=now()
  where user_id=auth.uid() and status='approved';
  if not found then raise exception 'Permintaan hanya tersedia untuk akun affiliate aktif.'; end if;
end;
$$;

create or replace function public.refresh_affiliate_ledger()
returns void language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare v_target integer; v_bonus bigint; v_return_days integer;
begin
  select monthly_bonus_units,monthly_bonus_amount,return_window_days into v_target,v_bonus,v_return_days from public.affiliate_program_settings where id=1;
  update public.affiliate_commissions c set status='available', available_at=now(), updated_at=now()
  from public.orders o
  where c.order_id=o.id and c.status='held' and c.payout_id is null
    and o.payment_status='paid' and o.status <> 'cancelled' and o.shipping_status='delivered'
    and o.delivered_at is not null and now() >= private.add_days(o.delivered_at,v_return_days)
    and not exists (select 1 from public.affiliate_commissions r where r.order_id=o.id and r.status='reversed');
  insert into public.affiliate_bonus_awards(affiliate_id,period_month,qualified_units,amount)
  select c.affiliate_id, date_trunc('month',o.paid_at)::date, sum(oi.quantity)::integer, v_bonus
  from public.affiliate_commissions c
  join public.orders o on o.id=c.order_id
  join public.order_items oi on oi.order_id=o.id
  where c.status='available' and o.paid_at is not null and o.status <> 'cancelled'
    and o.payment_status='paid' and o.shipping_status='delivered'
  group by c.affiliate_id,date_trunc('month',o.paid_at)::date
  having sum(oi.quantity) >= v_target
  on conflict(affiliate_id,period_month) do nothing;
end;
$$;

create or replace function public.get_affiliate_dashboard()
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare v_user uuid:=auth.uid(); v_profile public.affiliate_profiles%rowtype; v_settings public.affiliate_program_settings%rowtype;
begin
  if v_user is null then raise exception 'Masuk untuk membuka dashboard affiliate.'; end if;
  perform public.refresh_affiliate_ledger();
  select * into v_profile from public.affiliate_profiles where user_id=v_user;
  if not found then return jsonb_build_object('application_status','not_applied'); end if;
  select * into v_settings from public.affiliate_program_settings where id=1;
  return jsonb_build_object(
    'application_status',v_profile.status,'full_name',v_profile.full_name,'phone',v_profile.phone,'terms_version',v_settings.terms_version,
    'referral_code',v_profile.referral_code,'bank_name',v_profile.bank_name,
    'bank_account_name',v_profile.bank_account_name,'bank_account_number',v_profile.bank_account_number,
    'commission_rate',v_settings.commission_rate,'referral_days',v_settings.referral_days,
    'minimum_payout',v_settings.minimum_payout,'monthly_bonus_units',v_settings.monthly_bonus_units,'monthly_bonus_amount',v_settings.monthly_bonus_amount,'return_window_days',v_settings.return_window_days,
    'click_count',(select count(*) from public.affiliate_click_events where affiliate_id=v_user),
    'pending_commission',coalesce((select sum(amount) from public.affiliate_commissions where affiliate_id=v_user and status='held' and payout_id is null),0),
    'available_balance',coalesce((select sum(amount) from public.affiliate_commissions where affiliate_id=v_user and status='available' and payout_id is null),0)
      + coalesce((select sum(amount) from public.affiliate_bonus_awards where affiliate_id=v_user and status='available' and payout_id is null),0),
    'paid_total',coalesce((select sum(amount) from public.affiliate_payouts where affiliate_id=v_user and status='paid'),0),
    'valid_order_count',(select count(*) from public.affiliate_commissions where affiliate_id=v_user and status <> 'reversed'),
    'recent_commissions',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) from (
      select c.order_id,o.order_number,c.product_amount,c.commission_rate,c.amount,c.status,c.created_at,c.hold_until,c.available_at
      from public.affiliate_commissions c join public.orders o on o.id=c.order_id where c.affiliate_id=v_user order by c.created_at desc limit 15
    ) x),
    'bonus_awards',(select coalesce(jsonb_agg(jsonb_build_object('period_month',b.period_month,'qualified_units',b.qualified_units,'amount',b.amount,'status',b.status,'created_at',b.created_at) order by b.period_month desc),'[]'::jsonb) from (select * from public.affiliate_bonus_awards where affiliate_id=v_user order by period_month desc limit 24) b),
    'payout_history',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount,'status',p.status,'is_final',p.is_final,'payout_week',p.payout_week,'created_at',p.created_at,'processed_at',p.processed_at,'transfer_reference',p.transfer_reference) order by p.created_at desc),'[]'::jsonb)
      from (select * from public.affiliate_payouts where affiliate_id=v_user order by created_at desc limit 20) p)
  );
end;
$$;

create or replace function public.get_admin_affiliate_dashboard()
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare v_result jsonb;
begin
  if not private.is_admin() then raise exception 'Akses admin diperlukan.'; end if;
  perform public.refresh_affiliate_ledger();
  select jsonb_build_object(
    'settings',(select to_jsonb(s) from public.affiliate_program_settings s where id=1),
    'affiliates',(select coalesce(jsonb_agg(jsonb_build_object(
      'user_id',a.user_id,'full_name',a.full_name,'phone',a.phone,'email',u.email,'referral_code',a.referral_code,'status',a.status,
      'bank_name',a.bank_name,'bank_account_name',a.bank_account_name,'bank_account_number',a.bank_account_number,
      'applied_at',a.applied_at,'closure_reason',a.closure_reason,'closure_requested_at',a.closure_requested_at,
      'click_count',(select count(*) from public.affiliate_click_events c where c.affiliate_id=a.user_id),
      'pending_commission',coalesce((select sum(amount) from public.affiliate_commissions c where c.affiliate_id=a.user_id and c.status='held' and c.payout_id is null),0),
      'available_balance',coalesce((select sum(amount) from public.affiliate_commissions c where c.affiliate_id=a.user_id and c.status='available' and c.payout_id is null),0)+coalesce((select sum(amount) from public.affiliate_bonus_awards b where b.affiliate_id=a.user_id and b.status='available' and b.payout_id is null),0)
    ) order by a.applied_at desc),'[]'::jsonb) from public.affiliate_profiles a left join auth.users u on u.id=a.user_id),
    'payouts',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'affiliate_id',p.affiliate_id,'affiliate_name',a.full_name,'amount',p.amount,'status',p.status,'is_final',p.is_final,'bank_name',p.bank_name,'bank_account_name',p.bank_account_name,'bank_account_number',p.bank_account_number,'payout_week',p.payout_week,'created_at',p.created_at,'processed_at',p.processed_at,'transfer_reference',p.transfer_reference,'admin_note',p.admin_note) order by p.created_at desc),'[]'::jsonb) from (select * from public.affiliate_payouts order by created_at desc limit 100) p join public.affiliate_profiles a on a.user_id=p.affiliate_id),
    'recent_commissions',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'affiliate_name',a.full_name,'referral_code',a.referral_code,'order_number',o.order_number,'product_amount',c.product_amount,'rate',c.commission_rate,'amount',c.amount,'status',c.status,'delivered_at',o.delivered_at,'created_at',c.created_at) order by c.created_at desc),'[]'::jsonb) from (select * from public.affiliate_commissions order by created_at desc limit 100) c join public.affiliate_profiles a on a.user_id=c.affiliate_id join public.orders o on o.id=c.order_id)
    ,'bonus_awards',(select coalesce(jsonb_agg(jsonb_build_object('affiliate_name',a.full_name,'period_month',b.period_month,'qualified_units',b.qualified_units,'amount',b.amount,'status',b.status,'created_at',b.created_at) order by b.period_month desc),'[]'::jsonb) from (select * from public.affiliate_bonus_awards order by period_month desc limit 100) b join public.affiliate_profiles a on a.user_id=b.affiliate_id)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.admin_review_affiliate(p_user_id uuid,p_decision text,p_note text default null)
returns void language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not private.is_admin() then raise exception 'Akses admin diperlukan.'; end if;
  if p_decision not in ('approve','reject','suspend','restore') then raise exception 'Keputusan tidak valid.'; end if;
  if p_decision in ('reject','suspend') and length(btrim(coalesce(p_note,''))) < 4 then raise exception 'Alasan penolakan atau penangguhan minimal 4 karakter.'; end if;
  update public.affiliate_profiles set
    status=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' when 'suspend' then 'suspended' else 'approved' end,
    approved_at=case when p_decision='approve' then coalesce(approved_at,now()) else approved_at end,
    approved_by=case when p_decision='approve' then auth.uid() else approved_by end,
    admin_note=left(nullif(btrim(p_note),''),1000),updated_at=now()
  where user_id=p_user_id and (p_decision <> 'approve' or status='pending');
  if not found then raise exception 'Pengajuan tidak ditemukan atau tidak dapat diubah.'; end if;
end;
$$;

create or replace function public.admin_update_affiliate_settings(p_commission_rate numeric)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.is_admin() then raise exception 'Akses admin diperlukan.'; end if;
  if p_commission_rate < 0 or p_commission_rate > 100 then raise exception 'Persentase komisi harus 0–100.'; end if;
  update public.affiliate_program_settings set commission_rate=round(p_commission_rate,2),updated_at=now() where id=1;
end;
$$;

create or replace function public.admin_prepare_affiliate_payouts()
returns integer language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare v_week date := ((now() at time zone 'Asia/Jakarta')::date - ((extract(isodow from now() at time zone 'Asia/Jakarta')::integer-5+7)%7)); v_min bigint; v_row record; v_payout uuid; v_count integer:=0; v_amount bigint;
begin
  if not private.is_admin() then raise exception 'Akses admin diperlukan.'; end if;
  if extract(isodow from now() at time zone 'Asia/Jakarta') <> 5 or (now() at time zone 'Asia/Jakarta')::time < time '15:00' then
    raise exception 'Daftar pencairan mingguan tersedia hari Jumat mulai pukul 15.00 WIB.';
  end if;
  perform public.refresh_affiliate_ledger();
  select minimum_payout into v_min from public.affiliate_program_settings where id=1;
  for v_row in
    select a.user_id,a.bank_account_name,a.bank_account_number,
      coalesce((select sum(c.amount) from public.affiliate_commissions c where c.affiliate_id=a.user_id and c.status='available' and c.payout_id is null),0)
      + coalesce((select sum(b.amount) from public.affiliate_bonus_awards b where b.affiliate_id=a.user_id and b.status='available' and b.payout_id is null),0) as eligible
    from public.affiliate_profiles a
    where a.status in ('approved','closure_requested') and a.bank_account_number is not null
      and not exists(select 1 from public.affiliate_payouts p where p.affiliate_id=a.user_id and p.payout_week=v_week and p.is_final=false)
  loop
    if v_row.eligible >= v_min then
      insert into public.affiliate_payouts(affiliate_id,amount,status,bank_name,bank_account_name,bank_account_number,payout_week)
      values(v_row.user_id,v_row.eligible,'pending','BCA',v_row.bank_account_name,v_row.bank_account_number,v_week)
      returning id into v_payout;
      update public.affiliate_commissions set payout_id=v_payout where affiliate_id=v_row.user_id and status='available' and payout_id is null;
      update public.affiliate_bonus_awards set payout_id=v_payout where affiliate_id=v_row.user_id and status='available' and payout_id is null;
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.admin_update_affiliate_payout(p_payout_id uuid,p_status text,p_reference text default null,p_note text default null)
returns void language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare v_payout public.affiliate_payouts%rowtype;
begin
  if not private.is_admin() then raise exception 'Akses admin diperlukan.'; end if;
  if p_status not in ('processing','paid','failed') then raise exception 'Status pencairan tidak valid.'; end if;
  if p_status='paid' and nullif(btrim(coalesce(p_reference,'')),'') is null then raise exception 'Nomor referensi transfer wajib diisi sebelum pencairan ditandai dibayar.'; end if;
  select * into v_payout from public.affiliate_payouts where id=p_payout_id for update;
  if not found then raise exception 'Data pencairan tidak ditemukan.'; end if;
  if v_payout.status='paid' then raise exception 'Pencairan ini sudah berstatus dibayar.'; end if;
  if v_payout.status='failed' and not v_payout.is_final then raise exception 'Pencairan gagal bersifat final; saldo akan masuk antrean Jumat berikutnya.'; end if;
  update public.affiliate_payouts set status=p_status,transfer_reference=left(nullif(btrim(p_reference),''),160),admin_note=left(nullif(btrim(p_note),''),1000),processed_at=case when p_status in ('paid','failed') then now() else null end,processed_by=auth.uid() where id=p_payout_id;
  if p_status='paid' and v_payout.is_final then
    update public.affiliate_profiles set status='closed',closed_at=now(),updated_at=now() where user_id=v_payout.affiliate_id and status='closure_requested';
  end if;
  if p_status='failed' and not v_payout.is_final then
    update public.affiliate_commissions set payout_id=null where payout_id=p_payout_id;
    update public.affiliate_bonus_awards set payout_id=null where payout_id=p_payout_id;
  end if;
end;
$$;

create or replace function public.admin_review_affiliate_closure(p_user_id uuid,p_approve boolean,p_note text default null)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare v_profile public.affiliate_profiles%rowtype; v_amount bigint; v_payout uuid; v_week date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if not private.is_admin() then raise exception 'Akses admin diperlukan.'; end if;
  select * into v_profile from public.affiliate_profiles where user_id=p_user_id and status='closure_requested' for update;
  if not found then raise exception 'Permintaan penutupan tidak ditemukan.'; end if;
  if not p_approve then
    if exists(select 1 from public.affiliate_payouts where affiliate_id=p_user_id and is_final and status in ('pending','processing')) then
      raise exception 'Pencairan akhir sudah disiapkan dan tidak dapat dibatalkan.';
    end if;
    update public.affiliate_profiles set status='approved',admin_note=left(nullif(btrim(p_note),''),1000),updated_at=now() where user_id=p_user_id;
    return null;
  end if;
  if exists(select 1 from public.affiliate_payouts where affiliate_id=p_user_id and is_final and status in ('pending','processing')) then
    raise exception 'Pencairan akhir sudah disiapkan; tandai dibayar setelah transfer berhasil.';
  end if;
  if v_profile.bank_account_number is null then raise exception 'Affiliate harus melengkapi rekening BCA sebelum penutupan disetujui.'; end if;
  perform public.refresh_affiliate_ledger();
  if exists(select 1 from public.affiliate_commissions where affiliate_id=p_user_id and status='held') then
    raise exception 'Masih ada komisi dalam masa tunggu. Setujui penutupan setelah semua masa retur pesanan berakhir.';
  end if;
  if exists(select 1 from public.affiliate_payouts where affiliate_id=p_user_id and not is_final and status in ('pending','processing')) then
    raise exception 'Selesaikan antrean pencairan biasa sebelum menyetujui penutupan akun.';
  end if;
  select id into v_payout from public.affiliate_payouts where affiliate_id=p_user_id and is_final and status='failed' order by created_at desc limit 1 for update;
  if v_payout is not null then
    update public.affiliate_payouts set status='pending',bank_name='BCA',bank_account_name=v_profile.bank_account_name,bank_account_number=v_profile.bank_account_number,processed_at=null,processed_by=null,admin_note=left(nullif(btrim(p_note),''),1000) where id=v_payout;
    return v_payout;
  end if;
  select coalesce(sum(amount),0) into v_amount from public.affiliate_commissions where affiliate_id=p_user_id and status='available' and payout_id is null;
  v_amount:=v_amount+coalesce((select sum(amount) from public.affiliate_bonus_awards where affiliate_id=p_user_id and status='available' and payout_id is null),0);
  if v_amount>0 then
    insert into public.affiliate_payouts(affiliate_id,amount,status,is_final,bank_name,bank_account_name,bank_account_number,payout_week,admin_note)
    values(p_user_id,v_amount,'pending',true,'BCA',v_profile.bank_account_name,v_profile.bank_account_number,v_week,left(nullif(btrim(p_note),''),1000)) returning id into v_payout;
    update public.affiliate_commissions set payout_id=v_payout where affiliate_id=p_user_id and status='available' and payout_id is null;
    update public.affiliate_bonus_awards set payout_id=v_payout where affiliate_id=p_user_id and status='available' and payout_id is null;
  end if;
  if v_amount=0 then
    update public.affiliate_profiles set status='closed',closed_at=now(),admin_note=left(nullif(btrim(p_note),''),1000),updated_at=now() where user_id=p_user_id;
  else
    update public.affiliate_profiles set admin_note=left(nullif(btrim(p_note),''),1000),updated_at=now() where user_id=p_user_id;
  end if;
  return v_payout;
end;
$$;

create or replace function public.admin_mark_order_returned(p_order_id uuid,p_request_received_at timestamptz default now())
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_order public.orders%rowtype; v_return_days integer;
begin
  if not private.is_admin() then raise exception 'Akses admin diperlukan.'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.shipping_status <> 'delivered' or v_order.delivered_at is null then
    raise exception 'Pesanan tidak ditemukan atau belum berstatus diterima.';
  end if;
  select return_window_days into v_return_days from public.affiliate_program_settings where id=1;
  if p_request_received_at < v_order.delivered_at
    or p_request_received_at > private.add_days(v_order.delivered_at,v_return_days)
    or p_request_received_at > now() + interval '5 minutes' then
    raise exception 'Waktu pengajuan harus berada dalam 3 hari setelah pesanan diterima.';
  end if;
  update public.orders set shipping_status='returned',return_requested_at=p_request_received_at,updated_at=now() where id=p_order_id;
end;
$$;

-- Referral token disediakan server melalui p_customer; tanggal dan afiliasi tidak dipercaya dari browser.
create or replace function public.prepare_midtrans_order(
  p_checkout_token uuid,p_customer jsonb,p_items jsonb,p_shipping jsonb,p_customer_id uuid
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare v_result jsonb; v_order public.orders%rowtype; v_payment public.payments%rowtype; v_stock_item record;
begin
  perform set_config('app.affiliate_attribution_token',coalesce(p_customer->>'affiliate_attribution_token',''),true);
  v_result:=public.create_whatsapp_order_with_shipping(p_checkout_token,p_customer,p_items,p_shipping,p_customer_id);
  select * into v_order from public.orders where checkout_token=p_checkout_token for update;
  if not found or v_order.status='cancelled' then raise exception 'Pesanan ini sudah dibatalkan. Muat ulang checkout untuk membuat pesanan baru.'; end if;
  if v_order.shipping_fee is null or v_order.total_amount is null then raise exception 'Tarif pengiriman atau total pesanan belum tersedia.'; end if;
  if v_order.stock_reserved_at is null and v_order.stock_deducted_at is null and v_order.payment_status<>'paid' then
    for v_stock_item in select variant_id,size_id,sum(quantity)::integer quantity from public.order_items where order_id=v_order.id group by variant_id,size_id order by variant_id,size_id loop
      update public.inventory set stock_quantity=stock_quantity+v_stock_item.quantity,reserved_quantity=reserved_quantity+v_stock_item.quantity,updated_at=now()
      where variant_id=v_stock_item.variant_id and size_id=v_stock_item.size_id;
      if not found then raise exception 'Stok pesanan tidak dapat dicadangkan. Muat ulang checkout.'; end if;
    end loop;
    update public.orders set stock_reserved_at=now() where id=v_order.id;
  end if;
  update public.orders set payment_method='midtrans_snap',status=case when status in ('needs_confirmation','awaiting_payment') then 'awaiting_payment' else status end,
    payment_status=case when payment_status in ('unpaid','waiting_confirmation') then 'waiting_confirmation' else payment_status end,
    shipping_status='ready_to_ship',updated_at=now() where id=v_order.id;
  select * into v_order from public.orders where id=v_order.id;
  select * into v_payment from public.payments where order_id=v_order.id and provider='midtrans' for update;
  if not found then insert into public.payments(order_id,provider,status,amount) values(v_order.id,'midtrans','pending',v_order.total_amount) returning * into v_payment;
  elsif v_payment.amount<>v_order.total_amount then raise exception 'Nilai pembayaran pesanan berubah. Buat checkout baru.'; end if;
  return v_result||jsonb_build_object('order_id',v_order.id,'order_number',v_order.order_number,'amount',v_order.total_amount,'payment_id',v_payment.id,
    'payment_reference',v_payment.payment_reference,'payment_status',v_payment.status,'customer_id',v_order.customer_id,
    'discount_base_amount',v_order.discount_base_amount,'discount_amount',v_order.discount_amount,'discount_percent',v_order.discount_percent,
    'discount_order_number',v_order.discount_order_number,'discount_tokens_remaining',v_order.discount_tokens_remaining);
end;
$$;

revoke all on function public.record_affiliate_referral(text,uuid) from public;
grant execute on function public.record_affiliate_referral(text,uuid) to anon,authenticated;
revoke all on function public.apply_affiliate_application(text,text,text) from public;
grant execute on function public.apply_affiliate_application(text,text,text) to authenticated;
revoke all on function public.save_affiliate_bank_account(text,text) from public;
grant execute on function public.save_affiliate_bank_account(text,text) to authenticated;
revoke all on function public.request_affiliate_closure(text) from public;
grant execute on function public.request_affiliate_closure(text) to authenticated;
revoke all on function public.get_affiliate_dashboard() from public;
grant execute on function public.get_affiliate_dashboard() to authenticated;
revoke all on function public.get_admin_affiliate_dashboard() from public;
grant execute on function public.get_admin_affiliate_dashboard() to authenticated;
revoke all on function public.admin_review_affiliate(uuid,text,text) from public;
grant execute on function public.admin_review_affiliate(uuid,text,text) to authenticated;
revoke all on function public.admin_update_affiliate_settings(numeric) from public;
grant execute on function public.admin_update_affiliate_settings(numeric) to authenticated;
revoke all on function public.admin_prepare_affiliate_payouts() from public;
grant execute on function public.admin_prepare_affiliate_payouts() to authenticated;
revoke all on function public.admin_update_affiliate_payout(uuid,text,text,text) from public;
grant execute on function public.admin_update_affiliate_payout(uuid,text,text,text) to authenticated;
revoke all on function public.admin_review_affiliate_closure(uuid,boolean,text) from public;
grant execute on function public.admin_review_affiliate_closure(uuid,boolean,text) to authenticated;
revoke all on function public.admin_mark_order_returned(uuid,timestamptz) from public;
grant execute on function public.admin_mark_order_returned(uuid,timestamptz) to authenticated;
revoke all on function public.refresh_affiliate_ledger() from public,anon,authenticated;
grant execute on function public.refresh_affiliate_ledger() to service_role;
revoke all on function public.prepare_midtrans_order(uuid,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.prepare_midtrans_order(uuid,jsonb,jsonb,jsonb,uuid) to service_role;
grant select on public.affiliate_profiles,public.affiliate_commissions,public.affiliate_bonus_awards,public.affiliate_payouts to service_role;
grant select,update on public.orders to service_role;
grant usage,select on sequence public.affiliate_click_events_id_seq to service_role;

do $$ begin
  if exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then null; end if;
  if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='affiliate_profiles') then
    execute 'alter publication supabase_realtime add table public.affiliate_profiles';
  end if;
  if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='affiliate_commissions') then
    execute 'alter publication supabase_realtime add table public.affiliate_commissions';
  end if;
exception when undefined_object then raise notice 'Publication Realtime belum tersedia; muat ulang dashboard secara manual.';
end $$;

commit;

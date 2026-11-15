-- Dukungan kampanye email untuk member yang masih menyetujui email promosi.
begin;

alter table public.customer_profiles
  add column if not exists email_marketing_unsubscribe_token uuid;

update public.customer_profiles
set email_marketing_unsubscribe_token = gen_random_uuid()
where email_marketing_opt_in = true
  and email_marketing_unsubscribe_token is null;

create unique index if not exists customer_profiles_unsubscribe_token_idx
  on public.customer_profiles (email_marketing_unsubscribe_token)
  where email_marketing_unsubscribe_token is not null;

create or replace function private.rotate_customer_unsubscribe_token()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if new.email_marketing_opt_in then
    if tg_op = 'INSERT' then
      new.email_marketing_unsubscribe_token := coalesce(new.email_marketing_unsubscribe_token, gen_random_uuid());
    elsif not old.email_marketing_opt_in or new.email_marketing_unsubscribe_token is null then
      new.email_marketing_unsubscribe_token := gen_random_uuid();
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists customer_profiles_rotate_unsubscribe_token on public.customer_profiles;
create trigger customer_profiles_rotate_unsubscribe_token
before insert or update of email_marketing_opt_in on public.customer_profiles
for each row execute function private.rotate_customer_unsubscribe_token();

create or replace function public.unsubscribe_customer_email_marketing(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  affected integer;
begin
  if p_token is null then return false; end if;
  update public.customer_profiles
  set email_marketing_opt_in = false,
      email_marketing_unsubscribed_at = now(),
      updated_at = now()
  where email_marketing_unsubscribe_token = p_token
    and email_marketing_opt_in = true;
  get diagnostics affected = row_count;
  return affected > 0;
end;
$function$;

revoke all on function private.rotate_customer_unsubscribe_token() from public, anon, authenticated;
revoke all on function public.unsubscribe_customer_email_marketing(uuid) from public, authenticated;
grant execute on function public.unsubscribe_customer_email_marketing(uuid) to anon, authenticated;

create or replace function public.service_promo_email_recipients()
returns table (user_id uuid, email text, full_name text, unsubscribe_token uuid)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
  select cp.user_id, u.email::text, cp.full_name, cp.email_marketing_unsubscribe_token
  from public.customer_profiles cp
  join auth.users u on u.id = cp.user_id
  where cp.email_marketing_opt_in = true
    and cp.email_marketing_unsubscribed_at is null
    and cp.email_marketing_unsubscribe_token is not null
    and u.email_confirmed_at is not null
    and nullif(btrim(u.email), '') is not null
    and not exists (select 1 from public.admin_users au where au.user_id = cp.user_id)
  order by cp.created_at;
$function$;

revoke all on function public.service_promo_email_recipients() from public, anon, authenticated;
grant execute on function public.service_promo_email_recipients() to service_role;

create table if not exists public.promo_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete restrict,
  subject text not null,
  message text not null,
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  status text not null default 'sending',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint promo_email_subject_length check (char_length(subject) between 1 and 150),
  constraint promo_email_message_length check (char_length(message) between 1 and 5000),
  constraint promo_email_counts_nonnegative check (recipient_count >= 0 and sent_count >= 0 and failed_count >= 0),
  constraint promo_email_status_check check (status in ('sending', 'sent', 'partial', 'failed'))
);

alter table public.promo_email_campaigns enable row level security;
revoke all on public.promo_email_campaigns from public, anon, authenticated;
grant select, insert, update on public.promo_email_campaigns to service_role;

commit;

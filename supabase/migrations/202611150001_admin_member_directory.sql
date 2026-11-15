-- Daftar member untuk dashboard admin, tanpa membuka email auth.users ke browser publik.
begin;

create or replace function public.admin_list_customer_members(
  p_search text default null,
  p_marketing_opt_in boolean default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  email text,
  full_name text,
  phone text,
  email_confirmed boolean,
  email_marketing_opt_in boolean,
  email_marketing_opted_in_at timestamptz,
  created_at timestamptz,
  order_count bigint,
  paid_order_count bigint,
  discount_tokens_used integer,
  discount_tokens_reserved integer,
  discount_tokens_remaining integer,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, private
as $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not private.is_admin() then
    raise exception 'Akses admin diperlukan.' using errcode = '42501';
  end if;

  return query
  with filtered_members as (
    select
      cp.user_id,
      u.email::text as member_email,
      cp.full_name,
      cp.phone,
      (u.email_confirmed_at is not null) as is_email_confirmed,
      cp.email_marketing_opt_in,
      cp.email_marketing_opted_in_at,
      cp.created_at
    from public.customer_profiles as cp
    join auth.users as u on u.id = cp.user_id
    where not exists (
      select 1 from public.admin_users as au where au.user_id = cp.user_id
    )
      and (p_marketing_opt_in is null or cp.email_marketing_opt_in = p_marketing_opt_in)
      and (
        nullif(btrim(p_search), '') is null
        or concat_ws(' ', cp.full_name, u.email, cp.phone) ilike '%' || btrim(p_search) || '%'
      )
  ), order_stats as (
    select
      o.customer_id,
      count(*)::bigint as order_count,
      count(*) filter (where o.payment_status = 'paid')::bigint as paid_order_count,
      count(distinct o.discount_order_number) filter (
        where o.discount_order_number between 1 and 5
          and o.discount_amount > 0
          and o.payment_status = 'paid'
      )::integer as discount_tokens_used,
      count(distinct o.discount_order_number) filter (
        where o.discount_order_number between 1 and 5
          and o.discount_amount > 0
          and o.status <> 'cancelled'
          and o.payment_status in ('unpaid', 'waiting_confirmation')
      )::integer as discount_tokens_reserved
    from public.orders as o
    join filtered_members as fm on fm.user_id = o.customer_id
    group by o.customer_id
  )
  select
    fm.user_id,
    fm.member_email,
    fm.full_name,
    fm.phone,
    fm.is_email_confirmed,
    fm.email_marketing_opt_in,
    fm.email_marketing_opted_in_at,
    fm.created_at,
    coalesce(os.order_count, 0)::bigint,
    coalesce(os.paid_order_count, 0)::bigint,
    coalesce(os.discount_tokens_used, 0)::integer,
    coalesce(os.discount_tokens_reserved, 0)::integer,
    greatest(5 - coalesce(os.discount_tokens_used, 0) - coalesce(os.discount_tokens_reserved, 0), 0)::integer,
    count(*) over ()::bigint
  from filtered_members as fm
  left join order_stats as os on os.customer_id = fm.user_id
  order by fm.created_at desc, fm.full_name asc
  limit v_limit
  offset v_offset;
end;
$function$;

revoke all on function public.admin_list_customer_members(text, boolean, integer, integer) from public, anon;
grant execute on function public.admin_list_customer_members(text, boolean, integer, integer) to authenticated;

commit;

-- Batasi dashboard maksimal dua akun admin aktif.
-- Kunci advisory mencegah dua permintaan bersamaan melewati batas.

begin;

create or replace function private.enforce_admin_user_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_admin_count integer;
begin
  if new.is_active is not true then
    return new;
  end if;

  perform pg_advisory_xact_lock(741026, 2);

  select count(*)::integer
    into active_admin_count
    from public.admin_users as admins
   where admins.is_active = true
     and admins.user_id is distinct from new.user_id;

  if active_admin_count >= 2 then
    raise exception 'Maksimal dua akun admin aktif.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_admin_user_limit() from public, anon, authenticated;

drop trigger if exists admin_users_enforce_active_limit on public.admin_users;
create trigger admin_users_enforce_active_limit
before insert or update of is_active on public.admin_users
for each row execute function private.enforce_admin_user_limit();

commit;

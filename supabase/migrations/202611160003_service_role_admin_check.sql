-- Allow the promo-email Edge Function to check active admin membership.
-- The server uses the service role key and reads only these two columns.
begin;

grant select (user_id, is_active)
  on table public.admin_users
  to service_role;

commit;

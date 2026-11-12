-- Allow the payment Edge Function to read only the order data it needs.
-- Keep these privileges limited to service_role; do not grant them to anon.
begin;

grant usage on schema public to service_role;
grant select on table public.orders, public.order_items, public.payments to service_role;

commit;

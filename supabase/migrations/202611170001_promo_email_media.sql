-- Store optional campaign image and call-to-action link details.
begin;

alter table public.promo_email_campaigns
  add column if not exists image_url text,
  add column if not exists button_text text,
  add column if not exists button_url text;

commit;

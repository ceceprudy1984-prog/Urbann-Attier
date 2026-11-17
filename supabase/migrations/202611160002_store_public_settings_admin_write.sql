-- Pulihkan izin simpan konten sorotan; RLS tetap membatasi perubahan untuk admin aktif.
begin;

grant select on public.store_public_settings to anon, authenticated;
grant update on public.store_public_settings to authenticated;

drop policy if exists store_public_settings_admin_update on public.store_public_settings;
create policy store_public_settings_admin_update on public.store_public_settings
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

commit;

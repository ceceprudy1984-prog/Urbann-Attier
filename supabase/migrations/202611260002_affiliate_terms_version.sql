-- Catat persetujuan untuk versi syarat affiliate yang ditampilkan sebelum pendaftaran.

begin;

update public.affiliate_program_settings
   set terms_version = '2026-11-v2',
       updated_at = now()
 where id = 1;

commit;

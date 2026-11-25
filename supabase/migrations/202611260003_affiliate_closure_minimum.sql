-- Saat akun affiliate ditutup, saldo di bawah minimum tidak dicairkan sebagai pembayaran akhir.
-- Saldo tetap tercatat; akun tertutup tetap dapat melihat ringkasan saldo secara read-only.

begin;

create or replace function public.admin_review_affiliate_closure(
  p_user_id uuid,
  p_approve boolean,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_profile public.affiliate_profiles%rowtype;
  v_amount bigint;
  v_minimum bigint;
  v_payout uuid;
  v_failed_final_amount bigint;
  v_week date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if not private.is_admin() then raise exception 'Akses admin diperlukan.'; end if;
  select * into v_profile
    from public.affiliate_profiles
   where user_id = p_user_id and status = 'closure_requested'
   for update;
  if not found then raise exception 'Permintaan penutupan tidak ditemukan.'; end if;

  if not p_approve then
    if exists (
      select 1 from public.affiliate_payouts
       where affiliate_id = p_user_id and is_final and status in ('pending','processing')
    ) then
      raise exception 'Pencairan akhir sudah disiapkan dan tidak dapat dibatalkan.';
    end if;
    update public.affiliate_profiles
       set status = 'approved', admin_note = left(nullif(btrim(p_note),''),1000), updated_at = now()
     where user_id = p_user_id;
    return null;
  end if;

  if exists (
    select 1 from public.affiliate_payouts
     where affiliate_id = p_user_id and is_final and status in ('pending','processing')
  ) then
    raise exception 'Pencairan akhir sudah disiapkan; tandai dibayar setelah transfer berhasil.';
  end if;

  perform public.refresh_affiliate_ledger();
  if exists (select 1 from public.affiliate_commissions where affiliate_id=p_user_id and status='held') then
    raise exception 'Masih ada komisi dalam masa tunggu. Setujui penutupan setelah semua masa retur pesanan berakhir.';
  end if;
  if exists (
    select 1 from public.affiliate_payouts
     where affiliate_id=p_user_id and not is_final and status in ('pending','processing')
  ) then
    raise exception 'Selesaikan antrean pencairan biasa sebelum menyetujui penutupan akun.';
  end if;

  select minimum_payout into v_minimum from public.affiliate_program_settings where id=1;

  -- Pulihkan antrean pembayaran akhir yang gagal agar nilainya bisa dinilai kembali.
  select id, amount into v_payout, v_failed_final_amount
    from public.affiliate_payouts
   where affiliate_id=p_user_id and is_final and status='failed'
   order by created_at desc limit 1 for update;
  if v_payout is not null and v_failed_final_amount >= v_minimum and v_profile.bank_account_number is not null then
    update public.affiliate_payouts
       set status='pending', bank_name='BCA', bank_account_name=v_profile.bank_account_name,
           bank_account_number=v_profile.bank_account_number, processed_at=null,
           processed_by=null, admin_note=left(nullif(btrim(p_note),''),1000)
     where id=v_payout;
    return v_payout;
  elsif v_payout is not null then
    update public.affiliate_commissions set payout_id=null where payout_id=v_payout;
    update public.affiliate_bonus_awards set payout_id=null where payout_id=v_payout;
    update public.affiliate_payouts
       set is_final=false,
           admin_note='Pembayaran akhir di bawah minimum pencairan; saldo tidak dicairkan.'
     where id=v_payout;
  end if;

  select coalesce(sum(amount),0) into v_amount
    from public.affiliate_commissions
   where affiliate_id=p_user_id and status='available' and payout_id is null;
  v_amount := v_amount + coalesce((
    select sum(amount) from public.affiliate_bonus_awards
     where affiliate_id=p_user_id and status='available' and payout_id is null
  ),0);

  if v_amount >= v_minimum and v_amount > 0 then
    if v_profile.bank_account_number is null then
      raise exception 'Affiliate harus melengkapi rekening BCA sebelum pembayaran akhir.';
    end if;
    insert into public.affiliate_payouts(
      affiliate_id,amount,status,is_final,bank_name,bank_account_name,
      bank_account_number,payout_week,admin_note
    ) values (
      p_user_id,v_amount,'pending',true,'BCA',v_profile.bank_account_name,
      v_profile.bank_account_number,v_week,left(nullif(btrim(p_note),''),1000)
    ) returning id into v_payout;
    update public.affiliate_commissions set payout_id=v_payout
     where affiliate_id=p_user_id and status='available' and payout_id is null;
    update public.affiliate_bonus_awards set payout_id=v_payout
     where affiliate_id=p_user_id and status='available' and payout_id is null;
    update public.affiliate_profiles
       set admin_note=left(nullif(btrim(p_note),''),1000),updated_at=now()
     where user_id=p_user_id;
    return v_payout;
  end if;

  -- Penutupan tetap dapat disetujui, tetapi saldo di bawah minimum tidak dibayar.
  update public.affiliate_profiles
     set status='closed', closed_at=now(),
         admin_note=concat_ws(' ',nullif(btrim(p_note),''),
           'Saldo di bawah minimum pencairan tetap tercatat dan tidak dicairkan.'),
         updated_at=now()
   where user_id=p_user_id;
  return null;
end;
$$;

revoke all on function public.admin_review_affiliate_closure(uuid,boolean,text) from public, anon;
grant execute on function public.admin_review_affiliate_closure(uuid,boolean,text) to authenticated;

commit;

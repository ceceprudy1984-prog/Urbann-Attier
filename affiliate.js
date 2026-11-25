const affiliateClient = window.urbannSupabaseClient || null;
const $affiliate = (selector) => document.querySelector(selector);
let affiliateMode = "login";
let affiliateSession = null;
let affiliateSettings = null;

function affiliateStatus(message = "", isError = false) {
  const el = $affiliate("#affiliateStatus");
  el.textContent = message;
  el.classList.toggle("is-error", isError);
}
function affiliateMoney(value) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
}
function affiliateDate(value) {
  return value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value)) : "—";
}
function affiliateEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function statusLabel(value) {
  return ({ pending: "Menunggu persetujuan", approved: "Aktif", rejected: "Belum disetujui", suspended: "Ditangguhkan", closure_requested: "Penutupan ditinjau", closed: "Ditutup", held: "Menunggu masa retur", available: "Siap dicairkan", reversed: "Dibatalkan", paid: "Dibayar", processing: "Diproses", failed: "Gagal" })[value] || value || "—";
}
function setAuthMode(mode) {
  affiliateMode = mode;
  const registering = mode === "register";
  $affiliate("#authTitle").textContent = registering ? "Daftar sebagai affiliate" : "Masuk ke akun affiliate";
  $affiliate("#authSubmit").textContent = registering ? "Buat akun" : "Masuk";
  $affiliate("#authPassword").autocomplete = registering ? "new-password" : "current-password";
  $affiliate("#nameField").hidden = !registering;
  $affiliate("#phoneField").hidden = !registering;
  $affiliate("#authApplicantName").required = registering;
  $affiliate("#authApplicantPhone").required = registering;
  $affiliate("#authSwitch").innerHTML = registering
    ? 'Sudah punya akun? <button type="button" data-mode="login">Masuk</button>'
    : 'Belum punya akun? <button type="button" data-mode="register">Daftar</button>';
}
async function loadAffiliateSettings() {
  const { data, error } = await affiliateClient.from("affiliate_program_settings")
    .select("terms_version,commission_rate,referral_days,minimum_payout,monthly_bonus_units,monthly_bonus_amount").eq("id", 1).single();
  if (error) throw error;
  affiliateSettings = data;
}
function renderAffiliateDashboard(data) {
  $affiliate("#authPanel").hidden = true;
  $affiliate("#applicationPanel").hidden = true;
  $affiliate("#affiliateDashboard").hidden = false;
  $affiliate("#dashboardGreeting").textContent = `Halo, ${data.full_name || affiliateSession.user.email || "Affiliate"}`;
  if (!$affiliate("#applicantName").value) $affiliate("#applicantName").value = data.full_name || "";
  if (!$affiliate("#applicantPhone").value) $affiliate("#applicantPhone").value = data.phone || "";
  const state = data.application_status;
  $affiliate("#applicationLabel").textContent = state === "approved"
    ? "Akun affiliate Anda aktif. Berikut ringkasan performa dan saldo." : `Status akun: ${statusLabel(state)}.`;
  const content = $affiliate("#approvedContent");
  content.hidden = state !== "approved" && state !== "closure_requested";
  if (content.hidden) return;
  const link = new URL("index.html", window.location.href);
  link.searchParams.set("ref", data.referral_code);
  $affiliate("#referralLink").textContent = link.href;
  $affiliate("#clickCount").textContent = Number(data.click_count || 0).toLocaleString("id-ID");
  $affiliate("#pendingBalance").textContent = affiliateMoney(data.pending_commission);
  $affiliate("#availableBalance").textContent = affiliateMoney(data.available_balance);
  $affiliate("#paidTotal").textContent = affiliateMoney(data.paid_total);
  $affiliate("#payoutNote").textContent = `Pencairan manual setiap Jumat pukul 15.00 WIB ke BCA. Minimum ${affiliateMoney(data.minimum_payout)}; saldo di bawah batas dibawa ke minggu berikutnya. Komisi ${data.commission_rate}% dilepas setelah pesanan dibayar, diterima, dan melewati ${data.return_window_days || 3} hari tanpa retur.`;
  $affiliate("#bankAccountName").value = data.bank_account_name || "";
  $affiliate("#bankAccountNumber").value = data.bank_account_number || "";
  const commissions = data.recent_commissions || [];
  $affiliate("#commissionRows").innerHTML = commissions.map((row) => `<tr><td>${affiliateEscape(row.order_number || "Pesanan")}</td><td>${affiliateMoney(row.product_amount)}</td><td>${affiliateMoney(row.amount)} <small>(${affiliateEscape(row.commission_rate)}%)</small></td><td>${affiliateEscape(statusLabel(row.status))}</td></tr>`).join("");
  $affiliate("#commissionEmpty").hidden = commissions.length > 0;
  const bonuses = data.bonus_awards || [];
  $affiliate("#bonusRows").innerHTML = bonuses.map((row) => `<tr><td>${affiliateDate(row.period_month)}</td><td>${Number(row.qualified_units).toLocaleString("id-ID")} pcs</td><td>${affiliateMoney(row.amount)}</td><td>${affiliateEscape(statusLabel(row.status))}</td></tr>`).join("");
  $affiliate("#bonusEmpty").hidden = bonuses.length > 0;
  const payouts = data.payout_history || [];
  $affiliate("#payoutRows").innerHTML = payouts.map((row) => `<tr><td>${affiliateDate(row.created_at)}</td><td>${affiliateMoney(row.amount)}</td><td>${affiliateEscape(statusLabel(row.status))}</td><td>${affiliateEscape(row.transfer_reference || row.admin_note || "—")}</td></tr>`).join("");
  $affiliate("#payoutEmpty").hidden = payouts.length > 0;
  $affiliate("#closureForm").hidden = state !== "approved";
}
async function loadAffiliateDashboard() {
  const { data, error } = await affiliateClient.rpc("get_affiliate_dashboard");
  if (error) throw error;
  if (data.application_status === "not_applied") {
    $affiliate("#authPanel").hidden = true;
    $affiliate("#affiliateDashboard").hidden = true;
    $affiliate("#applicationPanel").hidden = false;
    return;
  }
  renderAffiliateDashboard(data);
}
async function enterAffiliate(session) {
  affiliateSession = session;
  const metadata = session.user?.user_metadata || {};
  if (!$affiliate("#applicantName").value) $affiliate("#applicantName").value = metadata.full_name || metadata.name || "";
  if (!$affiliate("#applicantPhone").value) $affiliate("#applicantPhone").value = metadata.phone || "";
  $affiliate("#authPanel").hidden = true;
  affiliateStatus("Memuat dashboard affiliate…");
  try {
    await loadAffiliateSettings();
    await loadAffiliateDashboard();
    affiliateStatus("");
  } catch (error) {
    $affiliate("#authPanel").hidden = false;
    affiliateStatus(`Dashboard belum dapat dimuat. Pastikan migrasi affiliate sudah dipasang. ${error.message || ""}`, true);
  }
}
$affiliate("#authSwitch").addEventListener("click", (event) => {
  const button = event.target.closest("[data-mode]");
  if (button) setAuthMode(button.dataset.mode);
});
$affiliate("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!affiliateClient) return affiliateStatus("Koneksi akun belum siap. Muat ulang halaman.", true);
  const button = $affiliate("#authSubmit");
  button.disabled = true;
  affiliateStatus(affiliateMode === "register" ? "Membuat akun…" : "Memeriksa akun…");
  try {
    const email = $affiliate("#authEmail").value.trim();
    const password = $affiliate("#authPassword").value;
    let result;
    if (affiliateMode === "register") {
      result = await affiliateClient.auth.signUp({ email, password, options: { emailRedirectTo: new URL("affiliate.html", location.href).href, data: { full_name: $affiliate("#authApplicantName").value.trim(), phone: $affiliate("#authApplicantPhone").value.trim() } } });
      if (result.error) throw result.error;
      if (!result.data.session) {
        affiliateStatus("Akun dibuat. Buka tautan verifikasi yang dikirim ke email, lalu masuk di halaman ini.");
        setAuthMode("login");
        return;
      }
      await enterAffiliate(result.data.session);
      $affiliate("#applicantName").value = $affiliate("#authApplicantName").value.trim();
      $affiliate("#applicantPhone").value = $affiliate("#authApplicantPhone").value.trim();
      affiliateStatus("Akun siap. Baca ketentuan lalu ajukan keanggotaan affiliate.");
    } else {
      result = await affiliateClient.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      await enterAffiliate(result.data.session);
    }
  } catch (error) {
    affiliateStatus(error.message || "Permintaan akun belum berhasil.", true);
  } finally { button.disabled = false; }
});
$affiliate("#applyButton").addEventListener("click", async () => {
  if (!$affiliate("#acceptTerms").checked) return affiliateStatus("Centang persetujuan setelah membaca seluruh ketentuan.", true);
  if (!$affiliate("#applicantName").value.trim() || !$affiliate("#applicantPhone").value.trim()) {
    return affiliateStatus("Lengkapi nama dan nomor WhatsApp terlebih dahulu.", true);
  }
  const fullName = $affiliate("#applicantName").value.trim();
  const phone = $affiliate("#applicantPhone").value.trim();
  try {
    const { error } = await affiliateClient.rpc("apply_affiliate_application", { p_full_name: fullName, p_phone: phone, p_terms_version: affiliateSettings.terms_version });
    if (error) throw error;
    await loadAffiliateDashboard();
    affiliateStatus("Pengajuan terkirim. Admin akan meninjau dan memberi kabar melalui email.");
  } catch (error) { affiliateStatus(error.message || "Pengajuan belum berhasil.", true); }
});
$affiliate("#copyReferral").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($affiliate("#referralLink").textContent); affiliateStatus("Link referral berhasil disalin."); }
  catch { affiliateStatus("Salin link referral dari teks di atas.", true); }
});
$affiliate("#bankForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const { error } = await affiliateClient.rpc("save_affiliate_bank_account", { p_account_name: $affiliate("#bankAccountName").value.trim(), p_account_number: $affiliate("#bankAccountNumber").value.replace(/\s/g, "") });
    if (error) throw error;
    affiliateStatus("Rekening BCA tersimpan.");
  } catch (error) { affiliateStatus(error.message || "Rekening belum dapat disimpan.", true); }
});
$affiliate("#closureForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!confirm("Ajukan penutupan akun affiliate untuk ditinjau admin?")) return;
  try {
    const { error } = await affiliateClient.rpc("request_affiliate_closure", { p_reason: $affiliate("#closureReason").value.trim() });
    if (error) throw error;
    await loadAffiliateDashboard();
    affiliateStatus("Permintaan penutupan dikirim dan menunggu persetujuan admin.");
  } catch (error) { affiliateStatus(error.message || "Permintaan belum berhasil.", true); }
});
$affiliate("#affiliateLogout").addEventListener("click", async () => { await affiliateClient.auth.signOut(); affiliateSession = null; $affiliate("#affiliateDashboard").hidden = true; $affiliate("#authPanel").hidden = false; affiliateStatus("Anda sudah keluar."); });

if (affiliateClient) {
  affiliateClient.auth.getSession().then(({ data }) => { if (data.session) enterAffiliate(data.session); });
  affiliateClient.auth.onAuthStateChange((event, session) => { if (event === "SIGNED_IN" && session) enterAffiliate(session); });
  setAuthMode("login");
} else affiliateStatus("Koneksi akun belum siap. Muat ulang atau hubungi admin.", true);

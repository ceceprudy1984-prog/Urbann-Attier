const config = window.URBANN_SUPABASE_CONFIG;
const hasConfig = Boolean(config?.url && config?.publishableKey && window.supabase?.createClient);
const supabaseClient = hasConfig
  ? window.supabase.createClient(config.url, config.publishableKey)
  : null;

const $ = (selector) => document.querySelector(selector);
const state = {
  user: null,
  products: [],
  categories: [],
  orders: [],
  members: [],
  membersTotal: 0,
  membersOffset: 0,
  membersPageSize: 50,
  membersRequestId: 0,
  membersSearchTimer: null,
  ordersFilter: "all",
  orderChannel: null,
  orderRefreshTimer: null,
  orderRefreshPending: false,
  editingOrderId: null,
  editingProductId: null,
  variants: [],
  sizes: [],
  stockDraft: new Map(),
  imageFiles: new Map(),
  spotlightFiles: { launch: null, promo: null },
  spotlightBusy: false,
  homepageSettings: null,
  promoAudienceCount: null,
  promoEmailBusy: false,
  promoEmailImageFile: null,
  affiliateAdminData: null,
  busy: false,
};

function showLogin(message = "") {
  $("#loginView").hidden = false;
  $("#dashboardView").hidden = true;
  $("#loginStatus").textContent = message;
}

function showDashboard(user) {
  state.user = user;
  $("#loginView").hidden = true;
  $("#dashboardView").hidden = false;
  $("#adminWelcome").textContent = `Masuk sebagai ${user.email || "admin"}`;
  $("#currentAdminEmail").value = user.email || "";
}

function formatRupiah(value) {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function setStatus(selector, message, isError = false) {
  const element = $(selector);
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function stockKey(color, size) {
  return `${color}\u0000${size}`;
}

function parseNumber(value, label, { integer = false, min = 0 } = {}) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || number < min || (integer && !Number.isInteger(number))) {
    throw new Error(`${label} harus berupa angka ${integer ? "bulat " : ""}minimal ${min}.`);
  }
  return number;
}

function parseVariantLines(text) {
  const rows = String(text || "").split(/\r?\n/).map((line, index) => {
    const [colorRaw, imageRaw = "", altRaw = ""] = line.split("|").map((part) => part.trim());
    if (!colorRaw) return null;
    return { color: colorRaw, image: imageRaw, alt: altRaw, line: index + 1 };
  }).filter(Boolean);

  const names = new Set();
  rows.forEach(({ color, line }) => {
    const key = color.toLocaleLowerCase("id-ID");
    if (!names.has(key)) names.add(key);
  });
  return { rows, colors: [...names].map((key) => rows.find((row) => row.color.toLocaleLowerCase("id-ID") === key).color) };
}

function parseSizeLines(text) {
  const rows = String(text || "").split(/\r?\n/).map((line, index) => {
    const [nameRaw, bustRaw = "", lengthRaw = "", sleeveRaw = ""] = line.split("|").map((part) => part.trim());
    if (!nameRaw) return null;
    return {
      name: nameRaw,
      bust: parseNumber(bustRaw, `Lingkar dada baris ${index + 1}`),
      length: parseNumber(lengthRaw, `Panjang gamis baris ${index + 1}`),
      sleeve: parseNumber(sleeveRaw, `Panjang lengan baris ${index + 1}`),
    };
  }).filter(Boolean);

  const seen = new Set();
  rows.forEach(({ name }) => {
    const key = name.toLocaleLowerCase("id-ID");
    if (seen.has(key)) throw new Error(`Ukuran “${name}” ditulis lebih dari sekali.`);
    seen.add(key);
  });
  return rows;
}

function syncStockDraft() {
  document.querySelectorAll("[data-stock-color][data-stock-size]").forEach((input) => {
    const key = stockKey(input.dataset.stockColor, input.dataset.stockSize);
    const value = input.value.trim();
    state.stockDraft.set(key, value === "" ? null : value);
  });
}

function renderStockMatrix() {
  syncStockDraft();
  const { colors } = parseVariantLines($("#productVariants").value);
  const sizes = parseSizeLines($("#productSizes").value);
  renderImageColorOptions(colors);
  const matrix = $("#inventoryMatrix");
  const count = colors.length * sizes.length;
  $("#inventoryCombinationCount").textContent = `${count} kombinasi`;

  if (!colors.length || !sizes.length) {
    matrix.innerHTML = '<p class="matrix-empty">Isi warna dan ukuran terlebih dahulu.</p>';
    return;
  }

  matrix.innerHTML = `<div class="table-scroll"><table class="inventory-table">
    <thead><tr><th>Warna</th><th>Ukuran</th><th>Stok</th></tr></thead><tbody>
    ${colors.map((color) => sizes.map((size) => {
      const value = state.stockDraft.get(stockKey(color, size.name));
      return `<tr><td>${escapeHtml(color)}</td><td>${escapeHtml(size.name)}</td><td>
        <label class="sr-only">Stok ${escapeHtml(color)} ukuran ${escapeHtml(size.name)}</label>
        <input type="number" min="0" step="1" inputmode="numeric" data-stock-color="${escapeHtml(color)}" data-stock-size="${escapeHtml(size.name)}" value="${value ?? ""}" placeholder="Belum diisi" />
      </td></tr>`;
    }).join("")).join("")}
    </tbody></table></div>`;
}

function renderImageColorOptions(colors) {
  const select = $("#imageVariantColor");
  const previous = select.value;
  select.innerHTML = colors.length
    ? colors.map((color) => `<option value="${escapeHtml(color)}">${escapeHtml(color)}</option>`).join("")
    : '<option value="">Isi warna terlebih dahulu</option>';
  if (colors.includes(previous)) select.value = previous;
  select.disabled = colors.length === 0;
  $("#productImageFiles").disabled = colors.length === 0;
  renderSelectedImageFiles();
}

function renderSelectedImageFiles() {
  const container = $("#selectedImageFiles");
  const entries = [...state.imageFiles.entries()].flatMap(([color, files]) =>
    files.map((file, index) => ({ color, file, index })));
  container.innerHTML = entries.length ? entries.map(({ color, file, index }) => `
    <div class="selected-file"><span>${escapeHtml(color)} · ${escapeHtml(file.name)}</span>
      <button type="button" data-remove-image="${escapeHtml(color)}" data-image-index="${index}" aria-label="Hapus pilihan ${escapeHtml(file.name)}">Hapus</button></div>`).join("")
    : '<p class="upload-hint">Foto yang dipilih akan diunggah saat produk disimpan.</p>';
}

function setActiveView(viewName) {
  $("#overviewPage").hidden = viewName !== "overview";
  $("#trafficPage").hidden = viewName !== "traffic";
  $("#ordersPage").hidden = viewName !== "orders";
  $("#membersPage").hidden = viewName !== "members";
  $("#spotlightAdminPage").hidden = viewName !== "spotlight";
  $("#emailCampaignsPage").hidden = viewName !== "email-campaigns";
  $("#productsPage").hidden = viewName !== "products";
  $("#affiliatesPage").hidden = viewName !== "affiliates";
  document.querySelectorAll("[data-admin-view]").forEach((button) => {
    const active = button.dataset.adminView === viewName;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  if (viewName === "products") loadProducts();
  if (viewName === "affiliates") loadAffiliateAdmin();
  if (viewName === "traffic") loadTrafficReport();
  if (viewName === "orders") loadOrders();
  if (viewName === "members") loadMembers();
  if (viewName === "spotlight") loadHomepageContent();
  if (viewName === "email-campaigns") {
    loadPromoEmailAudience();
    loadPromoEmailHistory();
  }
}

function affiliateStatusText(value) {
  return ({ pending: "Menunggu", approved: "Aktif", rejected: "Ditolak", suspended: "Ditangguhkan", closure_requested: "Minta tutup", closed: "Ditutup", held: "Ditahan 3 hari kerja", available: "Siap dicairkan", reversed: "Dibatalkan", paid: "Dibayar", processing: "Diproses", failed: "Gagal" })[value] || value || "—";
}

async function loadAffiliateAdmin() {
  if (!supabaseClient) return;
  setStatus("#affiliateAdminStatus", "Memuat data affiliate…");
  try {
    const { data, error } = await supabaseClient.rpc("get_admin_affiliate_dashboard");
    if (error) throw error;
    state.affiliateAdminData = data || {};
    const settings = data?.settings || {};
    $("#affiliateCommissionRate").value = settings.commission_rate ?? 8;
    const affiliates = data?.affiliates || [];
    $("#affiliateApplicationsBody").innerHTML = affiliates.map((row) => {
      let actions = "—";
      if (row.status === "pending") actions = `<button class="button button-small" data-affiliate-review="${escapeHtml(row.user_id)}" data-decision="approve">Setujui</button> <button class="button button-small" data-affiliate-review="${escapeHtml(row.user_id)}" data-decision="reject">Tolak</button>`;
      else if (row.status === "approved") actions = `<button class="button button-small" data-affiliate-review="${escapeHtml(row.user_id)}" data-decision="suspend">Tangguhkan</button>`;
      else if (row.status === "suspended") actions = `<button class="button button-small" data-affiliate-review="${escapeHtml(row.user_id)}" data-decision="restore">Aktifkan</button>`;
      else if (row.status === "closure_requested") actions = `<button class="button button-small" data-affiliate-closure="${escapeHtml(row.user_id)}" data-approve="true">Setujui tutup</button> <button class="button button-small" data-affiliate-closure="${escapeHtml(row.user_id)}" data-approve="false">Tolak</button><small>${escapeHtml(row.closure_reason || "")}</small>`;
      return `<tr><td><strong>${escapeHtml(row.full_name)}</strong><small>${escapeHtml(row.email || "")}</small></td><td>${escapeHtml(row.phone || "")}</td><td>${escapeHtml(row.referral_code || "")}</td><td>${escapeHtml(affiliateStatusText(row.status))}</td><td>Menunggu ${formatRupiah(row.pending_commission)}<small>Tersedia ${formatRupiah(row.available_balance)}</small></td><td class="affiliate-admin-actions">${actions}</td></tr>`;
    }).join("");
    $("#affiliateApplicationsEmpty").hidden = affiliates.length > 0;
    const payouts = data?.payouts || [];
    $("#affiliatePayoutsBody").innerHTML = payouts.map((row) => `<tr><td><strong>${escapeHtml(row.affiliate_name)}</strong><small>${escapeHtml(row.is_final ? "Pencairan akhir" : formatDate(row.payout_week))}</small></td><td>${escapeHtml(row.bank_name)} · ${escapeHtml(row.bank_account_name)}<small>${escapeHtml(row.bank_account_number)}</small></td><td><strong>${formatRupiah(row.amount)}</strong></td><td><select data-payout-status="${escapeHtml(row.id)}"><option value="${escapeHtml(row.status)}">${escapeHtml(affiliateStatusText(row.status))}</option><option value="processing">Diproses</option><option value="paid">Dibayar</option><option value="failed">Gagal</option></select></td><td><input data-payout-reference="${escapeHtml(row.id)}" value="${escapeHtml(row.transfer_reference || "")}" placeholder="No. referensi" maxlength="160" /></td><td><button class="button button-small" data-save-affiliate-payout="${escapeHtml(row.id)}">Simpan</button></td></tr>`).join("");
    $("#affiliatePayoutsEmpty").hidden = payouts.length > 0;
    const commissions = data?.recent_commissions || [];
    $("#affiliateCommissionsBody").innerHTML = commissions.map((row) => `<tr><td>${formatDate(row.created_at)}</td><td>${escapeHtml(row.affiliate_name)}<small>${escapeHtml(row.referral_code)}</small></td><td>${escapeHtml(row.order_number || "—")}</td><td>${formatRupiah(row.product_amount)}</td><td>${formatRupiah(row.amount)} <small>${escapeHtml(row.rate)}%</small></td><td>${escapeHtml(affiliateStatusText(row.status))}</td></tr>`).join("");
    const bonuses = data?.bonus_awards || [];
    $("#affiliateBonusesBody").innerHTML = bonuses.map((row) => `<tr><td>${formatDate(row.period_month)}</td><td>${escapeHtml(row.affiliate_name)}</td><td>${Number(row.qualified_units).toLocaleString("id-ID")} pcs</td><td>${formatRupiah(row.amount)}</td><td>${escapeHtml(affiliateStatusText(row.status))}</td></tr>`).join("");
    $("#affiliateBonusesEmpty").hidden = bonuses.length > 0;
    setStatus("#affiliateAdminStatus", "Data affiliate diperbarui.");
  } catch (error) {
    setStatus("#affiliateAdminStatus", `Data affiliate gagal dimuat: ${error.message || "Pastikan migrasi affiliate telah diterapkan."}`, true);
  }
}

async function handleAffiliateAdminAction(event) {
  const review = event.target.closest("[data-affiliate-review]");
  const closure = event.target.closest("[data-affiliate-closure]");
  const payout = event.target.closest("[data-save-affiliate-payout]");
  try {
    if (review) {
      const note = review.dataset.decision === "reject" || review.dataset.decision === "suspend"
        ? prompt("Tuliskan alasan atau catatan admin:") : "";
      if ((review.dataset.decision === "reject" || review.dataset.decision === "suspend") && note === null) return;
      const { error } = await supabaseClient.rpc("admin_review_affiliate", { p_user_id: review.dataset.affiliateReview, p_decision: review.dataset.decision, p_note: note });
      if (error) throw error;
    } else if (closure) {
      const approved = closure.dataset.approve === "true";
      const note = prompt(approved ? "Catatan pencairan akhir (opsional):" : "Alasan penutupan ditolak:", "");
      if (note === null) return;
      const { error } = await supabaseClient.rpc("admin_review_affiliate_closure", { p_user_id: closure.dataset.affiliateClosure, p_approve: approved, p_note: note });
      if (error) throw error;
    } else if (payout) {
      const id = payout.dataset.saveAffiliatePayout;
      const status = document.querySelector(`[data-payout-status="${CSS.escape(id)}"]`).value;
      const reference = document.querySelector(`[data-payout-reference="${CSS.escape(id)}"]`).value.trim();
      if (status === "paid" && !reference) throw new Error("Isi referensi transfer sebelum menandai pencairan sebagai dibayar.");
      const { error } = await supabaseClient.rpc("admin_update_affiliate_payout", { p_payout_id: id, p_status: status, p_reference: reference, p_note: null });
      if (error) throw error;
    } else return;
    await loadAffiliateAdmin();
  } catch (error) { setStatus("#affiliateAdminStatus", error.message || "Perubahan affiliate belum berhasil.", true); }
}

async function invokePromoEmailFunction(body) {
  const { data, error } = await supabaseClient.functions.invoke("promo-email", { body });
  if (!error) return data;
  let message = error.message || "Permintaan email promo gagal.";
  try {
    const response = error.context;
    const details = response?.json ? await response.json() : null;
    if (details?.error) message = details.error;
  } catch { /* use the function client's message */ }
  throw new Error(message);
}

function updatePromoEmailSendState() {
  const hasContent = Boolean($("#promoEmailSubject").value.trim() && $("#promoEmailMessage").value.trim());
  $("#sendPromoCampaignButton").disabled = state.promoEmailBusy || !hasContent || !state.promoAudienceCount;
}

async function loadPromoEmailAudience() {
  if (!supabaseClient || state.promoEmailBusy) return;
  state.promoAudienceCount = null;
  $("#promoEmailRecipientCount").textContent = "Memeriksa…";
  updatePromoEmailSendState();
  setStatus("#promoEmailStatus", "Memeriksa jumlah penerima yang menyetujui email promo…");
  try {
    const result = await invokePromoEmailFunction({ action: "preview" });
    state.promoAudienceCount = Number(result?.recipientCount || 0);
    $("#promoEmailRecipientCount").textContent = `${state.promoAudienceCount.toLocaleString("id-ID")} member`;
    setStatus("#promoEmailStatus", state.promoAudienceCount
      ? "Jumlah penerima dihitung dari persetujuan aktif dan email yang sudah terverifikasi."
      : "Belum ada member terverifikasi yang menyetujui email promo.");
  } catch (error) {
    $("#promoEmailRecipientCount").textContent = "Belum tersedia";
    setStatus("#promoEmailStatus", `Daftar penerima belum dapat diperiksa: ${error.message}. Pastikan migrasi dan Edge Function promo-email sudah diterapkan.`, true);
  }
  updatePromoEmailSendState();
}

function handlePromoEmailImageChange(event) {
  const input = event.currentTarget;
  const file = input.files?.[0] || null;
  if (!file) {
    state.promoEmailImageFile = null;
    $("#promoEmailImageFileName").textContent = "Pilih gambar dari perangkat ini. JPG, PNG, WebP, atau AVIF; maksimal 10 MB. Gambar diunggah otomatis saat email dikirim.";
    return;
  }
  const supportedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
  if (!supportedTypes.includes(file.type) || file.size > 10 * 1024 * 1024) {
    input.value = "";
    state.promoEmailImageFile = null;
    $("#promoEmailImageFileName").textContent = "Pilih JPG, PNG, WebP, atau AVIF maksimal 10 MB.";
    setStatus("#promoEmailStatus", "Gambar harus berformat JPG, PNG, WebP, atau AVIF dan berukuran maksimal 10 MB.", true);
    return;
  }
  state.promoEmailImageFile = file;
  $("#promoEmailImageFileName").textContent = `Dipilih: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB). Gambar akan diunggah saat email dikirim.`;
  setStatus("#promoEmailStatus", "Gambar siap digunakan di email.");
}

async function uploadPromoEmailImage(file) {
  if (!file) return "";
  const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" })[file.type];
  if (!extension || file.size > 10 * 1024 * 1024) throw new Error("Gunakan gambar JPG, PNG, WebP, atau AVIF maksimal 10 MB.");
  const token = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  const path = `promo-email/${Date.now()}-${token}.${extension}`;
  const { error } = await supabaseClient.storage.from("product-images").upload(path, file, {
    cacheControl: "3600", upsert: false, contentType: file.type,
  });
  if (error) throw new Error(`Gambar belum dapat diunggah: ${error.message}`);
  return imagePublicUrl(path);
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

async function loadPromoEmailHistory() {
  if (!supabaseClient) return;
  try {
    const result = await invokePromoEmailFunction({ action: "history" });
    const campaigns = result?.campaigns || [];
    const statusLabels = { sending: "Sedang diproses", sent: "Selesai", partial: "Sebagian gagal", failed: "Gagal" };
    $("#promoEmailHistoryBody").innerHTML = campaigns.map((campaign) => `
      <tr><td>${escapeHtml(formatDateTime(campaign.created_at))}</td><td>${escapeHtml(campaign.subject)}</td>
      <td>${Number(campaign.recipient_count || 0)}</td><td>${Number(campaign.sent_count || 0)}</td>
      <td>${Number(campaign.failed_count || 0)}</td><td>${escapeHtml(statusLabels[campaign.status] || campaign.status)}</td></tr>`).join("");
    $("#promoEmailHistoryEmpty").hidden = campaigns.length > 0;
  } catch (error) {
    $("#promoEmailHistoryBody").innerHTML = "";
    $("#promoEmailHistoryEmpty").hidden = false;
    setStatus("#promoEmailStatus", `Riwayat kampanye belum dapat dimuat: ${error.message}.`, true);
  }
}

async function sendPromoCampaign() {
  if (state.promoEmailBusy) return;
  const subject = $("#promoEmailSubject").value.trim();
  const message = $("#promoEmailMessage").value.trim();
  const imageFile = state.promoEmailImageFile;
  const buttonText = $("#promoEmailButtonText").value.trim();
  const buttonUrl = $("#promoEmailButtonUrl").value.trim();
  if (!subject || !message || !state.promoAudienceCount) return;
  if (Boolean(buttonText) !== Boolean(buttonUrl)) {
    setStatus("#promoEmailStatus", "Isi teks tombol dan alamat tujuan bersama-sama.", true);
    return;
  }
  try {
    for (const [label, value] of [["Tautan tombol", buttonUrl]]) {
      if (!value) continue;
      const url = new URL(value);
      if (!["https:", "http:"].includes(url.protocol)) throw new Error(`${label} harus memakai alamat website http:// atau https://.`);
    }
  } catch (error) {
    setStatus("#promoEmailStatus", error.message || "Alamat gambar atau tautan tidak valid.", true);
    return;
  }
  const confirmed = window.confirm(`Kirim email promo “${subject}” kepada sekitar ${state.promoAudienceCount} member yang menyetujui email? Email yang sudah terkirim tidak dapat ditarik kembali.`);
  if (!confirmed) return;

  state.promoEmailBusy = true;
  const button = $("#sendPromoCampaignButton");
  button.textContent = "Mengirim…";
  updatePromoEmailSendState();
  setStatus("#promoEmailStatus", imageFile
    ? "Mengunggah gambar lalu mengirim kampanye. Jangan tutup halaman sampai hasil pengiriman tampil."
    : "Mengirim kampanye. Jangan tutup halaman sampai hasil pengiriman tampil.");
  try {
    const imageUrl = imageFile ? await uploadPromoEmailImage(imageFile) : "";
    const result = await invokePromoEmailFunction({ action: "send", subject, message, imageUrl, buttonText, buttonUrl });
    $("#promoEmailRecipientCount").textContent = `${Number(result.recipientCount || 0).toLocaleString("id-ID")} member`;
    state.promoAudienceCount = Number(result.recipientCount || 0);
    if (result.status === "sent") {
      setStatus("#promoEmailStatus", `Email diterima layanan pengiriman untuk ${result.sentCount} dari ${result.recipientCount} penerima. Status ini berarti email diterima untuk diproses penyedia, bukan jaminan sudah masuk kotak masuk.`);
    } else {
      setStatus("#promoEmailStatus", `Pengiriman selesai sebagian: ${result.sentCount} diterima penyedia, ${result.failedCount} gagal. ${result.detail || "Periksa riwayat sebelum mencoba lagi."}`, true);
    }
    $("#promoEmailSubject").value = "";
    $("#promoEmailMessage").value = "";
    $("#promoEmailImageFile").value = "";
    $("#promoEmailImageFileName").textContent = "Pilih gambar dari perangkat ini. JPG, PNG, WebP, atau AVIF; maksimal 10 MB. Gambar diunggah otomatis saat email dikirim.";
    state.promoEmailImageFile = null;
    $("#promoEmailButtonText").value = "";
    $("#promoEmailButtonUrl").value = "";
    await loadPromoEmailHistory();
  } catch (error) {
    setStatus("#promoEmailStatus", `Kampanye belum berhasil diproses: ${error.message}`, true);
  } finally {
    state.promoEmailBusy = false;
    button.textContent = "Kirim email promo";
    updatePromoEmailSendState();
  }
}

const homepageContentColumns = "homepage_launch_active, homepage_launch_title, homepage_launch_message, homepage_launch_image_url, homepage_launch_at, homepage_promo_active, homepage_promo_badge, homepage_promo_title, homepage_promo_description, homepage_promo_image_url, homepage_promo_cta_label, homepage_promo_cta_url, homepage_promo_starts_at, homepage_promo_ends_at";

function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Tanggal promo atau peluncuran tidak valid.");
  return date.toISOString();
}

function safeCampaignUrl(value, { allowEmpty = false } = {}) {
  const text = String(value || "").trim();
  if (!text && allowEmpty) return null;
  if (text.startsWith("#") || (text.startsWith("/") && !text.startsWith("//"))) return text;
  if (text.startsWith("//")) throw new Error("Gunakan https:// di awal alamat eksternal.");
  try {
    const isAbsolute = /^[a-z][a-z\d+.-]*:/i.test(text);
    const url = isAbsolute ? new URL(text) : new URL(text, "https://urbann-attier.invalid/");
    if (["http:", "https:"].includes(url.protocol)) return isAbsolute ? url.href : text;
  } catch { /* report a clear validation message below */ }
  throw new Error("Tautan harus berupa alamat http/https, tautan relatif, atau tujuan seperti #produk.");
}

function renderPromoProductOptions(selectedId = $("#homepagePromoProduct").value) {
  const select = $("#homepagePromoProduct");
  const availableProducts = state.products.filter((product) => product.is_active);
  select.innerHTML = '<option value="">Pilih produk…</option>' + availableProducts.map((product) =>
    '<option value="' + escapeHtml(product.id) + '">' + escapeHtml(product.name) + '</option>').join("");
  if (availableProducts.some((product) => String(product.id) === String(selectedId))) {
    select.value = String(selectedId);
  }
}

function updatePromoDestinationControls() {
  const type = $("#homepagePromoCtaType").value;
  $("#homepagePromoProductField").hidden = type !== "product";
  $("#homepagePromoCustomField").hidden = type !== "custom";
  $("#homepagePromoCtaHelp").textContent = type === "product"
    ? "Pilih produk; alamat halaman detail akan dibuat otomatis."
    : type === "custom"
      ? "Masukkan bagian halaman, halaman lain, atau tautan eksternal."
      : "Tombol akan membawa pengunjung ke bagian katalog di halaman utama.";
  const productId = $("#homepagePromoProduct").value;
  const customUrl = $("#homepagePromoCustomUrl").value.trim();
  const destinationPreview = type === "catalog"
    ? "#produk (bagian katalog)"
    : type === "product"
      ? productId ? "detail-produk.html?id=" + encodeURIComponent(productId) : "Pilih produk untuk melihat alamat tujuannya."
      : customUrl || "Masukkan alamat tujuan.";
  $("#homepagePromoCtaPreview").textContent = "Alamat tujuan: " + destinationPreview;
}

function setPromoDestination(value) {
  const target = String(value || "#produk").trim();
  renderPromoProductOptions();

  if (target === "#produk" || target === "#detail-produk.html") {
    $("#homepagePromoCtaType").value = "catalog";
    $("#homepagePromoCustomUrl").value = "";
    updatePromoDestinationControls();
    return;
  }

  try {
    const url = new URL(target, window.location.href);
    const productId = url.pathname.endsWith("/detail-produk.html") || url.pathname === "detail-produk.html"
      ? url.searchParams.get("id")
      : null;
    if (url.origin === window.location.origin && productId
      && state.products.some((product) => product.is_active && String(product.id) === productId)) {
      $("#homepagePromoCtaType").value = "product";
      renderPromoProductOptions(productId);
      $("#homepagePromoCustomUrl").value = "";
      updatePromoDestinationControls();
      return;
    }
  } catch { /* keep an unrecognized destination in the custom field */ }

  $("#homepagePromoCtaType").value = "custom";
  $("#homepagePromoCustomUrl").value = target;
  updatePromoDestinationControls();
}

function getPromoDestinationUrl() {
  const type = $("#homepagePromoCtaType").value;
  if (type === "catalog") return "#produk";
  if (type === "product") {
    const productId = $("#homepagePromoProduct").value;
    if (!productId || !state.products.some((product) => product.is_active && String(product.id) === productId)) {
      throw new Error("Pilih produk aktif sebagai tujuan tombol promo.");
    }
    return "detail-produk.html?id=" + encodeURIComponent(productId);
  }
  return safeCampaignUrl($("#homepagePromoCustomUrl").value);
}

function showHomepageImagePreview(type, url) {
  const preview = $(`#homepage${type === "launch" ? "Launch" : "Promo"}Preview`);
  let safeUrl = "";
  try {
    safeUrl = String(url || "").startsWith("blob:") ? url : safeCampaignUrl(url, { allowEmpty: true });
  } catch { /* keep the preview empty while an address is incomplete */ }
  preview.hidden = !safeUrl;
  if (safeUrl) preview.src = safeUrl;
  else preview.removeAttribute("src");
}

async function loadHomepageContent() {
  if (!supabaseClient || state.spotlightBusy) return;
  if (!state.products.length) await loadProducts();
  setStatus("#homepageContentStatus", "Memuat konten halaman utama…");
  const { data, error } = await supabaseClient.from("store_public_settings")
    .select(homepageContentColumns).eq("id", 1).maybeSingle();
  if (error) {
    setStatus("#homepageContentStatus", `Konten belum dapat dimuat: ${error.message}. Pastikan migrasi sorotan halaman utama sudah dijalankan.`, true);
    return;
  }
  const settings = data || {};
  state.homepageSettings = settings;
  $("#homepageLaunchActive").checked = Boolean(settings.homepage_launch_active);
  $("#homepageLaunchTitle").value = settings.homepage_launch_title || "";
  $("#homepageLaunchMessage").value = settings.homepage_launch_message || "";
  $("#homepageLaunchAt").value = toDateTimeLocal(settings.homepage_launch_at);
  $("#homepageLaunchImageUrl").value = settings.homepage_launch_image_url || "";
  $("#homepagePromoActive").checked = Boolean(settings.homepage_promo_active);
  $("#homepagePromoBadge").value = settings.homepage_promo_badge || "PROMO";
  $("#homepagePromoTitle").value = settings.homepage_promo_title || "";
  $("#homepagePromoDescription").value = settings.homepage_promo_description || "";
  $("#homepagePromoStartsAt").value = toDateTimeLocal(settings.homepage_promo_starts_at);
  $("#homepagePromoEndsAt").value = toDateTimeLocal(settings.homepage_promo_ends_at);
  $("#homepagePromoCtaLabel").value = settings.homepage_promo_cta_label || "Lihat promo";
  setPromoDestination(settings.homepage_promo_cta_url || "#produk");
  $("#homepagePromoImageUrl").value = settings.homepage_promo_image_url || "";
  state.spotlightFiles = { launch: null, promo: null };
  showHomepageImagePreview("launch", settings.homepage_launch_image_url);
  showHomepageImagePreview("promo", settings.homepage_promo_image_url);
  setStatus("#homepageContentStatus", "Konten halaman utama berhasil dimuat.");
}

async function uploadHomepageImage(type, file) {
  const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" })[file.type];
  if (!extension || file.size > 10 * 1024 * 1024) throw new Error("Gunakan gambar JPG, PNG, WebP, atau AVIF maksimal 10 MB.");
  const path = `homepage/${type}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabaseClient.storage.from("product-images").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return { path, url: imagePublicUrl(path) };
}

async function saveHomepageContent() {
  if (state.spotlightBusy || !supabaseClient) return;
  const button = $("#saveHomepageContentButton");
  state.spotlightBusy = true;
  button.disabled = true;
  button.textContent = "Menyimpan…";
  const newlyUploaded = [];
  try {
    const launchActive = $("#homepageLaunchActive").checked;
    const promoActive = $("#homepagePromoActive").checked;
    const launchTitle = $("#homepageLaunchTitle").value.trim();
    const launchMessage = $("#homepageLaunchMessage").value.trim();
    const promoBadge = $("#homepagePromoBadge").value.trim() || "PROMO";
    const promoTitle = $("#homepagePromoTitle").value.trim();
    const promoDescription = $("#homepagePromoDescription").value.trim();
    const launchDate = fromDateTimeLocal($("#homepageLaunchAt").value);
    const promoStarts = fromDateTimeLocal($("#homepagePromoStartsAt").value);
    const promoEnds = fromDateTimeLocal($("#homepagePromoEndsAt").value);
    if (promoStarts && promoEnds && new Date(promoEnds) <= new Date(promoStarts)) throw new Error("Tanggal berakhir harus setelah tanggal mulai promo.");
    if (launchActive && (!launchTitle || !launchMessage)) throw new Error("Isi nama dan pesan teaser sebelum menampilkannya.");
    if (promoActive && (!promoTitle || !promoDescription)) throw new Error("Isi judul dan keterangan promo sebelum menampilkannya.");

    let launchImage = $("#homepageLaunchImageUrl").value.trim();
    let promoImage = $("#homepagePromoImageUrl").value.trim();
    if (state.spotlightFiles.launch) {
      const uploaded = await uploadHomepageImage("launch", state.spotlightFiles.launch);
      newlyUploaded.push(uploaded.path);
      launchImage = uploaded.url;
    }
    if (state.spotlightFiles.promo) {
      const uploaded = await uploadHomepageImage("promo", state.spotlightFiles.promo);
      newlyUploaded.push(uploaded.path);
      promoImage = uploaded.url;
    }
    launchImage = safeCampaignUrl(launchImage, { allowEmpty: true });
    promoImage = safeCampaignUrl(promoImage, { allowEmpty: true });
    if (launchActive && !launchImage) throw new Error("Tambahkan foto untuk teaser Coming Soon yang aktif.");
    const payload = {
      homepage_launch_active: launchActive,
      homepage_launch_title: launchTitle,
      homepage_launch_message: launchMessage,
      homepage_launch_image_url: launchImage,
      homepage_launch_at: launchDate,
      homepage_promo_active: promoActive,
      homepage_promo_badge: promoBadge,
      homepage_promo_title: promoTitle,
      homepage_promo_description: promoDescription,
      homepage_promo_image_url: promoImage,
      homepage_promo_cta_label: $("#homepagePromoCtaLabel").value.trim() || "Lihat promo",
      homepage_promo_cta_url: getPromoDestinationUrl(),
      homepage_promo_starts_at: promoStarts,
      homepage_promo_ends_at: promoEnds,
    };
    const { error } = await supabaseClient.from("store_public_settings").update(payload).eq("id", 1);
    if (error) throw error;
    const retainedPaths = [
      storagePathFromPublicUrl(payload.homepage_launch_image_url),
      storagePathFromPublicUrl(payload.homepage_promo_image_url),
    ].filter(Boolean);
    const previousPaths = [
      storagePathFromPublicUrl(state.homepageSettings?.homepage_launch_image_url),
      storagePathFromPublicUrl(state.homepageSettings?.homepage_promo_image_url),
    ].filter((path) => path?.startsWith("homepage/") && !retainedPaths.includes(path));
    let cleanupNote = "";
    if (previousPaths.length) {
      const { error: cleanupError } = await supabaseClient.storage.from("product-images").remove(previousPaths);
      if (cleanupError) cleanupNote = " Foto lama masih tersimpan di penyimpanan dan dapat dibersihkan nanti.";
    }
    state.homepageSettings = payload;
    $("#homepageLaunchImageUrl").value = launchImage || "";
    $("#homepagePromoImageUrl").value = promoImage || "";
    showHomepageImagePreview("launch", launchImage);
    showHomepageImagePreview("promo", promoImage);
    state.spotlightFiles = { launch: null, promo: null };
    $("#homepageLaunchImageFile").value = "";
    $("#homepagePromoImageFile").value = "";
    setStatus("#homepageContentStatus", `Sorotan dan promo berhasil disimpan. Muat ulang halaman utama untuk melihat perubahan.${cleanupNote}`);
  } catch (error) {
    if (newlyUploaded.length) await supabaseClient.storage.from("product-images").remove(newlyUploaded);
    setStatus("#homepageContentStatus", `Konten belum tersimpan: ${error.message}`, true);
  } finally {
    state.spotlightBusy = false;
    button.disabled = false;
    button.textContent = "Simpan konten";
  }
}

function handleHomepageImageChange(type, event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) || file.size > 10 * 1024 * 1024) {
    setStatus("#homepageContentStatus", "Gunakan gambar JPG, PNG, WebP, atau AVIF maksimal 10 MB.", true);
    return;
  }
  state.spotlightFiles[type] = file;
  showHomepageImagePreview(type, URL.createObjectURL(file));
  setStatus("#homepageContentStatus", "Foto siap diunggah saat konten disimpan.");
}

async function loadMembers() {
  if (!supabaseClient) return;
  const requestId = ++state.membersRequestId;
  const search = $("#memberSearch").value.trim();
  const consentValue = $("#memberConsentFilter").value;
  const consent = consentValue === "yes" ? true : consentValue === "no" ? false : null;
  setStatus("#membersStatus", "Memuat data member…");
  $("#previousMembersPage").disabled = true;
  $("#nextMembersPage").disabled = true;

  const { data, error } = await supabaseClient.rpc("admin_list_customer_members", {
    p_search: search || null,
    p_marketing_opt_in: consent,
    p_limit: state.membersPageSize,
    p_offset: state.membersOffset,
  });
  if (requestId !== state.membersRequestId) return;
  if (error) {
    state.members = [];
    state.membersTotal = 0;
    renderMembers();
    setStatus("#membersStatus", `Data member gagal dimuat: ${error.message}. Pastikan migrasi data member sudah dijalankan.`, true);
    return;
  }

  state.members = data || [];
  state.membersTotal = Number(state.members[0]?.total_count || 0);
  renderMembers();
  setStatus("#membersStatus", "Data member berhasil diperbarui.");
}

function renderMembers() {
  const rows = state.members.map((member) => `
    <tr>
      <td><strong>${escapeHtml(member.full_name || "Nama belum diisi")}</strong><small>${escapeHtml(member.email || "Email tidak tersedia")}</small></td>
      <td>${escapeHtml(member.phone || "Belum diisi")}</td>
      <td>${formatDate(member.created_at)}</td>
      <td><span class="status-pill ${member.email_confirmed ? "is-on" : "is-pending"}">${member.email_confirmed ? "Terverifikasi" : "Belum"}</span></td>
      <td><span class="status-pill ${member.email_marketing_opt_in ? "is-on" : "is-off"}">${member.email_marketing_opt_in ? "Bersedia" : "Tidak bersedia"}</span>${member.email_marketing_opt_in && member.email_marketing_opted_in_at ? `<small>Disetujui ${formatDate(member.email_marketing_opted_in_at)}</small>` : ""}</td>
      <td>${Number(member.order_count || 0)} total<small>${Number(member.paid_order_count || 0)} lunas</small></td>
      <td>${Number(member.discount_tokens_used || 0)} terpakai · ${Number(member.discount_tokens_reserved || 0)} ditahan<small>Sisa ${Number(member.discount_tokens_remaining ?? 5)} dari 5</small></td>
    </tr>`).join("");

  $("#membersBody").innerHTML = rows;
  $("#membersEmpty").hidden = state.members.length > 0;
  const start = state.membersTotal ? state.membersOffset + 1 : 0;
  const end = Math.min(state.membersOffset + state.members.length, state.membersTotal);
  $("#membersPageSummary").textContent = state.membersTotal
    ? `Menampilkan ${start}-${end} dari ${state.membersTotal} member`
    : "Belum ada member yang cocok.";
  $("#previousMembersPage").disabled = state.membersOffset <= 0;
  $("#nextMembersPage").disabled = state.membersOffset + state.membersPageSize >= state.membersTotal;
}

async function confirmAdmin(user) {
  const { data, error } = await supabaseClient
    .from("admin_users").select("is_active").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (!data?.is_active) {
    await supabaseClient.auth.signOut();
    throw new Error("Akun ini belum mendapat akses admin aktif.");
  }
  showDashboard(user);
  await Promise.all([loadOverview(), loadProducts(), loadOrders()]);
  subscribeToOrderChanges();
}

function subscribeToOrderChanges() {
  if (!supabaseClient) return;
  if (state.orderChannel) supabaseClient.removeChannel(state.orderChannel);
  state.orderChannel = supabaseClient.channel("urbann-admin-orders")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, scheduleOrderRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, scheduleOrderRefresh)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setStatus("#dashboardStatus", "Pembaruan status pesanan otomatis aktif.");
      } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        setStatus("#dashboardStatus", "Pembaruan otomatis terputus. Gunakan tombol Muat ulang untuk memeriksa status terbaru.", true);
      }
    });
}

function scheduleOrderRefresh(payload = {}) {
  if (payload.table === "orders") {
    const updatedOrder = payload.new || {};
    const previousOrder = state.orders.find((order) => order.id === updatedOrder.id);
    const orderNumber = updatedOrder.order_number || previousOrder?.order_number || "Pesanan";

    if (payload.eventType === "INSERT") {
      setStatus("#dashboardStatus", `Pesanan baru ${orderNumber} diterima. Daftar pesanan diperbarui otomatis.`);
    } else if (payload.eventType === "UPDATE" && previousOrder) {
      if (previousOrder.payment_status !== updatedOrder.payment_status) {
        setStatus("#dashboardStatus", `Pembayaran ${orderNumber}: ${paymentStatusLabel(updatedOrder.payment_status, updatedOrder.payment_method)}. Dashboard diperbarui otomatis.`);
      } else if (previousOrder.status !== updatedOrder.status) {
        setStatus("#dashboardStatus", `Tahap ${orderNumber}: ${orderStatusLabel(updatedOrder.status)}. Dashboard diperbarui otomatis.`);
      }
    }
  }

  window.clearTimeout(state.orderRefreshTimer);
  state.orderRefreshTimer = window.setTimeout(() => {
    const refreshes = [loadOverview()];
    if ($("#orderModal").hidden) refreshes.push(loadOrders());
    else state.orderRefreshPending = true;
    Promise.all(refreshes).catch((error) => {
      setStatus("#dashboardStatus", `Aktivitas pesanan gagal diperbarui: ${error.message}`, true);
    });
  }, 350);
}

async function loadOverview() {
  const [products, orders, pending, recent] = await Promise.all([
    supabaseClient.from("products").select("id", { count: "exact", head: true }),
    supabaseClient.from("orders").select("id", { count: "exact", head: true }),
    supabaseClient.from("orders").select("id", { count: "exact", head: true }).or("status.eq.needs_confirmation,and(payment_status.eq.waiting_confirmation,payment_method.neq.midtrans_snap)").neq("status", "cancelled"),
    supabaseClient.from("orders").select("id, order_number, customer_name, total_amount, status, payment_status, payment_method, created_at").order("created_at", { ascending: false }).limit(6),
  ]);
  const failed = [products, orders, pending, recent].find((result) => result.error);
  if (failed) throw failed.error;

  $("#productCount").textContent = products.count ?? 0;
  $("#orderCount").textContent = orders.count ?? 0;
  $("#pendingCount").textContent = pending.count ?? 0;
  $("#recentOrdersBody").innerHTML = recent.data.map((order) => `<tr>
    <td>${escapeHtml(order.order_number)}</td><td>${escapeHtml(order.customer_name)}</td>
    <td>${formatRupiah(order.total_amount)}</td><td><span class="status-pill ${orderStatusClass(order.status)}">${escapeHtml(orderStatusLabel(order.status))}</span><small class="table-substatus">${escapeHtml(paymentStatusLabel(order.payment_status, order.payment_method))}</small></td><td>${formatDate(order.created_at)}</td>
    <td><button class="button button-small" type="button" data-open-order="${escapeHtml(order.id)}">Lihat / kelola</button></td>
  </tr>`).join("");
  $("#ordersEmpty").hidden = recent.data.length > 0;
  document.querySelectorAll("[data-open-order]").forEach((button) => button.addEventListener("click", () => openOrderEditor(button.dataset.openOrder)));
}

function formatTrafficCount(value) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

async function loadTrafficReport() {
  const button = $("#refreshTrafficButton");
  button.disabled = true;
  $("#trafficEmpty").hidden = true;
  setStatus("#trafficStatus", "Mengambil laporan Analytics…");
  try {
    const { data, error } = await supabaseClient.functions.invoke("analytics-traffic", {
      body: { days: Number($("#trafficDateRange").value) || 30 },
    });
    if (error) throw new Error(error.message || "Laporan Analytics belum dapat diambil.");
    if (data?.error) throw new Error(data.error);

    const totals = data?.totals || {};
    const rows = Array.isArray(data?.sources) ? data.sources : [];
    $("#trafficSessions").textContent = formatTrafficCount(totals.sessions);
    $("#trafficUsers").textContent = formatTrafficCount(totals.users);
    $("#trafficPurchases").textContent = formatTrafficCount(totals.transactions);
    $("#trafficRevenue").textContent = formatRupiah(totals.revenue || 0);
    $("#trafficSourcesBody").innerHTML = rows.map((row) => `<tr>
      <td>${escapeHtml(row.source || "(direct / none)")}</td>
      <td>${escapeHtml(row.medium || "(none)")}</td>
      <td>${escapeHtml(row.campaign || "(not set)")}</td>
      <td>${formatTrafficCount(row.sessions)}</td>
      <td>${formatTrafficCount(row.users)}</td>
      <td>${formatTrafficCount(row.transactions)}</td>
      <td>${formatRupiah(row.revenue || 0)}</td>
    </tr>`).join("");
    $("#trafficEmpty").hidden = rows.length > 0;
    setStatus("#trafficStatus", `Laporan ${$("#trafficDateRange").selectedOptions[0].text.toLowerCase()} berhasil dimuat.`);
  } catch (error) {
    $("#trafficSourcesBody").innerHTML = "";
    $("#trafficSessions").textContent = "—";
    $("#trafficUsers").textContent = "—";
    $("#trafficPurchases").textContent = "—";
    $("#trafficRevenue").textContent = "—";
    setStatus("#trafficStatus", error.message || "Laporan Analytics belum dapat dimuat.", true);
  } finally {
    button.disabled = false;
  }
}

function normalizeUtmValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildUtmLink(event) {
  event.preventDefault();
  const landingInput = $("#utmLandingUrl").value.trim();
  const source = normalizeUtmValue($("#utmSource").value);
  const medium = normalizeUtmValue($("#utmMedium").value);
  const campaign = normalizeUtmValue($("#utmCampaign").value);
  const content = normalizeUtmValue($("#utmContent").value);
  try {
    const url = new URL(landingInput);
    if (url.protocol !== "https:" || !["urbannattier.com", "www.urbannattier.com"].includes(url.hostname.toLowerCase())) {
      throw new Error("Halaman tujuan harus berupa tautan HTTPS di urbannattier.com.");
    }
    if (!source || !medium || !campaign) throw new Error("Isi sumber, jenis promosi, dan nama kampanye terlebih dahulu.");
    url.searchParams.set("utm_source", source);
    url.searchParams.set("utm_medium", medium);
    url.searchParams.set("utm_campaign", campaign);
    if (content) url.searchParams.set("utm_content", content);
    else url.searchParams.delete("utm_content");

    $("#utmGeneratedUrl").value = url.toString();
    const qrUrl = new URL("https://api.qrserver.com/v1/create-qr-code/");
    qrUrl.searchParams.set("size", "600x600");
    qrUrl.searchParams.set("format", "png");
    qrUrl.searchParams.set("ecc", "M");
    qrUrl.searchParams.set("qzone", "4");
    qrUrl.searchParams.set("data", url.toString());
    const qrImage = $("#utmQrImage");
    qrImage.hidden = false;
    qrImage.alt = `QR code untuk kampanye ${campaign} dari ${source}`;
    qrImage.dataset.qrUrl = qrUrl.toString();
    qrImage.onerror = () => {
      qrImage.hidden = true;
      setStatus("#utmBuilderStatus", "Tautan sudah dibuat, tetapi QR belum dapat dimuat. Periksa koneksi lalu buat ulang.", true);
    };
    qrImage.onload = () => setStatus("#utmBuilderStatus", "Tautan dan QR berhasil dibuat. Salin tautan atau unduh QR untuk dibagikan.");
    qrImage.src = qrUrl.toString();
    $("#utmResult").hidden = false;
    setStatus("#utmBuilderStatus", "Tautan berhasil dibuat. Salin lalu bagikan di kanal promosi yang sesuai.");
  } catch (error) {
    $("#utmResult").hidden = true;
    setStatus("#utmBuilderStatus", error.message || "Tautan tujuan tidak valid.", true);
  }
}

async function copyUtmLink() {
  const generatedUrl = $("#utmGeneratedUrl");
  try {
    await navigator.clipboard.writeText(generatedUrl.value);
    setStatus("#utmBuilderStatus", "Tautan berhasil disalin. Sekarang tempelkan ke postingan, bio, atau iklan.");
  } catch {
    generatedUrl.focus();
    generatedUrl.select();
    setStatus("#utmBuilderStatus", "Tautan siap disalin. Tekan Ctrl+C, lalu tempelkan ke kanal promosi.");
  }
}

async function downloadUtmQr() {
  const qrImage = $("#utmQrImage");
  const qrUrl = qrImage.dataset.qrUrl;
  if (!qrUrl) return;
  try {
    const response = await fetch(qrUrl, { mode: "cors" });
    if (!response.ok) throw new Error("QR belum dapat diunduh.");
    const imageBlob = await response.blob();
    const objectUrl = URL.createObjectURL(imageBlob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `urbann-attier-${normalizeUtmValue($("#utmCampaign").value) || "qr"}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
    setStatus("#utmBuilderStatus", "QR berhasil diunduh sebagai PNG.");
  } catch {
    window.open(qrUrl, "_blank", "noopener");
    setStatus("#utmBuilderStatus", "QR dibuka di tab baru. Jika unduhan tidak dimulai, klik kanan gambar lalu pilih Simpan gambar sebagai.");
  }
}

const ORDER_STATUS_LABELS = {
  needs_confirmation: "Perlu konfirmasi", awaiting_payment: "Menunggu pembayaran", paid: "Pembayaran lunas",
  processing: "Diproses", shipped: "Dikirim", completed: "Selesai", cancelled: "Dibatalkan",
};
const PAYMENT_STATUS_LABELS = {
  unpaid: "Belum dibayar", waiting_confirmation: "Transfer perlu dicek", paid: "Lunas",
  rejected: "Transfer ditolak", refunded: "Dana dikembalikan",
};

function orderStatusLabel(status) { return ORDER_STATUS_LABELS[status] || status || "—"; }
function paymentStatusLabel(status, paymentMethod = null) {
  if (paymentMethod === "midtrans_snap") {
    const midtransLabels = {
      unpaid: "Belum dibayar",
      waiting_confirmation: "Menunggu pembayaran Midtrans",
      paid: "Lunas",
      rejected: "Gagal / kedaluwarsa",
      refunded: "Dana dikembalikan",
    };
    return midtransLabels[status] || PAYMENT_STATUS_LABELS[status] || status || "—";
  }
  return PAYMENT_STATUS_LABELS[status] || status || "—";
}
function orderStatusClass(status) {
  if (["processing", "shipped", "completed"].includes(status)) return "is-on";
  if (status === "cancelled") return "is-off";
  return "is-pending";
}

async function loadOrders() {
  setStatus("#ordersStatus", "Memuat pesanan…");
  const { data, error } = await supabaseClient.from("orders")
    .select("id, order_number, customer_id, customer_name, customer_phone, customer_email, address_line, province, city, district, postal_code, customer_note, status, payment_status, payment_method, shipping_status, delivered_at, return_requested_at, shipping_provider, shipping_service, tracking_number, subtotal_amount, discount_base_amount, discount_amount, discount_percent, discount_order_number, discount_tokens_remaining, packaging_fee, shipping_fee, total_amount, confirmed_at, confirmed_by_email, paid_at, paid_confirmed_by_email, created_at, updated_at, confirmed_by, paid_confirmed_by")
    .order("created_at", { ascending: false }).limit(100);
  if (error) {
    setStatus("#ordersStatus", `Pesanan gagal dimuat: ${error.message}`, true);
    return;
  }
  const ids = data.map((order) => order.id);
  let items = [];
  if (ids.length) {
    const result = await supabaseClient.from("order_items")
      .select("id, order_id, product_name, color_name, size_name, purchase_mode, pricing_tier, quantity, unit_price, line_total")
      .in("order_id", ids).order("created_at", { ascending: true });
    if (result.error) {
      setStatus("#ordersStatus", `Rincian pesanan gagal dimuat: ${result.error.message}`, true);
      return;
    }
    items = result.data || [];
  }
  state.orders = data.map((order) => ({ ...order, items: items.filter((item) => item.order_id === order.id) }));
  renderOrders();
  setStatus("#ordersStatus", `${state.orders.length} pesanan ditampilkan (maksimal 100 terbaru).`);
}

function renderOrders() {
  const query = $("#orderSearch").value.trim().toLocaleLowerCase("id-ID");
  const orders = state.orders.filter((order) => {
    const matchesQuery = `${order.order_number} ${order.customer_name} ${order.customer_phone}`.toLocaleLowerCase("id-ID").includes(query);
    const matchesFilter = state.ordersFilter === "all"
      || (state.ordersFilter === "pending" && order.status !== "cancelled" && (order.status === "needs_confirmation" || (order.payment_status === "waiting_confirmation" && order.payment_method !== "midtrans_snap")))
      || order.status === state.ordersFilter;
    return matchesQuery && matchesFilter;
  });
  $("#ordersBody").innerHTML = orders.map((order) => `<tr>
    <td><strong>${escapeHtml(order.order_number)}</strong><small>${formatDate(order.created_at)}</small></td>
    <td><strong>${escapeHtml(order.customer_name)}</strong><small>${escapeHtml(order.customer_phone)}</small></td>
    <td><strong>${formatRupiah(order.total_amount)}</strong><small>${escapeHtml(paymentStatusLabel(order.payment_status, order.payment_method))}</small></td>
    <td><span class="status-pill ${order.payment_status === "paid" ? "is-on" : order.payment_status === "rejected" || order.payment_status === "refunded" ? "is-off" : "is-pending"}">${escapeHtml(paymentStatusLabel(order.payment_status, order.payment_method))}</span></td>
    <td><span class="status-pill ${orderStatusClass(order.status)}">${escapeHtml(orderStatusLabel(order.status))}</span></td>
    <td><button class="button button-small" type="button" data-open-order="${escapeHtml(order.id)}">Lihat / kelola</button></td>
  </tr>`).join("");
  $("#ordersPageEmpty").hidden = orders.length > 0;
  $("#ordersPageEmpty").textContent = state.orders.length
    ? "Tidak ada pesanan yang cocok dengan pencarian atau filter ini."
    : "Belum ada pesanan yang tersimpan.";
  $("#ordersBody").querySelectorAll("[data-open-order]").forEach((button) => button.addEventListener("click", () => openOrderEditor(button.dataset.openOrder)));
}

async function openOrderEditor(orderId) {
  let order = state.orders.find((item) => item.id === orderId);
  if (!order) {
    await loadOrders();
    order = state.orders.find((item) => item.id === orderId);
  }
  if (!order) {
    window.alert("Detail pesanan belum berhasil dimuat. Muat ulang daftar pesanan lalu coba kembali.");
    return;
  }
  state.editingOrderId = order.id;
  $("#orderModalTitle").textContent = `Pesanan ${order.order_number}`;
  $("#orderCustomerSummary").innerHTML = `<div><strong>${escapeHtml(order.customer_name)}</strong><span>${escapeHtml(order.customer_phone)}${order.customer_email ? ` · ${escapeHtml(order.customer_email)}` : ""}</span></div>
    <p>${escapeHtml(order.address_line)}, ${escapeHtml(order.district)}, ${escapeHtml(order.city)}, ${escapeHtml(order.province)} ${escapeHtml(order.postal_code)}</p>
    ${order.customer_note ? `<p>Catatan: ${escapeHtml(order.customer_note)}</p>` : ""}<small>Status pengiriman: ${escapeHtml(order.shipping_status || "—")}${order.delivered_at ? ` · Diterima ${formatDate(order.delivered_at)}` : ""}${order.return_requested_at ? ` · Retur diajukan ${formatDate(order.return_requested_at)}` : ""}</small><small>Dibuat ${formatDate(order.created_at)} · Konfirmasi admin: ${order.confirmed_at ? `${formatDate(order.confirmed_at)} oleh ${escapeHtml(order.confirmed_by_email || "admin")}` : "Belum"} · Pembayaran: ${order.paid_at ? `${formatDate(order.paid_at)} diverifikasi oleh ${escapeHtml(order.paid_confirmed_by_email || "admin")}` : "Belum lunas"}</small>`;
  $("#orderItemsBody").innerHTML = order.items.length ? order.items.map((item) => `<tr>
    <td><strong>${escapeHtml(item.product_name)}</strong><small>${escapeHtml(item.color_name)} · ${escapeHtml(item.size_name)} · ${escapeHtml(item.pricing_tier)}</small></td>
    <td>${Number(item.quantity)} pcs</td><td>${formatRupiah(item.unit_price)}</td><td>${formatRupiah(item.line_total)}</td>
  </tr>`).join("") : '<tr><td colspan="4">Rincian produk tidak tersedia.</td></tr>';
  $("#orderMoneySummary").innerHTML = `<span>Produk ${formatRupiah(order.subtotal_amount)}${Number(order.discount_amount) > 0 ? ` − diskon member ${formatRupiah(order.discount_amount)}` : ""} + pengemasan ${formatRupiah(order.packaging_fee)} + ongkir ${order.shipping_fee == null ? "belum diisi" : formatRupiah(order.shipping_fee)}</span><strong>Total ${formatRupiah(order.total_amount)}</strong>`;
  $("#orderStatusSelect").value = order.status === "paid" ? "processing" : order.status;
  $("#paymentStatusSelect").value = order.payment_status;
  $("#orderShippingFee").value = order.shipping_fee ?? "";
  $("#orderShippingProvider").value = order.shipping_provider || "";
  $("#orderShippingService").value = order.shipping_service || "";
  $("#orderTrackingNumber").value = order.tracking_number || "";
  $("#markOrderReturnedButton").hidden = order.shipping_status !== "delivered";
  $("#returnRequestField").hidden = order.shipping_status !== "delivered";
  const localNow = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  $("#returnRequestReceivedAt").value = localNow.toISOString().slice(0, 16);
  $("#orderFormStatus").textContent = "";
  $("#orderModal").hidden = false;
  $("#orderStatusSelect").focus();
}

function printOrderInvoice() {
  const order = state.orders.find((item) => item.id === state.editingOrderId);
  if (!order) return;

  const currentShippingFee = $("#orderShippingFee").value.trim();
  const savedShippingFee = order.shipping_fee == null ? "" : String(order.shipping_fee);
  const hasUnsavedChanges = $("#orderStatusSelect").value !== (order.status === "paid" ? "processing" : order.status)
    || $("#paymentStatusSelect").value !== order.payment_status
    || currentShippingFee !== savedShippingFee
    || $("#orderShippingProvider").value.trim() !== (order.shipping_provider || "")
    || $("#orderShippingService").value.trim() !== (order.shipping_service || "")
    || $("#orderTrackingNumber").value.trim() !== (order.tracking_number || "");
  if (hasUnsavedChanges) {
    window.alert("Ada perubahan pesanan yang belum disimpan. Simpan perubahan terlebih dahulu agar invoice memakai data terbaru.");
    return;
  }

  const address = [order.address_line, order.district, order.city, order.province, order.postal_code]
    .filter(Boolean).map(escapeHtml).join(", ");
  const itemRows = order.items.length ? order.items.map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.product_name)}</strong><small>${escapeHtml(item.color_name)} / ${escapeHtml(item.size_name)}${item.pricing_tier ? ` · ${escapeHtml(item.pricing_tier)}` : ""}</small><small>Harga awal: ${formatRupiah(item.unit_price)} × ${Number(item.quantity)} = ${formatRupiah(item.line_total)}</small></td>
      <td class="invoice-qty">${Number(item.quantity)}×</td>
      <td class="invoice-amount">${formatRupiah(item.line_total)}</td>
    </tr>`).join("") : '<tr><td colspan="3">Rincian produk tidak tersedia.</td></tr>';
  const shipping = order.shipping_fee == null ? "Belum ditentukan" : formatRupiah(order.shipping_fee);
  const totalLabel = order.shipping_fee == null ? "Total sementara" : "Total tagihan";
  const carrier = [order.shipping_provider, order.shipping_service].filter(Boolean).map(escapeHtml).join(" · ") || "Belum ditentukan";
  const memberDiscountRow = order.customer_id
    ? `<div><span>Diskon member${Number(order.discount_percent) ? ` ${Number(order.discount_percent)}% dari harga ecer ${formatRupiah(order.discount_base_amount)}` : ""}</span><strong>${Number(order.discount_amount) > 0 ? `−${formatRupiah(order.discount_amount)}` : "Tidak berlaku"}</strong></div>`
    : "";
  const remainingTokensNote = order.customer_id
    ? `<div><span>Sisa token diskon setelah pesanan</span><strong>${order.discount_tokens_remaining == null ? "—" : `${Number(order.discount_tokens_remaining)} dari 5 pesanan`}</strong></div>`
    : "";

  $("#invoicePrintArea").innerHTML = `
    <header class="invoice-heading">
      <div class="invoice-brand"><img src="assets/urban attier tf.png" alt="" /><div><strong>Urbann Attier</strong><small>Gamis wanita</small></div></div>
      <div class="invoice-title"><h1>Invoice Pesanan</h1><strong>${escapeHtml(order.order_number)}</strong><span>${formatDate(order.created_at)}</span></div>
    </header>
    <section class="invoice-customer"><h2>Informasi pelanggan</h2><strong>${escapeHtml(order.customer_name)}</strong><span>${escapeHtml(order.customer_phone)}${order.customer_email ? ` · ${escapeHtml(order.customer_email)}` : ""}</span><span>${address || "Alamat belum tersedia"}</span>${order.customer_note ? `<small>Catatan: ${escapeHtml(order.customer_note)}</small>` : ""}</section>
    <table class="invoice-items"><thead><tr><th>Produk</th><th>Qty</th><th>Jumlah</th></tr></thead><tbody>${itemRows}</tbody></table>
    <section class="invoice-totals"><div><span>Subtotal produk</span><strong>${formatRupiah(order.subtotal_amount)}</strong></div>${memberDiscountRow}${remainingTokensNote}<div><span>Biaya pengemasan</span><strong>${formatRupiah(order.packaging_fee)}</strong></div><div><span>Ongkos kirim</span><strong>${shipping}</strong></div><div class="invoice-grand-total"><span>${totalLabel}</span><strong>${formatRupiah(order.total_amount)}</strong></div></section>
    <section class="invoice-status"><div><span>Status pembayaran</span><strong>${escapeHtml(paymentStatusLabel(order.payment_status, order.payment_method))}</strong></div><div><span>Tahap pesanan</span><strong>${escapeHtml(orderStatusLabel(order.status))}</strong></div><div><span>Ekspedisi / layanan</span><strong>${carrier}</strong></div><div><span>Nomor resi</span><strong>${escapeHtml(order.tracking_number || "Belum tersedia")}</strong></div></section>
    <footer class="invoice-footer"><strong>Terima kasih telah berbelanja di Urbann Attier.</strong><span>Invoice ini merupakan bukti rincian pesanan.</span></footer>`;

  const printArea = $("#invoicePrintArea");
  printArea.hidden = false;
  const cleanUp = () => { printArea.hidden = true; };
  window.addEventListener("afterprint", cleanUp, { once: true });
  window.setTimeout(() => {
    window.print();
    window.setTimeout(cleanUp, 1000);
  }, 100);
}

function closeOrderModal() {
  if (state.busy) return;
  $("#orderModal").hidden = true;
  state.editingOrderId = null;
  if (state.orderRefreshPending) {
    state.orderRefreshPending = false;
    Promise.all([loadOverview(), loadOrders()]).catch((error) => {
      setStatus("#dashboardStatus", `Pesanan gagal diperbarui: ${error.message}`, true);
    });
  }
}

function normalizeWhatsAppNumber(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("0062")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  return /^62\d{8,13}$/.test(digits) ? digits : "";
}

function buildOrderNotification(order, nextStatus, nextPaymentStatus, nextTotal, shippingDetails) {
  const statusChanged = order.status !== nextStatus;
  const paymentChanged = order.payment_status !== nextPaymentStatus;
  if (!statusChanged && !paymentChanged) return { unchanged: true };

  const phone = normalizeWhatsAppNumber(order.customer_phone);
  if (!phone) return { error: "Nomor WhatsApp pelanggan tidak valid. Perubahan tetap disimpan, tetapi notifikasi tidak dapat disiapkan." };

  const lines = [
    `Halo ${order.customer_name}, kami dari Urbann Attier ingin memberi kabar tentang pesanan Anda.`,
    `Nomor pesanan: ${order.order_number}`,
  ];
  if (statusChanged) lines.push(`Tahap pesanan: ${orderStatusLabel(nextStatus)}.`);
  if (paymentChanged) lines.push(`Status pembayaran: ${paymentStatusLabel(nextPaymentStatus, order.payment_method)}.`);

  if (nextPaymentStatus === "waiting_confirmation") {
    lines.push("Pembayaran yang Anda laporkan sedang kami periksa.");
  } else if (nextPaymentStatus === "paid") {
    lines.push("Pembayaran sudah kami verifikasi. Pesanan Anda sedang diproses.");
  } else if (nextPaymentStatus === "rejected") {
    lines.push("Pembayaran belum dapat kami konfirmasi. Silakan hubungi admin untuk pengecekan lebih lanjut.");
  } else if (nextPaymentStatus === "refunded") {
    lines.push("Pengembalian dana pesanan Anda sudah dicatat. Silakan hubungi admin bila memerlukan rincian.");
  }

  if (["awaiting_payment", "processing", "shipped", "completed"].includes(nextStatus)) {
    lines.push(`Total pesanan termasuk ongkir: ${formatRupiah(nextTotal)}.`);
  }
  if (nextStatus === "shipped") {
    const carrier = [shippingDetails.provider, shippingDetails.service].filter(Boolean).join(" ");
    if (carrier) lines.push(`Ekspedisi: ${carrier}.`);
    if (shippingDetails.trackingNumber) lines.push(`Nomor resi: ${shippingDetails.trackingNumber}.`);
  }
  if (nextStatus === "cancelled") lines.push("Pesanan ini telah dibatalkan. Silakan hubungi admin jika ada pertanyaan.");
  if (nextStatus === "completed") lines.push("Terima kasih telah berbelanja di Urbann Attier.");
  lines.push("", "Pesan ini disiapkan oleh dashboard. Mohon balas jika Anda membutuhkan bantuan.");

  const url = `https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`;
  return { url };
}

async function saveOrder(event) {
  event.preventDefault();
  if (!state.editingOrderId || state.busy) return;
  const order = state.orders.find((item) => item.id === state.editingOrderId);
  if (!order) return;
  const nextPaymentStatus = $("#paymentStatusSelect").value;
  let nextStatus = $("#orderStatusSelect").value;
  const rawShippingFee = $("#orderShippingFee").value.trim();
  let shippingFee = null;
  try {
    shippingFee = parseNumber(rawShippingFee, "Ongkos kirim", { integer: true, min: 0 });
    if (order.status === "cancelled" && nextStatus !== "cancelled") {
      throw new Error("Pesanan yang sudah dibatalkan tidak dapat dibuka kembali.");
    }
    if (nextPaymentStatus === "paid" && nextStatus !== "shipped" && nextStatus !== "completed" && nextStatus !== "cancelled") nextStatus = "processing";
    if (["awaiting_payment", "processing", "shipped", "completed"].includes(nextStatus) && shippingFee == null) {
      throw new Error("Isi ongkos kirim sebelum pesanan dikonfirmasi atau diproses. Isi 0 jika tanpa ongkir.");
    }
    if (["processing", "shipped", "completed"].includes(nextStatus) && nextPaymentStatus !== "paid") {
      throw new Error("Tandai pembayaran lunas setelah transfer terverifikasi sebelum pesanan diproses.");
    }
    if (["shipped", "completed"].includes(nextStatus) && !$("#orderShippingProvider").value.trim()) {
      throw new Error("Isi nama ekspedisi sebelum pesanan dikirim.");
    }
    if (nextStatus === "shipped" && !$("#orderTrackingNumber").value.trim()) {
      throw new Error("Isi nomor resi sebelum menandai pesanan dikirim.");
    }
    if (nextStatus === "completed" && order.status !== "shipped" && order.status !== "completed") {
      throw new Error("Ubah tahap menjadi Dikirim terlebih dahulu sebelum menandai Selesai.");
    }
    if (nextPaymentStatus === "refunded" && nextStatus !== "cancelled") {
      throw new Error("Ubah tahap pesanan menjadi Dibatalkan saat dana dikembalikan.");
    }
    if (nextStatus === "cancelled" && ["shipped", "completed"].includes(order.status)) {
      throw new Error("Pesanan yang sudah dikirim tidak dapat dibatalkan dari dashboard ini.");
    }
    if (nextStatus === "cancelled" && order.payment_status === "paid" && nextPaymentStatus !== "refunded") {
      throw new Error("Pembayaran sudah lunas. Pilih Dana dikembalikan setelah refund benar-benar dilakukan.");
    }
    if (nextStatus === "cancelled" && nextPaymentStatus === "paid") {
      throw new Error("Pesanan batal tidak dapat disimpan sebagai lunas. Verifikasi status pembayaran dan refund terlebih dahulu.");
    }
    if (nextPaymentStatus === "refunded" && order.payment_status !== "paid" && order.payment_status !== "refunded") {
      throw new Error("Refund hanya bisa dicatat setelah pembayaran sebelumnya lunas.");
    }
  } catch (error) {
    setStatus("#orderFormStatus", error.message, true);
    return;
  }

  const now = new Date().toISOString();
  const update = {
    status: nextStatus,
    payment_status: nextPaymentStatus,
    shipping_fee: shippingFee,
    total_amount: Number(order.subtotal_amount) - Number(order.discount_amount || 0) + Number(order.packaging_fee) + Number(shippingFee || 0),
    shipping_provider: $("#orderShippingProvider").value.trim() || null,
    shipping_service: $("#orderShippingService").value.trim() || null,
    tracking_number: $("#orderTrackingNumber").value.trim() || null,
    shipping_status: nextStatus === "shipped" ? "shipped" : nextStatus === "completed" ? "delivered" : nextStatus === "processing" ? "ready_to_ship" : nextStatus === "cancelled" ? order.shipping_status : (shippingFee == null ? "waiting_quote" : "ready_to_ship"),
  };
  if (!order.confirmed_at && nextStatus !== "needs_confirmation") {
    update.confirmed_at = now;
    update.confirmed_by = state.user.id;
    update.confirmed_by_email = state.user.email || null;
  }
  if (nextPaymentStatus === "paid" && order.payment_status !== "paid") {
    update.paid_at = now;
    update.paid_confirmed_by = state.user.id;
    update.paid_confirmed_by_email = state.user.email || null;
  }
  if (nextPaymentStatus !== "paid" && order.payment_status === "paid") {
    update.paid_at = null;
    update.paid_confirmed_by = null;
    update.paid_confirmed_by_email = null;
  }

  const notification = buildOrderNotification(order, nextStatus, nextPaymentStatus, update.total_amount, {
    provider: update.shipping_provider,
    service: update.shipping_service,
    trackingNumber: update.tracking_number,
  });
  const notificationTab = notification.url ? window.open("about:blank", "_blank") : null;

  state.busy = true;
  $("#saveOrderButton").disabled = true;
  $("#saveOrderButton").textContent = "Menyimpan…";
  setStatus("#orderFormStatus", "Menyimpan perubahan pesanan…");
  try {
    const { error } = await supabaseClient.from("orders").update(update).eq("id", order.id);
    if (error) throw error;
    if (notification.url) {
      const link = $("#orderNotificationLink");
      link.href = notification.url;
      link.hidden = false;
      link.textContent = notificationTab && !notificationTab.closed
        ? `Pesan WhatsApp pesanan ${order.order_number} sudah disiapkan. Tekan Kirim di WhatsApp.`
        : `Buka WhatsApp untuk mengirim pemberitahuan pesanan ${order.order_number}`;
      if (notificationTab && !notificationTab.closed) {
        notificationTab.location.href = notification.url;
        notificationTab.opener = null;
        setStatus("#ordersStatus", `Pesanan ${order.order_number} berhasil diperbarui. Pesan WhatsApp sudah disiapkan; admin perlu menekan Kirim.`);
      } else {
        setStatus("#ordersStatus", `Pesanan ${order.order_number} berhasil diperbarui. Klik tautan WhatsApp di atas untuk menyiapkan pemberitahuan.`);
      }
    } else if (notification.error) {
      if (notificationTab && !notificationTab.closed) notificationTab.close();
      $("#orderNotificationLink").hidden = true;
      setStatus("#ordersStatus", `${order.order_number} berhasil diperbarui. ${notification.error}`, true);
    } else {
      if (notificationTab && !notificationTab.closed) notificationTab.close();
      $("#orderNotificationLink").hidden = true;
      setStatus("#ordersStatus", `Pesanan ${order.order_number} berhasil diperbarui. Tidak ada perubahan status untuk diberitahukan.`);
    }
    $("#orderModal").hidden = true;
    await Promise.all([loadOrders(), loadOverview()]);
  } catch (error) {
    setStatus("#orderFormStatus", `Pesanan belum tersimpan: ${error.message}`, true);
  } finally {
    state.busy = false;
    $("#saveOrderButton").disabled = false;
    $("#saveOrderButton").textContent = "Simpan perubahan";
  }
}

function renderProducts() {
  const query = $("#productSearch").value.trim().toLocaleLowerCase("id-ID");
  const products = state.products.filter((product) =>
    `${product.name} ${product.sku || ""}`.toLocaleLowerCase("id-ID").includes(query));
  $("#productsBody").innerHTML = products.map((product) => {
    const known = product.inventory.filter((item) => item.stock_quantity !== null);
    const totalStock = known.reduce((sum, item) => sum + Math.max(0, Number(item.stock_quantity) - Number(item.reserved_quantity || 0)), 0);
    const totalReserved = known.reduce((sum, item) => sum + Number(item.reserved_quantity || 0), 0);
    const stockText = known.length ? `${totalStock.toLocaleString("id-ID")} pcs tersedia${totalReserved ? ` · ${totalReserved.toLocaleString("id-ID")} dicadangkan` : ""}` : "Belum diisi";
    const stockByVariant = product.variants.length && product.sizes.length
      ? `<div class="product-stock-list">${product.variants.map((variant) => {
        const quantities = product.sizes.map((size) => {
          const row = product.inventory.find((item) => item.variant_id === variant.id && item.size_id === size.id);
          const available = row?.stock_quantity == null ? null : Math.max(0, Number(row.stock_quantity) - Number(row.reserved_quantity || 0));
          const held = Number(row?.reserved_quantity || 0);
          const stateClass = available == null
            ? "is-unknown"
            : available === 0
              ? "is-zero"
              : available <= 5
                ? "is-warning-yellow"
                : available <= 10
                  ? "is-warning-green"
                  : "";
          return `<span class="product-stock-value ${stateClass}${held ? " is-held" : ""}"><strong>${escapeHtml(size.size_name)}</strong><span>${available == null ? "Belum diisi" : `${available} tersedia`}</span>${held ? `<small>${held} dicadangkan</small>` : ""}</span>`;
        }).join("");
        return `<section class="product-stock-color"><h4>${escapeHtml(variant.color_name)}</h4><div class="product-stock-sizes">${quantities}</div></section>`;
      }).join("")}</div>`
      : "Belum ada warna / ukuran";
    return `<article class="product-catalog-card">
      <header class="product-catalog-card-header">
        <div class="product-catalog-identity"><h3>${escapeHtml(product.name)}</h3><small>${escapeHtml(product.sku || product.slug)}</small></div>
        <span class="status-pill ${product.is_active ? "is-on" : "is-off"}">${product.is_active ? "Aktif" : "Draft"}</span>
        <div class="product-catalog-actions"><button class="button button-small" type="button" data-stock-product="${product.id}">Atur stok</button>
      <button class="button button-small" type="button" data-edit-product="${product.id}">Edit</button>
      <button class="button button-small button-quiet" type="button" data-toggle-product="${product.id}" data-active="${product.is_active}">${product.is_active ? "Jadikan draft" : "Aktifkan"}</button>
      <button class="button button-small button-danger" type="button" data-delete-product="${product.id}">Hapus</button></div>
      </header>
      <div class="product-catalog-summary">
        <div><span>Kategori</span><strong>${escapeHtml(state.categories.find((category) => category.id === product.category_id)?.name || product.category || "Belum dipilih")}</strong></div>
        <div><span>Harga ecer</span><strong>${formatRupiah(product.price_retail)}</strong></div>
        <div><span>Harga serian</span><strong>${formatRupiah(product.price_series)}</strong></div>
        <div><span>Harga grosir</span><strong>${formatRupiah(product.price_wholesale)}</strong><small>Mulai ${Number(product.wholesale_min_qty) || 20} pcs</small></div>
        <div><span>Varian</span><strong>${product.variants.length} warna · ${product.sizes.length} ukuran</strong></div>
      </div>
      <section class="product-catalog-inventory">
        <div class="product-catalog-inventory-heading"><div><h4>Rincian stok</h4><p>Stok tersedia: <strong>${stockText}</strong></p></div><span>${product.variants.length} warna</span></div>
        <div class="stock-alert-legend" aria-label="Keterangan warna peringatan stok">
          <span><i class="stock-alert-swatch is-warning-green"></i>Hijau: 6–10 pcs</span>
          <span><i class="stock-alert-swatch is-warning-yellow"></i>Kuning: 1–5 pcs</span>
          <span><i class="stock-alert-swatch is-zero"></i>Merah: habis</span>
        </div>
        ${stockByVariant}
      </section>
    </article>`;
  }).join("");
  $("#productsEmpty").hidden = products.length > 0;
}

async function loadProducts() {
  setStatus("#productsStatus", "Memuat produk…");
  const { data: categoryRows, error: categoryError } = await supabaseClient.from("product_categories")
    .select("id, name, slug, parent_id, is_active, sort_order")
    .order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (categoryError) {
    setStatus("#productsStatus", `Kategori gagal dimuat: ${categoryError.message}. Pastikan migrasi kategori sudah diterapkan.`, true);
    return;
  }
  state.categories = categoryRows || [];
  renderCategoryManager();
  renderProductCategoryOptions();
  const { data, error } = await supabaseClient.from("products")
    .select("id, sku, slug, name, category, category_id, description, material, model, care_notes, price_retail, price_series, price_wholesale, wholesale_min_qty, is_active, sort_order")
    .order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (error) {
    setStatus("#productsStatus", `Produk gagal dimuat: ${error.message}`, true);
    return;
  }

  const ids = data.map((product) => product.id);
  let variants = [], sizes = [], images = [], inventory = [];
  if (ids.length) {
    const results = await Promise.all([
      supabaseClient.from("product_variants").select("id, product_id, color_name, sort_order").in("product_id", ids).order("sort_order"),
      supabaseClient.from("product_sizes").select("id, product_id, size_name, bust_cm, garment_length_cm, sleeve_length_cm, sort_order").in("product_id", ids).order("sort_order"),
      supabaseClient.from("product_images").select("id, product_id, variant_id, image_path, alt_text, sort_order").in("product_id", ids).order("sort_order"),
      supabaseClient.from("inventory").select("product_id, variant_id, size_id, stock_quantity, reserved_quantity").in("product_id", ids),
    ]);
    const failed = results.find((result) => result.error);
    if (failed) {
      setStatus("#productsStatus", `Data varian atau stok gagal dimuat: ${failed.error.message}`, true);
      return;
    }
    [variants, sizes, images, inventory] = results.map((result) => result.data);
  }

  state.products = data.map((product) => ({
    ...product,
    variants: variants.filter((row) => row.product_id === product.id),
    sizes: sizes.filter((row) => row.product_id === product.id),
    images: images.filter((row) => row.product_id === product.id),
    inventory: inventory.filter((row) => row.product_id === product.id),
  }));
  renderPromoProductOptions();
  renderProducts();
  setStatus("#productsStatus", `${state.products.length} produk dimuat.`);
}

function renderCategoryManager() {
  const parentSelect = $("#categoryParent");
  const selectedParent = parentSelect.value;
  const parents = state.categories.filter((category) => !category.parent_id);
  const activeParents = parents.filter((category) => category.is_active);
  parentSelect.innerHTML = `<option value="">Kategori utama</option>${activeParents.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join("")}`;
  if (activeParents.some((category) => category.id === selectedParent)) parentSelect.value = selectedParent;

  const categoryList = $("#categoryManagerList");
  categoryList.innerHTML = parents.map((parent) => {
    const children = state.categories.filter((category) => category.parent_id === parent.id);
    const renderRow = (category, nested = false) => `
      <article class="category-manager-row${nested ? " is-nested" : ""}">
        <div><strong>${escapeHtml(category.name)}</strong><small>/${escapeHtml(category.slug)}/ ${nested ? "· Subkategori" : "· Kategori utama"}</small></div>
        <span class="status-pill ${category.is_active ? "is-on" : "is-off"}">${category.is_active ? "Aktif" : "Nonaktif"}</span>
        <div class="category-manager-actions"><button class="button button-small" type="button" data-edit-category="${escapeHtml(category.id)}">Ubah nama</button><button class="button button-small button-quiet" type="button" data-toggle-category="${escapeHtml(category.id)}" data-active="${category.is_active}">${category.is_active ? "Nonaktifkan" : "Aktifkan"}</button></div>
      </article>`;
    return `${renderRow(parent)}${children.map((category) => renderRow(category, true)).join("")}`;
  }).join("") || '<p class="empty-state">Belum ada kategori.</p>';

  $("#productCategory").innerHTML = `<option value="">Pilih kategori</option>${parents.map((parent) => {
    const children = state.categories.filter((category) => category.parent_id === parent.id);
    const parentDisabled = parent.is_active ? "" : " disabled";
    return `<optgroup label="${escapeHtml(parent.name)}${parent.is_active ? "" : " (Nonaktif)"}"><option value="${escapeHtml(parent.id)}"${parentDisabled}>Semua ${escapeHtml(parent.name)}</option>${children.map((category) => `<option value="${escapeHtml(category.id)}"${category.is_active && parent.is_active ? "" : " disabled"}>${escapeHtml(category.name)}${category.is_active ? "" : " (Nonaktif)"}</option>`).join("")}</optgroup>`;
  }).join("")}`;
}

function renderProductCategoryOptions() {
  const select = $("#productCategory");
  const currentValue = select.value;
  renderCategoryManager();
  if (state.categories.some((category) => category.id === currentValue)) select.value = currentValue;
}

async function saveCategory(event) {
  event.preventDefault();
  const name = $("#categoryName").value.trim();
  const slug = slugify(name);
  const parentId = $("#categoryParent").value || null;
  if (!name || !slug) {
    setStatus("#categoryStatus", "Masukkan nama kategori yang valid.", true);
    return;
  }
  const parent = parentId ? state.categories.find((category) => category.id === parentId) : null;
  if (parent?.parent_id) {
    setStatus("#categoryStatus", "Subkategori hanya dapat memiliki satu tingkat induk. Pilih kategori utama.", true);
    return;
  }
  const button = $("#saveCategoryButton");
  button.disabled = true;
  setStatus("#categoryStatus", "Menyimpan kategori…");
  try {
    const { error } = await supabaseClient.from("product_categories").insert({ name, slug, parent_id: parentId });
    if (error) throw error;
    $("#categoryForm").reset();
    await loadProducts();
    setStatus("#categoryStatus", `Kategori “${name}” berhasil ditambahkan.`);
  } catch (error) {
    setStatus("#categoryStatus", `Kategori belum tersimpan: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

async function toggleCategory(categoryId, isActive) {
  const category = state.categories.find((item) => item.id === categoryId);
  if (!category) return;
  if (isActive && category.parent_id && !state.categories.find((item) => item.id === category.parent_id)?.is_active) {
    setStatus("#categoryStatus", "Aktifkan kategori induk terlebih dahulu.", true);
    return;
  }
  if (!isActive && !category.parent_id && state.categories.some((item) => item.parent_id === categoryId && item.is_active)) {
    setStatus("#categoryStatus", "Nonaktifkan semua subkategori aktif terlebih dahulu.", true);
    return;
  }
  const action = isActive ? "nonaktifkan" : "aktifkan";
  if (!window.confirm(`Yakin ingin ${action} kategori “${category.name}”? Produk tidak akan dihapus.`)) return;
  setStatus("#categoryStatus", "Memperbarui kategori…");
  const { error } = await supabaseClient.from("product_categories").update({ is_active: !isActive }).eq("id", categoryId);
  if (error) {
    setStatus("#categoryStatus", `Kategori gagal diperbarui: ${error.message}`, true);
    return;
  }
  await loadProducts();
  setStatus("#categoryStatus", `Kategori “${category.name}” berhasil diperbarui.`);
}

async function renameCategory(categoryId) {
  const category = state.categories.find((item) => item.id === categoryId);
  if (!category) return;
  const name = window.prompt("Nama kategori baru:", category.name)?.trim();
  if (!name || name === category.name) return;
  const slug = slugify(name);
  if (!slug) {
    setStatus("#categoryStatus", "Nama kategori tidak menghasilkan alamat yang valid.", true);
    return;
  }
  const { error } = await supabaseClient.from("product_categories").update({ name, slug }).eq("id", categoryId);
  if (error) {
    setStatus("#categoryStatus", `Nama kategori gagal diubah: ${error.message}`, true);
    return;
  }
  await loadProducts();
  setStatus("#categoryStatus", `Kategori berhasil diubah menjadi “${name}”.`);
}

function clearProductForm() {
  $("#productForm").reset();
  $("#wholesaleMin").value = "20";
  $("#productActive").checked = false;
  $("#productSlug").value = "";
  $("#productVariants").value = "";
  $("#productSizes").value = "";
  state.editingProductId = null;
  state.variants = [];
  state.sizes = [];
  state.stockDraft = new Map();
  state.imageFiles = new Map();
  $("#productImageFiles").value = "";
  $("#saveStockButton").disabled = true;
  renderStockMatrix();
  setStatus("#productFormStatus", "");
  $("#productFormTitle").textContent = "Tambah produk";
  $("#saveProductButton").textContent = "Simpan produk";
}

function openNewProduct() {
  clearProductForm();
  $("#productModal").hidden = false;
  $("#productName").focus();
}

async function openEditProduct(productId) {
  const product = state.products.find((item) => String(item.id) === String(productId));
  if (!product) return;
  clearProductForm();
  state.editingProductId = product.id;
  state.variants = product.variants;
  state.sizes = product.sizes;

  const fields = {
    productName: "name", productSku: "sku", productSlug: "slug",
    priceRetail: "price_retail", priceSeries: "price_series", priceWholesale: "price_wholesale",
    wholesaleMin: "wholesale_min_qty", productMaterial: "material", productModel: "model",
    productDescription: "description", productCare: "care_notes",
  };
  Object.entries(fields).forEach(([id, key]) => { $(`#${id}`).value = product[key] ?? ""; });
  const selectedCategoryId = product.category_id || state.categories.find((category) => !category.parent_id && category.name.toLocaleLowerCase("id-ID") === String(product.category || "").toLocaleLowerCase("id-ID"))?.id || "";
  $("#productCategory").value = selectedCategoryId;
  $("#productActive").checked = product.is_active;

  const variantNames = new Map(product.variants.map((variant) => [variant.id, variant.color_name]));
  $("#productVariants").value = product.images.map((image) =>
    `${variantNames.get(image.variant_id) || ""} | ${image.image_path} | ${image.alt_text || ""}`)
    .join("\n");
  if (!product.images.length) $("#productVariants").value = product.variants.map((variant) => variant.color_name).join("\n");
  $("#productSizes").value = product.sizes.map((size) =>
    `${size.size_name} | ${size.bust_cm ?? ""} | ${size.garment_length_cm ?? ""} | ${size.sleeve_length_cm ?? ""}`).join("\n");
  state.stockDraft = new Map();
  product.inventory.forEach((item) => {
    const variant = product.variants.find((row) => row.id === item.variant_id);
    const size = product.sizes.find((row) => row.id === item.size_id);
    if (variant && size) state.stockDraft.set(stockKey(variant.color_name, size.size_name), item.stock_quantity);
  });
  renderStockMatrix();
  $("#productFormTitle").textContent = "Edit produk";
  $("#saveProductButton").textContent = "Simpan perubahan";
  $("#saveStockButton").disabled = false;
  $("#productModal").hidden = false;
}

async function openStockEditor(productId) {
  await openEditProduct(productId);
  const firstStockInput = $("#inventoryMatrix input[data-stock-color]");
  $("#inventorySection").scrollIntoView({ behavior: "smooth", block: "center" });
  if (firstStockInput) firstStockInput.focus({ preventScroll: true });
}

function closeProductModal() {
  if (state.busy) return;
  $("#productModal").hidden = true;
  clearProductForm();
}

function setFormBusy(busy) {
  state.busy = busy;
  $("#saveProductButton").disabled = busy;
  $("#saveStockButton").disabled = busy || !state.editingProductId;
  $("#cancelProductButton").disabled = busy;
  $("#closeProductModal").disabled = busy;
  $("#saveProductButton").textContent = busy ? "Menyimpan…" : (state.editingProductId ? "Simpan perubahan" : "Simpan produk");
}

async function upsertVariants(productId, colors) {
  if (!colors.length) return [];
  const rows = colors.map((color, index) => ({
    product_id: productId,
    color_name: color,
    sort_order: index,
    is_active: true,
  }));
  const { data, error } = await supabaseClient.from("product_variants")
    .upsert(rows, { onConflict: "product_id,color_name" }).select("id, product_id, color_name, sort_order");
  if (error) throw error;
  return data;
}

async function upsertSizes(productId, sizeRows) {
  if (!sizeRows.length) return [];
  const rows = sizeRows.map((size, index) => ({
    product_id: productId,
    size_name: size.name,
    bust_cm: size.bust,
    garment_length_cm: size.length,
    sleeve_length_cm: size.sleeve,
    sort_order: index,
  }));
  const { data, error } = await supabaseClient.from("product_sizes")
    .upsert(rows, { onConflict: "product_id,size_name" }).select("id, product_id, size_name, bust_cm, garment_length_cm, sleeve_length_cm, sort_order");
  if (error) throw error;
  return data;
}

async function saveProduct(event) {
  event.preventDefault();
  if (state.busy) return;
  setStatus("#productFormStatus", "");
  setFormBusy(true);
  let insertedProductId = null;
  let insertedImageIds = [];
  let uploadedPaths = [];
  try {
    syncStockDraft();
    const name = $("#productName").value.trim();
    const slug = slugify($("#productSlug").value || name);
    if (!name || !slug) throw new Error("Nama produk dan slug wajib diisi.");

    const { rows: imageRows, colors } = parseVariantLines($("#productVariants").value);
    const sizesInput = parseSizeLines($("#productSizes").value);
    const uniqueColors = new Set(colors.map((name) => name.toLocaleLowerCase("id-ID")));
    if (uniqueColors.size !== colors.length) throw new Error("Nama warna harus unik.");

    const productPayload = {
      name, slug,
      sku: $("#productSku").value.trim() || null,
      category_id: $("#productCategory").value || null,
      category: state.categories.find((category) => category.id === $("#productCategory").value)?.name || null,
      description: $("#productDescription").value.trim(),
      material: $("#productMaterial").value.trim() || null,
      model: $("#productModel").value.trim() || null,
      care_notes: $("#productCare").value.trim() || null,
      price_retail: parseNumber($("#priceRetail").value, "Harga ecer", { integer: true }),
      price_series: parseNumber($("#priceSeries").value, "Harga serian", { integer: true }),
      price_wholesale: parseNumber($("#priceWholesale").value, "Harga grosir", { integer: true }),
      wholesale_min_qty: parseNumber($("#wholesaleMin").value, "Minimal grosir", { integer: true, min: 1 }) || 20,
      is_active: $("#productActive").checked,
    };

    let productId = state.editingProductId;
    if (productId) {
      const { error } = await supabaseClient.from("products").update(productPayload).eq("id", productId);
      if (error) throw error;
    } else {
      const { data, error } = await supabaseClient.from("products").insert(productPayload).select("id").single();
      if (error) throw error;
      productId = data.id;
      insertedProductId = productId;
    }

    const savedVariants = await upsertVariants(productId, colors);
    const savedSizes = await upsertSizes(productId, sizesInput);
    const variantByName = new Map(savedVariants.map((row) => [row.color_name.toLocaleLowerCase("id-ID"), row]));
    const sizeByName = new Map(savedSizes.map((row) => [row.size_name.toLocaleLowerCase("id-ID"), row]));

    const desiredImages = imageRows.filter((row) => row.image).map((row, index) => {
      const variant = variantByName.get(row.color.toLocaleLowerCase("id-ID"));
      if (!variant) throw new Error(`Warna “${row.color}” tidak ditemukan pada baris foto ${row.line}.`);
      return {
        product_id: productId, variant_id: variant.id,
        image_path: row.image, alt_text: row.alt || null, sort_order: index,
      };
    });
    for (const [color, files] of state.imageFiles.entries()) {
      const variant = variantByName.get(color.toLocaleLowerCase("id-ID"));
      if (!variant) throw new Error(`Warna “${color}” perlu disimpan terlebih dahulu sebelum fotonya diunggah.`);
      for (const file of files) {
        const extension = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const safeName = slugify(file.name.replace(/\.[^.]+$/, "")) || "foto";
        const fileToken = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
        const path = `${productId}/${slugify(color)}/${Date.now()}-${fileToken}-${safeName}.${extension}`;
        const { error } = await supabaseClient.storage.from("product-images").upload(path, file, {
          cacheControl: "3600", upsert: false, contentType: file.type,
        });
        if (error) throw error;
        uploadedPaths.push(path);
        const { data: publicUrl } = supabaseClient.storage.from("product-images").getPublicUrl(path);
        desiredImages.push({
          product_id: productId, variant_id: variant.id,
          image_path: publicUrl.publicUrl, alt_text: `${name} warna ${color}`, sort_order: desiredImages.length,
        });
      }
    }
    if (desiredImages.length) {
      const { data, error } = await supabaseClient.from("product_images").insert(desiredImages).select("id");
      if (error) throw error;
      insertedImageIds = data.map((row) => row.id);
    }

    const inventoryRows = [];
    colors.forEach((color, colorIndex) => sizesInput.forEach((size, sizeIndex) => {
      const variant = variantByName.get(color.toLocaleLowerCase("id-ID"));
      const savedSize = sizeByName.get(size.name.toLocaleLowerCase("id-ID"));
      const raw = state.stockDraft.get(stockKey(color, size.name));
      inventoryRows.push({
        product_id: productId, variant_id: variant.id, size_id: savedSize.id,
        stock_quantity: parseNumber(raw, `Stok ${color} ukuran ${size.name}`, { integer: true }),
      });
    }));
    if (inventoryRows.length) {
      const { error } = await supabaseClient.from("inventory")
        .upsert(inventoryRows, { onConflict: "variant_id,size_id" });
      if (error) throw error;
    }

    const keepVariantIds = savedVariants.map((row) => row.id);
    const keepSizeIds = savedSizes.map((row) => row.id);
    if (state.editingProductId && state.variants.length) {
      const removed = state.variants.filter((row) => !keepVariantIds.includes(row.id)).map((row) => row.id);
      if (removed.length) {
        const { error } = await supabaseClient.from("product_variants").delete().in("id", removed).eq("product_id", productId);
        if (error) throw error;
      }
    }
    if (state.editingProductId && state.sizes.length) {
      const removed = state.sizes.filter((row) => !keepSizeIds.includes(row.id)).map((row) => row.id);
      if (removed.length) {
        const { error } = await supabaseClient.from("product_sizes").delete().in("id", removed).eq("product_id", productId);
        if (error) throw error;
      }
    }

    const previousImages = state.products.find((product) => product.id === productId)?.images || [];
    if (previousImages.length) {
      const { error } = await supabaseClient.from("product_images")
        .delete().in("id", previousImages.map((image) => image.id));
      if (error) throw error;
    }
    const keptImagePaths = new Set(desiredImages.map((image) => image.image_path));
    const obsoleteStoragePaths = previousImages.map((image) => storagePathFromPublicUrl(image.image_path)).filter(Boolean)
      .filter((path) => !uploadedPaths.includes(path) && !keptImagePaths.has(imagePublicUrl(path)));
    if (obsoleteStoragePaths.length) {
      const { error } = await supabaseClient.storage.from("product-images").remove(obsoleteStoragePaths);
      if (error) console.warn("Foto lama belum terhapus dari Storage:", error.message);
    }

    $("#productModal").hidden = true;
    clearProductForm();
    setStatus("#productsStatus", "Produk berhasil disimpan.");
    await Promise.all([loadProducts(), loadOverview()]);
  } catch (error) {
    if (uploadedPaths.length) {
      await supabaseClient.storage.from("product-images").remove(uploadedPaths);
    }
    if (insertedImageIds.length && !insertedProductId) {
      await supabaseClient.from("product_images").delete().in("id", insertedImageIds);
    }
    if (insertedProductId) {
      await supabaseClient.from("products").delete().eq("id", insertedProductId);
    }
    setStatus("#productFormStatus", `Belum berhasil disimpan: ${error.message}`, true);
  } finally {
    setFormBusy(false);
  }
}

function storagePathFromPublicUrl(value) {
  if (!value) return null;
  const marker = "/storage/v1/object/public/product-images/";
  const index = String(value).indexOf(marker);
  if (index < 0) return null;
  return decodeURIComponent(String(value).slice(index + marker.length));
}

function imagePublicUrl(path) {
  return supabaseClient.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}

async function saveStockOnly() {
  if (!state.editingProductId || state.busy) return;
  setFormBusy(true);
  setStatus("#productFormStatus", "Menyimpan stok…");
  try {
    syncStockDraft();
    const product = state.products.find((item) => item.id === state.editingProductId);
    const { colors } = parseVariantLines($("#productVariants").value);
    const sizes = parseSizeLines($("#productSizes").value);
    const variantsByName = new Map(product.variants.map((row) => [row.color_name.toLocaleLowerCase("id-ID"), row]));
    const sizesByName = new Map(product.sizes.map((row) => [row.size_name.toLocaleLowerCase("id-ID"), row]));
    const rows = [];
    colors.forEach((color) => sizes.forEach((size) => {
      const variant = variantsByName.get(color.toLocaleLowerCase("id-ID"));
      const savedSize = sizesByName.get(size.name.toLocaleLowerCase("id-ID"));
      if (!variant || !savedSize) throw new Error("Simpan perubahan warna atau ukuran terlebih dahulu, lalu atur stok.");
      rows.push({
        product_id: product.id, variant_id: variant.id, size_id: savedSize.id,
        stock_quantity: parseNumber(state.stockDraft.get(stockKey(color, size.name)), `Stok ${color} ukuran ${size.name}`, { integer: true }),
      });
    }));
    if (!rows.length) throw new Error("Tambahkan warna dan ukuran produk sebelum mengisi stok.");
    if (rows.length) {
      const { error } = await supabaseClient.from("inventory").upsert(rows, { onConflict: "variant_id,size_id" });
      if (error) throw error;
    }
    product.inventory = rows.map((row) => ({
      ...row,
      reserved_quantity: product.inventory.find((existing) => existing.variant_id === row.variant_id && existing.size_id === row.size_id)?.reserved_quantity || 0,
    }));
    renderProducts();
    setStatus("#productFormStatus", "Stok berhasil diperbarui.");
    setStatus("#productsStatus", `Stok ${product.name} berhasil diperbarui.`);
  } catch (error) {
    setStatus("#productFormStatus", `Stok belum tersimpan: ${error.message}`, true);
  } finally {
    setFormBusy(false);
  }
}

async function deleteProduct(productId) {
  const product = state.products.find((item) => String(item.id) === String(productId));
  if (!product) return;
  const confirmed = window.confirm(`Hapus “${product.name}” dari katalog? Foto, warna, ukuran, dan stok produk akan dihapus. Rincian nama/warna/ukuran pada pesanan lama tetap tersimpan.`);
  if (!confirmed) return;
  setStatus("#productsStatus", `Menghapus ${product.name}…`);
  const { error } = await supabaseClient.from("products").delete().eq("id", product.id);
  if (error) {
    setStatus("#productsStatus", `Produk gagal dihapus: ${error.message}`, true);
    return;
  }
  const storagePaths = product.images.map((image) => storagePathFromPublicUrl(image.image_path)).filter(Boolean);
  let cleanupNote = "";
  if (storagePaths.length) {
    const { error: storageError } = await supabaseClient.storage.from("product-images").remove(storagePaths);
    if (storageError) cleanupNote = " Data produk sudah terhapus, tetapi ada foto di Storage yang perlu dibersihkan nanti.";
  }
  await Promise.all([loadProducts(), loadOverview()]);
  setStatus("#productsStatus", `Produk dihapus.${cleanupNote}`);
}

async function setProductActive(productId, nextActive) {
  const { error } = await supabaseClient.from("products").update({ is_active: nextActive }).eq("id", productId);
  if (error) {
    setStatus("#productsStatus", `Status produk gagal diperbarui: ${error.message}`, true);
    return;
  }
  await Promise.all([loadProducts(), loadOverview()]);
  setStatus("#productsStatus", nextActive ? "Produk diaktifkan." : "Produk dijadikan draft.");
}

async function handleLogin(event) {
  event.preventDefault();
  if (!supabaseClient) return showLogin("Konfigurasi Supabase belum lengkap.");
  const button = $("#loginButton");
  button.disabled = true;
  setStatus("#loginStatus", "Memeriksa akun…");
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: $("#adminEmail").value.trim(), password: $("#adminPassword").value,
    });
    if (error) throw error;
    await confirmAdmin(data.user);
  } catch (error) {
    setStatus("#loginStatus", error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function handleAdminPasswordRecovery() {
  if (!supabaseClient) return showLogin("Konfigurasi Supabase belum lengkap.");
  const email = $("#adminEmail").value.trim();
  if (!email) {
    setStatus("#loginStatus", "Masukkan email admin terlebih dahulu.", true);
    $("#adminEmail").focus();
    return;
  }

  const button = $("#adminForgotPasswordButton");
  button.disabled = true;
  setStatus("#loginStatus", "Mengirim tautan pemulihan…");
  try {
    const redirectTo = new URL("akun.html?mode=new-password&return=admin", window.location.href).href;
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    setStatus("#loginStatus", "Jika email terdaftar, tautan pemulihan akan dikirim. Periksa kotak masuk dan folder spam.");
  } catch (error) {
    setStatus("#loginStatus", error.message || "Tautan pemulihan belum dapat dikirim. Silakan coba lagi.", true);
  } finally {
    button.disabled = false;
  }
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  state.user = null;
  showLogin("Anda sudah keluar.");
}

function closeEmailSettings() {
  $("#emailSettingsModal").hidden = true;
  $("#emailSettingsForm").reset();
  setStatus("#emailSettingsStatus", "");
}

async function handleAdminEmailChange(event) {
  event.preventDefault();
  if (!state.user) return;
  const newEmail = $("#newAdminEmail").value.trim();
  if (!newEmail) return;
  if (newEmail.toLowerCase() === String(state.user.email || "").toLowerCase()) {
    setStatus("#emailSettingsStatus", "Email baru sama dengan email yang sedang digunakan.", true);
    return;
  }

  const button = $("#saveAdminEmailButton");
  button.disabled = true;
  setStatus("#emailSettingsStatus", "Mengirim tautan konfirmasi…");
  try {
    const emailRedirectTo = new URL("admin.html?email_updated=1", window.location.href).href;
    const { error } = await supabaseClient.auth.updateUser({ email: newEmail }, { emailRedirectTo });
    if (error) throw error;
    setStatus("#emailSettingsStatus", "Tautan konfirmasi dikirim ke email lama dan email baru. Buka keduanya untuk menyelesaikan pergantian alamat.");
  } catch (error) {
    setStatus("#emailSettingsStatus", error.message || "Permintaan perubahan email belum berhasil. Silakan coba lagi.", true);
  } finally {
    button.disabled = false;
  }
}

async function initialize() {
  if (!hasConfig) {
    showLogin("Isi Project URL dan Publishable key di supabase-config.js.");
    $("#loginButton").disabled = true;
    return;
  }
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) return showLogin(`Sesi gagal dibaca: ${error.message}`);
  if (!data.session) return showLogin();
  try {
    await confirmAdmin(data.session.user);
  } catch (error) {
    showLogin(error.message);
  }
}

$("#loginForm").addEventListener("submit", handleLogin);
$("#adminForgotPasswordButton").addEventListener("click", handleAdminPasswordRecovery);
$("#logoutButton").addEventListener("click", handleLogout);
$("#openEmailSettingsButton").addEventListener("click", () => {
  $("#currentAdminEmail").value = state.user?.email || "";
  $("#emailSettingsModal").hidden = false;
  $("#newAdminEmail").focus();
});
$("#closeEmailSettingsButton").addEventListener("click", closeEmailSettings);
$("#cancelEmailSettingsButton").addEventListener("click", closeEmailSettings);
$("#emailSettingsModal").addEventListener("click", (event) => {
  if (event.target === $("#emailSettingsModal")) closeEmailSettings();
});
$("#emailSettingsForm").addEventListener("submit", handleAdminEmailChange);
$("#refreshButton").addEventListener("click", async () => {
  setStatus("#dashboardStatus", "Memuat ulang data…");
  try {
    await Promise.all([loadOverview(), loadProducts()]);
    setStatus("#dashboardStatus", "Data toko berhasil dimuat.");
  } catch (error) {
    setStatus("#dashboardStatus", `Data gagal dimuat: ${error.message}`, true);
  }
});
$("#refreshTrafficButton").addEventListener("click", loadTrafficReport);
$("#refreshAffiliatesButton").addEventListener("click", loadAffiliateAdmin);
$("#affiliateApplicationsBody").addEventListener("click", handleAffiliateAdminAction);
$("#affiliatePayoutsBody").addEventListener("click", handleAffiliateAdminAction);
$("#affiliateSettingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const rate = Number($("#affiliateCommissionRate").value);
    const { error } = await supabaseClient.rpc("admin_update_affiliate_settings", { p_commission_rate: rate });
    if (error) throw error;
    setStatus("#affiliateAdminStatus", "Persentase komisi diperbarui.");
    await loadAffiliateAdmin();
  } catch (error) { setStatus("#affiliateAdminStatus", error.message || "Pengaturan komisi belum tersimpan.", true); }
});
$("#prepareAffiliatePayoutsButton").addEventListener("click", async () => {
  if (!confirm("Siapkan daftar affiliate yang memenuhi syarat pencairan minggu ini? Transfer tetap dilakukan manual oleh admin.")) return;
  try {
    const { data, error } = await supabaseClient.rpc("admin_prepare_affiliate_payouts");
    if (error) throw error;
    setStatus("#affiliateAdminStatus", `${Number(data || 0)} pencairan disiapkan. Periksa rekening dan lakukan transfer manual.`);
    await loadAffiliateAdmin();
  } catch (error) { setStatus("#affiliateAdminStatus", error.message || "Daftar pencairan belum dapat disiapkan.", true); }
});
$("#trafficDateRange").addEventListener("change", loadTrafficReport);
$("#utmBuilderForm").addEventListener("submit", buildUtmLink);
$("#copyUtmButton").addEventListener("click", copyUtmLink);
$("#downloadUtmQrButton").addEventListener("click", downloadUtmQr);
$("#refreshOrdersButton").addEventListener("click", async () => {
  try {
    await Promise.all([loadOrders(), loadOverview()]);
  } catch (error) {
    setStatus("#ordersStatus", `Pesanan gagal diperbarui: ${error.message}`, true);
  }
});
$("#refreshMembersButton").addEventListener("click", loadMembers);
$("#refreshPromoAudienceButton").addEventListener("click", loadPromoEmailAudience);
$("#sendPromoCampaignButton").addEventListener("click", sendPromoCampaign);
$("#promoEmailImageFile").addEventListener("change", handlePromoEmailImageChange);
$("#promoEmailSubject").addEventListener("input", updatePromoEmailSendState);
$("#promoEmailMessage").addEventListener("input", updatePromoEmailSendState);
$("#memberSearch").addEventListener("input", () => {
  window.clearTimeout(state.membersSearchTimer);
  state.membersSearchTimer = window.setTimeout(() => {
    state.membersOffset = 0;
    loadMembers();
  }, 250);
});
$("#memberConsentFilter").addEventListener("change", () => {
  state.membersOffset = 0;
  loadMembers();
});
$("#previousMembersPage").addEventListener("click", () => {
  state.membersOffset = Math.max(0, state.membersOffset - state.membersPageSize);
  loadMembers();
});
$("#nextMembersPage").addEventListener("click", () => {
  if (state.membersOffset + state.membersPageSize < state.membersTotal) {
    state.membersOffset += state.membersPageSize;
    loadMembers();
  }
});
$("#orderSearch").addEventListener("input", renderOrders);
$("#orderFilter").addEventListener("change", () => {
  state.ordersFilter = $("#orderFilter").value;
  renderOrders();
});
document.querySelectorAll("[data-open-orders]").forEach((button) => {
  button.addEventListener("click", () => {
    state.ordersFilter = button.dataset.openOrders;
    $("#orderFilter").value = state.ordersFilter;
    setActiveView("orders");
  });
});
$("#orderForm").addEventListener("submit", saveOrder);
$("#markOrderReturnedButton").addEventListener("click", async () => {
  if (!state.editingOrderId) return;
  if (!confirm("Pastikan permintaan retur diajukan dalam 3 hari dan video unboxing sudah diperiksa. Tandai pesanan ini sebagai retur? Komisi affiliate terkait akan dibatalkan.")) return;
  const button = $("#markOrderReturnedButton");
  button.disabled = true;
  try {
    const requestReceivedAt = $("#returnRequestReceivedAt").value;
    if (!requestReceivedAt) throw new Error("Isi waktu pengajuan retur dari pesan WhatsApp pelanggan.");
    const { error } = await supabaseClient.rpc("admin_mark_order_returned", { p_order_id: state.editingOrderId, p_request_received_at: new Date(requestReceivedAt).toISOString() });
    if (error) throw error;
    closeOrderModal();
    await Promise.all([loadOrders(), loadOverview()]);
    setStatus("#ordersStatus", "Retur dicatat. Komisi affiliate yang belum dibayar dibatalkan.");
  } catch (error) { setStatus("#orderFormStatus", error.message || "Retur belum dapat dicatat.", true); }
  finally { button.disabled = false; }
});
$("#printOrderInvoice").addEventListener("click", printOrderInvoice);
$("#closeOrderModal").addEventListener("click", closeOrderModal);
$("#cancelOrderEdit").addEventListener("click", closeOrderModal);
$("#orderModal").addEventListener("click", (event) => {
  if (event.target === $("#orderModal")) closeOrderModal();
});
document.querySelectorAll("[data-admin-view]").forEach((button) => {
  button.addEventListener("click", () => setActiveView(button.dataset.adminView));
});
$("#categoryForm").addEventListener("submit", saveCategory);
$("#categoryManagerList").addEventListener("click", (event) => {
  const renameButton = event.target.closest("[data-edit-category]");
  if (renameButton) renameCategory(renameButton.dataset.editCategory);
  const toggleButton = event.target.closest("[data-toggle-category]");
  if (toggleButton) toggleCategory(toggleButton.dataset.toggleCategory, toggleButton.dataset.active === "true");
});
$("#saveHomepageContentButton").addEventListener("click", saveHomepageContent);
$("#homepagePromoCtaType").addEventListener("change", updatePromoDestinationControls);
$("#homepagePromoProduct").addEventListener("change", updatePromoDestinationControls);
$("#homepagePromoCustomUrl").addEventListener("input", updatePromoDestinationControls);
$("#homepageLaunchImageFile").addEventListener("change", (event) => handleHomepageImageChange("launch", event));
$("#homepagePromoImageFile").addEventListener("change", (event) => handleHomepageImageChange("promo", event));
$("#homepageLaunchImageUrl").addEventListener("input", (event) => {
  state.spotlightFiles.launch = null;
  showHomepageImagePreview("launch", event.target.value.trim());
});
$("#homepagePromoImageUrl").addEventListener("input", (event) => {
  state.spotlightFiles.promo = null;
  showHomepageImagePreview("promo", event.target.value.trim());
});
$("#addProductButton").addEventListener("click", openNewProduct);
$("#productSearch").addEventListener("input", renderProducts);
$("#productVariants").addEventListener("input", renderStockMatrix);
$("#productSizes").addEventListener("input", renderStockMatrix);
$("#inventoryMatrix").addEventListener("input", syncStockDraft);
$("#productForm").addEventListener("submit", saveProduct);
$("#saveStockButton").addEventListener("click", saveStockOnly);
$("#closeProductModal").addEventListener("click", closeProductModal);
$("#cancelProductButton").addEventListener("click", closeProductModal);
$("#productModal").addEventListener("click", (event) => {
  if (event.target === $("#productModal")) closeProductModal();
});
$("#productImageFiles").addEventListener("change", (event) => {
  const color = $("#imageVariantColor").value;
  if (!color) return;
  const chosen = [...event.target.files];
  const invalid = chosen.find((file) => !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) || file.size > 10 * 1024 * 1024);
  if (invalid) {
    setStatus("#productFormStatus", `File “${invalid.name}” bukan format gambar yang diizinkan atau ukurannya melebihi 10 MB.`, true);
  } else {
    const current = state.imageFiles.get(color) || [];
    state.imageFiles.set(color, [...current, ...chosen]);
    setStatus("#productFormStatus", "Foto dipilih. Foto akan diunggah saat produk disimpan.");
  }
  event.target.value = "";
  renderSelectedImageFiles();
});
$("#selectedImageFiles").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-image]");
  if (!button) return;
  const color = button.dataset.removeImage;
  const files = state.imageFiles.get(color) || [];
  files.splice(Number(button.dataset.imageIndex), 1);
  if (files.length) state.imageFiles.set(color, files);
  else state.imageFiles.delete(color);
  renderSelectedImageFiles();
});
$("#productName").addEventListener("input", () => {
  if (!state.editingProductId || !$("#productSlug").dataset.touched) {
    $("#productSlug").value = slugify($("#productName").value);
  }
});
$("#productSlug").addEventListener("input", () => { $("#productSlug").dataset.touched = "true"; });
$("#productsBody").addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-product]");
  const toggleButton = event.target.closest("[data-toggle-product]");
  const stockButton = event.target.closest("[data-stock-product]");
  const deleteButton = event.target.closest("[data-delete-product]");
  if (stockButton) openStockEditor(stockButton.dataset.stockProduct);
  if (editButton) openEditProduct(editButton.dataset.editProduct);
  if (toggleButton) setProductActive(toggleButton.dataset.toggleProduct, toggleButton.dataset.active !== "true");
  if (deleteButton) deleteProduct(deleteButton.dataset.deleteProduct);
});

initialize();

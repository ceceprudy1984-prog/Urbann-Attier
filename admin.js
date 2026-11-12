const config = window.URBANN_SUPABASE_CONFIG;
const hasConfig = Boolean(config?.url && config?.publishableKey && window.supabase?.createClient);
const supabaseClient = hasConfig
  ? window.supabase.createClient(config.url, config.publishableKey)
  : null;

const $ = (selector) => document.querySelector(selector);
const state = {
  user: null,
  products: [],
  orders: [],
  ordersFilter: "all",
  orderChannel: null,
  orderRefreshTimer: null,
  editingOrderId: null,
  editingProductId: null,
  variants: [],
  sizes: [],
  stockDraft: new Map(),
  imageFiles: new Map(),
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
  $("#ordersPage").hidden = viewName !== "orders";
  $("#productsPage").hidden = viewName !== "products";
  document.querySelectorAll("[data-admin-view]").forEach((button) => {
    const active = button.dataset.adminView === viewName;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  if (viewName === "products") loadProducts();
  if (viewName === "orders") loadOrders();
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
    .subscribe();
}

function scheduleOrderRefresh() {
  window.clearTimeout(state.orderRefreshTimer);
  state.orderRefreshTimer = window.setTimeout(() => {
    const refreshes = [loadOverview()];
    if ($("#orderModal").hidden) refreshes.push(loadOrders());
    Promise.all(refreshes).catch((error) => {
      setStatus("#dashboardStatus", `Aktivitas pesanan gagal diperbarui: ${error.message}`, true);
    });
  }, 350);
}

async function loadOverview() {
  const [products, orders, pending, recent] = await Promise.all([
    supabaseClient.from("products").select("id", { count: "exact", head: true }),
    supabaseClient.from("orders").select("id", { count: "exact", head: true }),
    supabaseClient.from("orders").select("id", { count: "exact", head: true }).or("status.eq.needs_confirmation,payment_status.eq.waiting_confirmation").neq("status", "cancelled"),
    supabaseClient.from("orders").select("id, order_number, customer_name, total_amount, status, payment_status, created_at").order("created_at", { ascending: false }).limit(6),
  ]);
  const failed = [products, orders, pending, recent].find((result) => result.error);
  if (failed) throw failed.error;

  $("#productCount").textContent = products.count ?? 0;
  $("#orderCount").textContent = orders.count ?? 0;
  $("#pendingCount").textContent = pending.count ?? 0;
  $("#recentOrdersBody").innerHTML = recent.data.map((order) => `<tr>
    <td>${escapeHtml(order.order_number)}</td><td>${escapeHtml(order.customer_name)}</td>
    <td>${formatRupiah(order.total_amount)}</td><td><span class="status-pill ${orderStatusClass(order.status)}">${escapeHtml(orderStatusLabel(order.status))}</span><small class="table-substatus">${escapeHtml(paymentStatusLabel(order.payment_status))}</small></td><td>${formatDate(order.created_at)}</td>
    <td><button class="button button-small" type="button" data-open-order="${escapeHtml(order.id)}">Lihat / kelola</button></td>
  </tr>`).join("");
  $("#ordersEmpty").hidden = recent.data.length > 0;
  document.querySelectorAll("[data-open-order]").forEach((button) => button.addEventListener("click", () => openOrderEditor(button.dataset.openOrder)));
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
function paymentStatusLabel(status) { return PAYMENT_STATUS_LABELS[status] || status || "—"; }
function orderStatusClass(status) {
  if (["processing", "shipped", "completed"].includes(status)) return "is-on";
  if (status === "cancelled") return "is-off";
  return "is-pending";
}

async function loadOrders() {
  setStatus("#ordersStatus", "Memuat pesanan…");
  const { data, error } = await supabaseClient.from("orders")
    .select("id, order_number, customer_name, customer_phone, customer_email, address_line, province, city, district, postal_code, customer_note, status, payment_status, payment_method, shipping_status, shipping_provider, shipping_service, tracking_number, subtotal_amount, packaging_fee, shipping_fee, total_amount, confirmed_at, confirmed_by_email, paid_at, paid_confirmed_by_email, created_at, updated_at, confirmed_by, paid_confirmed_by")
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
      || (state.ordersFilter === "pending" && order.status !== "cancelled" && (order.status === "needs_confirmation" || order.payment_status === "waiting_confirmation"))
      || order.status === state.ordersFilter;
    return matchesQuery && matchesFilter;
  });
  $("#ordersBody").innerHTML = orders.map((order) => `<tr>
    <td><strong>${escapeHtml(order.order_number)}</strong><small>${formatDate(order.created_at)}</small></td>
    <td><strong>${escapeHtml(order.customer_name)}</strong><small>${escapeHtml(order.customer_phone)}</small></td>
    <td><strong>${formatRupiah(order.total_amount)}</strong><small>${escapeHtml(paymentStatusLabel(order.payment_status))}</small></td>
    <td><span class="status-pill ${order.payment_status === "paid" ? "is-on" : order.payment_status === "rejected" ? "is-off" : "is-pending"}">${escapeHtml(paymentStatusLabel(order.payment_status))}</span></td>
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
    ${order.customer_note ? `<p>Catatan: ${escapeHtml(order.customer_note)}</p>` : ""}<small>Dibuat ${formatDate(order.created_at)} · Konfirmasi admin: ${order.confirmed_at ? `${formatDate(order.confirmed_at)} oleh ${escapeHtml(order.confirmed_by_email || "admin")}` : "Belum"} · Pembayaran: ${order.paid_at ? `${formatDate(order.paid_at)} diverifikasi oleh ${escapeHtml(order.paid_confirmed_by_email || "admin")}` : "Belum lunas"}</small>`;
  $("#orderItemsBody").innerHTML = order.items.length ? order.items.map((item) => `<tr>
    <td><strong>${escapeHtml(item.product_name)}</strong><small>${escapeHtml(item.color_name)} · ${escapeHtml(item.size_name)} · ${escapeHtml(item.pricing_tier)}</small></td>
    <td>${Number(item.quantity)} pcs</td><td>${formatRupiah(item.unit_price)}</td><td>${formatRupiah(item.line_total)}</td>
  </tr>`).join("") : '<tr><td colspan="4">Rincian produk tidak tersedia.</td></tr>';
  $("#orderMoneySummary").innerHTML = `<span>Produk ${formatRupiah(order.subtotal_amount)} + pengemasan ${formatRupiah(order.packaging_fee)} + ongkir ${order.shipping_fee == null ? "belum diisi" : formatRupiah(order.shipping_fee)}</span><strong>Total ${formatRupiah(order.total_amount)}</strong>`;
  $("#orderStatusSelect").value = order.status === "paid" ? "processing" : order.status;
  $("#paymentStatusSelect").value = order.payment_status;
  $("#orderShippingFee").value = order.shipping_fee ?? "";
  $("#orderShippingProvider").value = order.shipping_provider || "";
  $("#orderShippingService").value = order.shipping_service || "";
  $("#orderTrackingNumber").value = order.tracking_number || "";
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
      <td><strong>${escapeHtml(item.product_name)}</strong><small>${escapeHtml(item.color_name)} / ${escapeHtml(item.size_name)}${item.pricing_tier ? ` · ${escapeHtml(item.pricing_tier)}` : ""}</small></td>
      <td class="invoice-qty">${Number(item.quantity)}×</td>
      <td class="invoice-amount">${formatRupiah(item.line_total)}</td>
    </tr>`).join("") : '<tr><td colspan="3">Rincian produk tidak tersedia.</td></tr>';
  const shipping = order.shipping_fee == null ? "Belum ditentukan" : formatRupiah(order.shipping_fee);
  const totalLabel = order.shipping_fee == null ? "Total sementara" : "Total tagihan";
  const carrier = [order.shipping_provider, order.shipping_service].filter(Boolean).map(escapeHtml).join(" · ") || "Belum ditentukan";

  $("#invoicePrintArea").innerHTML = `
    <header class="invoice-heading">
      <div class="invoice-brand"><img src="assets/urban attier tf.png" alt="" /><div><strong>Urbann Attier</strong><small>Gamis wanita</small></div></div>
      <div class="invoice-title"><h1>Invoice Pesanan</h1><strong>${escapeHtml(order.order_number)}</strong><span>${formatDate(order.created_at)}</span></div>
    </header>
    <section class="invoice-customer"><h2>Informasi pelanggan</h2><strong>${escapeHtml(order.customer_name)}</strong><span>${escapeHtml(order.customer_phone)}${order.customer_email ? ` · ${escapeHtml(order.customer_email)}` : ""}</span><span>${address || "Alamat belum tersedia"}</span>${order.customer_note ? `<small>Catatan: ${escapeHtml(order.customer_note)}</small>` : ""}</section>
    <table class="invoice-items"><thead><tr><th>Produk</th><th>Qty</th><th>Jumlah</th></tr></thead><tbody>${itemRows}</tbody></table>
    <section class="invoice-totals"><div><span>Subtotal produk</span><strong>${formatRupiah(order.subtotal_amount)}</strong></div><div><span>Biaya pengemasan</span><strong>${formatRupiah(order.packaging_fee)}</strong></div><div><span>Ongkos kirim</span><strong>${shipping}</strong></div><div class="invoice-grand-total"><span>${totalLabel}</span><strong>${formatRupiah(order.total_amount)}</strong></div></section>
    <section class="invoice-status"><div><span>Status pembayaran</span><strong>${escapeHtml(paymentStatusLabel(order.payment_status))}</strong></div><div><span>Tahap pesanan</span><strong>${escapeHtml(orderStatusLabel(order.status))}</strong></div><div><span>Ekspedisi / layanan</span><strong>${carrier}</strong></div><div><span>Nomor resi</span><strong>${escapeHtml(order.tracking_number || "Belum tersedia")}</strong></div></section>
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
  if (paymentChanged) lines.push(`Status pembayaran: ${paymentStatusLabel(nextPaymentStatus)}.`);

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
    total_amount: Number(order.subtotal_amount) + Number(order.packaging_fee) + Number(shippingFee || 0),
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
    const stockText = known.length ? `${totalStock} pcs tersedia${totalReserved ? ` · ${totalReserved} dicadangkan` : ""}` : "Belum diisi";
    const stockByVariant = product.variants.length && product.sizes.length
      ? `<div class="product-stock-list">${product.variants.map((variant) => {
        const quantities = product.sizes.map((size) => {
          const row = product.inventory.find((item) => item.variant_id === variant.id && item.size_id === size.id);
          const available = row?.stock_quantity == null ? null : Math.max(0, Number(row.stock_quantity) - Number(row.reserved_quantity || 0));
          const held = Number(row?.reserved_quantity || 0);
          const stateClass = available === 0 ? "is-zero" : available == null ? "is-unknown" : "";
          return `<span class="product-stock-value ${stateClass}">${escapeHtml(size.size_name)}: ${available == null ? "—" : `${available}${held ? ` (${held} dicadangkan)` : ""}`}</span>`;
        }).join("");
        return `<div class="product-stock-color"><strong>${escapeHtml(variant.color_name)}</strong><span>${quantities}</span></div>`;
      }).join("")}</div>`
      : "Belum ada warna / ukuran";
    return `<tr>
      <td><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku || product.slug)}</small></td>
      <td>${formatRupiah(product.price_retail)}</td>
      <td>${formatRupiah(product.price_series)}</td>
      <td>${formatRupiah(product.price_wholesale)}<small>Mulai ${Number(product.wholesale_min_qty) || 20} pcs</small></td>
      <td>${product.variants.length} warna · ${product.sizes.length} ukuran</td>
      <td><small class="stock-total">Total diketahui: ${stockText}</small>${stockByVariant}</td>
      <td><span class="status-pill ${product.is_active ? "is-on" : "is-off"}">${product.is_active ? "Aktif" : "Draft"}</span></td>
      <td><div class="row-actions"><button class="button button-small" type="button" data-stock-product="${product.id}">Atur stok</button>
      <button class="button button-small" type="button" data-edit-product="${product.id}">Edit</button>
      <button class="button button-small button-quiet" type="button" data-toggle-product="${product.id}" data-active="${product.is_active}">${product.is_active ? "Jadikan draft" : "Aktifkan"}</button>
      <button class="button button-small button-danger" type="button" data-delete-product="${product.id}">Hapus</button></div></td>
    </tr>`;
  }).join("");
  $("#productsEmpty").hidden = products.length > 0;
}

async function loadProducts() {
  setStatus("#productsStatus", "Memuat produk…");
  const { data, error } = await supabaseClient.from("products")
    .select("id, sku, slug, name, category, description, material, model, care_notes, price_retail, price_series, price_wholesale, wholesale_min_qty, is_active, sort_order")
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
  renderProducts();
  setStatus("#productsStatus", `${state.products.length} produk dimuat.`);
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
    productName: "name", productSku: "sku", productCategory: "category", productSlug: "slug",
    priceRetail: "price_retail", priceSeries: "price_series", priceWholesale: "price_wholesale",
    wholesaleMin: "wholesale_min_qty", productMaterial: "material", productModel: "model",
    productDescription: "description", productCare: "care_notes",
  };
  Object.entries(fields).forEach(([id, key]) => { $(`#${id}`).value = product[key] ?? ""; });
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
      category: $("#productCategory").value.trim() || null,
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

async function handleLogout() {
  await supabaseClient.auth.signOut();
  state.user = null;
  showLogin("Anda sudah keluar.");
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
$("#logoutButton").addEventListener("click", handleLogout);
$("#refreshButton").addEventListener("click", async () => {
  setStatus("#dashboardStatus", "Memuat ulang data…");
  try {
    await Promise.all([loadOverview(), loadProducts()]);
    setStatus("#dashboardStatus", "Data toko berhasil dimuat.");
  } catch (error) {
    setStatus("#dashboardStatus", `Data gagal dimuat: ${error.message}`, true);
  }
});
$("#refreshOrdersButton").addEventListener("click", async () => {
  try {
    await Promise.all([loadOrders(), loadOverview()]);
  } catch (error) {
    setStatus("#ordersStatus", `Pesanan gagal diperbarui: ${error.message}`, true);
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
$("#printOrderInvoice").addEventListener("click", printOrderInvoice);
$("#closeOrderModal").addEventListener("click", closeOrderModal);
$("#cancelOrderEdit").addEventListener("click", closeOrderModal);
$("#orderModal").addEventListener("click", (event) => {
  if (event.target === $("#orderModal")) closeOrderModal();
});
document.querySelectorAll("[data-admin-view]").forEach((button) => {
  button.addEventListener("click", () => setActiveView(button.dataset.adminView));
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

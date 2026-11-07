const checkoutProducts = document.querySelector("#checkoutProducts");
const checkoutTotals = document.querySelector("#checkoutTotals");
const checkoutContent = document.querySelector("#checkoutContent");
const checkoutEmpty = document.querySelector("#checkoutEmpty");
const recipientForm = document.querySelector("#recipientForm");
const checkoutActionStatus = document.querySelector("#checkoutActionStatus");
const checkoutWhatsAppButton = document.querySelector("#checkoutWhatsAppButton");
const checkoutTokenStorageKey = "urbann-attier-checkout-token-v1";

// Ganti dengan nomor WhatsApp bisnis format internasional tanpa tanda + atau spasi.
const STORE_WHATSAPP = "6282318500057";

function renderCheckout() {
  const items = UrbannCart.getItems();
  const stockCheck = UrbannCart.validateItems(items);
  UrbannCart.updateBadges();

  if (!items.length) {
    checkoutContent.hidden = true;
    checkoutEmpty.hidden = false;
    return;
  }

  let subtotal = 0;
  let allPricesAvailable = true;

  checkoutProducts.innerHTML = items.map((item) => {
    const product = UrbannCart.findProduct(item.productId);
    if (!product) return "";
    const variant = product.varianWarna.find((color) => color.nama === item.color);
    const price = UrbannCart.pricing(product, item);
    const safe = window.urbannEscapeHtml;
    const photo = window.urbannSafeImageUrl(variant?.foto || product.varianWarna[0]?.foto || "");
    if (price.subtotal == null) allPricesAvailable = false;
    else subtotal += price.subtotal;

    return `
      <article class="checkout-product">
        <img src="${safe(photo)}" alt="${safe(product.nama)}, warna ${safe(item.color)}" />
        <div class="checkout-product-info">
          <h3>${safe(product.nama)}</h3>
          <p>${safe(UrbannCart.description(product, item))}</p>
          <p>${price.label} · ${UrbannCart.formatRupiah(price.unitPrice)} / pcs</p>
        </div>
        <div class="checkout-product-price"><span>${item.quantity} pcs</span><strong>${UrbannCart.formatRupiah(price.subtotal)}</strong></div>
      </article>
    `;
  }).join("");

  checkoutTotals.innerHTML = `
    <p class="checkout-total-row"><span>Jumlah produk</span><strong>${items.reduce((sum, item) => sum + item.quantity, 0)} pcs</strong></p>
    <p class="checkout-total-row"><span>Subtotal produk</span><strong>${allPricesAvailable ? UrbannCart.formatRupiah(subtotal) : "Harga belum lengkap"}</strong></p>
  `;
  document.querySelector("#checkoutPackagingFee").textContent = BIAYA_PENGEMASAN == null
    ? "Akan dikonfirmasi admin"
    : UrbannCart.formatRupiah(BIAYA_PENGEMASAN);
  document.querySelector("#checkoutGrandTotal").textContent = !allPricesAvailable
    ? "Harga belum lengkap"
    : BIAYA_PENGEMASAN == null
      ? "Menunggu biaya pengemasan"
      : UrbannCart.formatRupiah(subtotal + BIAYA_PENGEMASAN);
  const hasPendingCheckout = Boolean(sessionStorage.getItem(checkoutTokenStorageKey));
  checkoutWhatsAppButton.disabled = !allPricesAvailable || (!stockCheck.ok && !hasPendingCheckout);
  checkoutWhatsAppButton.textContent = !allPricesAvailable
    ? "Lengkapi harga produk terlebih dahulu"
    : stockCheck.ok
      ? "Kirim pesanan ke WhatsApp"
      : hasPendingCheckout
        ? "Periksa status checkout sebelumnya"
        : "Periksa stok keranjang";
  if (!stockCheck.ok) {
    checkoutActionStatus.textContent = hasPendingCheckout
      ? "Checkout sebelumnya mungkin sudah tercatat. Coba ulangi dengan data dan keranjang yang sama untuk memeriksa hasilnya."
      : stockCheck.message;
  } else if (!hasPendingCheckout) {
    checkoutActionStatus.textContent = "";
  }
}

window.URBANN_PRODUCTS_READY.then(renderCheckout);
window.addEventListener("urbann:catalog-updated", renderCheckout);

function getCheckoutToken() {
  let token = sessionStorage.getItem(checkoutTokenStorageKey);
  if (!token) {
    token = globalThis.crypto?.randomUUID?.()
      || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
        const random = Math.random() * 16 | 0;
        return (char === "x" ? random : (random & 0x3 | 0x8)).toString(16);
      });
    sessionStorage.setItem(checkoutTokenStorageKey, token);
  }
  return { key: checkoutTokenStorageKey, token };
}

recipientForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  checkoutActionStatus.textContent = "";

  if (!/^62\d{8,13}$/.test(STORE_WHATSAPP)) {
    checkoutActionStatus.textContent = "Nomor WhatsApp toko belum diatur. Ganti nilai STORE_WHATSAPP di checkout.js dengan nomor bisnis yang aktif.";
    return;
  }

  const items = UrbannCart.getItems();
  const stockCheck = UrbannCart.validateItems(items);
  const hasPendingCheckout = Boolean(sessionStorage.getItem(checkoutTokenStorageKey));
  if (!items.length) {
    checkoutActionStatus.textContent = "Keranjang kosong. Tambahkan produk sebelum melanjutkan checkout.";
    return;
  }
  if (!stockCheck.ok && !hasPendingCheckout) {
    checkoutActionStatus.textContent = stockCheck.message;
    return;
  }

  const recipient = new FormData(recipientForm);
  const cartSnapshot = items.map((item) => ({
    product_id: Number(item.productId),
    mode: item.mode,
    color: item.color,
    size: item.size,
    quantity: Number(item.quantity),
  }));
  const { key: tokenKey, token } = getCheckoutToken();
  const customer = {
    name: String(recipient.get("name") || "").trim(),
    phone: String(recipient.get("phone") || "").trim(),
    address: String(recipient.get("address") || "").trim(),
    province: String(recipient.get("province") || "").trim(),
    city: String(recipient.get("city") || "").trim(),
    district: String(recipient.get("district") || "").trim(),
    postal_code: String(recipient.get("postalCode") || "").trim(),
    note: String(recipient.get("note") || "").trim(),
  };

  checkoutWhatsAppButton.disabled = true;
  checkoutWhatsAppButton.textContent = "Memeriksa stok dan membuat pesanan…";
  checkoutActionStatus.textContent = "Pesanan akan dicatat dan stok dikurangi sebelum WhatsApp dibuka.";
  let whatsappWindow = window.open("about:blank", "_blank");

  try {
    const client = window.urbannSupabaseClient;
    if (!client) throw new Error("Koneksi database belum siap. Muat ulang halaman lalu coba lagi.");

    const { data, error } = await client.rpc("create_whatsapp_order", {
      p_checkout_token: token,
      p_customer: customer,
      p_items: cartSnapshot,
    });
    if (error) throw error;
    if (!data?.order_number) throw new Error("Pesanan belum mendapat nomor konfirmasi dari database.");

    const orderLines = items.map((item) => {
      const product = UrbannCart.findProduct(item.productId);
      return `- ${product?.nama || "Produk"} | ${UrbannCart.description(product, item)} | ${item.quantity} pcs`;
    });
    const subtotal = Number(data.subtotal_amount);
    const packagingFee = Number(data.packaging_fee);
    const message = [
      "Halo Urbann Attier, saya ingin konfirmasi pesanan:",
      `Nomor pesanan: ${data.order_number}`,
      "",
      ...orderLines,
      "",
      `Subtotal produk: ${UrbannCart.formatRupiah(subtotal)}`,
      `Biaya pengemasan: ${UrbannCart.formatRupiah(packagingFee)}`,
      "Ongkir: mohon dikonfirmasi admin",
      `Total sementara sebelum ongkir: ${UrbannCart.formatRupiah(subtotal + packagingFee)}`,
      "Total akhir dan instruksi pembayaran menunggu konfirmasi admin.",
      "",
      "Data penerima:",
      `Nama: ${customer.name}`,
      `WhatsApp: ${customer.phone}`,
      `Alamat: ${customer.address}`,
      `Provinsi: ${customer.province}`,
      `Kota/Kabupaten: ${customer.city}`,
      `Kecamatan: ${customer.district}`,
      `Kode pos: ${customer.postal_code}`,
      `Catatan kurir: ${customer.note || "-"}`,
    ].join("\n");

    const whatsappUrl = `https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(message)}`;
    UrbannCart.clear();
    sessionStorage.removeItem(tokenKey);
    if (whatsappWindow && !whatsappWindow.closed) {
      whatsappWindow.location.href = whatsappUrl;
      whatsappWindow.opener = null;
      checkoutActionStatus.textContent = `Pesanan ${data.order_number} tercatat dan stok telah diperbarui. Tekan Kirim di WhatsApp agar pesan sampai ke admin.`;
    } else {
      checkoutActionStatus.textContent = `Pesanan ${data.order_number} tercatat dan stok telah diperbarui. WhatsApp akan dibuka di halaman ini.`;
      window.location.assign(whatsappUrl);
    }
  } catch (error) {
    if (whatsappWindow && !whatsappWindow.closed) whatsappWindow.close();
    checkoutActionStatus.textContent = `Pesanan belum diproses: ${error.message || "Terjadi kesalahan."}`;
    checkoutWhatsAppButton.disabled = false;
    checkoutWhatsAppButton.textContent = "Coba checkout lagi";
  }
});

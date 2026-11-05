const checkoutProducts = document.querySelector("#checkoutProducts");
const checkoutTotals = document.querySelector("#checkoutTotals");
const checkoutContent = document.querySelector("#checkoutContent");
const checkoutEmpty = document.querySelector("#checkoutEmpty");
const recipientForm = document.querySelector("#recipientForm");
const checkoutActionStatus = document.querySelector("#checkoutActionStatus");
const checkoutWhatsAppButton = document.querySelector("#checkoutWhatsAppButton");

// Ganti dengan nomor WhatsApp bisnis format internasional tanpa tanda + atau spasi.
const STORE_WHATSAPP = "6282318500057";

function renderCheckout() {
  const items = UrbannCart.getItems();
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
  checkoutWhatsAppButton.disabled = !allPricesAvailable;
  checkoutWhatsAppButton.textContent = allPricesAvailable
    ? "Kirim pesanan ke WhatsApp"
    : "Lengkapi harga produk terlebih dahulu";
}

window.URBANN_PRODUCTS_READY.then(renderCheckout);
window.addEventListener("urbann:catalog-updated", renderCheckout);

recipientForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  checkoutActionStatus.textContent = "";

  if (!/^62\d{8,13}$/.test(STORE_WHATSAPP)) {
    checkoutActionStatus.textContent = "Nomor WhatsApp toko belum diatur. Ganti nilai STORE_WHATSAPP di checkout.js dengan nomor bisnis yang aktif.";
    return;
  }

  const items = UrbannCart.getItems();
  const orderLines = [];
  let subtotal = 0;
  let allPricesAvailable = true;

  items.forEach((item) => {
    const product = UrbannCart.findProduct(item.productId);
    if (!product) return;
    const price = UrbannCart.pricing(product, item);
    if (price.subtotal == null) allPricesAvailable = false;
    else subtotal += price.subtotal;
    orderLines.push(
      `- ${product.nama} | ${UrbannCart.description(product, item)} | ${item.quantity} pcs | ${price.label} | ${UrbannCart.formatRupiah(price.subtotal)}`,
    );
  });

  if (!items.length || !allPricesAvailable) {
    checkoutActionStatus.textContent = "Keranjang kosong atau ada harga produk yang belum lengkap. Periksa kembali keranjang sebelum mengirim pesanan.";
    return;
  }

  const recipient = new FormData(recipientForm);
  const message = [
    "Halo Urbann Attier, saya ingin konfirmasi pesanan:",
    "",
    ...orderLines,
    "",
    `Subtotal produk: ${UrbannCart.formatRupiah(subtotal)}`,
    `Biaya pengemasan: ${BIAYA_PENGEMASAN == null ? "mohon dikonfirmasi admin" : UrbannCart.formatRupiah(BIAYA_PENGEMASAN)}`,
    "Ongkir: mohon dikonfirmasi admin",
    `Subtotal + pengemasan sebelum ongkir: ${BIAYA_PENGEMASAN == null ? "mohon dikonfirmasi admin" : UrbannCart.formatRupiah(subtotal + BIAYA_PENGEMASAN)}`,
    "Total akhir: mohon dikonfirmasi admin sebelum pembayaran",
    "",
    "Data penerima:",
    `Nama: ${recipient.get("name")}`,
    `WhatsApp: ${recipient.get("phone")}`,
    `Alamat: ${recipient.get("address")}`,
    `Provinsi: ${recipient.get("province")}`,
    `Kota/Kabupaten: ${recipient.get("city")}`,
    `Kecamatan: ${recipient.get("district")}`,
    `Kode pos: ${recipient.get("postalCode")}`,
    `Catatan kurir: ${recipient.get("note") || "-"}`,
  ].join("\n");

  const whatsappUrl = `https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(message)}`;
  const whatsappWindow = window.open(whatsappUrl, "_blank");
  if (whatsappWindow) {
    whatsappWindow.opener = null;
    checkoutActionStatus.textContent = "WhatsApp terbuka untuk mengirim permintaan pesanan. Tekan Kirim di WhatsApp agar pesan sampai ke admin.";
  } else {
    window.location.assign(whatsappUrl);
  }
});

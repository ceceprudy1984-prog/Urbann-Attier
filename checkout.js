const checkoutProducts = document.querySelector("#checkoutProducts");
const checkoutTotals = document.querySelector("#checkoutTotals");
const checkoutContent = document.querySelector("#checkoutContent");
const checkoutEmpty = document.querySelector("#checkoutEmpty");
const recipientForm = document.querySelector("#recipientForm");
const checkoutActionStatus = document.querySelector("#checkoutActionStatus");
const checkoutWhatsAppButton = document.querySelector("#checkoutWhatsAppButton");
const destinationSearchInput = document.querySelector("#shippingDestinationSearch");
const destinationSearchButton = document.querySelector("#searchShippingDestination");
const destinationResults = document.querySelector("#shippingDestinationResults");
const destinationSelectedMessage = document.querySelector("#shippingDestinationSelected");
const loadShippingRatesButton = document.querySelector("#loadShippingRates");
const shippingRateStatus = document.querySelector("#shippingRateStatus");
const shippingRateList = document.querySelector("#shippingRateList");
const checkoutTokenStorageKey = "urbann-attier-checkout-token-v1";
const SHIPPING_WEIGHT_PER_PIECE_GRAMS = 500;

// Ganti dengan nomor WhatsApp bisnis format internasional tanpa tanda + atau spasi.
const STORE_WHATSAPP = "6282318500057";

let selectedDestination = null;
let availableShippingRates = [];
let selectedShippingRate = null;
let destinationSearchCache = new Map();
let checkoutSubtotal = 0;
let allPricesAvailable = false;

function escapeCheckoutHtml(value) {
  return window.urbannEscapeHtml(String(value ?? ""));
}

function getItemsWeight(items = UrbannCart.getItems()) {
  return items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) * SHIPPING_WEIGHT_PER_PIECE_GRAMS;
}

function resetShippingRates(message = "") {
  availableShippingRates = [];
  selectedShippingRate = null;
  if (shippingRateList) shippingRateList.innerHTML = "";
  if (shippingRateStatus) shippingRateStatus.textContent = message;
  updateCheckoutSummary();
}

function updateOrderButton() {
  if (!checkoutWhatsAppButton) return;

  const items = UrbannCart.getItems();
  const stockCheck = UrbannCart.validateItems(items);
  const hasPendingCheckout = Boolean(sessionStorage.getItem(checkoutTokenStorageKey));
  const selectedRateMatchesCart = selectedShippingRate
    && selectedShippingRate.weightGrams === getItemsWeight(items);
  const canSubmit = allPricesAvailable
    && Boolean(selectedDestination)
    && Boolean(selectedRateMatchesCart)
    && (stockCheck.ok || hasPendingCheckout);

  checkoutWhatsAppButton.disabled = !canSubmit;
  if (!allPricesAvailable) {
    checkoutWhatsAppButton.textContent = "Harga produk belum lengkap";
  } else if (!selectedDestination) {
    checkoutWhatsAppButton.textContent = "Pilih wilayah tujuan";
  } else if (!selectedRateMatchesCart) {
    checkoutWhatsAppButton.textContent = "Pilih layanan pengiriman";
  } else if (!stockCheck.ok && !hasPendingCheckout) {
    checkoutWhatsAppButton.textContent = "Periksa stok keranjang";
  } else {
    checkoutWhatsAppButton.textContent = "Kirim pesanan ke WhatsApp";
  }

  if (!stockCheck.ok) {
    checkoutActionStatus.textContent = hasPendingCheckout
      ? "Checkout sebelumnya mungkin sudah tercatat. Coba lagi dengan data, keranjang, dan pilihan pengiriman yang sama."
      : stockCheck.message;
  } else if (checkoutActionStatus.textContent === stockCheck.message) {
    checkoutActionStatus.textContent = "";
  }
}

function updateCheckoutSummary() {
  const packagingFee = BIAYA_PENGEMASAN == null ? null : Number(BIAYA_PENGEMASAN);
  const selectedFee = selectedShippingRate ? Number(selectedShippingRate.cost) : null;
  const packagingElement = document.querySelector("#checkoutPackagingFee");
  const shippingElement = document.querySelector("#checkoutShippingFee");
  const grandTotalElement = document.querySelector("#checkoutGrandTotal");

  if (packagingElement) {
    packagingElement.textContent = packagingFee == null
      ? "Akan dikonfirmasi admin"
      : UrbannCart.formatRupiah(packagingFee);
  }
  if (shippingElement) {
    shippingElement.textContent = selectedFee == null
      ? "Pilih layanan"
      : UrbannCart.formatRupiah(selectedFee);
  }
  if (grandTotalElement) {
    grandTotalElement.textContent = !allPricesAvailable
      ? "Harga belum lengkap"
      : packagingFee == null
        ? "Menunggu biaya pengemasan"
        : selectedFee == null
          ? "Pilih layanan pengiriman"
          : UrbannCart.formatRupiah(checkoutSubtotal + packagingFee + selectedFee);
  }

  updateOrderButton();
}

function renderCheckout() {
  const items = UrbannCart.getItems();
  UrbannCart.updateBadges();

  if (!items.length) {
    checkoutContent.hidden = true;
    checkoutEmpty.hidden = false;
    return;
  }

  checkoutContent.hidden = false;
  checkoutEmpty.hidden = true;
  checkoutSubtotal = 0;
  allPricesAvailable = true;

  checkoutProducts.innerHTML = items.map((item) => {
    const product = UrbannCart.findProduct(item.productId);
    if (!product) {
      allPricesAvailable = false;
      return "";
    }
    const variant = product.varianWarna.find((color) => color.nama === item.color);
    const price = UrbannCart.pricing(product, item);
    const safe = escapeCheckoutHtml;
    const photo = window.urbannSafeImageUrl(variant?.foto || product.varianWarna[0]?.foto || "");
    if (price.subtotal == null) allPricesAvailable = false;
    else checkoutSubtotal += price.subtotal;

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
    <p class="checkout-total-row"><span>Subtotal produk</span><strong>${allPricesAvailable ? UrbannCart.formatRupiah(checkoutSubtotal) : "Harga belum lengkap"}</strong></p>
  `;

  const currentWeight = getItemsWeight(items);
  document.querySelector("#shippingPackageWeight").textContent =
    `Berat perkiraan: ${currentWeight.toLocaleString("id-ID")} gram (${items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} pcs × 500 gram).`;

  if (selectedShippingRate && selectedShippingRate.weightGrams !== currentWeight) {
    resetShippingRates("Jumlah barang berubah. Periksa tarif pengiriman kembali.");
  } else {
    updateCheckoutSummary();
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

async function callShippingFunction(payload) {
  const client = window.urbannSupabaseClient;
  if (!client) throw new Error("Koneksi Supabase belum siap. Muat ulang halaman lalu coba lagi.");

  const { data, error } = await client.functions.invoke("shipping-rates", { body: payload });
  if (error) {
    const responseMessage = data?.error || error.message;
    throw new Error(responseMessage || "Layanan cek ongkir belum dapat dihubungi.");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function setSelectedDestination(location) {
  selectedDestination = location;
  destinationSelectedMessage.textContent = location.label;
  destinationSearchInput.value = location.label;
  destinationResults.hidden = true;

  recipientForm.elements.namedItem("province").value = location.province;
  recipientForm.elements.namedItem("city").value = location.city;
  recipientForm.elements.namedItem("district").value = location.district;
  recipientForm.elements.namedItem("postalCode").value = location.postalCode;
  loadShippingRatesButton.disabled = false;
  resetShippingRates("Wilayah dipilih. Klik “Cek ongkir” untuk melihat layanan yang tersedia.");
}

destinationSearchButton?.addEventListener("click", async () => {
  const query = destinationSearchInput.value.trim();
  if (query.length < 3) {
    destinationResults.hidden = true;
    shippingRateStatus.textContent = "Masukkan nama wilayah atau kode pos minimal 3 karakter.";
    return;
  }

  destinationSearchButton.disabled = true;
  destinationSearchButton.textContent = "Mencari…";
  shippingRateStatus.textContent = "Mencari wilayah tujuan…";
  destinationResults.hidden = true;

  try {
    const cacheKey = query.toLocaleLowerCase("id-ID");
    let result = destinationSearchCache.get(cacheKey);
    if (!result) {
      result = await callShippingFunction({ action: "search-destination", query });
      destinationSearchCache.set(cacheKey, result);
    }

    const locations = Array.isArray(result.locations) ? result.locations : [];
    if (!locations.length) {
      shippingRateStatus.textContent = "Wilayah tidak ditemukan. Coba nama kecamatan, kelurahan, atau kode pos.";
      return;
    }

    destinationResults.innerHTML = locations.map((location, index) => `
      <button class="checkout-location-option" type="button" role="option" aria-selected="false" data-location-index="${index}">
        <strong>${escapeCheckoutHtml(location.label || location.subdistrict)}</strong>
        <span>${escapeCheckoutHtml([location.district, location.city, location.province, location.postalCode].filter(Boolean).join(", "))}</span>
      </button>
    `).join("");
    destinationResults.hidden = false;
    shippingRateStatus.textContent = "Pilih lokasi yang sesuai dengan alamat penerima.";
    destinationResults.dataset.locations = JSON.stringify(locations);
  } catch (error) {
    shippingRateStatus.textContent = `Pencarian wilayah gagal: ${error.message}`;
  } finally {
    destinationSearchButton.disabled = false;
    destinationSearchButton.textContent = "Cari wilayah";
  }
});

destinationResults?.addEventListener("click", (event) => {
  const option = event.target.closest("[data-location-index]");
  if (!option) return;
  const locations = JSON.parse(destinationResults.dataset.locations || "[]");
  const location = locations[Number(option.dataset.locationIndex)];
  if (location) setSelectedDestination(location);
});

destinationSearchInput?.addEventListener("input", () => {
  if (selectedDestination && destinationSearchInput.value.trim() !== selectedDestination.label) {
    selectedDestination = null;
    destinationSelectedMessage.textContent = "";
    destinationResults.hidden = true;
    recipientForm.elements.namedItem("province").value = "";
    recipientForm.elements.namedItem("city").value = "";
    recipientForm.elements.namedItem("district").value = "";
    recipientForm.elements.namedItem("postalCode").value = "";
    loadShippingRatesButton.disabled = true;
    resetShippingRates("Pilih kembali wilayah tujuan untuk menghitung ongkir.");
  }
});

destinationSearchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    destinationSearchButton.click();
  }
});

loadShippingRatesButton?.addEventListener("click", async () => {
  if (!selectedDestination) {
    shippingRateStatus.textContent = "Cari dan pilih wilayah tujuan terlebih dahulu.";
    return;
  }

  const weightGrams = getItemsWeight();
  loadShippingRatesButton.disabled = true;
  loadShippingRatesButton.textContent = "Menghitung tarif…";
  resetShippingRates("Meminta tarif dari RajaOngkir…");

  try {
    const result = await callShippingFunction({
      action: "rates",
      destinationId: selectedDestination.id,
      weightGrams,
    });
    availableShippingRates = Array.isArray(result.rates) ? result.rates : [];
    if (!availableShippingRates.length) {
      shippingRateStatus.textContent = "Belum ada layanan kurir untuk rute ini. Coba wilayah tujuan lain atau hubungi admin.";
      return;
    }

    shippingRateList.innerHTML = availableShippingRates.map((rate, index) => `
      <label class="checkout-rate-option">
        <input type="radio" name="shippingRate" value="${index}" />
        <span class="checkout-rate-details">
          <strong>${escapeCheckoutHtml(rate.courier)} ${escapeCheckoutHtml(rate.service)}</strong>
          <small>${escapeCheckoutHtml(rate.description)}${rate.estimate ? ` · Estimasi ${escapeCheckoutHtml(rate.estimate)}` : ""}</small>
        </span>
        <strong class="checkout-rate-cost">${UrbannCart.formatRupiah(rate.cost)}</strong>
      </label>
    `).join("");
    shippingRateStatus.textContent = `Tarif ditemukan untuk berat ${weightGrams.toLocaleString("id-ID")} gram. Pilih salah satu layanan.`;
  } catch (error) {
    shippingRateStatus.textContent = `Tarif belum dapat dimuat: ${error.message}`;
  } finally {
    loadShippingRatesButton.disabled = !selectedDestination;
    loadShippingRatesButton.textContent = "Cek ongkir lagi";
  }
});

shippingRateList?.addEventListener("change", (event) => {
  if (event.target.name !== "shippingRate") return;
  const rate = availableShippingRates[Number(event.target.value)];
  if (!rate || !Number.isFinite(Number(rate.cost))) return;

  selectedShippingRate = {
    ...rate,
    cost: Number(rate.cost),
    weightGrams: getItemsWeight(),
  };
  updateCheckoutSummary();
});

recipientForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  checkoutActionStatus.textContent = "";

  if (!/^62\d{8,13}$/.test(STORE_WHATSAPP)) {
    checkoutActionStatus.textContent = "Nomor WhatsApp toko belum diatur. Ganti nilai STORE_WHATSAPP di checkout.js dengan nomor bisnis yang aktif.";
    return;
  }
  if (!selectedDestination || !selectedShippingRate) {
    checkoutActionStatus.textContent = "Pilih wilayah tujuan dan layanan pengiriman sebelum melanjutkan.";
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
  if (selectedShippingRate.weightGrams !== getItemsWeight(items)) {
    resetShippingRates("Jumlah barang berubah. Periksa tarif pengiriman kembali.");
    checkoutActionStatus.textContent = "Berat paket berubah. Silakan hitung ulang ongkir.";
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
  if (!customer.province || !customer.city || !customer.district || !customer.postal_code) {
    checkoutActionStatus.textContent = "Pilih wilayah tujuan dari hasil pencarian RajaOngkir terlebih dahulu.";
    return;
  }

  checkoutWhatsAppButton.disabled = true;
  checkoutWhatsAppButton.textContent = "Memeriksa stok dan mencatat pesanan…";
  checkoutActionStatus.textContent = "Tarif yang dipilih dicatat sebagai perkiraan; admin akan mengonfirmasi total akhir.";
  const whatsappWindow = window.open("about:blank", "_blank");

  try {
    const client = window.urbannSupabaseClient;
    if (!client) throw new Error("Koneksi database belum siap. Muat ulang halaman lalu coba lagi.");

    const { data, error } = await client.rpc("create_whatsapp_order_with_shipping", {
      p_checkout_token: token,
      p_customer: customer,
      p_items: cartSnapshot,
      p_shipping: {
        destination_id: selectedDestination.id,
        weight_grams: selectedShippingRate.weightGrams,
        provider_code: selectedShippingRate.code,
        service: selectedShippingRate.service,
        fee: selectedShippingRate.cost,
      },
    });
    if (error) throw error;
    if (!data?.order_number) throw new Error("Pesanan belum mendapat nomor konfirmasi dari database.");

    const orderLines = items.map((item) => {
      const product = UrbannCart.findProduct(item.productId);
      return `- ${product?.nama || "Produk"} | ${UrbannCart.description(product, item)} | ${item.quantity} pcs`;
    });
    const subtotal = Number(data.subtotal_amount);
    const packagingFee = Number(data.packaging_fee);
    const shippingFee = Number(data.shipping_fee ?? selectedShippingRate.cost);
    const total = Number(data.total_with_shipping ?? subtotal + packagingFee + shippingFee);
    const message = [
      "Halo Urbann Attier, saya ingin konfirmasi pesanan:",
      `Nomor pesanan: ${data.order_number}`,
      "",
      ...orderLines,
      "",
      `Subtotal produk: ${UrbannCart.formatRupiah(subtotal)}`,
      `Biaya pengemasan: ${UrbannCart.formatRupiah(packagingFee)}`,
      `Pilihan kurir: ${selectedShippingRate.courier} ${selectedShippingRate.service}`,
      `Perkiraan ongkir: ${UrbannCart.formatRupiah(shippingFee)}`,
      `Total sementara: ${UrbannCart.formatRupiah(total)}`,
      "Mohon konfirmasi tarif ongkir dan total akhir sebelum pembayaran.",
      "",
      "Data penerima:",
      `Nama: ${customer.name}`,
      `WhatsApp: ${customer.phone}`,
      `Alamat: ${customer.address}`,
      `Kelurahan: ${selectedDestination.subdistrict || "-"}`,
      `Kecamatan: ${customer.district}`,
      `Kota/Kabupaten: ${customer.city}`,
      `Provinsi: ${customer.province}`,
      `Kode pos: ${customer.postal_code}`,
      `Catatan kurir: ${customer.note || "-"}`,
    ].join("\n");

    const whatsappUrl = `https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(message)}`;
    UrbannCart.clear();
    sessionStorage.removeItem(tokenKey);
    if (whatsappWindow && !whatsappWindow.closed) {
      whatsappWindow.location.href = whatsappUrl;
      whatsappWindow.opener = null;
      checkoutActionStatus.textContent = `Pesanan ${data.order_number} tercatat dan stok telah diperbarui. Tekan Kirim di WhatsApp agar permintaan sampai ke admin.`;
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

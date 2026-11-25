let produkAktif = null;
const detailContainer = document.getElementById("detailProduk");

let warnaAktif = null;
let ukuranAktif = "";
let fotoAktifIndex = 0;
let pelacakanTambahKeranjangTerakhir = Promise.resolve(false);
const trackedProductViews = new Set();
const detailEscapeHtml = window.urbannEscapeHtml || ((value) => String(value ?? ""));
const detailSafeImageUrl = window.urbannSafeImageUrl || ((value) => value || "");

function hargaRupiah(nilai) {
  return nilai == null ? "Segera tersedia" : `Rp ${nilai.toLocaleString("id-ID")}`;
}

function setMeta(selector, attribute, value) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, "");
    document.head.appendChild(element);
  }
  element.setAttribute(attribute, value);
}

function deskripsiSeoProduk() {
  if (!produkAktif) return "";
  return [produkAktif.deskripsi, produkAktif.detailProduk?.Bahan, produkAktif.detailProduk?.Model]
    .map((value) => String(value || "").trim())
    .filter((value) => value && value.toLocaleLowerCase("id-ID") !== "deskripsi produk akan ditambahkan.")
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 300);
}

function perbaruiDataTerstruktur(productUrl) {
  const existing = document.getElementById("productStructuredData");
  if (!produkAktif) {
    existing?.remove();
    return;
  }

  const images = [...new Set(produkAktif.varianWarna.flatMap((variant) => variant.fotos?.length ? variant.fotos : [variant.foto]).filter(Boolean))]
    .map((image) => detailSafeImageUrl(image))
    .filter(Boolean)
    .map((image) => new URL(image, window.location.href).href);
  const allStockValues = produkAktif.varianWarna.flatMap((variant) => Object.values(variant.stok || {}));
  const stockValues = allStockValues.filter((stock) => typeof stock === "number");
  const productDescription = deskripsiSeoProduk();
  const product = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: produkAktif.nama,
    brand: { "@type": "Brand", name: "Urbann Attier" },
    url: productUrl.href,
  };
  if (produkAktif.sku) product.sku = produkAktif.sku;
  if (produkAktif.kategori) product.category = produkAktif.kategori;
  if (productDescription) product.description = productDescription;
  if (images.length) product.image = images;

  if (Number.isFinite(Number(produkAktif.harga)) && produkAktif.harga != null) {
    const offer = {
      "@type": "Offer",
      url: productUrl.href,
      priceCurrency: "IDR",
      price: String(Number(produkAktif.harga)),
      itemCondition: "https://schema.org/NewCondition",
    };
    if (stockValues.length && stockValues.length === allStockValues.length) {
      offer.availability = stockValues.some((stock) => stock > 0)
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock";
    }
    product.offers = offer;
  }

  const script = existing || document.head.appendChild(document.createElement("script"));
  script.id = "productStructuredData";
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(product);
}

function perbaruiJudulProduk() {
  const heading = document.getElementById("namaProduk");
  const metaDescription = document.querySelector('meta[name="description"]');
  const canonical = document.querySelector('link[rel="canonical"]');

  if (!produkAktif) {
    document.title = "Produk tidak ditemukan | Urbann Attier";
    if (heading) heading.textContent = "Produk tidak ditemukan";
    setMeta('meta[name="robots"]', "name", "noindex, follow");
    if (metaDescription) {
      metaDescription.content = "Produk yang Anda cari tidak tersedia di Urbann Attier.";
    }
    return;
  }

  const productIdentifier = encodeURIComponent(produkAktif.slug || produkAktif.id);
  const isStaticProductPage = /^\/produk\/[^/]+\/?$/.test(window.location.pathname);
  const productUrl = isStaticProductPage
    ? new URL(`/produk/${productIdentifier}/`, "https://urbannattier.com")
    : new URL(`/detail-produk.html?slug=${productIdentifier}`, "https://urbannattier.com");
  const canonicalUrl = canonical || document.head.appendChild(document.createElement("link"));
  canonicalUrl.rel = "canonical";
  canonicalUrl.href = productUrl.href;
  document.title = `${produkAktif.nama} | Gamis Wanita Urbann Attier`;
  if (heading) heading.textContent = produkAktif.nama;
  const description = deskripsiSeoProduk() || `Lihat ${produkAktif.nama}, koleksi gamis Urbann Attier. Periksa pilihan warna, ukuran, dan harga yang tersedia.`;
  if (metaDescription) {
    metaDescription.content = description;
  }
  setMeta('meta[property="og:type"]', "property", "product");
  setMeta('meta[property="og:title"]', "property", document.title);
  setMeta('meta[property="og:description"]', "property", description);
  setMeta('meta[property="og:url"]', "property", productUrl.href);
  const previewImage = produkAktif.varianWarna[0]?.foto;
  const safePreviewImage = previewImage ? detailSafeImageUrl(previewImage) : "";
  if (safePreviewImage) setMeta('meta[property="og:image"]', "property", new URL(safePreviewImage, window.location.href).href);
  setMeta('meta[name="twitter:card"]', "name", previewImage ? "summary_large_image" : "summary");
  perbaruiDataTerstruktur(productUrl);
}

function renderDetail() {
  perbaruiJudulProduk();

  if (!produkAktif) {
    detailContainer.innerHTML = `
      <a class="detail-kembali" href="/index.html#produk">&larr; Kembali ke koleksi</a>
      <h1 class="detail-page-title">Produk tidak ditemukan</h1>
      <p>Produk yang Anda cari tidak tersedia. Silakan kembali ke halaman koleksi.</p>
    `;
    return;
  }

  if (!window.urbannStaticProductViewTracked && !trackedProductViews.has(produkAktif.id)) {
    const item = UrbannCart.analyticsItem(produkAktif, { mode: "ecer", quantity: 1 });
    if (item) {
      window.urbannTrack?.("view_item", {
        currency: "IDR",
        value: item.price,
        items: [item],
      });
      trackedProductViews.add(produkAktif.id);
    }
  }

  const foto = warnaAktif?.foto || "";
  const jumlahSeriWarna = produkAktif.varianWarna.length;
  const jumlahSeriUkuran = produkAktif.ukuran.length;
  const pilihanWarna = produkAktif.varianWarna
    .map(
      (varian, index) => `
        <button
          class="detail-thumbnail ${index === 0 ? "aktif" : ""}"
          type="button"
          data-warna-index="${index}"
          aria-label="Lihat warna ${detailEscapeHtml(varian.nama)}"
          aria-pressed="${index === 0}"
        >
          <img src="${detailEscapeHtml(detailSafeImageUrl(varian.foto))}" alt="${detailEscapeHtml(produkAktif.nama)} warna ${detailEscapeHtml(varian.nama)}" loading="lazy">
          <span>${detailEscapeHtml(varian.nama)}</span>
        </button>
      `,
    )
    .join("");

  const ukuranButtons = produkAktif.ukuran
    .map(
      (ukuran) => `
        <button class="opsi-btn" type="button" data-ukuran="${detailEscapeHtml(ukuran)}" aria-pressed="false">
          ${detailEscapeHtml(ukuran)}
        </button>
      `,
    )
    .join("");

  const detailProduk = Object.entries(produkAktif.detailProduk || {}).filter(([, nilai]) => nilai != null && nilai !== "")
    .map(
      ([label, nilai]) => `
        <div class="detail-spec-row">
        <dt>${detailEscapeHtml(label)}</dt>
        <dd>${detailEscapeHtml(nilai)}</dd>
        </div>
      `,
    )
    .join("");

  const barisUkuran = (produkAktif.ukuranDetail || [])
    .map(
      (item) => `
        <tr>
          <th scope="row">${detailEscapeHtml(item.ukuran)}</th>
          <td>${detailEscapeHtml(item.lingkarDada ?? "—")}</td>
          <td>${detailEscapeHtml(item.panjangGamis ?? "—")}</td>
          <td>${detailEscapeHtml(item.panjangLengan ?? "—")}</td>
        </tr>
      `,
    )
    .join("");

  detailContainer.innerHTML = `
    <a class="detail-kembali" href="/index.html#produk">&larr; Kembali ke koleksi</a>
    <h1 id="namaProduk" class="detail-page-title">${detailEscapeHtml(produkAktif.nama)}</h1>

    <div class="detail-wrapper">
      <div class="detail-galeri">
        <figure class="detail-img">
          <img id="fotoUtama" src="${detailEscapeHtml(detailSafeImageUrl(foto))}" alt="${detailEscapeHtml(produkAktif.nama)} warna ${detailEscapeHtml(warnaAktif?.nama || "")}">
        </figure>
        <div class="detail-photo-thumbnails" id="detailPhotoThumbnails"></div>
        <p class="detail-gallery-label">Foto tersedia berdasarkan warna</p>
      </div>

      <div class="detail-info">
        <div class="detail-price-list" aria-label="Pilihan harga">
          <div class="detail-price-row">
            <span>Harga ecer</span>
            <strong>${hargaRupiah(produkAktif.harga)}</strong>
          </div>
          <div class="detail-price-row">
            <span>Harga grosir</span>
            <strong>${hargaRupiah(produkAktif.hargaGrosir)}</strong>
          </div>
          <div class="detail-price-row">
            <span>Harga serian</span>
            <strong>${hargaRupiah(produkAktif.hargaSerian)}</strong>
          </div>
        </div>

        <section class="detail-terms" aria-labelledby="detailTermsTitle">
          <h2 id="detailTermsTitle">Syarat dan ketentuan pembelian</h2>
          <ul>
            <li><strong>Ecer:</strong> minimal pembelian 1 pcs.</li>
            <li><strong>Serian:</strong> minimal membeli 1 seri warna atau seri ukuran lengkap; jumlah pcs mengikuti varian yang tersedia.</li>
            <li><strong>Grosir:</strong> berlaku untuk pembelian ${detailEscapeHtml(produkAktif.grosirMinimal || 20)} pcs atau lebih.</li>
          </ul>
        </section>

        <div class="opsi-group">
          <p class="opsi-label">Pilih warna: <strong id="namaWarnaAktif">${detailEscapeHtml(warnaAktif?.nama || "")}</strong></p>
          <div class="detail-color-list">${pilihanWarna}</div>
        </div>

        <div class="opsi-group">
          <p class="opsi-label">Pilih ukuran:</p>
          <div class="opsi-list">${ukuranButtons}</div>
        </div>

        <section class="detail-purchase" aria-labelledby="purchaseTitle">
          <h2 id="purchaseTitle">Jumlah dan jenis pembelian</h2>
          <label for="jenisPembelian">Pilih skema pembelian</label>
          <select id="jenisPembelian">
            <option value="ecer">Ecer / satuan</option>
            <option value="seri-warna">Seri warna · ${jumlahSeriWarna} pcs per seri</option>
            <option value="seri-ukuran">Seri ukuran · ${jumlahSeriUkuran} pcs per seri</option>
          </select>

          <label for="jumlahPembelian">Jumlah pembelian (pcs)</label>
          <input id="jumlahPembelian" type="number" min="1" step="1" value="1" inputmode="numeric">
          <p class="detail-purchase-help" id="infoPembelian" aria-live="polite">
            Harga ecer berlaku mulai 1 pcs. Harga grosir otomatis diterapkan saat jumlah mencapai ${detailEscapeHtml(produkAktif.grosirMinimal || 20)} pcs.
          </p>
          <p class="detail-purchase-summary" id="ringkasanPembelian" aria-live="polite"></p>

          <div class="detail-current-pricing" aria-live="polite">
            <p><span>Harga yang berlaku</span><strong id="jenisHargaAktif">Harga ecer</strong></p>
            <p><span>Harga per pcs</span><strong id="hargaAktif">${hargaRupiah(produkAktif.harga)}</strong></p>
            <p class="detail-subtotal"><span>Subtotal</span><strong id="subtotalAktif">${hargaRupiah(produkAktif.harga)}</strong></p>
            <p class="detail-packaging-fee"><span>Biaya pengemasan <small>(per pesanan)</small></span><strong>${BIAYA_PENGEMASAN == null ? "Akan dikonfirmasi" : hargaRupiah(BIAYA_PENGEMASAN)}</strong></p>
          </div>
        </section>

        <p class="detail-stock" id="detailStock" aria-live="polite">
          Stok: data warna dan ukuran ini belum diisi.
        </p>

        <div class="detail-description">
          <h2>Deskripsi produk</h2>
          <p>${detailEscapeHtml(produkAktif.deskripsi)}</p>
          <dl class="detail-spec-list">${detailProduk}</dl>

          <h3 class="size-guide-title">Detail ukuran</h3>
          <div class="size-table-wrap">
            <table class="size-table">
              <caption>Ukuran produk dalam sentimeter (cm)</caption>
              <thead>
                <tr>
                  <th scope="col">Size</th>
                  <th scope="col">Lingkar dada</th>
                  <th scope="col">Panjang gamis</th>
                  <th scope="col">Panjang lengan</th>
                </tr>
              </thead>
              <tbody>${barisUkuran}</tbody>
            </table>
          </div>
        </div>

        <div class="detail-purchase-actions">
          <button class="btn btn-primary btn-add-cart" id="btnTambahKeranjang" type="button">Tambah ke keranjang</button>
          <button class="btn btn-secondary btn-checkout-now" id="btnCheckoutSekarang" type="button">Checkout sekarang</button>
        </div>
        <p class="cart-action-status" id="cartActionStatus" role="status" aria-live="polite"></p>
        <a class="cart-view-link" href="/keranjang.html">
          Lihat keranjang (<span class="cart-count" data-cart-count>0</span>)
        </a>
        <p class="detail-payment-note">
          Ongkir dan pembayaran dikonfirmasi admin melalui WhatsApp.
        </p>
      </div>
    </div>
  `;

  renderPhotoSelection();
  pasangEventDetail();
}

function renderPhotoSelection() {
  const images = warnaAktif?.fotos?.length ? warnaAktif.fotos : [warnaAktif?.foto].filter(Boolean);
  fotoAktifIndex = Math.min(fotoAktifIndex, Math.max(0, images.length - 1));
  const mainImage = detailContainer.querySelector("#fotoUtama");
  const thumbnails = detailContainer.querySelector("#detailPhotoThumbnails");
  if (!mainImage || !thumbnails) return;
  mainImage.src = detailSafeImageUrl(images[fotoAktifIndex] || "");
  mainImage.alt = `${produkAktif.nama} warna ${warnaAktif?.nama || ""}`;
  thumbnails.innerHTML = images.length > 1 ? images.map((image, index) => `
    <button class="detail-photo-thumb ${index === fotoAktifIndex ? "aktif" : ""}" type="button" data-photo-index="${index}" aria-label="Lihat foto ${index + 1} warna ${detailEscapeHtml(warnaAktif.nama)}" aria-pressed="${index === fotoAktifIndex}">
      <img src="${detailEscapeHtml(detailSafeImageUrl(image))}" alt="" loading="lazy">
    </button>`).join("") : "";
  thumbnails.querySelectorAll("[data-photo-index]").forEach((button) => {
    button.addEventListener("click", () => {
      fotoAktifIndex = Number(button.dataset.photoIndex);
      renderPhotoSelection();
    });
  });
}

function pasangEventDetail() {
  detailContainer.querySelectorAll("[data-warna-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.warnaIndex);
      warnaAktif = produkAktif.varianWarna[index];
      fotoAktifIndex = 0;
      renderPhotoSelection();
      detailContainer.querySelector("#namaWarnaAktif").textContent = warnaAktif.nama;

      detailContainer.querySelectorAll("[data-warna-index]").forEach((tombol) => {
        const terpilih = Number(tombol.dataset.warnaIndex) === index;
        tombol.classList.toggle("aktif", terpilih);
        tombol.setAttribute("aria-pressed", String(terpilih));
      });
      perbaruiStok();
      perbaruiRingkasanPembelian();
    });
  });

  detailContainer.querySelectorAll("[data-ukuran]").forEach((button) => {
    button.addEventListener("click", () => {
      ukuranAktif = button.dataset.ukuran;
      detailContainer.querySelectorAll("[data-ukuran]").forEach((tombol) => {
        const terpilih = tombol.dataset.ukuran === ukuranAktif;
        tombol.classList.toggle("opsi-aktif", terpilih);
        tombol.setAttribute("aria-pressed", String(terpilih));
      });
      perbaruiStok();
      perbaruiRingkasanPembelian();
    });
  });

  const jenisPembelian = detailContainer.querySelector("#jenisPembelian");
  const jumlahPembelian = detailContainer.querySelector("#jumlahPembelian");

  jenisPembelian.addEventListener("change", () => {
    const jumlahSatuSeri = hitungJumlahSatuSeri(jenisPembelian.value);
    if (jenisPembelian.value === "ecer") {
      jumlahPembelian.min = "1";
      jumlahPembelian.step = "1";
      jumlahPembelian.value = "1";
    } else {
      jumlahPembelian.min = String(jumlahSatuSeri);
      jumlahPembelian.step = String(jumlahSatuSeri);
      jumlahPembelian.value = String(jumlahSatuSeri);
    }
    perbaruiRingkasanPembelian();
  });

  jumlahPembelian.addEventListener("input", () => {
    if (jenisPembelian.value === "ecer") perbaruiRingkasanPembelian();
  });
  jumlahPembelian.addEventListener("change", perbaruiRingkasanPembelian);
  detailContainer.querySelector("#btnTambahKeranjang").addEventListener("click", tambahKeKeranjang);
  detailContainer.querySelector("#btnCheckoutSekarang").addEventListener("click", async () => {
    if (!tambahKeKeranjang()) return;
    await pelacakanTambahKeranjangTerakhir;
    window.location.href = "/checkout.html";
  });
  perbaruiRingkasanPembelian();
  UrbannCart.updateBadges();
}

function tambahKeKeranjang() {
  if (!ukuranAktif) {
    detailContainer.querySelector("#cartActionStatus").textContent = "Pilih ukuran terlebih dahulu.";
    return false;
  }

  const jenis = detailContainer.querySelector("#jenisPembelian").value;
  const jumlah = Number.parseInt(detailContainer.querySelector("#jumlahPembelian").value, 10);
  const hasil = UrbannCart.add({
    productId: produkAktif.id,
    mode: jenis,
    color: warnaAktif.nama,
    size: ukuranAktif,
    quantity: jumlah,
  });
  pelacakanTambahKeranjangTerakhir = hasil.analyticsTracking || Promise.resolve(false);

  detailContainer.querySelector("#cartActionStatus").textContent = hasil.message;
  UrbannCart.updateBadges();
  return hasil.ok;
}

function hitungJumlahSatuSeri(jenis) {
  if (jenis === "seri-warna") return produkAktif.varianWarna.length;
  if (jenis === "seri-ukuran") return produkAktif.ukuran.length;
  return 1;
}

function perbaruiRingkasanPembelian() {
  const jenis = detailContainer.querySelector("#jenisPembelian").value;
  const inputJumlah = detailContainer.querySelector("#jumlahPembelian");
  const info = detailContainer.querySelector("#infoPembelian");
  const jumlahSatuSeri = hitungJumlahSatuSeri(jenis);
  let jumlah = Math.max(1, Number.parseInt(inputJumlah.value, 10) || 1);

  if (jenis !== "ecer") {
    jumlah = Math.max(jumlahSatuSeri, Math.ceil(jumlah / jumlahSatuSeri) * jumlahSatuSeri);
    inputJumlah.min = String(jumlahSatuSeri);
    inputJumlah.step = String(jumlahSatuSeri);
    inputJumlah.value = String(jumlah);
    info.textContent = `Jumlah harus kelipatan ${jumlahSatuSeri} pcs agar setiap seri lengkap. Harga grosir otomatis berlaku mulai ${Number(produkAktif.grosirMinimal) || 20} pcs.`;
  } else {
    inputJumlah.min = "1";
    inputJumlah.step = "1";
    inputJumlah.value = String(jumlah);
    info.textContent = jumlah >= (Number(produkAktif.grosirMinimal) || 20)
      ? `Jumlah ${produkAktif.grosirMinimal || 20} pcs atau lebih otomatis memakai harga grosir.`
      : `Harga ecer berlaku untuk pembelian satuan. Pilih seri lengkap untuk harga serian. Harga grosir otomatis berlaku mulai ${Number(produkAktif.grosirMinimal) || 20} pcs.`;
  }

  let tier = "ecer";
  let labelTier = "Harga ecer";
  let hargaPerPcs = produkAktif.harga;
  if (jumlah >= (Number(produkAktif.grosirMinimal) || 20)) {
    tier = "grosir";
    labelTier = "Harga grosir";
    hargaPerPcs = produkAktif.hargaGrosir;
  } else if (jenis !== "ecer") {
    tier = "serian";
    labelTier = "Harga serian";
    hargaPerPcs = produkAktif.hargaSerian;
  }

  detailContainer.querySelector("#jenisHargaAktif").textContent = labelTier;
  detailContainer.querySelector("#hargaAktif").textContent = hargaRupiah(hargaPerPcs);
  detailContainer.querySelector("#subtotalAktif").textContent =
    hargaPerPcs == null ? "Segera tersedia" : hargaRupiah(hargaPerPcs * jumlah);

  const ringkasan = detailContainer.querySelector("#ringkasanPembelian");
  if (jenis === "seri-warna") {
    ringkasan.textContent = `Isi pesanan: ${jumlah / jumlahSatuSeri} seri warna (${produkAktif.varianWarna.map((warna) => warna.nama).join(", ")}), ukuran ${ukuranAktif || "pilih ukuran"}.`;
  } else if (jenis === "seri-ukuran") {
    ringkasan.textContent = `Isi pesanan: ${jumlah / jumlahSatuSeri} seri ukuran, warna ${warnaAktif?.nama || "pilih warna"} (${produkAktif.ukuran.join(", ")}).`;
  } else {
    ringkasan.textContent = `Isi pesanan: ${jumlah} pcs, warna ${warnaAktif?.nama || "-"}, ukuran ${ukuranAktif || "belum dipilih"}.`;
  }

  detailContainer.querySelector(".detail-stock").dataset.tier = tier;
}

function perbaruiStok() {
  const statusStok = detailContainer.querySelector("#detailStock");
  if (!ukuranAktif) {
    statusStok.textContent = "Pilih ukuran untuk melihat stok.";
    return;
  }

  const stok = warnaAktif?.stok?.[ukuranAktif];
  if (typeof stok === "number") {
    statusStok.textContent = stok > 0 ? `Stok ${warnaAktif.nama}, ukuran ${ukuranAktif}: ${stok} pcs.` : "Stok untuk pilihan ini habis.";
  } else {
    statusStok.textContent = `Stok ${warnaAktif?.nama || ""}, ukuran ${ukuranAktif}: belum diisi.`;
  }
}

window.URBANN_PRODUCTS_READY.then((products) => {
  const params = new URLSearchParams(window.location.search);
  const pathMatch = window.location.pathname.match(/^\/produk\/([^/]+)\/?$/);
  const productSlug = params.get("slug") || (pathMatch ? decodeURIComponent(pathMatch[1]) : null);
  const idProduk = Number(params.get("id") || productSlug);
  produkAktif = products.find((item) => productSlug ? item.slug === productSlug : item.id === idProduk) || null;
  warnaAktif = produkAktif?.varianWarna[0] || null;
  renderDetail();
}).catch(() => {
  produkAktif = null;
  renderDetail();
});

window.addEventListener("urbann:catalog-updated", (event) => {
  if (!produkAktif) return;
  const previousProductId = produkAktif.id;
  const previousColor = warnaAktif?.nama;
  const previousSize = ukuranAktif;
  const previousMode = detailContainer.querySelector("#jenisPembelian")?.value || "ecer";
  const previousQuantity = detailContainer.querySelector("#jumlahPembelian")?.value || "1";
  produkAktif = event.detail.find((item) => item.id === previousProductId) || null;
  if (!produkAktif) {
    warnaAktif = null;
    renderDetail();
    return;
  }
  warnaAktif = produkAktif.varianWarna.find((item) => item.nama === previousColor) || produkAktif.varianWarna[0] || null;
  ukuranAktif = produkAktif.ukuran.includes(previousSize) ? previousSize : "";
  fotoAktifIndex = 0;
  renderDetail();
  const purchaseMode = detailContainer.querySelector("#jenisPembelian");
  purchaseMode.value = previousMode;
  purchaseMode.dispatchEvent(new Event("change"));
  detailContainer.querySelector("#jumlahPembelian").value = previousQuantity;
  if (ukuranAktif) {
    const sizeButton = [...detailContainer.querySelectorAll("[data-ukuran]")].find((button) => button.dataset.ukuran === ukuranAktif);
    sizeButton?.click();
  } else {
    perbaruiStok();
    perbaruiRingkasanPembelian();
  }
});

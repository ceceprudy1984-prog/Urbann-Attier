const query = new URLSearchParams(window.location.search);
const idProduk = Number(query.get("id"));
const produkAktif = produk.find((item) => item.id === idProduk);
const detailContainer = document.getElementById("detailProduk");

let warnaAktif = produkAktif?.varianWarna[0] || null;
let ukuranAktif = "";

function hargaRupiah(nilai) {
  return nilai == null ? "Segera tersedia" : `Rp ${nilai.toLocaleString("id-ID")}`;
}

function perbaruiJudulProduk() {
  const heading = document.getElementById("namaProduk");
  const metaDescription = document.querySelector('meta[name="description"]');

  if (!produkAktif) {
    document.title = "Produk tidak ditemukan | Urbann Attier";
    if (heading) heading.textContent = "Produk tidak ditemukan";
    if (metaDescription) {
      metaDescription.content = "Produk yang Anda cari tidak tersedia di Urbann Attier.";
    }
    return;
  }

  document.title = `${produkAktif.nama} | Gamis Wanita Urbann Attier`;
  if (heading) heading.textContent = produkAktif.nama;
  if (metaDescription) {
    metaDescription.content = `Lihat ${produkAktif.nama} dari Urbann Attier. Pilih warna dan ukuran, serta lihat harga dan informasi produk.`;
  }
}

function renderDetail() {
  perbaruiJudulProduk();

  if (!produkAktif) {
    detailContainer.innerHTML = `
      <a class="detail-kembali" href="index.html#produk">&larr; Kembali ke koleksi</a>
      <h1 class="detail-page-title">Produk tidak ditemukan</h1>
      <p>Produk yang Anda cari tidak tersedia. Silakan kembali ke halaman koleksi.</p>
    `;
    return;
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
          aria-label="Lihat warna ${varian.nama}"
          aria-pressed="${index === 0}"
        >
          <img src="${varian.foto}" alt="${produkAktif.nama} warna ${varian.nama}" loading="lazy">
          <span>${varian.nama}</span>
        </button>
      `,
    )
    .join("");

  const ukuranButtons = produkAktif.ukuran
    .map(
      (ukuran) => `
        <button class="opsi-btn" type="button" data-ukuran="${ukuran}" aria-pressed="false">
          ${ukuran}
        </button>
      `,
    )
    .join("");

  const detailProduk = Object.entries(produkAktif.detailProduk || {})
    .map(
      ([label, nilai]) => `
        <div class="detail-spec-row">
          <dt>${label}</dt>
          <dd>${nilai}</dd>
        </div>
      `,
    )
    .join("");

  const barisUkuran = (produkAktif.ukuranDetail || [])
    .map(
      (item) => `
        <tr>
          <th scope="row">${item.ukuran}</th>
          <td>${item.lingkarDada}</td>
          <td>${item.panjangGamis}</td>
          <td>${item.panjangLengan}</td>
        </tr>
      `,
    )
    .join("");

  detailContainer.innerHTML = `
    <a class="detail-kembali" href="index.html#produk">&larr; Kembali ke koleksi</a>
    <h1 id="namaProduk" class="detail-page-title">${produkAktif.nama}</h1>

    <div class="detail-wrapper">
      <div class="detail-galeri">
        <figure class="detail-img">
          <img id="fotoUtama" src="${foto}" alt="${produkAktif.nama} warna ${warnaAktif?.nama || ""}">
        </figure>
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
            <li><strong>Grosir:</strong> berlaku untuk pembelian 20 pcs atau lebih.</li>
          </ul>
        </section>

        <div class="opsi-group">
          <p class="opsi-label">Pilih warna: <strong id="namaWarnaAktif">${warnaAktif?.nama || ""}</strong></p>
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
            Ecer berlaku mulai 1 pcs. Seri warna atau ukuran harus dibeli lengkap.
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
          <p>${produkAktif.deskripsi}</p>
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
        <a class="cart-view-link" href="keranjang.html">
          Lihat keranjang (<span class="cart-count" data-cart-count>0</span>)
        </a>
        <p class="detail-payment-note">
          Ongkir dan pembayaran dikonfirmasi admin melalui WhatsApp.
        </p>
      </div>
    </div>
  `;

  pasangEventDetail();
}

function pasangEventDetail() {
  detailContainer.querySelectorAll("[data-warna-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.warnaIndex);
      warnaAktif = produkAktif.varianWarna[index];
      detailContainer.querySelector("#fotoUtama").src = warnaAktif.foto;
      detailContainer.querySelector("#fotoUtama").alt = `${produkAktif.nama} warna ${warnaAktif.nama}`;
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
  detailContainer.querySelector("#btnCheckoutSekarang").addEventListener("click", () => {
    if (tambahKeKeranjang()) window.location.href = "checkout.html";
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
    info.textContent = `Jumlah harus kelipatan ${jumlahSatuSeri} pcs agar setiap seri lengkap.`;
  } else {
    inputJumlah.min = "1";
    inputJumlah.step = "1";
    inputJumlah.value = String(jumlah);
    info.textContent = jumlah >= 20
      ? "Jumlah 20 pcs atau lebih otomatis masuk harga grosir."
      : "Harga ecer berlaku untuk pembelian satuan. Pilih seri lengkap untuk harga serian.";
  }

  let tier = "ecer";
  let labelTier = "Harga ecer";
  let hargaPerPcs = produkAktif.harga;
  if (jumlah >= 20) {
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

renderDetail();

const hamburger = document.querySelector(".hamburger-btn");
const navLinks = document.querySelector(".nav-links");

if (hamburger && navLinks) {
  const navContent = document.querySelector("#navContent");
  const setMenuOpen = (open) => {
    hamburger.classList.toggle("active", open);
    navContent?.classList.toggle("active", open);
    hamburger.setAttribute("aria-expanded", String(open));
    hamburger.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu");
    document.body.classList.toggle("nav-open", open);
  };

  hamburger.addEventListener("click", () => setMenuOpen(hamburger.getAttribute("aria-expanded") !== "true"));
  navContent?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setMenuOpen(false)));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenuOpen(false);
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 1020) setMenuOpen(false);
  });
}

const navbar = document.querySelector(".navbar");
const updateNavbarScroll = () => navbar?.classList.toggle("is-scrolled", window.scrollY > 24);
window.addEventListener("scroll", updateNavbarScroll, { passive: true });
updateNavbarScroll();

// Stok, deskripsi, dan harga grosir/serian perlu diisi dengan data toko yang valid.
const produk = [
  {
    id: 0,
    nama: "Lunar Lace",
    harga: 135000,
    hargaGrosir: 130000,
    hargaSerian: 125000,
    deskripsi: "Teliti sebelum membeli baca deskripsi secara utuh untuk menghindari kesalahan pembelian."
    ,
    ukuran: ["M", "L", "XL", "XXL", "XXXL"],
    detailProduk: {
      bahan: "Isi jenis bahan",
      model: "Isi detail model atau potongan",
      catatan: "Isi informasi tambahan atau perawatan",
    },
    ukuranDetail: [
      { ukuran: "M", lingkarDada: "Isi cm", panjangGamis: "Isi cm", panjangLengan: "Isi cm" },
      { ukuran: "L", lingkarDada: "Isi cm", panjangGamis: "Isi cm", panjangLengan: "Isi cm" },
      { ukuran: "XL", lingkarDada: "Isi cm", panjangGamis: "Isi cm", panjangLengan: "Isi cm" },
      { ukuran: "XXL", lingkarDada: "Isi cm", panjangGamis: "Isi cm", panjangLengan: "Isi cm" },
      { ukuran: "XXXL", lingkarDada: "Isi cm", panjangGamis: "Isi cm", panjangLengan: "Isi cm" },
    ],
    varianWarna: [
      { nama: "Burgundy", foto: "assets/lunar lace/burgundy.jpeg" },
      { nama: "Denim", foto: "assets/lunar lace/denim.jpeg" },
      { nama: "Emerald", foto: "assets/lunar lace/emerald.jpeg" },
      { nama: "Hitam", foto: "assets/lunar lace/hitam.jpeg" },
      { nama: "Khaki", foto: "assets/lunar lace/khaki.jpeg" },
      { nama: "Navy", foto: "assets/lunar lace/navy.jpeg" },
      { nama: "Sage", foto: "assets/lunar lace/sage.jpeg" },
    ],
  },
  {
    id: 1,
    nama: "Ceongsam Sabrina",
    harga: 50000,
    hargaGrosir: null,
    hargaSerian: null,
    deskripsi: "Deskripsi produk akan ditambahkan.",
    ukuran: ["S", "M", "L"],
    detailProduk: {
      bahan: "Isi jenis bahan",
      model: "Isi detail model atau potongan",
      catatan: "Isi informasi tambahan atau perawatan",
    },
    ukuranDetail: [
      { ukuran: "S", lingkarDada: "Isi cm", panjangGamis: "Isi cm", panjangLengan: "Isi cm" },
      { ukuran: "M", lingkarDada: "Isi cm", panjangGamis: "Isi cm", panjangLengan: "Isi cm" },
      { ukuran: "L", lingkarDada: "Isi cm", panjangGamis: "Isi cm", panjangLengan: "Isi cm" },
    ],
    varianWarna: [
      { nama: "Hitam", foto: "assets/ceongsam/ceongsam-black.jpeg" },
      { nama: "Blue Emerald", foto: "assets/ceongsam/ceongsam-blue-emerald.jpeg" },
      { nama: "Burgundy", foto: "assets/ceongsam/ceongsam-burgundy.jpeg" },
      { nama: "Mahogany", foto: "assets/ceongsam/ceongsam-mahogany.jpeg" },
      { nama: "Navy", foto: "assets/ceongsam/ceongsam-navy.jpeg" },
    ],
  },
  {
    id: 2,
    nama: "Abaya Turky",
    harga: 85000,
    hargaGrosir: null,
    hargaSerian: null,
    deskripsi: "Deskripsi produk akan ditambahkan.",
    ukuran: ["S", "M", "L"],
    detailProduk: {
      bahan: "Isi jenis bahan",
      model: "Isi detail model atau potongan",
      catatan: "Isi informasi tambahan atau perawatan",
    },
    ukuranDetail: [
      { ukuran: "S", lingkarDada: "Isi cm", panjangGamis: "Isi cm", panjangLengan: "Isi cm" },
      { ukuran: "M", lingkarDada: "Isi cm", panjangGamis: "Isi cm", panjangLengan: "Isi cm" },
      { ukuran: "L", lingkarDada: "Isi cm", panjangGamis: "Isi cm", panjangLengan: "Isi cm" },
    ],
    varianWarna: [
      { nama: "Blue Emerald", foto: "assets/abaya turky/blue emerald.jpeg" },
      { nama: "Burgundy", foto: "assets/abaya turky/burgundy.jpeg" },
      { nama: "Hitam", foto: "assets/abaya turky/hitam.jpeg" },
      { nama: "Mahogany", foto: "assets/abaya turky/mahogany (1).jpeg" },
      { nama: "Navy", foto: "assets/abaya turky/navy.jpeg" },
    ],
  },
  {
    id: 3,
    nama: "Delvina Dress",
    harga: 85000,
    hargaGrosir: null,
    hargaSerian: null,
    deskripsi: "Deskripsi produk akan ditambahkan.",
    ukuran: ["S", "M", "L"],
    detailProduk: {
      bahan: "Isi jenis bahan",
      model: "Isi detail model atau potongan",
      catatan: "Isi informasi tambahan atau perawatan",
    },
    ukuranDetail: [
      { ukuran: "S", lingkarDada: "Isi cm", panjangGamis: "Isi cm", panjangLengan: "Isi cm" },
      { ukuran: "M", lingkarDada: "Isi cm", panjangGamis: "Isi cm", panjangLengan: "Isi cm" },
      { ukuran: "L", lingkarDada: "Isi cm", panjangGamis: "Isi cm", panjangLengan: "Isi cm" },
    ],
    varianWarna: [
      { nama: "Blue Emerald", foto: "assets/delvina/delvina-blueemerald.jpeg" },
      { nama: "Burgundy", foto: "assets/delvina/delvina-burgundy.jpeg" },
      { nama: "Denim", foto: "assets/delvina/delvina-denim.jpeg" },
      { nama: "Dusty Pink", foto: "assets/delvina/delvina-dustypink.jpeg" },
      { nama: "Hitam", foto: "assets/delvina/delvina-hitam.jpeg" },
      { nama: "Khaki", foto: "assets/delvina/delvina-khaky.jpeg" },
      { nama: "Mahogany", foto: "assets/delvina/delvina-mahogany.jpeg" },
      { nama: "Navy", foto: "assets/delvina/delvina-navy.jpeg" },
      { nama: "Sage", foto: "assets/delvina/delvina-sage.jpeg" },
    ],
  },
  {
    id: 4,
    nama: "Delvina Couple",
    harga: 200000,
    hargaGrosir: null,
    hargaSerian: null,
    deskripsi: "Deskripsi produk akan ditambahkan.",
    ukuran: ["S", "M", "L"],
    detailProduk: {
      bahan: "Isi jenis bahan",
      model: "Isi detail model atau potongan",
      catatan: "Isi informasi tambahan atau perawatan",
    },
    ukuranDetail: [
      { ukuran: "S", lingkarDada: "Isi cm", panjangGamis: "Isi cm", panjangLengan: "Isi cm" },
      { ukuran: "M", lingkarDada: "Isi cm", panjangGamis: "Isi cm", panjangLengan: "Isi cm" },
      { ukuran: "L", lingkarDada: "Isi cm", panjangGamis: "Isi cm", panjangLengan: "Isi cm" },
    ],
    varianWarna: [
      { nama: "Burgundy", foto: "assets/delvina couple/burgundy.jpeg" },
      { nama: "Denim", foto: "assets/delvina couple/denim (1).jpeg" },
      { nama: "Dusty", foto: "assets/delvina couple/dusty.jpeg" },
      { nama: "Emerald", foto: "assets/delvina couple/emerald.jpeg" },
      { nama: "Hitam", foto: "assets/delvina couple/hitam.jpeg" },
      { nama: "Khaki", foto: "assets/delvina couple/khaki.jpeg" },
      { nama: "Mahogany", foto: "assets/delvina couple/mahogany.jpeg" },
      { nama: "Navy", foto: "assets/delvina couple/navy.jpeg" },
      { nama: "Sage", foto: "assets/delvina couple/sage.jpeg" },
    ],
  },
];

// DATA STOK PRODUK
// Ganti null dengan jumlah stok sebenarnya. Contoh: M: 8 berarti stok size M ada 8 pcs.
// Gunakan 0 jika kombinasi warna dan size tersebut habis.
const stokPerProduk = {
  0: {
    Burgundy: { M: null, L: null, XL: null, XXL: null, XXXL: null },
    Denim: { M: null, L: null, XL: null, XXL: null, XXXL: null },
    Emerald: { M: null, L: null, XL: null, XXL: null, XXXL: null },
    Hitam: { M: null, L: null, XL: null, XXL: null, XXXL: null },
    Khaki: { M: null, L: null, XL: null, XXL: null, XXXL: null },
    Navy: { M: null, L: null, XL: null, XXL: null, XXXL: null },
    Sage: { M: null, L: null, XL: null, XXL: null, XXXL: null },
  },
  1: {
    Hitam: { S: null, M: null, L: null },
    "Blue Emerald": { S: null, M: null, L: null },
    Burgundy: { S: null, M: null, L: null },
    Mahogany: { S: null, M: null, L: null },
    Navy: { S: null, M: null, L: null },
  },
  2: {
    "Blue Emerald": { S: null, M: null, L: null },
    Burgundy: { S: null, M: null, L: null },
    Hitam: { S: null, M: null, L: null },
    Mahogany: { S: null, M: null, L: null },
    Navy: { S: null, M: null, L: null },
  },
  3: {
    "Blue Emerald": { S: null, M: null, L: null },
    Burgundy: { S: null, M: null, L: null },
    Denim: { S: null, M: null, L: null },
    "Dusty Pink": { S: null, M: null, L: null },
    Hitam: { S: null, M: null, L: null },
    Khaki: { S: null, M: null, L: null },
    Mahogany: { S: null, M: null, L: null },
    Navy: { S: null, M: null, L: null },
    Sage: { S: null, M: null, L: null },
  },
  4: {
    Burgundy: { S: null, M: null, L: null },
    Denim: { S: null, M: null, L: null },
    Dusty: { S: null, M: null, L: null },
    Emerald: { S: null, M: null, L: null },
    Hitam: { S: null, M: null, L: null },
    Khaki: { S: null, M: null, L: null },
    Mahogany: { S: null, M: null, L: null },
    Navy: { S: null, M: null, L: null },
    Sage: { S: null, M: null, L: null },
  },
};

produk.forEach((item) => {
  item.varianWarna.forEach((varian) => {
    varian.stok = stokPerProduk[item.id]?.[varian.nama] || {};
  });
});

const formatRupiah = (nominal) =>
  nominal == null ? "Segera tersedia" : `Rp ${nominal.toLocaleString("id-ID")}`;

const grid = document.getElementById("produkGrid");

function renderProducts(searchTerm = "") {
  if (!grid) return;
  const query = searchTerm.trim().toLocaleLowerCase("id-ID");
  const filtered = produk.filter((item) =>
    [item.nama, ...(item.varianWarna || []).map((color) => color.nama)].join(" ").toLocaleLowerCase("id-ID").includes(query),
  );

  grid.innerHTML = filtered.length
    ? filtered
    .map((item) => {
      const fotoUtama = item.varianWarna[0]?.foto || "";
      return `
        <article class="produk-card">
          <div class="produk-img">
            <img src="${fotoUtama}" alt="${item.nama}" loading="lazy">
          </div>
          <div class="produk-info">
            <h3 class="produk-nama">${item.nama}</h3>
            <p class="produk-harga">${formatRupiah(item.harga)}</p>
            <a href="detail-produk.html?id=${item.id}" class="btn-detail">Lihat Detail</a>
          </div>
        </article>
      `;
    })
    .join("")
    : '<p class="produk-empty">Produk tidak ditemukan. Coba kata kunci lain.</p>';
}

renderProducts();

const productSearch = document.querySelector("#productSearch");
const productSearchInput = document.querySelector("#productSearchInput");
productSearch?.addEventListener("submit", (event) => {
  event.preventDefault();
  renderProducts(productSearchInput?.value || "");
  document.querySelector("#produk")?.scrollIntoView({ behavior: "smooth" });
  document.querySelector("#produk")?.classList.add("search-results-highlight");
  window.setTimeout(() => document.querySelector("#produk")?.classList.remove("search-results-highlight"), 900);
});
productSearchInput?.addEventListener("input", () => {
  if (!productSearchInput.value.trim()) renderProducts();
});

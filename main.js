const hamburger = document.querySelector(".hamburger-btn");
const navLinks = document.querySelector(".nav-links");
const BIAYA_PENGEMASAN = 5000;
let produk = [];

window.urbannProducts = produk;
window.urbannEscapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
window.urbannSafeImageUrl = (value) => {
  if (!value) return "";
  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:", "file:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};

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
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") setMenuOpen(false); });
  window.addEventListener("resize", () => { if (window.innerWidth > 1020) setMenuOpen(false); });
}

const navbar = document.querySelector(".navbar");
const updateNavbarScroll = () => navbar?.classList.toggle("is-scrolled", window.scrollY > 24);
window.addEventListener("scroll", updateNavbarScroll, { passive: true });
updateNavbarScroll();

const grid = document.getElementById("produkGrid");
const productSearch = document.querySelector("#productSearch");
const productSearchInput = document.querySelector("#productSearchInput");
const escapeHtml = window.urbannEscapeHtml;
const safeImageUrl = window.urbannSafeImageUrl;
let publicSupabaseClient = null;
let catalogReloadTimer = null;

function formatRupiah(amount) {
  return amount == null ? "Segera tersedia" : `Rp ${Number(amount).toLocaleString("id-ID")}`;
}

function renderProducts(searchTerm = "") {
  if (!grid) return;
  const query = searchTerm.trim().toLocaleLowerCase("id-ID");
  const filtered = produk.filter((item) =>
    [item.nama, ...(item.varianWarna || []).map((color) => color.nama)]
      .join(" ").toLocaleLowerCase("id-ID").includes(query));

  grid.innerHTML = filtered.length
    ? filtered.map((item) => {
      const firstImage = safeImageUrl(item.varianWarna[0]?.foto);
      return `<article class="produk-card">
        <div class="produk-img"><img src="${escapeHtml(firstImage)}" alt="${escapeHtml(item.nama)}" loading="lazy"></div>
        <div class="produk-info">
          <h3 class="produk-nama">${escapeHtml(item.nama)}</h3>
          <p class="produk-harga">${formatRupiah(item.harga)}</p>
          <a href="detail-produk.html?id=${encodeURIComponent(item.id)}" class="btn-detail">Lihat Detail</a>
        </div>
      </article>`;
    }).join("")
    : '<p class="produk-empty">Belum ada produk aktif di katalog. Silakan cek kembali nanti.</p>';
}

function mapCatalog(products, variants, images, sizes, inventory) {
  return products.map((product) => {
    const productVariants = variants.filter((variant) => variant.product_id === product.id);
    const productSizes = sizes.filter((size) => size.product_id === product.id);
    return {
      id: product.id,
      nama: product.name,
      harga: product.price_retail,
      hargaGrosir: product.price_wholesale,
      hargaSerian: product.price_series,
      grosirMinimal: product.wholesale_min_qty,
      deskripsi: product.description || "",
      ukuran: productSizes.map((size) => size.size_name),
      detailProduk: {
        Bahan: product.material,
        Model: product.model,
        Catatan: product.care_notes,
      },
      ukuranDetail: productSizes.map((size) => ({
        ukuran: size.size_name,
        lingkarDada: size.bust_cm,
        panjangGamis: size.garment_length_cm,
        panjangLengan: size.sleeve_length_cm,
      })),
      varianWarna: productVariants.map((variant) => {
        const variantImages = images.filter((image) => image.variant_id === variant.id)
          .map((image) => image.image_path);
        const stockBySize = {};
        productSizes.forEach((size) => {
          const row = inventory.find((stock) => stock.variant_id === variant.id && stock.size_id === size.id);
          stockBySize[size.size_name] = row ? row.stock_quantity : null;
        });
        return {
          id: variant.id,
          nama: variant.color_name,
          foto: variantImages[0] || "",
          fotos: variantImages,
          stok: stockBySize,
        };
      }),
    };
  });
}

async function loadCatalog() {
  const config = window.URBANN_SUPABASE_CONFIG;
  if (!config?.url || !config?.publishableKey || !window.supabase?.createClient) {
    throw new Error("Koneksi katalog belum tersedia. Muat ulang atau hubungi pengelola toko.");
  }
  publicSupabaseClient ||= window.supabase.createClient(config.url, config.publishableKey);
  const { data: products, error } = await publicSupabaseClient.from("products")
    .select("id, name, slug, category, description, material, model, care_notes, price_retail, price_series, price_wholesale, wholesale_min_qty, sort_order")
    .eq("is_active", true).order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (error) throw error;
  if (!products.length) return [];

  const ids = products.map((product) => product.id);
  const results = await Promise.all([
    publicSupabaseClient.from("product_variants").select("id, product_id, color_name, sort_order").in("product_id", ids).eq("is_active", true).order("sort_order"),
    publicSupabaseClient.from("product_images").select("id, product_id, variant_id, image_path, alt_text, sort_order").in("product_id", ids).order("sort_order"),
    publicSupabaseClient.from("product_sizes").select("id, product_id, size_name, bust_cm, garment_length_cm, sleeve_length_cm, sort_order").in("product_id", ids).order("sort_order"),
    publicSupabaseClient.from("inventory").select("product_id, variant_id, size_id, stock_quantity").in("product_id", ids),
  ]);
  const failed = results.find((result) => result.error);
  if (failed) throw failed.error;
  return mapCatalog(products, ...results.map((result) => result.data));
}

function scheduleCatalogRefresh() {
  window.clearTimeout(catalogReloadTimer);
  catalogReloadTimer = window.setTimeout(async () => {
    try {
      produk = await loadCatalog();
      window.urbannProducts = produk;
      renderProducts(productSearchInput?.value || "");
      window.dispatchEvent(new CustomEvent("urbann:catalog-updated", { detail: produk }));
    } catch (error) {
      console.error("Katalog Urbann Attier gagal diperbarui:", error);
    }
  }, 350);
}

function subscribeToCatalogChanges() {
  if (!publicSupabaseClient) return;
  const tables = ["products", "product_variants", "product_images", "product_sizes", "inventory"];
  let channel = publicSupabaseClient.channel("urbann-public-catalog");
  tables.forEach((table) => {
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, scheduleCatalogRefresh);
  });
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") scheduleCatalogRefresh();
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      console.warn("Realtime katalog belum aktif. Pastikan tabel sudah ditambahkan ke publication supabase_realtime.");
    }
  });
}

window.URBANN_PRODUCTS_READY = loadCatalog().then((loadedProducts) => {
  produk = loadedProducts;
  window.urbannProducts = produk;
  renderProducts(productSearchInput?.value || "");
  subscribeToCatalogChanges();
  return produk;
}).catch((error) => {
  console.error("Katalog Urbann Attier gagal dimuat:", error);
  if (grid) grid.innerHTML = '<p class="produk-empty">Katalog sedang tidak dapat dimuat. Silakan muat ulang halaman beberapa saat lagi.</p>';
  produk = [];
  window.urbannProducts = produk;
  return produk;
});

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

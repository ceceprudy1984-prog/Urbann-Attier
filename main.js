// Supabase can fall back to the Site URL if a recovery redirect is missing or
// rejected. Bring auth errors from the home URL back to the account page.
const authRedirectParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const onAccountPage = /(?:^|\/)akun\.html$/.test(window.location.pathname);
const isPasswordRecoveryRedirect = authRedirectParams.get("type") === "recovery"
  && (authRedirectParams.has("access_token") || authRedirectParams.has("token_hash"));
if (!onAccountPage && isPasswordRecoveryRedirect) {
  const accountUrl = new URL("akun.html", window.location.href);
  accountUrl.searchParams.set("mode", "new-password");
  accountUrl.hash = window.location.hash.slice(1);
  window.location.replace(accountUrl.href);
} else if (!onAccountPage && (authRedirectParams.has("error") || authRedirectParams.has("error_code"))) {
  const accountUrl = new URL("akun.html", window.location.href);
  accountUrl.searchParams.set("mode", "login");
  accountUrl.hash = window.location.hash.slice(1);
  window.location.replace(accountUrl.href);
}

const hamburger = document.querySelector(".hamburger-btn");
const navLinks = document.querySelector(".nav-links");
let BIAYA_PENGEMASAN = 5000;
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
let bestsellerProductIds = [];
let bestsellerLoadFailed = false;
let activeSpotlight = "new";
let homepageSpotlightSettings = null;

const spotlightSettingColumns = "homepage_launch_active, homepage_launch_title, homepage_launch_message, homepage_launch_image_url, homepage_launch_at, homepage_promo_active, homepage_promo_badge, homepage_promo_title, homepage_promo_description, homepage_promo_image_url, homepage_promo_cta_label, homepage_promo_cta_url, homepage_promo_starts_at, homepage_promo_ends_at";

async function loadHomepageSpotlightSettings() {
  if (!publicSupabaseClient) return;
  const { data, error } = await publicSupabaseClient.from("store_public_settings")
    .select(spotlightSettingColumns).eq("id", 1).maybeSingle();
  if (error) {
    homepageSpotlightSettings = null;
    console.warn("Konten sorotan belum tersedia. Pastikan migrasi konten sorotan sudah dijalankan:", error.message);
  } else {
    homepageSpotlightSettings = data || null;
  }
  renderSpotlight();
}

function spotlightDateLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short" }).format(date);
}

function safeSpotlightLink(value, fallback = "#produk") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  if (text.startsWith("#") || (text.startsWith("/") && !text.startsWith("//"))) return text;
  try {
    const url = new URL(text, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : fallback;
  } catch {
    return fallback;
  }
}

function formatRupiah(amount) {
  return amount == null ? "Segera tersedia" : `Rp ${Number(amount).toLocaleString("id-ID")}`;
}

const motionPreference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
let revealObserver;

function observeMotionElements(root = document) {
  if (!document.body.classList.contains("motion-enabled")
    || document.body.classList.contains("opening-splash-active") || !revealObserver) return;
  const elements = [];
  if (root instanceof Element && root.matches(".motion-reveal")) elements.push(root);
  elements.push(...root.querySelectorAll?.(".motion-reveal") || []);
  elements.forEach((element, index) => {
    if (element.dataset.motionObserved) return;
    element.dataset.motionObserved = "true";
    const stagger = window.matchMedia("(max-width: 600px)").matches ? 55 : 85;
    element.style.setProperty("--motion-delay", `${Math.min(index, 3) * stagger}ms`);
    revealObserver.observe(element);
  });
}

function configureMotion() {
  const canAnimateOnScroll = !motionPreference?.matches && "IntersectionObserver" in window;
  document.body.classList.toggle("motion-enabled", canAnimateOnScroll);
  revealObserver?.disconnect();
  revealObserver = null;
  if (!canAnimateOnScroll) {
    document.querySelectorAll(".motion-reveal").forEach((element) => {
      delete element.dataset.motionObserved;
      element.classList.remove("is-visible");
      element.style.removeProperty("--motion-delay");
    });
    return;
  }
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -24px 0px" });
  observeMotionElements(document);
}

document.addEventListener("urbann:opening-finished", () => observeMotionElements(document));

configureMotion();
motionPreference?.addEventListener?.("change", configureMotion);

function renderProducts(searchTerm = "") {
  if (!grid) return;
  const query = searchTerm.trim().toLocaleLowerCase("id-ID");
  const filtered = produk.filter((item) =>
    [item.nama, ...(item.varianWarna || []).map((color) => color.nama)]
      .join(" ").toLocaleLowerCase("id-ID").includes(query));

  grid.innerHTML = filtered.length
    ? filtered.map((item) => {
      const firstImage = safeImageUrl(item.varianWarna[0]?.foto);
      return `<article class="produk-card motion-reveal">
        <div class="produk-img"><img src="${escapeHtml(firstImage)}" alt="${escapeHtml(item.nama)}" loading="lazy"></div>
        <div class="produk-info">
          <h3 class="produk-nama">${escapeHtml(item.nama)}</h3>
          <p class="produk-harga">${formatRupiah(item.harga)}</p>
          <a href="detail-produk.html?id=${encodeURIComponent(item.id)}" class="btn-detail">Lihat Detail</a>
        </div>
      </article>`;
    }).join("")
    : '<p class="produk-empty">Belum ada produk aktif di katalog. Silakan cek kembali nanti.</p>';
  observeMotionElements(grid);
}

function renderSpotlightProductCard(item, badge) {
  const image = safeImageUrl(item.varianWarna[0]?.foto);
  return `<article class="produk-card motion-reveal">
    <div class="produk-img"><span class="spotlight-product-badge">${escapeHtml(badge)}</span><img src="${escapeHtml(image)}" alt="${escapeHtml(item.nama)}" loading="lazy"></div>
    <div class="produk-info">
      <h3 class="produk-nama">${escapeHtml(item.nama)}</h3>
      <p class="produk-harga">${formatRupiah(item.harga)}</p>
      <a href="detail-produk.html?id=${encodeURIComponent(item.id)}" class="btn-detail">Lihat Detail</a>
    </div>
  </article>`;
}

function renderSpotlight() {
  const panel = document.querySelector("#spotlightPanel");
  const products = document.querySelector("#spotlightProducts");
  const promo = document.querySelector("#spotlightPromo");
  const promoEmpty = document.querySelector("#spotlightPromoEmpty");
  const launch = document.querySelector("#spotlightLaunch");
  const description = document.querySelector("#spotlightDescription");
  if (!panel || !products || !promo || !description) return;

  document.querySelectorAll("[data-spotlight-tab]").forEach((button) => {
    const active = button.dataset.spotlightTab === activeSpotlight;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  const activeTab = document.querySelector(`[data-spotlight-tab="${activeSpotlight}"]`);
  if (activeTab) panel.setAttribute("aria-labelledby", activeTab.id);

  if (activeSpotlight === "promo") {
    const settings = homepageSpotlightSettings;
    const now = Date.now();
    const startsAt = settings?.homepage_promo_starts_at ? new Date(settings.homepage_promo_starts_at).getTime() : null;
    const endsAt = settings?.homepage_promo_ends_at ? new Date(settings.homepage_promo_ends_at).getTime() : null;
    const isPromoVisible = Boolean(settings?.homepage_promo_active)
      && (!startsAt || startsAt <= now) && (!endsAt || endsAt > now);
    description.textContent = "Informasi promo dan benefit khusus pelanggan Urbann Attier.";
    products.hidden = true;
    launch.hidden = true;
    promo.hidden = !isPromoVisible;
    promoEmpty.hidden = isPromoVisible;
    observeMotionElements(panel);
    if (isPromoVisible) {
      document.querySelector("#spotlightPromoBadge").textContent = settings.homepage_promo_badge || "PROMO";
      document.querySelector("#spotlightPromoTitle").textContent = settings.homepage_promo_title || "Penawaran istimewa untuk Anda";
      document.querySelector("#spotlightPromoMessage").textContent = settings.homepage_promo_description || "Lihat informasi promo terbaru dari Urbann Attier.";
      const promoDate = document.querySelector("#spotlightPromoDate");
      promoDate.textContent = startsAt || endsAt
        ? `${startsAt ? `Mulai ${spotlightDateLabel(settings.homepage_promo_starts_at)}` : ""}${startsAt && endsAt ? " · " : ""}${endsAt ? `Berakhir ${spotlightDateLabel(settings.homepage_promo_ends_at)}` : ""}`
        : "";
      promoDate.hidden = !promoDate.textContent;
      const promoLink = document.querySelector("#spotlightPromoLink");
      promoLink.textContent = settings.homepage_promo_cta_label || "Lihat promo";
      promoLink.href = safeSpotlightLink(settings.homepage_promo_cta_url);
      const promoImage = document.querySelector("#spotlightPromoImage");
      const imageUrl = safeImageUrl(settings.homepage_promo_image_url);
      promoImage.hidden = !imageUrl;
      promoImage.src = imageUrl;
      promoImage.alt = settings.homepage_promo_title || "Gambar promo Urbann Attier";
    }
    return;
  }

  promo.hidden = true;
  promoEmpty.hidden = true;
  products.hidden = false;
  if (activeSpotlight === "best") {
    launch.hidden = true;
    description.textContent = "Peringkat dihitung dari jumlah produk pada pesanan yang pembayarannya sudah lunas.";
    if (bestsellerLoadFailed) {
      products.innerHTML = '<p class="produk-empty">Pilihan produk terlaris akan segera hadir.</p>';
      return;
    }
    const bestsellers = bestsellerProductIds
      .map((id) => produk.find((item) => Number(item.id) === Number(id)))
      .filter(Boolean)
      .slice(0, 3);
    products.innerHTML = bestsellers.length
      ? bestsellers.map((item) => renderSpotlightProductCard(item, "Terlaris")).join("")
      : '<p class="produk-empty">Pilihan terlaris akan muncul setelah ada pesanan yang berhasil dibayar.</p>';
    observeMotionElements(products);
    return;
  }

  const launchSettings = homepageSpotlightSettings;
  const launchAt = launchSettings?.homepage_launch_at ? new Date(launchSettings.homepage_launch_at).getTime() : null;
  const showLaunch = Boolean(launchSettings?.homepage_launch_active)
    && (!launchAt || launchAt > Date.now())
    && Boolean(safeImageUrl(launchSettings?.homepage_launch_image_url));
  if (showLaunch) {
    description.textContent = "Intip koleksi berikutnya yang sedang disiapkan untuk Anda.";
    products.hidden = true;
    launch.hidden = false;
    document.querySelector("#spotlightLaunchImage").src = safeImageUrl(launchSettings.homepage_launch_image_url);
    document.querySelector("#spotlightLaunchImage").alt = launchSettings.homepage_launch_title || "Teaser produk yang segera hadir";
    document.querySelector("#spotlightLaunchTitle").textContent = launchSettings.homepage_launch_title || "Koleksi baru segera hadir";
    document.querySelector("#spotlightLaunchMessage").textContent = launchSettings.homepage_launch_message || "Kami sedang menyiapkan sesuatu yang istimewa.";
    const launchDate = document.querySelector("#spotlightLaunchDate");
    launchDate.textContent = launchAt ? `Dijadwalkan hadir ${spotlightDateLabel(launchSettings.homepage_launch_at)}` : "Segera hadir";
    return;
  }
  launch.hidden = true;
  description.textContent = "Koleksi terbaru yang ditambahkan ke katalog Urbann Attier.";
  const newest = [...produk]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 3);
  products.innerHTML = newest.length
    ? newest.map((item) => renderSpotlightProductCard(item, "Baru")).join("")
    : '<p class="produk-empty">Produk baru akan tampil di sini setelah ditambahkan ke katalog.</p>';
  observeMotionElements(products);
}

async function loadBestsellerProductIds() {
  if (!publicSupabaseClient) return;
  const { data, error } = await publicSupabaseClient.rpc("storefront_bestseller_product_ids", { p_limit: 3 });
  bestsellerLoadFailed = Boolean(error);
  bestsellerProductIds = error ? [] : (data || []).map((row) => row.product_id);
  if (error) console.warn("Pilihan produk terlaris belum tersedia:", error.message);
  renderSpotlight();
}

function mapCatalog(products, variants, images, sizes, inventory) {
  return products.map((product) => {
    const productVariants = variants.filter((variant) => variant.product_id === product.id);
    const productSizes = sizes.filter((size) => size.product_id === product.id);
    return {
      id: product.id,
      nama: product.name,
      createdAt: product.created_at,
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
          stockBySize[size.size_name] = row && row.stock_quantity != null
            ? Math.max(0, Number(row.stock_quantity) - Number(row.reserved_quantity || 0))
            : null;
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
  window.urbannSupabaseClient = publicSupabaseClient;
  const [productsResult, settingsResult] = await Promise.all([
    publicSupabaseClient.from("products")
      .select("id, name, slug, category, description, material, model, care_notes, price_retail, price_series, price_wholesale, wholesale_min_qty, sort_order, created_at")
      .eq("is_active", true).order("sort_order", { ascending: true }).order("name", { ascending: true }),
    publicSupabaseClient.from("store_public_settings").select("packaging_fee").eq("id", 1).maybeSingle(),
  ]);
  if (productsResult.error) throw productsResult.error;
  if (settingsResult.error) throw settingsResult.error;
  const products = productsResult.data || [];
  BIAYA_PENGEMASAN = settingsResult.data?.packaging_fee ?? 5000;
  window.urbannPackagingFee = BIAYA_PENGEMASAN;
  if (!products.length) return [];

  const ids = products.map((product) => product.id);
  const results = await Promise.all([
    publicSupabaseClient.from("product_variants").select("id, product_id, color_name, sort_order").in("product_id", ids).eq("is_active", true).order("sort_order"),
    publicSupabaseClient.from("product_images").select("id, product_id, variant_id, image_path, alt_text, sort_order").in("product_id", ids).order("sort_order"),
    publicSupabaseClient.from("product_sizes").select("id, product_id, size_name, bust_cm, garment_length_cm, sleeve_length_cm, sort_order").in("product_id", ids).order("sort_order"),
    publicSupabaseClient.from("inventory").select("product_id, variant_id, size_id, stock_quantity, reserved_quantity").in("product_id", ids),
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
      await loadBestsellerProductIds();
      await loadHomepageSpotlightSettings();
      renderSpotlight();
      window.dispatchEvent(new CustomEvent("urbann:catalog-updated", { detail: produk }));
    } catch (error) {
      console.error("Katalog Urbann Attier gagal diperbarui:", error);
    }
  }, 350);
}

function subscribeToCatalogChanges() {
  if (!publicSupabaseClient) return;
  const tables = ["products", "product_variants", "product_images", "product_sizes", "inventory", "store_public_settings"];
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
  renderSpotlight();
  loadBestsellerProductIds();
  loadHomepageSpotlightSettings();
  subscribeToCatalogChanges();
  return produk;
}).catch((error) => {
  console.error("Katalog Urbann Attier gagal dimuat:", error);
  if (grid) grid.innerHTML = '<p class="produk-empty">Katalog sedang tidak dapat dimuat. Silakan muat ulang halaman beberapa saat lagi.</p>';
  produk = [];
  window.urbannProducts = produk;
  renderSpotlight();
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

document.querySelectorAll("[data-spotlight-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    activeSpotlight = button.dataset.spotlightTab;
    renderSpotlight();
  });
});

window.setInterval(() => {
  if (activeSpotlight === "promo" || activeSpotlight === "new") renderSpotlight();
}, 30000);

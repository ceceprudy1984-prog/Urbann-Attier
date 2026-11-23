import { readFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = "https://urbannattier.com";
const OUTPUT_DIR = path.join(ROOT, "produk");
const MANIFEST_PATH = path.join(OUTPUT_DIR, ".generated-manifest.json");

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

const escapeJsonForHtml = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
const slugIsSafe = (slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

async function getCatalog() {
  const configText = await readFile(path.join(ROOT, "supabase-config.js"), "utf8");
  const projectUrl = configText.match(/url:\s*"([^"]+)"/)?.[1];
  const publishableKey = configText.match(/publishableKey:\s*"([^"]+)"/)?.[1];
  if (!projectUrl || !publishableKey) throw new Error("URL atau publishable key Supabase tidak ditemukan di supabase-config.js.");

  const api = new URL("rest/v1/", projectUrl.endsWith("/") ? projectUrl : `${projectUrl}/`);
  const request = async (table, params) => {
    const url = new URL(table, api);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
    });
    if (!response.ok) throw new Error(`Gagal membaca ${table} dari katalog (${response.status}).`);
    return response.json();
  };

  const products = await request("products", {
    select: "id,sku,slug,name,category,description,material,model,care_notes,price_retail,price_series,price_wholesale,updated_at",
    is_active: "eq.true",
    order: "sort_order.asc,name.asc",
  });
  if (!products.length) throw new Error("Tidak ada produk aktif. File sitemap dan halaman lama tidak diubah.");
  if (products.some((product) => !slugIsSafe(product.slug))) {
    throw new Error("Ada slug produk yang tidak aman untuk alamat halaman. Periksa slug di dashboard admin.");
  }
  if (new Set(products.map((product) => product.slug)).size !== products.length) {
    throw new Error("Ada slug produk yang duplikat. Periksa katalog sebelum membuat halaman SEO.");
  }

  const ids = products.map(({ id }) => id).join(",");
  const filter = `in.(${ids})`;
  const [variants, images] = await Promise.all([
    request("product_variants", { select: "id,product_id,color_name,sort_order", product_id: filter, is_active: "eq.true", order: "sort_order.asc" }),
    request("product_images", { select: "id,product_id,variant_id,image_path,alt_text,sort_order", product_id: filter, order: "sort_order.asc" }),
  ]);

  return products.map((product) => {
    const productVariants = variants.filter((variant) => variant.product_id === product.id);
    const productImages = images.filter((image) => image.product_id === product.id && productVariants.some((variant) => variant.id === image.variant_id));
    return { ...product, images: productImages };
  });
}

function absoluteImageUrl(imagePath) {
  try {
    const url = new URL(imagePath, `${SITE_URL}/`);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function productHtml(product) {
  const productUrl = `${SITE_URL}/produk/${encodeURIComponent(product.slug)}/`;
  const productImages = product.images.map((image) => absoluteImageUrl(image.image_path)).filter(Boolean);
  const title = `${product.name} | Gamis Wanita Urbann Attier`;
  const productDescription = String(product.description || "").trim();
  const fullDescription = !["deskripsi produk akan ditambahkan.", "deskripsi produk akan ditambahkan"].includes(productDescription.toLocaleLowerCase("id-ID"))
    ? productDescription.replace(/\s+/g, " ").trim()
    : [product.name, product.material, product.model]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  const description = fullDescription || `Lihat ${product.name}, koleksi gamis Urbann Attier. Periksa pilihan warna, ukuran, dan harga yang tersedia.`;
  const metaDescription = description.length > 160
    ? `${description.slice(0, 157).replace(/\s+\S*$/, "")}…`
    : description;
  const offer = Number.isFinite(Number(product.price_retail)) && product.price_retail != null
    ? { "@type": "Offer", url: productUrl, priceCurrency: "IDR", price: String(Number(product.price_retail)), itemCondition: "https://schema.org/NewCondition" }
    : undefined;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    brand: { "@type": "Brand", name: "Urbann Attier" },
    url: productUrl,
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.category ? { category: product.category } : {}),
    ...(fullDescription ? { description: fullDescription } : {}),
    ...(productImages.length ? { image: productImages } : {}),
    ...(offer ? { offers: offer } : {}),
  };
  const price = (value) => value == null ? "Segera tersedia" : `Rp ${Number(value).toLocaleString("id-ID")}`;
  const imageMarkup = productImages[0]
    ? `<figure class="detail-img"><img src="${escapeHtml(productImages[0])}" alt="${escapeHtml(product.images[0]?.alt_text || product.name)}" fetchpriority="high"></figure>`
    : "";
  const facts = [
    ["Kategori", product.category], ["Bahan", product.material], ["Model", product.model], ["Catatan", product.care_notes],
  ].filter(([, value]) => value).map(([label, value]) => `<div class="detail-spec-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  const prices = [
    ["Harga ecer", product.price_retail], ["Harga grosir", product.price_wholesale], ["Harga serian", product.price_series],
  ].filter(([, value]) => value != null).map(([label, value]) => `<div class="detail-price-row"><span>${label}</span><strong>${price(value)}</strong></div>`).join("");
  const sourceUrl = `/detail-produk.html?slug=${encodeURIComponent(product.slug)}`;

  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(metaDescription)}" />
    <link rel="canonical" href="${escapeHtml(productUrl)}" />
    <meta property="og:type" content="product" />
    <meta property="og:site_name" content="Urbann Attier" />
    <meta property="og:locale" content="id_ID" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(metaDescription)}" />
    <meta property="og:url" content="${escapeHtml(productUrl)}" />
    ${productImages[0] ? `<meta property="og:image" content="${escapeHtml(productImages[0])}" />` : ""}
    ${productImages[0] ? `<meta property="og:image:alt" content="${escapeHtml(product.images[0]?.alt_text || product.name)}" />` : ""}
    <meta name="twitter:card" content="${productImages[0] ? "summary_large_image" : "summary"}" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(metaDescription)}" />
    ${productImages[0] ? `<meta name="twitter:image" content="${escapeHtml(productImages[0])}" />` : ""}
    <script type="application/ld+json">${escapeJsonForHtml(structuredData)}</script>
    <link rel="icon" type="image/x-icon" href="/assets/Urban%20Attier.jpg" />
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body class="halaman-detail">
    <main class="detail-section" id="detailProduk">
      <a class="detail-kembali" href="/index.html#produk">&larr; Kembali ke koleksi</a>
      <h1 id="namaProduk" class="detail-page-title">${escapeHtml(product.name)}</h1>
      <div class="detail-wrapper">
        <div class="detail-galeri">${imageMarkup}</div>
        <div class="detail-info">
          <div class="detail-price-list" aria-label="Pilihan harga">${prices}</div>
          <div class="detail-description">
            <h2>Deskripsi produk</h2><p>${escapeHtml(product.description || `Koleksi ${product.name} dari Urbann Attier.`)}</p>
            ${facts ? `<dl class="detail-spec-list">${facts}</dl>` : ""}
          </div>
          <a class="btn btn-primary" href="${sourceUrl}">Lihat pilihan warna, ukuran, dan pemesanan</a>
        </div>
      </div>
    </main>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="/supabase-config.js"></script>
    <script src="/main.js"></script>
    <script src="/cart-store.js"></script>
    <script src="/paket-detail.js"></script>
    <a class="floating-chat-link" href="https://wa.me/6282318500057?text=Halo%20Urbann%20Attier%2C%20saya%20ingin%20bertanya." target="_blank" rel="noopener noreferrer" aria-label="Chat Urbann Attier melalui WhatsApp"><span class="floating-chat-icon" aria-hidden="true">✆</span><span>Chat WhatsApp</span></a>
  </body>
</html>
`;
}

function sitemapXml(products) {
  const urls = [
    { loc: `${SITE_URL}/`, lastmod: new Date().toISOString().slice(0, 10) },
    { loc: `${SITE_URL}/kebijakan-privasi.html` },
    ...products.map((product) => ({
      loc: `${SITE_URL}/produk/${encodeURIComponent(product.slug)}/`,
      lastmod: product.updated_at ? new Date(product.updated_at).toISOString().slice(0, 10) : undefined,
    })),
  ];
  const entries = urls.map(({ loc, lastmod }) => `  <url><loc>${escapeHtml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

async function main() {
  const products = await getCatalog();
  await mkdir(OUTPUT_DIR, { recursive: true });

  let previousSlugs = [];
  try {
    previousSlugs = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  } catch {}

  const currentSlugs = new Set(products.map((product) => product.slug));
  for (const oldSlug of previousSlugs) {
    if (currentSlugs.has(oldSlug) || !slugIsSafe(oldSlug)) continue;
    const oldDirectory = path.resolve(OUTPUT_DIR, oldSlug);
    if (oldDirectory.startsWith(`${OUTPUT_DIR}${path.sep}`)) await rm(oldDirectory, { recursive: true, force: true });
  }

  for (const product of products) {
    const productDirectory = path.join(OUTPUT_DIR, product.slug);
    await mkdir(productDirectory, { recursive: true });
    await writeFile(path.join(productDirectory, "index.html"), productHtml(product), "utf8");
  }
  await writeFile(MANIFEST_PATH, JSON.stringify([...currentSlugs], null, 2) + "\n", "utf8");
  await writeFile(path.join(ROOT, "sitemap.xml"), sitemapXml(products), "utf8");
  console.log(`SEO statis dibuat untuk ${products.length} produk aktif; sitemap.xml diperbarui.`);
}

main().catch((error) => {
  console.error(`Pembuatan halaman SEO dibatalkan: ${error.message}`);
  process.exitCode = 1;
});

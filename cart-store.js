const UrbannCart = (() => {
  const storageKey = "urbann-attier-cart-v1";

  function getItems() {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function saveItems(items) {
    localStorage.setItem(storageKey, JSON.stringify(items));
    updateBadges();
  }

  function identity(item) {
    return [item.productId, item.mode, item.color, item.size].join("::");
  }

  function findProduct(productId) {
    return produk.find((item) => item.id === Number(productId));
  }

  function seriesCount(product, mode) {
    if (mode === "seri-warna") return product.varianWarna.length;
    if (mode === "seri-ukuran") return product.ukuran.length;
    return 1;
  }

  function normalizeQuantity(product, item, quantity) {
    const parsed = Math.max(1, Number.parseInt(quantity, 10) || 1);
    if (item.mode === "ecer") return parsed;
    const count = seriesCount(product, item.mode);
    return Math.max(count, Math.ceil(parsed / count) * count);
  }

  function inventoryRequirements(product, item) {
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { ok: false, message: "Jumlah pembelian harus berupa angka bulat minimal 1 pcs." };
    }

    const selectedVariant = product.varianWarna.find((variant) => variant.nama === item.color);
    const selectedSize = product.ukuran.find((size) => size === item.size);
    if (!selectedVariant || !selectedSize) {
      return { ok: false, message: `Pilihan warna atau ukuran untuk ${product.nama} sudah tidak tersedia. Muat ulang halaman dan pilih ulang.` };
    }

    if (item.mode === "ecer") {
      return { ok: true, requirements: [{ variant: selectedVariant, size: selectedSize, quantity }] };
    }

    if (item.mode === "seri-warna") {
      const count = product.varianWarna.length;
      if (!count || quantity % count !== 0) {
        return { ok: false, message: `Jumlah seri warna ${product.nama} harus kelipatan ${count} pcs.` };
      }
      const perVariant = quantity / count;
      return {
        ok: true,
        requirements: product.varianWarna.map((variant) => ({ variant, size: selectedSize, quantity: perVariant })),
      };
    }

    if (item.mode === "seri-ukuran") {
      const count = product.ukuran.length;
      if (!count || quantity % count !== 0) {
        return { ok: false, message: `Jumlah seri ukuran ${product.nama} harus kelipatan ${count} pcs.` };
      }
      const perSize = quantity / count;
      return {
        ok: true,
        requirements: product.ukuran.map((size) => ({ variant: selectedVariant, size, quantity: perSize })),
      };
    }

    return { ok: false, message: "Jenis pembelian tidak dikenali. Hapus produk dari keranjang lalu pilih ulang." };
  }

  function validateItems(items) {
    const requested = new Map();
    const details = new Map();

    for (const item of items) {
      const product = findProduct(item.productId);
      if (!product) return { ok: false, message: "Ada produk di keranjang yang sudah tidak tersedia. Hapus produk tersebut sebelum checkout." };
      const result = inventoryRequirements(product, item);
      if (!result.ok) return result;

      for (const requirement of result.requirements) {
        const key = `${product.id}::${requirement.variant.id}::${requirement.size}`;
        requested.set(key, (requested.get(key) || 0) + requirement.quantity);
        details.set(key, { product, ...requirement });
      }
    }

    for (const [key, quantity] of requested) {
      const { product, variant, size } = details.get(key);
      const stock = variant.stok?.[size];
      if (!Number.isInteger(stock) || stock < 0) {
        return { ok: false, message: `Stok ${product.nama}, warna ${variant.nama}, ukuran ${size} belum diisi. Silakan hubungi admin toko.` };
      }
      if (quantity > stock) {
        return { ok: false, message: `Stok ${product.nama}, warna ${variant.nama}, ukuran ${size} hanya ${stock} pcs, sedangkan keranjang membutuhkan ${quantity} pcs.` };
      }
    }

    return { ok: true, message: "Stok untuk semua produk di keranjang tersedia." };
  }

  function add(order) {
    const items = getItems();
    const product = findProduct(order.productId);
    if (!product) return { ok: false, message: "Produk tidak ditemukan." };

    const item = {
      productId: product.id,
      mode: order.mode,
      color: order.color,
      size: order.size,
      quantity: normalizeQuantity(product, order, order.quantity),
    };
    const existing = items.find((stored) => identity(stored) === identity(item));

    if (existing) {
      existing.quantity = normalizeQuantity(product, item, existing.quantity + item.quantity);
    } else {
      items.push(item);
    }

    const stockCheck = validateItems(items);
    if (!stockCheck.ok) return stockCheck;

    saveItems(items);
    return { ok: true, message: `${product.nama} ditambahkan ke keranjang.` };
  }

  function setQuantity(index, quantity) {
    const items = getItems();
    const item = items[index];
    if (!item) return;
    const product = findProduct(item.productId);
    if (!product) return;
    item.quantity = normalizeQuantity(product, item, quantity);
    const stockCheck = validateItems(items);
    if (!stockCheck.ok) return stockCheck;
    saveItems(items);
    return { ok: true, message: "Jumlah berhasil diperbarui." };
  }

  function remove(index) {
    const items = getItems();
    items.splice(index, 1);
    saveItems(items);
  }

  function clear() {
    saveItems([]);
  }

  function pricing(product, item) {
    let tier = "ecer";
    let unitPrice = product.harga;

    if (item.quantity >= (Number(product.grosirMinimal) || 20)) {
      tier = "grosir";
      unitPrice = product.hargaGrosir;
    } else if (item.mode !== "ecer") {
      tier = "serian";
      unitPrice = product.hargaSerian;
    }

    return {
      tier,
      label: tier === "grosir" ? "Grosir" : tier === "serian" ? "Serian" : "Ecer",
      unitPrice,
      subtotal: unitPrice == null ? null : unitPrice * item.quantity,
    };
  }

  function description(product, item) {
    if (item.mode === "seri-warna") {
      return `${item.quantity / product.varianWarna.length} seri warna · ukuran ${item.size} · ${product.varianWarna.map((color) => color.nama).join(", ")}`;
    }
    if (item.mode === "seri-ukuran") {
      return `${item.quantity / product.ukuran.length} seri ukuran · warna ${item.color} · ${product.ukuran.join(", ")}`;
    }
    return `Warna ${item.color} · ukuran ${item.size}`;
  }

  function formatRupiah(value) {
    return value == null ? "Segera tersedia" : `Rp ${value.toLocaleString("id-ID")}`;
  }

  function updateBadges() {
    const count = getItems().reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    document.querySelectorAll("[data-cart-count]").forEach((badge) => {
      const previousCount = badge.textContent;
      badge.textContent = String(count);
      badge.setAttribute("aria-label", `${count} barang di keranjang`);
      if (previousCount !== String(count)) {
        badge.classList.remove("is-bump");
        requestAnimationFrame(() => badge.classList.add("is-bump"));
        badge.addEventListener("animationend", () => badge.classList.remove("is-bump"), { once: true });
      }
    });
    document.querySelectorAll(".nav-cart").forEach((link) => {
      link.setAttribute("aria-label", `Buka keranjang, ${count} barang`);
    });
  }

  updateBadges();
  window.addEventListener("storage", updateBadges);

  return {
    getItems,
    add,
    setQuantity,
    remove,
    clear,
    validateItems,
    pricing,
    description,
    formatRupiah,
    findProduct,
    seriesCount,
    updateBadges,
  };
})();

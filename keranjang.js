const cartItemsContainer = document.getElementById("cartItems");
const cartSummaryContainer = document.getElementById("cartSummary");

function renderCart() {
  const items = UrbannCart.getItems();
  UrbannCart.updateBadges();
  const cartStatus = document.getElementById("cartActionStatus");

  if (items.length === 0) {
    if (cartStatus) {
      cartStatus.textContent = "";
      cartStatus.classList.remove("is-error");
    }
    cartItemsContainer.innerHTML = `
      <div class="cart-empty">
        <h2>Keranjang masih kosong</h2>
        <p>Pilih produk dan tambahkan ke keranjang untuk mulai berbelanja.</p>
        <a class="btn btn-primary" href="index.html#produk">Lihat koleksi</a>
      </div>
    `;
    cartSummaryContainer.innerHTML = "";
    return;
  }

  let total = 0;
  let allPricesAvailable = true;
  const stockCheck = UrbannCart.validateItems(items);

  cartItemsContainer.innerHTML = items
    .map((item, index) => {
      const product = UrbannCart.findProduct(item.productId);
      if (!product) return `
        <article class="cart-item">
          <div class="cart-item-info"><h2>Produk tidak tersedia</h2><p>Hapus item ini sebelum melanjutkan checkout.</p></div>
          <button class="cart-remove" type="button" data-cart-remove="${index}">Hapus</button>
        </article>`;
      const color = product.varianWarna.find((variant) => variant.nama === item.color);
      const price = UrbannCart.pricing(product, item);
      const safe = window.urbannEscapeHtml;
      const photo = window.urbannSafeImageUrl(color?.foto || product.varianWarna[0]?.foto || "");
      if (price.subtotal == null) allPricesAvailable = false;
      else total += price.subtotal;

      const step = item.mode === "ecer" ? 1 : UrbannCart.seriesCount(product, item.mode);
      const min = step;

      return `
        <article class="cart-item">
          <img class="cart-item-image" src="${safe(photo)}" alt="${safe(product.nama)} warna ${safe(item.color)}">
          <div class="cart-item-info">
            <h2>${safe(product.nama)}</h2>
            <p class="cart-item-variant">${safe(UrbannCart.description(product, item))}</p>
            <p>Skema harga: <strong>${price.label}</strong></p>
            <p>Harga per pcs: <strong>${UrbannCart.formatRupiah(price.unitPrice)}</strong></p>
            <label for="cartQuantity${index}">Jumlah (pcs)</label>
            <input
              id="cartQuantity${index}"
              class="cart-quantity"
              type="number"
              min="${min}"
              step="${step}"
              value="${item.quantity}"
              data-cart-quantity="${index}"
              inputmode="numeric"
            >
            <p class="cart-line-total">Subtotal: <strong>${UrbannCart.formatRupiah(price.subtotal)}</strong></p>
          </div>
          <button class="cart-remove" type="button" data-cart-remove="${index}">Hapus</button>
        </article>
      `;
    })
    .join("");

  cartSummaryContainer.innerHTML = `
    <h2>Ringkasan belanja</h2>
    <p><span>Total pcs</span><strong>${items.reduce((sum, item) => sum + item.quantity, 0)} pcs</strong></p>
    <p class="cart-grand-total"><span>Total sementara</span><strong>${allPricesAvailable ? UrbannCart.formatRupiah(total) : "Lengkapi harga produk"}</strong></p>
    ${allPricesAvailable && stockCheck.ok
      ? '<a class="btn btn-primary cart-checkout" href="checkout.html">Lanjut ke checkout</a>'
      : `<button class="btn btn-primary cart-checkout" type="button" disabled>${allPricesAvailable ? "Periksa stok keranjang" : "Lengkapi harga produk"}</button>
        <p class="cart-stock-error">${window.urbannEscapeHtml(stockCheck.message)}</p>`}
    <p>Ongkir dan pembayaran akan dihitung setelah layanan terkait terhubung.</p>
  `;

  cartItemsContainer.querySelectorAll("[data-cart-quantity]").forEach((input) => {
    input.addEventListener("change", () => {
      const result = UrbannCart.setQuantity(Number(input.dataset.cartQuantity), input.value);
      renderCart();
      if (cartStatus) {
        cartStatus.textContent = result?.ok ? "" : result?.message || "";
        cartStatus.classList.toggle("is-error", !result?.ok);
      }
    });
  });

  cartItemsContainer.querySelectorAll("[data-cart-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      UrbannCart.remove(Number(button.dataset.cartRemove));
      renderCart();
    });
  });
}

window.URBANN_PRODUCTS_READY.then(renderCart);
window.addEventListener("urbann:catalog-updated", renderCart);

const checkoutProducts = document.querySelector("#checkoutProducts");
const checkoutTotals = document.querySelector("#checkoutTotals");
const checkoutContent = document.querySelector("#checkoutContent");
const checkoutEmpty = document.querySelector("#checkoutEmpty");

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
    if (price.subtotal == null) allPricesAvailable = false;
    else subtotal += price.subtotal;

    return `
      <article class="checkout-product">
        <img src="${variant?.foto || product.varianWarna[0]?.foto || ""}" alt="${product.nama}, warna ${item.color}" />
        <div class="checkout-product-info">
          <h3>${product.nama}</h3>
          <p>${UrbannCart.description(product, item)}</p>
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
  document.querySelector("#checkoutGrandTotal").textContent = allPricesAvailable
    ? UrbannCart.formatRupiah(subtotal)
    : "Harga belum lengkap";
}

renderCheckout();

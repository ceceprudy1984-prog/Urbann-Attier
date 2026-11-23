(() => {
  const measurementId = "G-YT655LW0FP";
  if (!/^G-[A-Z0-9]+$/.test(measurementId)) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.append(script);

  window.urbannTrack = (eventName, parameters = {}) => {
    if (typeof eventName !== "string" || !/^[a-z][a-z0-9_]{0,39}$/.test(eventName)) return Promise.resolve(false);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (sent) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(sent);
      };
      const timeoutId = window.setTimeout(() => finish(false), 1200);
      window.gtag("event", eventName, {
        ...parameters,
        event_callback: () => finish(true),
        event_timeout: 1000,
      });
    });
  };

  const productMarkup = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map((element) => {
      try { return JSON.parse(element.textContent); } catch { return null; }
    })
    .find((data) => data?.["@type"] === "Product");
  if (productMarkup) {
    const offer = Array.isArray(productMarkup.offers) ? productMarkup.offers[0] : productMarkup.offers;
    const price = Number(offer?.price);
    const item = {
      item_id: String(productMarkup.sku || productMarkup.name),
      item_name: productMarkup.name,
      ...(productMarkup.category ? { item_category: productMarkup.category } : {}),
      ...(Number.isFinite(price) ? { price, quantity: 1 } : {}),
    };
    window.urbannStaticProductViewTracked = true;
    window.urbannTrack("view_item", {
      currency: offer?.priceCurrency || "IDR",
      ...(Number.isFinite(price) ? { value: price } : {}),
      items: [item],
    });
  }
})();

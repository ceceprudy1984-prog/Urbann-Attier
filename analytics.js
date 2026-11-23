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
    if (typeof eventName !== "string" || !/^[a-z][a-z0-9_]{0,39}$/.test(eventName)) return;
    window.gtag("event", eventName, parameters);
  };
})();

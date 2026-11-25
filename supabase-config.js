// Isi dengan Project URL dan Publishable key project `urbann attier store`.
// Publishable key memang digunakan di browser; jangan pernah menaruh secret/service_role key di sini.
window.URBANN_SUPABASE_CONFIG = {
  url: "https://gezqgavjxonrpovcbdhe.supabase.co",
  publishableKey: "sb_publishable_q2s7RbPJr4fnb6V0WyyQvA_9E-cMOXR",
};
if (window.location.pathname.endsWith("affiliate.html") && window.supabase?.createClient && !window.urbannSupabaseClient) {
  window.urbannSupabaseClient = window.supabase.createClient(
    window.URBANN_SUPABASE_CONFIG.url,
    window.URBANN_SUPABASE_CONFIG.publishableKey,
  );
}

// Simpan atribusi referral sebagai token acak yang divalidasi server saat checkout.
(() => {
  const attributionKey = "urbannAffiliateAttributionV1";
  const visitorKey = "urbannAffiliateVisitorV1";
  const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  window.urbannGetAffiliateAttributionToken = async () => {
    try { await window.urbannAffiliateReferralPromise; } catch { /* continue without attribution */ }
    try {
      const saved = JSON.parse(localStorage.getItem(attributionKey) || "null");
      return saved?.token && validUuid.test(saved.token) && Date.now() < Date.parse(saved.expiresAt)
        ? saved.token : null;
    } catch { return null; }
  };

  const code = new URLSearchParams(window.location.search).get("ref")?.trim().toUpperCase();
  if (!code || !/^[A-Z0-9-]{5,24}$/.test(code)) return;
  try {
    localStorage.removeItem(attributionKey);
    let visitorToken = localStorage.getItem(visitorKey);
    if (!validUuid.test(visitorToken || "")) {
      visitorToken = crypto.randomUUID();
      localStorage.setItem(visitorKey, visitorToken);
    }
    const initialize = () => {
      const client = window.urbannSupabaseClient;
      if (!client) return;
      window.urbannAffiliateReferralPromise = client.rpc("record_affiliate_referral", { p_code: code, p_visitor_token: visitorToken })
        .then(({ data, error }) => {
          if (error || !data?.valid || !validUuid.test(data.token || "")) return;
          localStorage.setItem(attributionKey, JSON.stringify({ token: data.token, expiresAt: data.expires_at }));
          return data.token;
        }).catch(() => null);
    };
    if (window.urbannSupabaseClient) initialize();
    else window.addEventListener("urbann:supabase-ready", initialize, { once: true });
  } catch { /* Storage may be disabled; storefront continues normally. */ }
})();

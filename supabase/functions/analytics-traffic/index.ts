import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const encoder = new TextEncoder();
const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function base64UrlEncode(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodePrivateKey(value: string) {
  const base64 = value.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function createGoogleAccessToken(serviceAccount: { client_email?: string; private_key?: string }) {
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("Kredensial Google Analytics belum lengkap di Supabase.");
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: GA_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const unsignedToken = `${header}.${payload}`;
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    decodePrivateKey(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, encoder.encode(unsignedToken));
  const assertion = `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`;
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.access_token !== "string") {
    throw new Error("Google belum memberikan akses ke laporan Analytics. Periksa service account dan izinnya.");
  }
  return result.access_token as string;
}

async function runAnalyticsReport(accessToken: string, propertyId: string, days: number, bySource: boolean) {
  const requestBody = {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    ...(bySource ? {
      dimensions: [
        { name: "sessionSource" },
        { name: "sessionMedium" },
        { name: "sessionCampaignName" },
      ],
    } : {}),
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "transactions" },
      { name: "purchaseRevenue" },
    ],
    ...(bySource ? { orderBys: [{ metric: { metricName: "sessions" }, desc: true }] } : {}),
    limit: 100,
  };
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const apiMessage = typeof result?.error?.message === "string" ? result.error.message : "Analytics Data API menolak permintaan.";
    console.error("GA4 report request failed:", response.status, apiMessage);
    throw new Error("Laporan GA4 belum dapat diambil. Pastikan Analytics Data API aktif dan akun layanan memiliki akses Viewer ke properti GA4.");
  }
  return result;
}

function metric(row: Record<string, unknown>, index: number) {
  return Number((row.metricValues as Array<{ value?: string }> | undefined)?.[index]?.value || 0);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Metode permintaan tidak didukung." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: "Konfigurasi Supabase server belum lengkap." }, 500);

  try {
    const authorization = request.headers.get("Authorization") || "";
    const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return jsonResponse({ error: "Masuk sebagai admin terlebih dahulu." }, 401);

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userResult, error: userError } = await serviceClient.auth.getUser(accessToken);
    if (userError || !userResult.user) return jsonResponse({ error: "Sesi admin tidak valid. Masuk kembali." }, 401);
    const { data: admin, error: adminError } = await serviceClient.from("admin_users")
      .select("is_active").eq("user_id", userResult.user.id).maybeSingle();
    if (adminError) throw adminError;
    if (!admin?.is_active) return jsonResponse({ error: "Akses admin aktif diperlukan." }, 403);

    const body = await request.json().catch(() => ({}));
    const days = [7, 30, 90].includes(Number(body?.days)) ? Number(body.days) : 30;
    const propertyId = Deno.env.get("GOOGLE_ANALYTICS_PROPERTY_ID") || "";
    const serviceAccountRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") || "";
    if (!propertyId || !serviceAccountRaw) {
      return jsonResponse({
        error: "Koneksi laporan GA4 belum disiapkan. Tambahkan GOOGLE_ANALYTICS_PROPERTY_ID dan GOOGLE_SERVICE_ACCOUNT_JSON pada Secrets Edge Function Supabase.",
      }, 503);
    }

    let serviceAccount: { client_email?: string; private_key?: string };
    try {
      serviceAccount = JSON.parse(serviceAccountRaw);
    } catch {
      return jsonResponse({ error: "GOOGLE_SERVICE_ACCOUNT_JSON bukan JSON service account yang valid." }, 503);
    }
    const googleToken = await createGoogleAccessToken(serviceAccount);
    const [totalsReport, sourcesReport] = await Promise.all([
      runAnalyticsReport(googleToken, propertyId, days, false),
      runAnalyticsReport(googleToken, propertyId, days, true),
    ]);
    const totalsRow = totalsReport?.rows?.[0] || { metricValues: [] };
    const sources = (sourcesReport?.rows || []).map((row: Record<string, unknown>) => {
      const dimensions = row.dimensionValues as Array<{ value?: string }> | undefined;
      return {
        source: dimensions?.[0]?.value || "(not set)",
        medium: dimensions?.[1]?.value || "(not set)",
        campaign: dimensions?.[2]?.value || "(not set)",
        sessions: metric(row, 0),
        users: metric(row, 1),
        transactions: metric(row, 2),
        revenue: metric(row, 3),
      };
    });

    return jsonResponse({
      days,
      totals: {
        sessions: metric(totalsRow, 0),
        users: metric(totalsRow, 1),
        transactions: metric(totalsRow, 2),
        revenue: metric(totalsRow, 3),
      },
      sources,
    });
  } catch (error) {
    console.error("analytics-traffic failed:", error);
    const message = error instanceof Error ? error.message : "Laporan Analytics belum dapat dimuat.";
    return jsonResponse({ error: message }, 500);
  }
});

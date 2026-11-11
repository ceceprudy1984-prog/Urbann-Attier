const RAJAONGKIR_BASE_URL = "https://rajaongkir.komerce.id/api/v1";
const ALLOWED_COURIERS = ["jnt", "jne", "sicepat", "spx", "lion"] as const;
const ORIGIN_POSTAL_CODE = "40914";
const ORIGIN_VILLAGE = "cingcin";
const ORIGIN_DISTRICT = "soreang";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

type RajaOngkirLocation = {
  id: number;
  label?: string;
  province_name?: string;
  city_name?: string;
  district_name?: string;
  subdistrict_name?: string;
  zip_code?: string;
};

let cachedOriginId: number | null = null;
let originCacheExpiresAt = 0;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("id-ID");
}

async function callRajaOngkir(path: string, init: RequestInit = {}) {
  const apiKey = Deno.env.get("RAJAONGKIR_API_KEY");
  if (!apiKey) throw new Error("Kunci API ongkir belum dipasang di Supabase.");

  const response = await fetch(`${RAJAONGKIR_BASE_URL}${path}`, {
    ...init,
    headers: {
      key: apiKey,
      ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...init.headers,
    },
  });

  const result = await response.json().catch(() => null);
  if (!response.ok || result?.meta?.status === "error") {
    const message = typeof result?.meta?.message === "string"
      ? result.meta.message
      : "Layanan cek ongkir sedang tidak dapat dihubungi.";
    throw new Error(message);
  }
  return result;
}

async function getOriginId(): Promise<number> {
  if (cachedOriginId && Date.now() < originCacheExpiresAt) return cachedOriginId;

  const params = new URLSearchParams({ search: ORIGIN_POSTAL_CODE, limit: "20", offset: "0" });
  const response = await callRajaOngkir(`/destination/domestic-destination?${params}`);
  const locations: RajaOngkirLocation[] = Array.isArray(response?.data) ? response.data : [];
  const match = locations.find((location) =>
    String(location.zip_code ?? "").trim() === ORIGIN_POSTAL_CODE
    && normalize(location.subdistrict_name).includes(ORIGIN_VILLAGE)
    && normalize(location.district_name).includes(ORIGIN_DISTRICT)
  );

  if (!match || !Number.isInteger(Number(match.id))) {
    throw new Error("Lokasi asal Cingcin, Soreang, kode pos 40914 belum cocok dengan data RajaOngkir.");
  }

  cachedOriginId = Number(match.id);
  originCacheExpiresAt = Date.now() + 6 * 60 * 60 * 1000;
  return cachedOriginId;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Metode permintaan tidak didukung." }, 405);

  try {
    const body = await request.json();
    const action = String(body?.action ?? "");

    if (action === "search-destination") {
      const query = String(body?.query ?? "").trim();
      if (query.length < 3 || query.length > 80) {
        return jsonResponse({ error: "Masukkan nama wilayah atau kode pos minimal 3 karakter." }, 400);
      }

      const params = new URLSearchParams({ search: query, limit: "10", offset: "0" });
      const response = await callRajaOngkir(`/destination/domestic-destination?${params}`);
      const locations: RajaOngkirLocation[] = Array.isArray(response?.data) ? response.data : [];
      return jsonResponse({
        locations: locations
          .filter((location) => Number.isInteger(Number(location.id)))
          .map((location) => ({
            id: Number(location.id),
            label: String(location.label ?? ""),
            province: String(location.province_name ?? ""),
            city: String(location.city_name ?? ""),
            district: String(location.district_name ?? ""),
            subdistrict: String(location.subdistrict_name ?? ""),
            postalCode: String(location.zip_code ?? ""),
          })),
      });
    }

    if (action === "rates") {
      const destinationId = Number(body?.destinationId);
      const weightGrams = Number(body?.weightGrams);
      if (!Number.isInteger(destinationId) || destinationId <= 0) {
        return jsonResponse({ error: "Pilih wilayah tujuan dari hasil pencarian terlebih dahulu." }, 400);
      }
      if (!Number.isInteger(weightGrams) || weightGrams < 1 || weightGrams > 200000) {
        return jsonResponse({ error: "Berat paket tidak valid." }, 400);
      }

      const originId = await getOriginId();
      const params = new URLSearchParams({
        origin: String(originId),
        destination: String(destinationId),
        weight: String(weightGrams),
        courier: ALLOWED_COURIERS.join(":"),
        price: "lowest",
      });
      const response = await callRajaOngkir("/calculate/domestic-cost", {
        method: "POST",
        body: params.toString(),
      });
      const rates = Array.isArray(response?.data) ? response.data : [];
      return jsonResponse({
        rates: rates.map((rate: Record<string, unknown>) => ({
          courier: String(rate.name ?? ""),
          code: String(rate.code ?? ""),
          service: String(rate.service ?? ""),
          description: String(rate.description ?? ""),
          cost: Number(rate.cost),
          estimate: String(rate.etd ?? ""),
        })).filter((rate: { cost: number }) => Number.isFinite(rate.cost) && rate.cost >= 0),
        weightGrams,
      });
    }

    return jsonResponse({ error: "Jenis permintaan ongkir tidak dikenal." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Terjadi kesalahan saat memeriksa ongkir.";
    return jsonResponse({ error: message }, 502);
  }
});

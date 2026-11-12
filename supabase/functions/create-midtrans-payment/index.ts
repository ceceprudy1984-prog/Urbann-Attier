import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const RAJAONGKIR_BASE_URL = "https://rajaongkir.komerce.id/api/v1";
const ORIGIN_POSTAL_CODE = "40914";
const ORIGIN_VILLAGE = "cingcin";
const ORIGIN_DISTRICT = "soreang";
const ALLOWED_COURIERS = new Set(["jnt", "jne", "sicepat", "spx", "lion"]);

type Location = {
  id: number;
  subdistrict_name?: string;
  district_name?: string;
  zip_code?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Pembayaran belum dapat disiapkan.";
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("id-ID");
}

async function callRajaOngkir(path: string, init: RequestInit = {}) {
  const apiKey = Deno.env.get("RAJAONGKIR_API_KEY");
  if (!apiKey) throw new Error("Kunci API ongkir belum tersedia di Supabase Secrets.");
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
    throw new Error(typeof result?.meta?.message === "string"
      ? result.meta.message
      : "Tarif pengiriman tidak dapat diverifikasi ulang.");
  }
  return result;
}

async function findShippingRate(destinationId: number, weightGrams: number, courierCode: string, serviceName: string) {
  if (!ALLOWED_COURIERS.has(courierCode)) throw new Error("Ekspedisi yang dipilih tidak didukung.");

  const originParams = new URLSearchParams({ search: ORIGIN_POSTAL_CODE, limit: "20", offset: "0" });
  const originResult = await callRajaOngkir(`/destination/domestic-destination?${originParams}`);
  const originLocations: Location[] = Array.isArray(originResult?.data) ? originResult.data : [];
  const origin = originLocations.find((location) =>
    String(location.zip_code ?? "").trim() === ORIGIN_POSTAL_CODE
    && normalize(location.subdistrict_name).includes(ORIGIN_VILLAGE)
    && normalize(location.district_name).includes(ORIGIN_DISTRICT)
  );
  if (!origin || !Number.isInteger(Number(origin.id))) {
    throw new Error("Lokasi asal toko belum dapat dicocokkan dengan RajaOngkir.");
  }

  const params = new URLSearchParams({
    origin: String(origin.id),
    destination: String(destinationId),
    weight: String(weightGrams),
    courier: [...ALLOWED_COURIERS].join(":"),
    price: "lowest",
  });
  const result = await callRajaOngkir("/calculate/domestic-cost", { method: "POST", body: params.toString() });
  const rates = Array.isArray(result?.data) ? result.data : [];
  const match = rates.find((rate: Record<string, unknown>) =>
    normalize(rate.code) === courierCode && normalize(rate.service) === normalize(serviceName)
  );
  const fee = Number(match?.cost);
  if (!match || !Number.isSafeInteger(fee) || fee < 0) {
    throw new Error("Tarif layanan berubah atau tidak tersedia. Silakan cek ongkir kembali.");
  }
  return {
    code: courierCode,
    courier: String(match.name ?? courierCode),
    service: String(match.service ?? serviceName),
    description: String(match.description ?? ""),
    cost: fee,
    estimate: String(match.etd ?? ""),
  };
}

function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Konfigurasi server Supabase belum tersedia.");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function requestSnapToken(order: Record<string, unknown>, paymentId: string, client: ReturnType<typeof getServiceClient>) {
  const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");
  const clientKey = Deno.env.get("MIDTRANS_CLIENT_KEY");
  if (!serverKey || !clientKey) throw new Error("Kunci Midtrans Sandbox belum lengkap di Supabase Secrets.");

  const orderId = String(order.order_number);
  const existingToken = typeof order.payment_reference === "string" ? order.payment_reference : "";
  if (existingToken) return { token: existingToken, clientKey };

  const { data: items, error: itemsError } = await client
    .from("order_items")
    .select("product_name,color_name,size_name,quantity,line_total")
    .eq("order_id", String(order.order_id));
  if (itemsError) throw itemsError;

  const itemDetails = (items ?? []).map((item) => ({
    id: `${String(item.product_name).slice(0, 30)}-${String(item.color_name).slice(0, 12)}-${String(item.size_name).slice(0, 8)}`.replace(/[^a-zA-Z0-9_-]/g, ""),
    price: Math.floor(Number(item.line_total) / Number(item.quantity)),
    quantity: Number(item.quantity),
    name: `${item.product_name} (${item.color_name}, ${item.size_name})`.slice(0, 50),
  }));
  const packagingFee = Number(order.packaging_fee ?? 0);
  const shippingFee = Number(order.shipping_fee ?? 0);
  if (packagingFee > 0) itemDetails.push({ id: "packaging", price: packagingFee, quantity: 1, name: "Biaya pengemasan" });
  if (shippingFee > 0) itemDetails.push({ id: "shipping", price: shippingFee, quantity: 1, name: `Ongkir ${String(order.shipping_provider ?? "")}`.slice(0, 50) });

  const customer = order.customer as Record<string, unknown>;
  const grossAmount = Number(order.amount);
  if (!Number.isSafeInteger(grossAmount) || grossAmount < 1) throw new Error("Total pembayaran pesanan tidak valid.");

  const response = await fetch("https://app.sandbox.midtrans.com/snap/v1/transactions", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${serverKey}:`)}`,
    },
    body: JSON.stringify({
      transaction_details: { order_id: orderId, gross_amount: grossAmount },
      item_details: itemDetails,
      customer_details: {
        first_name: String(customer.name ?? "Pelanggan").slice(0, 50),
        phone: String(customer.phone ?? "").slice(0, 20),
        shipping_address: {
          first_name: String(customer.name ?? "Pelanggan").slice(0, 50),
          phone: String(customer.phone ?? "").slice(0, 20),
          address: String(customer.address ?? "").slice(0, 200),
          city: String(customer.city ?? "").slice(0, 50),
          postal_code: String(customer.postal_code ?? "").slice(0, 10),
          country_code: "IDN",
        },
      },
      expiry: { unit: "minute", duration: 30 },
    }),
  });
  const responseBody = await response.text();
  let snap: Record<string, unknown> | null = null;
  try {
    snap = JSON.parse(responseBody) as Record<string, unknown>;
  } catch {
    // Preserve a short response excerpt below to help diagnose non-JSON errors.
  }
  if (!response.ok || typeof snap?.token !== "string") {
    const messages = Array.isArray(snap?.error_messages)
      ? snap.error_messages.filter((message): message is string => typeof message === "string")
      : [];
    const details = messages.join("; ") || responseBody.slice(0, 400).trim() || "Tidak ada rincian dari Midtrans.";
    console.error("Midtrans Snap token request rejected:", response.status, details);
    throw new Error(`Midtrans menolak pembuatan sesi (HTTP ${response.status}): ${details}`);
  }

  const { error: saveError } = await client.rpc("save_midtrans_snap_token", {
    p_payment_id: paymentId,
    p_snap_token: snap.token,
    p_redirect_url: String(snap.redirect_url ?? ""),
  });
  if (saveError) throw new Error("Sesi pembayaran dibuat, tetapi belum berhasil disimpan. Hubungi admin sebelum mencoba lagi.");
  return { token: snap.token, clientKey };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Metode permintaan tidak didukung." }, 405);

  try {
    const body = await request.json();
    const checkoutToken = String(body?.checkoutToken ?? "");
    const customer = body?.customer;
    const items = body?.items;
    const shipping = body?.shipping;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutToken)) {
      return jsonResponse({ error: "Sesi checkout tidak valid. Muat ulang halaman." }, 400);
    }
    if (!customer || typeof customer !== "object" || !Array.isArray(items) || !items.length || items.length > 30) {
      return jsonResponse({ error: "Data pesanan belum lengkap." }, 400);
    }
    const destinationId = Number(shipping?.destinationId);
    const weightGrams = Number(shipping?.weightGrams);
    const courierCode = normalize(shipping?.code);
    const serviceName = String(shipping?.service ?? "").trim();
    const quantityTotal = items.reduce((sum: number, item: Record<string, unknown>) => {
      const quantity = Number(item?.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw new Error("Jumlah produk tidak valid.");
      return sum + quantity;
    }, 0);
    const expectedWeight = quantityTotal * 500;
    if (!Number.isInteger(destinationId) || destinationId <= 0 || !Number.isInteger(weightGrams) || weightGrams < 1 || weightGrams > 200000 || !serviceName) {
      return jsonResponse({ error: "Pilih wilayah dan layanan pengiriman yang valid." }, 400);
    }
    if (weightGrams !== expectedWeight) {
      return jsonResponse({ error: "Berat paket berubah. Hitung ulang ongkir sebelum membayar." }, 400);
    }

    const verifiedRate = await findShippingRate(destinationId, weightGrams, courierCode, serviceName);
    const client = getServiceClient();
    const { data: result, error } = await client.rpc("prepare_midtrans_order", {
      p_checkout_token: checkoutToken,
      p_customer: customer,
      p_items: items,
      p_shipping: {
        destination_id: destinationId,
        weight_grams: weightGrams,
        provider_code: verifiedRate.code,
        service: verifiedRate.service,
        fee: verifiedRate.cost,
      },
    });
    if (error) throw error;
    if (!result?.payment_id || !result?.order_id || !result?.order_number) {
      throw new Error("Pesanan belum mendapat data pembayaran dari database.");
    }

    const { data: order, error: orderError } = await client
      .from("orders")
      .select("id,order_number,customer_name,customer_phone,address_line,city,postal_code,packaging_fee,shipping_fee,shipping_provider,total_amount,status,payment_status")
      .eq("id", result.order_id)
      .single();
    if (orderError) throw orderError;
    if (order.status === "cancelled" || order.payment_status === "paid") {
      throw new Error("Pesanan ini sudah tidak dapat dibayar. Perbarui checkout dan buat pesanan baru.");
    }

    const preparedOrder: Record<string, unknown> = {
      ...result,
      amount: Number(order.total_amount),
      packaging_fee: Number(order.packaging_fee),
      shipping_fee: Number(order.shipping_fee),
      shipping_provider: order.shipping_provider,
      customer: {
        name: order.customer_name,
        phone: order.customer_phone,
        address: order.address_line,
        city: order.city,
        postal_code: order.postal_code,
      },
    };

    const { data: payment, error: paymentError } = await client
      .from("payments")
      .select("payment_reference")
      .eq("id", result.payment_id)
      .single();
    if (paymentError) throw paymentError;
    preparedOrder.payment_reference = payment?.payment_reference;

    const { token, clientKey } = await requestSnapToken(preparedOrder, String(result.payment_id), client);
    return jsonResponse({
      orderNumber: result.order_number,
      snapToken: token,
      clientKey,
      amount: preparedOrder.amount,
      formattedAmount: new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(preparedOrder.amount)),
    });
  } catch (error) {
    const message = getErrorMessage(error);
    console.error("create-midtrans-payment failed:", message);
    return jsonResponse({ error: message }, 400);
  }
});

import { createClient } from "npm:@supabase/supabase-js@2";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index++) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

async function sha512(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-512", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const body = await request.json();
    const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serverKey || !url || !serviceKey) throw new Error("Server payment configuration is missing.");

    const orderId = String(body?.order_id ?? "");
    const statusCode = String(body?.status_code ?? "");
    const grossAmount = String(body?.gross_amount ?? "");
    const signature = String(body?.signature_key ?? "").toLowerCase();
    if (!orderId || !statusCode || !grossAmount || !/^[a-f0-9]{128}$/.test(signature)) {
      return jsonResponse({ error: "Invalid notification payload." }, 400);
    }

    const expected = await sha512(`${orderId}${statusCode}${grossAmount}${serverKey}`);
    if (!constantTimeEqual(signature, expected)) return jsonResponse({ error: "Invalid signature." }, 401);

    const amount = Number(grossAmount);
    if (!Number.isFinite(amount) || amount < 0) return jsonResponse({ error: "Invalid amount." }, 400);

    const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.rpc("apply_midtrans_notification", {
      p_order_number: orderId,
      p_transaction_id: String(body?.transaction_id ?? ""),
      p_transaction_status: String(body?.transaction_status ?? ""),
      p_fraud_status: String(body?.fraud_status ?? ""),
      p_payment_type: String(body?.payment_type ?? ""),
      p_gross_amount: amount,
    });
    if (error) throw error;
    return jsonResponse({ status: "ok", result: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notification processing failed.";
    return jsonResponse({ error: message }, 500);
  }
});

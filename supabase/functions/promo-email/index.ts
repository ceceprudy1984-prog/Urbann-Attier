import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, list-unsubscribe-post",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

type PromoRecipient = {
  user_id: string;
  email: string;
  full_name: string;
  unsubscribe_token: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] || char);
}

function unsubscribePage(message: string, actionUrl = "") {
  const confirmation = actionUrl
    ? `<form method="post" action="${escapeHtml(actionUrl)}"><button style="padding:12px 18px;border:0;border-radius:8px;background:#74132b;color:white;font-weight:bold;cursor:pointer">Berhenti berlangganan</button></form>`
    : "";
  return new Response(`<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="referrer" content="no-referrer"><title>Preferensi email Urbann Attier</title><body style="margin:0;padding:40px 16px;background:#f5f2ed;color:#201d18;font:16px Arial,sans-serif"><main style="max-width:560px;margin:auto;padding:32px;border:1px solid #e8e1d6;border-radius:16px;background:#fffdfa"><h1 style="font-family:Georgia,serif">Urbann Attier</h1><p>${escapeHtml(message)}</p>${confirmation}</main></body></html>`, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

async function setUnsubscribed(serviceClient: ReturnType<typeof createClient>, token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return false;
  const { data, error } = await serviceClient.rpc("unsubscribe_customer_email_marketing", { p_token: token });
  if (error) throw error;
  return Boolean(data);
}

async function requireAdmin(request: Request, serviceClient: ReturnType<typeof createClient>) {
  const authorization = request.headers.get("Authorization") || "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) throw new Error("Masuk sebagai admin terlebih dahulu.");
  const { data: userResult, error: userError } = await serviceClient.auth.getUser(accessToken);
  if (userError || !userResult.user) throw new Error("Sesi admin tidak valid. Masuk kembali.");
  const { data: admin, error: adminError } = await serviceClient.from("admin_users")
    .select("is_active").eq("user_id", userResult.user.id).maybeSingle();
  if (adminError) throw adminError;
  if (!admin?.is_active) throw new Error("Akses admin aktif diperlukan.");
  return userResult.user;
}

async function loadRecipients(serviceClient: ReturnType<typeof createClient>) {
  const { data, error } = await serviceClient.rpc("service_promo_email_recipients");
  if (error) throw error;
  return (data || []) as PromoRecipient[];
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(request.url);
  const actionFromUrl = url.searchParams.get("action");
  const serviceUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceUrl || !serviceKey) return jsonResponse({ error: "Konfigurasi Supabase server belum lengkap." }, 500);
  const serviceClient = createClient(serviceUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  if (actionFromUrl === "unsubscribe" && ["GET", "POST"].includes(request.method)) {
    let token = url.searchParams.get("token") || "";
    if (request.method === "POST") {
      const form = new URLSearchParams(await request.text());
      token ||= form.get("token") || "";
    }
    try {
      if (request.method === "POST") {
        await setUnsubscribed(serviceClient, token);
        if (request.headers.get("List-Unsubscribe-Post") === "List-Unsubscribe=One-Click") {
          return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
        }
        return unsubscribePage("Anda sudah berhenti menerima email promosi Urbann Attier. Anda tetap dapat berbelanja seperti biasa.");
      }
      const actionUrl = `${url.origin}${url.pathname}?action=unsubscribe&token=${encodeURIComponent(token)}`;
      return unsubscribePage("Anda menerima informasi promo karena pernah menyetujuinya. Klik tombol berikut untuk berhenti berlangganan.", actionUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tautan berhenti berlangganan belum dapat diproses.";
      return unsubscribePage(message);
    }
  }

  if (request.method !== "POST") return jsonResponse({ error: "Metode permintaan tidak didukung." }, 405);
  try {
    const user = await requireAdmin(request, serviceClient);
    const body = await request.json();
    const action = String(body?.action || "");

    if (action === "preview") {
      const recipients = await loadRecipients(serviceClient);
      return jsonResponse({ recipientCount: recipients.length, maximum: 1000 });
    }

    if (action === "history") {
      const { data, error } = await serviceClient.from("promo_email_campaigns")
        .select("id, subject, recipient_count, sent_count, failed_count, status, created_at, completed_at")
        .order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return jsonResponse({ campaigns: data || [] });
    }

    if (action !== "send") return jsonResponse({ error: "Aksi kampanye tidak dikenali." }, 400);
    const subject = String(body?.subject || "").trim();
    const message = String(body?.message || "").trim();
    if (subject.length < 1 || subject.length > 150) return jsonResponse({ error: "Subjek harus berisi 1–150 karakter." }, 400);
    if (message.length < 1 || message.length > 5000) return jsonResponse({ error: "Isi email harus berisi 1–5.000 karakter." }, 400);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("PROMO_FROM_EMAIL");
    if (!resendKey || !from) return jsonResponse({ error: "Pasang RESEND_API_KEY dan PROMO_FROM_EMAIL pada Edge Function Secrets terlebih dahulu." }, 503);

    const recipients = await loadRecipients(serviceClient);
    if (!recipients.length) return jsonResponse({ error: "Belum ada member terverifikasi yang menyetujui email promo." }, 409);
    if (recipients.length > 1000) return jsonResponse({ error: "Jumlah penerima melebihi batas aman 1.000. Kirim dalam kampanye terpisah setelah batas ditingkatkan." }, 413);

    const { data: campaign, error: insertError } = await serviceClient.from("promo_email_campaigns").insert({
      created_by: user.id,
      subject,
      message,
      recipient_count: recipients.length,
      status: "sending",
    }).select("id").single();
    if (insertError) throw insertError;

    const endpoint = `${serviceUrl.replace(/\/$/, "")}/functions/v1/promo-email`;
    const messageHtml = escapeHtml(message).replace(/\r?\n/g, "<br>");
    let sentCount = 0;
    let failedCount = 0;
    const failureMessages: string[] = [];

    for (let offset = 0; offset < recipients.length; offset += 100) {
      const batch = recipients.slice(offset, offset + 100);
      const emails = batch.map((recipient) => {
        const unsubscribeUrl = `${endpoint}?action=unsubscribe&token=${encodeURIComponent(recipient.unsubscribe_token)}`;
        const greeting = recipient.full_name ? `Halo ${escapeHtml(recipient.full_name)},` : "Halo,";
        const textMessage = message;
        return {
          from,
          to: [recipient.email],
          subject,
          html: `<div style="max-width:640px;margin:0 auto;padding:28px 20px;color:#201d18;font:16px/1.7 Arial,sans-serif"><p style="color:#a78043;font:700 14px Georgia,serif">Urbann Attier</p><p>${greeting}</p><p>${messageHtml}</p><hr style="border:0;border-top:1px solid #e8e1d6;margin:28px 0"><p style="color:#77716a;font-size:12px">Anda menerima email ini karena menyetujui informasi promo melalui akun Urbann Attier. <a href="${unsubscribeUrl}">Berhenti berlangganan</a>.</p></div>`,
          text: `${recipient.full_name ? `Halo ${recipient.full_name},\n\n` : "Halo,\n\n"}${textMessage}\n\nAnda menerima email ini karena menyetujui informasi promo melalui akun Urbann Attier. Berhenti berlangganan: ${unsubscribeUrl}`,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        };
      });

      try {
        const response = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `urbann-promo-${campaign.id}-${offset}`,
          },
          body: JSON.stringify(emails),
        });
        const result = await response.json().catch(() => ({}));
        const ids = Array.isArray(result?.data) ? result.data : [];
        if (!response.ok || ids.length !== batch.length) {
          failedCount += batch.length;
          failureMessages.push(String(result?.message || result?.error || `Batch ${Math.floor(offset / 100) + 1} ditolak oleh layanan email.`).slice(0, 220));
        } else {
          sentCount += ids.length;
        }
      } catch (error) {
        failedCount += batch.length;
        failureMessages.push(error instanceof Error ? error.message.slice(0, 220) : "Gangguan jaringan saat menghubungi layanan email.");
      }
    }

    const status = sentCount === recipients.length ? "sent" : sentCount > 0 ? "partial" : "failed";
    const { error: updateError } = await serviceClient.from("promo_email_campaigns").update({
      sent_count: sentCount,
      failed_count: failedCount,
      status,
      completed_at: new Date().toISOString(),
    }).eq("id", campaign.id);
    if (updateError) console.error("Catatan hasil kampanye gagal diperbarui:", updateError.message);

    return jsonResponse({
      campaignId: campaign.id,
      recipientCount: recipients.length,
      sentCount,
      failedCount,
      status,
      ...(failureMessages.length ? { detail: failureMessages.slice(0, 3).join("; ") } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kampanye email belum berhasil diproses.";
    const status = /masuk sebagai admin|sesi admin|akses admin/i.test(message) ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});

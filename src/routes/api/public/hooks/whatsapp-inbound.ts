import { createFileRoute } from "@tanstack/react-router";

// Configure this as the webhook URL in Evolution API for each clinic's
// instance (Settings -> Webhook, event "MESSAGES_UPSERT"), including the
// shared secret as a query param since custom webhook headers aren't
// configurable in every Evolution API version:
//
//   https://your-app.com/api/public/hooks/whatsapp-inbound?token=<WHATSAPP_WEBHOOK_TOKEN>
//
// WHATSAPP_WEBHOOK_TOKEN is a separate secret from CRON_SECRET / the
// Evolution API key itself — set it as its own server env var.
export const Route = createFileRoute("/api/public/hooks/whatsapp-inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const provided = url.searchParams.get("token") ?? request.headers.get("x-webhook-token");
        const expected = process.env.WHATSAPP_WEBHOOK_TOKEN;
        if (!expected || !provided || provided !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const payload = (await request.json().catch(() => null)) as EvolutionWebhookPayload | null;
        if (!payload) {
          return new Response(JSON.stringify({ ok: true, skipped: "invalid payload" }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        // Only interested in actual incoming text messages, not delivery
        // receipts, status updates, or messages the clinic itself sent
        // (fromMe) — replying to those would make the bot talk to itself.
        if (payload.event !== "messages.upsert" || payload.data?.key?.fromMe) {
          return new Response(JSON.stringify({ ok: true, skipped: "not an inbound message" }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const text =
          payload.data?.message?.conversation ??
          payload.data?.message?.extendedTextMessage?.text ??
          null;
        const remoteJid = payload.data?.key?.remoteJid ?? "";
        const phone = remoteJid.split("@")[0];
        if (!text || !phone) {
          return new Response(JSON.stringify({ ok: true, skipped: "no text/phone" }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: connection } = await supabaseAdmin
          .from("whatsapp_connections")
          .select("clinic_id, instance_name")
          .eq("instance_name", payload.instance ?? "")
          .maybeSingle();
        if (!connection) {
          return new Response(JSON.stringify({ ok: true, skipped: "unknown instance" }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const { handleInboundWhatsAppMessage } = await import("@/lib/whatsapp-bot.server");
        const { reply } = await handleInboundWhatsAppMessage({
          clinicId: connection.clinic_id,
          phone,
          contactName: payload.data?.pushName ?? null,
          text,
        });

        if (reply) {
          const { sendWhatsAppMessage } = await import("@/lib/whatsapp.server");
          const sent = await sendWhatsAppMessage(connection.instance_name!, phone, reply);
          if (!sent.ok) console.error("[whatsapp-bot] reply send failed:", sent.error);
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

// Evolution API (Baileys-based) "messages.upsert" webhook shape. Kept
// intentionally loose/optional-everywhere: webhook payloads vary a bit
// across Evolution API versions and message types, and this endpoint
// should degrade to a no-op rather than throw on an unexpected shape.
interface EvolutionWebhookPayload {
  event?: string;
  instance?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    message?: { conversation?: string; extendedTextMessage?: { text?: string } };
    pushName?: string;
  };
}

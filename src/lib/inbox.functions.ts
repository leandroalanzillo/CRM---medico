import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().min(1),
});

/**
 * Sends a WhatsApp reply from a staff member inside the CRM inbox.
 * Runs server-side because it needs the Evolution API key (never exposed
 * to the browser). Also flips bot_active off — once a human replies, the
 * scripted bot should not talk over them in the same conversation.
 */
export const sendStaffReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // RLS-scoped read: only succeeds if the conversation is in the caller's clinic.
    const { data: conv, error } = await supabase
      .from("conversations")
      .select("id, clinic_id, phone")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!conv) throw new Error("Conversa não encontrada.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: connection } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("instance_name, status")
      .eq("clinic_id", conv.clinic_id)
      .maybeSingle();
    if (!connection?.instance_name || connection.status !== "connected") {
      throw new Error(
        "WhatsApp não está conectado — conecte em Atendimentos antes de responder por aqui.",
      );
    }

    const { sendWhatsAppMessage } = await import("@/lib/whatsapp.server");
    const sent = await sendWhatsAppMessage(connection.instance_name, conv.phone, data.text);
    if (!sent.ok) throw new Error(sent.error ?? "Falha ao enviar mensagem.");

    await supabase.from("messages").insert({
      clinic_id: conv.clinic_id,
      conversation_id: conv.id,
      direction: "outbound",
      body: data.text,
      sent_by: userId,
    });
    await supabase
      .from("conversations")
      .update({
        last_message: data.text,
        last_message_at: new Date().toISOString(),
        bot_active: false,
      })
      .eq("id", conv.id);

    return { ok: true };
  });

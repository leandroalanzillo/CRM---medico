import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Server-only. Runs the scripted lead-intake flow for inbound WhatsApp
// messages. Deliberately does NOT book appointments directly — it collects
// intent + contact info and creates/updates a lead in the CRM pipeline for
// a human to confirm and schedule. Booking automatically from unattended
// chat input risks double-booking and no-shows nobody actually agreed to.

type BotState = {
  step:
    "greeting" | "ask_name" | "ask_reason" | "ask_procedure" | "ask_period" | "done" | "handed_off";
  collected: {
    name?: string;
    reason?: "agendar" | "ja_paciente" | "outro";
    procedure?: string;
    period?: string;
  };
};

const GREETING = "Olá! 👋 Aqui é o assistente virtual da clínica. Qual é o seu nome completo?";

const REASON_MENU =
  "Prazer, {name}! Como posso ajudar?\n1 - Agendar uma consulta\n2 - Já sou paciente, outro assunto\n3 - Outro assunto\n\nResponda com o número da opção.";

const ASK_PROCEDURE =
  'Show! Qual profissional ou tipo de consulta você procura? (pode ser só o nome ou a especialidade — se não souber, pode escrever "não sei")';

const ASK_PERIOD =
  "Perfeito. Qual período costuma ser melhor pra você — manhã, tarde ou qualquer horário?";

const DONE_MESSAGE =
  "Obrigado, {name}! Já registrei seu pedido — nossa equipe entra em contato em breve para confirmar o melhor horário. 🙂";

const HANDOFF_MESSAGE = "Perfeito, já vou te transferir para nossa equipe, um momento. 🙂";

/**
 * Processes one inbound message for a given clinic/phone, returns the reply
 * to send back (or null if a human should take over silently) and persists
 * conversation + bot state. Caller (the webhook route) is responsible for
 * actually sending the reply via Evolution API.
 */
export async function handleInboundWhatsAppMessage(params: {
  clinicId: string;
  phone: string;
  contactName: string | null;
  text: string;
}): Promise<{ reply: string | null; conversationId: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Find or create the conversation for this phone number.
  const { data: existing } = await supabaseAdmin
    .from("conversations")
    .select("id, bot_state, bot_active, patient_id")
    .eq("clinic_id", params.clinicId)
    .eq("phone", params.phone)
    .maybeSingle();

  let conversationId = existing?.id;
  let state: BotState = (existing?.bot_state as BotState | null) ?? {
    step: "greeting",
    collected: {},
  };
  const botActive = existing?.bot_active ?? true;

  if (!conversationId) {
    const { data: created } = await supabaseAdmin
      .from("conversations")
      .insert({
        clinic_id: params.clinicId,
        phone: params.phone,
        contact_name: params.contactName,
        last_message: params.text,
        last_message_at: new Date().toISOString(),
        unread_count: 1,
        bot_state: state,
      })
      .select("id")
      .single();
    conversationId = created?.id;
  } else {
    await supabaseAdmin
      .from("conversations")
      .update({
        last_message: params.text,
        last_message_at: new Date().toISOString(),
        unread_count: (existing ? 1 : 0) + 1,
      })
      .eq("id", conversationId);
  }
  if (!conversationId) throw new Error("Não foi possível abrir a conversa.");

  await supabaseAdmin.from("messages").insert({
    clinic_id: params.clinicId,
    conversation_id: conversationId,
    direction: "inbound",
    body: params.text,
  });

  // A human already took over this conversation from the CRM inbox — the
  // bot goes quiet so it never talks over a staff member mid-conversation.
  if (!botActive) return { reply: null, conversationId };

  const input = params.text.trim();
  let reply: string;

  switch (state.step) {
    case "greeting": {
      reply = GREETING;
      state = { step: "ask_name", collected: {} };
      break;
    }
    case "ask_name": {
      state.collected.name = input;
      reply = REASON_MENU.replace("{name}", input.split(" ")[0]);
      state.step = "ask_reason";
      break;
    }
    case "ask_reason": {
      const choice = input.replace(/\D/g, "");
      if (choice === "1") {
        state.collected.reason = "agendar";
        reply = ASK_PROCEDURE;
        state.step = "ask_procedure";
      } else if (choice === "2") {
        state.collected.reason = "ja_paciente";
        reply = HANDOFF_MESSAGE;
        state.step = "handed_off";
      } else {
        state.collected.reason = "outro";
        reply = HANDOFF_MESSAGE;
        state.step = "handed_off";
      }
      break;
    }
    case "ask_procedure": {
      state.collected.procedure = input;
      reply = ASK_PERIOD;
      state.step = "ask_period";
      break;
    }
    case "ask_period": {
      state.collected.period = input;
      reply = DONE_MESSAGE.replace("{name}", state.collected.name?.split(" ")[0] ?? "");
      state.step = "done";
      await finalizeLead(supabaseAdmin, params.clinicId, params.phone, conversationId, state);
      break;
    }
    default: {
      // "done" or "handed_off" — flow finished, stay quiet and let a human
      // pick up the conversation (bot_active gets flipped off from the
      // inbox once staff actually replies).
      return { reply: null, conversationId };
    }
  }

  await supabaseAdmin
    .from("conversations")
    .update({
      bot_state: state,
      bot_active: state.step !== "handed_off" && state.step !== "done" ? true : false,
    })
    .eq("id", conversationId);

  await supabaseAdmin.from("messages").insert({
    clinic_id: params.clinicId,
    conversation_id: conversationId,
    direction: "outbound",
    body: reply,
  });

  return { reply, conversationId };
}

async function finalizeLead(
  supabaseAdmin: SupabaseClient<Database>,
  clinicId: string,
  phone: string,
  conversationId: string,
  state: BotState,
) {
  // Reuse an existing patient with this phone if there is one, instead of
  // creating a duplicate — same matching rule used by the Planilha import.
  const { data: existingPatient } = await supabaseAdmin
    .from("patients")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("phone", phone)
    .maybeSingle();

  let patientId = existingPatient?.id;
  if (!patientId) {
    const notesParts = [
      state.collected.procedure ? `Procedimento desejado: ${state.collected.procedure}` : null,
      state.collected.period ? `Período preferido: ${state.collected.period}` : null,
    ].filter(Boolean);
    const { data: created } = await supabaseAdmin
      .from("patients")
      .insert({
        clinic_id: clinicId,
        full_name: state.collected.name || "Lead via WhatsApp",
        phone,
        whatsapp: phone,
        kind: "lead",
        source: "WhatsApp Bot",
        notes: notesParts.join(" · ") || null,
      })
      .select("id")
      .single();
    patientId = created?.id;
  }
  if (!patientId) return;

  await supabaseAdmin
    .from("conversations")
    .update({ patient_id: patientId })
    .eq("id", conversationId);

  // First pipeline stage (lowest position) — same rule patient-dialog.tsx
  // uses when a receptionist creates a lead manually.
  const { data: existingCard } = await supabaseAdmin
    .from("pipeline_cards")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .maybeSingle();
  if (!existingCard) {
    const { data: stage } = await supabaseAdmin
      .from("pipeline_stages")
      .select("id")
      .eq("clinic_id", clinicId)
      .order("position")
      .limit(1)
      .maybeSingle();
    if (stage) {
      await supabaseAdmin
        .from("pipeline_cards")
        .insert({ clinic_id: clinicId, patient_id: patientId, stage_id: stage.id });
    }
  }

  await supabaseAdmin.from("patient_timeline").insert({
    clinic_id: clinicId,
    patient_id: patientId,
    event_type: "whatsapp_bot",
    description: "Lead captado automaticamente pelo assistente de WhatsApp.",
  });

  // Notify staff — same pattern as the other automations.
  const { data: staff } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("clinic_id", clinicId)
    .in("role", ["admin", "manager", "receptionist"]);
  const rows = (staff ?? []).map((s) => ({
    clinic_id: clinicId,
    recipient_id: s.user_id,
    type: "system" as const,
    title: "Novo lead via WhatsApp",
    body: `${state.collected.name ?? "Alguém"} entrou em contato pelo WhatsApp querendo agendar${
      state.collected.procedure ? ` (${state.collected.procedure})` : ""
    }. Confira em Pacientes.`,
    link: "/pacientes",
  }));
  if (rows.length) await supabaseAdmin.from("app_notifications").insert(rows);
}

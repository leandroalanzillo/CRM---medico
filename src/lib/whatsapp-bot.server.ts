import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Server-only. Runs an LLM-driven lead-intake flow for inbound WhatsApp
// messages, using Claude with tool calling to extract structured data
// (name, motivo, procedimento, período) from a natural conversation
// instead of a rigid "responda 1, 2 ou 3" menu. The model decides when it
// has enough info and either creates a lead or hands off to a human —
// it deliberately never books an appointment or confirms a time itself
// (no agenda access, and unattended chat shouldn't be able to double-book
// a slot nobody actually confirmed).

const ANTHROPIC_MODEL = process.env.WHATSAPP_BOT_MODEL || "claude-sonnet-5";
const MAX_TURNS = 24; // safety cap: force a human handoff instead of looping forever

const SYSTEM_PROMPT = `Você é o assistente virtual de atendimento via WhatsApp de uma clínica médica. Converse como uma recepcionista bem treinada: cordial, natural, direto — nunca como um menu de robô ("responda 1, 2 ou 3").

Seu objetivo, na ordem que fizer sentido conforme a conversa:
1. Descobrir o nome da pessoa.
2. Entender o motivo do contato.
3. Se for para agendar consulta: perguntar (uma coisa de cada vez, sem parecer formulário) qual profissional ou tipo de procedimento ela procura, e qual período costuma ser melhor (manhã, tarde, dia da semana).

Regras importantes:
- Nunca prometa, confirme ou sugira um horário específico de consulta — você não tem acesso à agenda real. Apenas registre o pedido; a equipe confirma depois.
- Se a pessoa já for paciente com uma dúvida específica, tiver uma reclamação, ou pedir para falar com um atendente humano, chame a ferramenta finish_conversation com create_lead=false imediatamente, sem tentar resolver sozinho.
- Se a pessoa mencionar qualquer emergência médica ou risco à vida, oriente-a a ligar para o SAMU (192) ou ir ao pronto-socorro mais próximo, e chame finish_conversation imediatamente.
- Sempre que souber algo novo (nome, motivo, procedimento, período), chame record_lead_info — pode chamar várias vezes ao longo da conversa, só com os campos que mudaram.
- Assim que tiver nome + motivo de agendamento claro (mesmo que a pessoa não saiba dizer o procedimento/período exatos), chame finish_conversation com create_lead=true — não prolongue a conversa além do necessário.
- Mensagens curtas, como se fosse WhatsApp de verdade — não escreva parágrafos longos.`;

const TOOLS = [
  {
    name: "record_lead_info",
    description:
      "Registra ou atualiza dados coletados do paciente durante a conversa. Chame sempre que aprender algo novo, mesmo que parcial — não precisa esperar ter tudo.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Nome completo da pessoa" },
        reason: {
          type: "string",
          enum: ["agendar_consulta", "ja_e_paciente", "duvida_outro"],
          description: "Motivo do contato",
        },
        procedure_or_professional: {
          type: "string",
          description: "Procedimento ou profissional desejado, se mencionado",
        },
        preferred_period: {
          type: "string",
          description: "Período ou dia preferido para a consulta, se mencionado",
        },
      },
    },
  },
  {
    name: "finish_conversation",
    description:
      "Encerra a etapa automática da conversa. Chame quando tiver informação suficiente para criar um lead (nome + motivo de agendamento), OU quando a pessoa precisar de um humano (já é paciente, dúvida específica, reclamação, emergência, ou pediu para falar com atendente).",
    input_schema: {
      type: "object" as const,
      properties: {
        create_lead: {
          type: "boolean",
          description:
            "true se deve criar/atualizar o lead no CRM com os dados coletados até agora",
        },
        handoff_reason: {
          type: "string",
          description: "Breve motivo do encerramento, para a equipe interna entender o contexto",
        },
      },
      required: ["create_lead", "handoff_reason"],
    },
  },
];

type LeadInfo = {
  name?: string;
  reason?: "agendar_consulta" | "ja_e_paciente" | "duvida_outro";
  procedure_or_professional?: string;
  preferred_period?: string;
};

type BotState = {
  collected: LeadInfo;
  turns: number;
};

interface AnthropicContentBlock {
  type: "text" | "tool_use";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

async function callClaude(
  history: { role: "user" | "assistant"; content: string }[],
): Promise<{ text: string; toolCalls: { name: string; input: Record<string, unknown> }[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      text: "Desculpe, o assistente automático está temporariamente indisponível. Nossa equipe vai te responder em breve.",
      toolCalls: [
        {
          name: "finish_conversation",
          input: { create_lead: false, handoff_reason: "ANTHROPIC_API_KEY ausente" },
        },
      ],
    };
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
      tools: TOOLS,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[whatsapp-bot] Anthropic API error [${res.status}]:`, body.slice(0, 500));
    return {
      text: "Desculpe, tive um problema técnico agora. Nossa equipe vai te responder em breve.",
      toolCalls: [
        {
          name: "finish_conversation",
          input: { create_lead: false, handoff_reason: "Erro na API do assistente" },
        },
      ],
    };
  }

  const data = (await res.json()) as { content: AnthropicContentBlock[] };
  const text = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
  const toolCalls = data.content
    .filter((b) => b.type === "tool_use")
    .map((b) => ({ name: b.name ?? "", input: b.input ?? {} }));

  return { text, toolCalls };
}

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

  const { data: existing } = await supabaseAdmin
    .from("conversations")
    .select("id, bot_state, bot_active")
    .eq("clinic_id", params.clinicId)
    .eq("phone", params.phone)
    .maybeSingle();

  let conversationId = existing?.id;
  const state: BotState = (existing?.bot_state as unknown as BotState | null) ?? {
    collected: {},
    turns: 0,
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
        bot_state:
          state as unknown as Database["public"]["Tables"]["conversations"]["Insert"]["bot_state"],
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
        unread_count: 1,
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

  // A human already took over — the bot goes quiet so it never talks over
  // a staff member mid-conversation.
  if (!botActive) return { reply: null, conversationId };

  state.turns += 1;
  if (state.turns > MAX_TURNS) {
    await handOff(
      supabaseAdmin,
      params.clinicId,
      conversationId,
      "Conversa longa demais para o fluxo automático",
    );
    return { reply: null, conversationId };
  }

  const { data: pastMessages } = await supabaseAdmin
    .from("messages")
    .select("direction, body")
    .eq("conversation_id", conversationId)
    .order("created_at")
    .limit(40);

  const history = (pastMessages ?? []).map((m) => ({
    role: (m.direction === "outbound" ? "assistant" : "user") as "user" | "assistant",
    content: m.body,
  }));

  const { text, toolCalls } = await callClaude(history);

  let shouldFinish = false;
  let createLead = false;

  for (const call of toolCalls) {
    if (call.name === "record_lead_info") {
      const input = call.input as LeadInfo;
      state.collected = {
        ...state.collected,
        ...Object.fromEntries(Object.entries(input).filter(([, v]) => v)),
      };
    } else if (call.name === "finish_conversation") {
      shouldFinish = true;
      createLead = !!call.input.create_lead;
    }
  }

  await supabaseAdmin
    .from("conversations")
    .update({
      bot_state:
        state as unknown as Database["public"]["Tables"]["conversations"]["Update"]["bot_state"],
    })
    .eq("id", conversationId);

  const reply =
    text ||
    (shouldFinish
      ? "Obrigado pelo contato! Nossa equipe já vai te responder."
      : "Certo, um momento.");

  await supabaseAdmin.from("messages").insert({
    clinic_id: params.clinicId,
    conversation_id: conversationId,
    direction: "outbound",
    body: reply,
  });

  if (shouldFinish) {
    if (createLead) {
      await finalizeLead(
        supabaseAdmin,
        params.clinicId,
        params.phone,
        conversationId,
        state.collected,
        params.contactName,
      );
    }
    await handOff(
      supabaseAdmin,
      params.clinicId,
      conversationId,
      createLead ? "Lead criado pelo assistente" : "Encaminhado pelo assistente",
    );
  }

  return { reply, conversationId };
}

async function handOff(
  supabaseAdmin: SupabaseClient<Database>,
  clinicId: string,
  conversationId: string,
  reason: string,
) {
  await supabaseAdmin.from("conversations").update({ bot_active: false }).eq("id", conversationId);

  const { data: staff } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("clinic_id", clinicId)
    .in("role", ["admin", "manager", "receptionist"]);
  const rows = (staff ?? []).map((s) => ({
    clinic_id: clinicId,
    recipient_id: s.user_id,
    type: "system" as const,
    title: "Conversa de WhatsApp aguardando atendimento",
    body: reason,
    link: "/atendimentos",
  }));
  if (rows.length) await supabaseAdmin.from("app_notifications").insert(rows);
}

async function finalizeLead(
  supabaseAdmin: SupabaseClient<Database>,
  clinicId: string,
  phone: string,
  conversationId: string,
  collected: LeadInfo,
  contactName: string | null,
) {
  const { data: existingPatient } = await supabaseAdmin
    .from("patients")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("phone", phone)
    .maybeSingle();

  let patientId = existingPatient?.id;
  if (!patientId) {
    const notesParts = [
      collected.procedure_or_professional
        ? `Procedimento desejado: ${collected.procedure_or_professional}`
        : null,
      collected.preferred_period ? `Período preferido: ${collected.preferred_period}` : null,
    ].filter(Boolean);
    const { data: created } = await supabaseAdmin
      .from("patients")
      .insert({
        clinic_id: clinicId,
        full_name: collected.name || contactName || "Lead via WhatsApp",
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
    description: "Lead captado automaticamente pelo assistente de WhatsApp (Claude).",
  });

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
    body: `${collected.name ?? "Alguém"} entrou em contato pelo WhatsApp querendo agendar${
      collected.procedure_or_professional ? ` (${collected.procedure_or_professional})` : ""
    }. Confira em Pacientes.`,
    link: "/pacientes",
  }));
  if (rows.length) await supabaseAdmin.from("app_notifications").insert(rows);
}

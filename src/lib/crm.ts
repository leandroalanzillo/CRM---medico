import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export async function addTimeline(params: {
  clinicId: string;
  patientId: string;
  eventType: string;
  description: string;
  metadata?: Json;
  actorId?: string | null;
}) {
  await supabase.from("patient_timeline").insert({
    clinic_id: params.clinicId,
    patient_id: params.patientId,
    event_type: params.eventType,
    description: params.description,
    metadata: params.metadata ?? null,
    actor_id: params.actorId ?? null,
  });
}

export async function addAudit(params: {
  clinicId: string;
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  changes?: Json;
}) {
  await supabase.from("audit_logs").insert({
    clinic_id: params.clinicId,
    user_id: params.userId ?? null,
    action: params.action,
    resource_type: params.resourceType,
    resource_id: params.resourceId ?? null,
    changes: params.changes ?? null,
  });
}

// Append an entry to a negotiation's change history.
export async function addNegotiationHistory(params: {
  clinicId: string;
  negotiationId: string;
  description: string;
  actorId?: string | null;
  metadata?: Json;
}) {
  await supabase.from("negotiation_history").insert({
    clinic_id: params.clinicId,
    negotiation_id: params.negotiationId,
    description: params.description,
    actor_id: params.actorId ?? null,
    metadata: params.metadata ?? null,
  });
}

// Automatically move a patient's pipeline card to a stage identified by slug.
export async function moveCardToStageBySlug(params: {
  clinicId: string;
  patientId: string;
  slug: string;
  reason: string;
  actorId?: string | null;
  auto?: boolean;
}) {
  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("id, name")
    .eq("clinic_id", params.clinicId)
    .eq("slug", params.slug)
    .maybeSingle();
  if (!stage) return;

  const { data: card } = await supabase
    .from("pipeline_cards")
    .select("id, stage_id")
    .eq("clinic_id", params.clinicId)
    .eq("patient_id", params.patientId)
    .maybeSingle();
  if (!card || card.stage_id === stage.id) return;

  const { data: fromStage } = await supabase
    .from("pipeline_stages")
    .select("name")
    .eq("id", card.stage_id)
    .maybeSingle();

  await supabase.from("pipeline_cards").update({ stage_id: stage.id }).eq("id", card.id);

  await addTimeline({
    clinicId: params.clinicId,
    patientId: params.patientId,
    eventType: "kanban_move",
    description: `${params.auto ? "Card movido automaticamente" : "Card movido"} de "${
      fromStage?.name ?? "—"
    }" para "${stage.name}" — ${params.reason}`,
    actorId: params.actorId,
  });
}

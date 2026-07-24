// Server-only. Uses the service-role client (like notifications.server.ts,
// whatsapp.server.ts) because app_notifications intentionally has no
// INSERT policy for regular authenticated users — only the server can
// create a bell notification, so nobody can forge one addressed to
// someone else. All automation logic that writes there has to live here.

/**
 * Fired when an appointment's status becomes "finished". Sets
 * produced_value on the appointment (from the procedure's default price,
 * if not already set some other way) and creates the matching income
 * transaction in Financeiro — so "produção por profissional" and the
 * Financeiro dashboards actually have data instead of always reading 0,
 * and nobody has to remember to log the receita by hand.
 *
 * Safe to call more than once for the same appointment: it checks for an
 * existing transaction first and skips creating a duplicate.
 */
export async function autoCreateRevenueOnFinish(appointment: {
  id: string;
  clinic_id: string;
  patient_id: string | null;
  professional_id: string | null;
  procedure_id: string | null;
  produced_value: number | null;
  starts_at: string;
}): Promise<{ created: boolean; reason?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Already has a value (set manually, or this ran before) — nothing to do.
  if (appointment.produced_value && appointment.produced_value > 0) {
    return { created: false, reason: "Este agendamento já tinha um valor de produção definido." };
  }

  let amount = 0;
  if (appointment.procedure_id) {
    const { data: proc } = await supabaseAdmin
      .from("procedures")
      .select("default_price")
      .eq("id", appointment.procedure_id)
      .maybeSingle();
    amount = Number(proc?.default_price ?? 0);
  }
  if (!appointment.procedure_id) {
    return {
      created: false,
      reason:
        "Nenhum procedimento selecionado nesse agendamento — sem procedimento não há preço para gerar a receita automaticamente.",
    };
  }
  if (amount <= 0) {
    return {
      created: false,
      reason:
        "O procedimento selecionado tem preço R$ 0,00 cadastrado — ajuste o preço em Configurações → Procedimentos, ou lance a receita manualmente em Financeiro.",
    };
  }

  await supabaseAdmin
    .from("appointments")
    .update({ produced_value: amount })
    .eq("id", appointment.id);

  // Don't double-create if a transaction already links to this appointment
  // (e.g. status flipped finished -> confirmed -> finished again).
  const { count } = await supabaseAdmin
    .from("financial_transactions")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", appointment.patient_id ?? "")
    .eq("professional_id", appointment.professional_id ?? "")
    .eq("due_date", appointment.starts_at.slice(0, 10))
    .eq("amount", amount);
  if ((count ?? 0) > 0) {
    return {
      created: false,
      reason: "Já existe um lançamento equivalente para este paciente/dia/valor.",
    };
  }

  const { data: category } = await supabaseAdmin
    .from("financial_categories")
    .select("id")
    .eq("clinic_id", appointment.clinic_id)
    .eq("type", "income")
    .ilike("name", "%consulta%")
    .maybeSingle();

  let patientName = "";
  if (appointment.patient_id) {
    const { data: patient } = await supabaseAdmin
      .from("patients")
      .select("full_name")
      .eq("id", appointment.patient_id)
      .maybeSingle();
    patientName = patient?.full_name ?? "";
  }

  await supabaseAdmin.from("financial_transactions").insert({
    clinic_id: appointment.clinic_id,
    type: "income",
    category_id: category?.id ?? null,
    description: patientName ? `Consulta - ${patientName}` : "Consulta finalizada",
    amount,
    due_date: appointment.starts_at.slice(0, 10),
    status: "pending",
    patient_id: appointment.patient_id,
    professional_id: appointment.professional_id,
    notes: "Criado automaticamente ao finalizar o atendimento.",
  });

  return { created: true };
}

/**
 * Fired when an appointment's status becomes "cancelled". Looks for
 * anyone on the waitlist for the same professional and creates an in-app
 * notification for admins/managers/receptionists so they can reach out
 * about the freed-up slot.
 */
export async function notifyWaitlistOnCancellation(appointment: {
  clinic_id: string;
  professional_id: string | null;
  procedure_id: string | null;
  starts_at: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let query = supabaseAdmin
    .from("waitlist")
    .select("id, patient_id, patient:patients(full_name)")
    .eq("clinic_id", appointment.clinic_id)
    .eq("status", "waiting");

  if (appointment.professional_id) query = query.eq("professional_id", appointment.professional_id);
  const { data: matches } = await query;
  if (!matches || matches.length === 0) return;

  const { data: admins } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("clinic_id", appointment.clinic_id)
    .in("role", ["admin", "manager", "receptionist"]);

  const names = matches
    .map((m) => (m as unknown as { patient: { full_name: string } | null }).patient?.full_name)
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");

  const notifications = (admins ?? []).map((a) => ({
    clinic_id: appointment.clinic_id,
    recipient_id: a.user_id,
    type: "system" as const,
    title: "Vaga aberta na agenda",
    body: `Uma consulta foi cancelada e há ${matches.length} paciente(s) na lista de espera (${names}${matches.length > 3 ? "..." : ""}). Confira a Lista de espera na Agenda.`,
    link: "/agenda",
  }));
  if (notifications.length) await supabaseAdmin.from("app_notifications").insert(notifications);
}

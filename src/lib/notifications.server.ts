// Server-only notification layer.
// Sends appointment notifications via Meta WhatsApp Cloud API and (when an
// email domain is configured) via Lovable Emails. Every attempt is logged to
// public.notification_log. Never import this file from client code.

type Channel = "email" | "whatsapp";
type RecipientType = "patient" | "professional";
type Kind = "confirmation" | "reminder";

interface LogRow {
  clinic_id: string;
  appointment_id: string | null;
  channel: Channel;
  recipient_type: RecipientType;
  recipient: string | null;
  kind: Kind;
  status: "sent" | "failed" | "skipped";
  error?: string | null;
}

const WA_API_VERSION = "v21.0";

function onlyDigits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo",
  }).format(d);
}
function fmtTime(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  }).format(d);
}

/** Send a WhatsApp text message via Meta Cloud API. */
async function sendWhatsApp(phone: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return { ok: false, error: "WhatsApp não configurado (secrets ausentes)" };
  }
  const to = onlyDigits(phone);
  if (!to) return { ok: false, error: "Telefone inválido" };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${WA_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { preview_url: false, body },
        }),
      },
    );
    if (!res.ok) {
      const errBody = await res.text();
      return { ok: false, error: `WhatsApp [${res.status}]: ${errBody.slice(0, 400)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `WhatsApp: ${(e as Error).message}` };
  }
}

/**
 * Send an email through Lovable Emails when the template helper has been
 * scaffolded (requires a verified email domain). Until then it skips cleanly.
 */
async function sendEmail(
  _to: string,
  _subject: string,
  _text: string,
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  // Email delivery activates once an email domain is configured for the project.
  // Until then, attempts are recorded as "skipped" so the flow stays intact.
  return { ok: false, skipped: true, error: "E-mail ainda não ativado (domínio pendente)" };
}

interface DispatchOptions {
  emailPatient?: boolean;
  whatsappPatient?: boolean;
  notifyProfessional?: boolean;
}

interface ApptRecord {
  id: string;
  clinic_id: string;
  starts_at: string;
  clinic: { name: string | null } | null;
  patient: { full_name: string | null; email: string | null; whatsapp: string | null; phone: string | null } | null;
  professional: { name: string | null; email: string | null; phone: string | null } | null;
}

function buildMessages(appt: ApptRecord, kind: Kind) {
  const start = new Date(appt.starts_at);
  const date = fmtDate(start);
  const time = fmtTime(start);
  const clinicName = appt.clinic?.name ?? "sua clínica";
  const patientName = appt.patient?.full_name ?? "paciente";
  const proName = appt.professional?.name ?? "profissional";

  if (kind === "confirmation") {
    const subject = `Consulta agendada — ${date} às ${time}`;
    const patient = `Olá ${patientName}! Sua consulta em ${clinicName} foi agendada para ${date} às ${time} com ${proName}. Em caso de dúvidas, entre em contato conosco.`;
    return { subject, patient, professional: "" };
  }
  const subject = `Lembrete: consulta amanhã (${date}) às ${time}`;
  const patient = `Olá ${patientName}! Lembrete: você tem consulta amanhã, ${date}, às ${time}, com ${proName} em ${clinicName}. Até breve!`;
  const professional = `Olá ${proName}! Lembrete: você tem atendimento amanhã, ${date}, às ${time}, com o paciente ${patientName}.`;
  return { subject, patient, professional };
}

/**
 * Fetch the appointment and send the requested notifications, logging each
 * attempt. Uses the service-role client (works from server fns and cron).
 */
export async function dispatchAppointmentNotifications(
  appointmentId: string,
  kind: Kind,
  opts: DispatchOptions,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: appt } = await supabaseAdmin
    .from("appointments")
    .select(
      "id, clinic_id, starts_at, clinic:clinics(name), patient:patients(full_name, email, whatsapp, phone), professional:professionals(name, email, phone)",
    )
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appt) return { sent: 0, failed: 0, skipped: 0 };

  const record = appt as unknown as ApptRecord;
  const msg = buildMessages(record, kind);
  const logs: LogRow[] = [];
  const counters = { sent: 0, failed: 0, skipped: 0 };

  const track = (row: LogRow) => {
    logs.push(row);
    counters[row.status] += 1;
  };

  // ---- Patient: WhatsApp ----
  if (opts.whatsappPatient) {
    const phone = record.patient?.whatsapp || record.patient?.phone || null;
    if (!phone) {
      track({ clinic_id: record.clinic_id, appointment_id: record.id, channel: "whatsapp", recipient_type: "patient", recipient: null, kind, status: "skipped", error: "Paciente sem WhatsApp" });
    } else {
      const r = await sendWhatsApp(phone, msg.patient);
      track({ clinic_id: record.clinic_id, appointment_id: record.id, channel: "whatsapp", recipient_type: "patient", recipient: phone, kind, status: r.ok ? "sent" : "failed", error: r.error });
    }
  }

  // ---- Patient: Email ----
  if (opts.emailPatient) {
    const email = record.patient?.email || null;
    if (!email) {
      track({ clinic_id: record.clinic_id, appointment_id: record.id, channel: "email", recipient_type: "patient", recipient: null, kind, status: "skipped", error: "Paciente sem e-mail" });
    } else {
      const r = await sendEmail(email, msg.subject, msg.patient);
      track({ clinic_id: record.clinic_id, appointment_id: record.id, channel: "email", recipient_type: "patient", recipient: email, kind, status: r.ok ? "sent" : r.skipped ? "skipped" : "failed", error: r.error });
    }
  }

  // ---- Professional (collaborator) ----
  if (opts.notifyProfessional && msg.professional) {
    const proPhone = record.professional?.phone || null;
    if (proPhone) {
      const r = await sendWhatsApp(proPhone, msg.professional);
      track({ clinic_id: record.clinic_id, appointment_id: record.id, channel: "whatsapp", recipient_type: "professional", recipient: proPhone, kind, status: r.ok ? "sent" : "failed", error: r.error });
    }
    const proEmail = record.professional?.email || null;
    if (proEmail) {
      const r = await sendEmail(proEmail, msg.subject, msg.professional);
      track({ clinic_id: record.clinic_id, appointment_id: record.id, channel: "email", recipient_type: "professional", recipient: proEmail, kind, status: r.ok ? "sent" : r.skipped ? "skipped" : "failed", error: r.error });
    }
  }

  if (logs.length) {
    await supabaseAdmin.from("notification_log").insert(logs);
  }
  return counters;
}

// Server-only notification layer.
// Sends appointment notifications via Meta WhatsApp Cloud API and (when an
// email domain is configured) via Lovable Emails. Every attempt is logged to
// public.notification_log. Never import this file from client code.

type Channel = "email" | "whatsapp" | "sms";
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
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(d);
}
function fmtTime(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
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

/**
 * Send an SMS via Twilio's REST API. Any Twilio-compatible provider works
 * the same way (same auth scheme); swap the URL/credentials if using
 * another vendor. Disabled by default at the clinic level
 * (notification_settings.notify_patient_sms) since SMS has a real per-message
 * cost, unlike WhatsApp/email.
 */
async function sendSMS(phone: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    return { ok: false, error: "SMS não configurado (credenciais do provedor ausentes)" };
  }
  const to = onlyDigits(phone);
  if (!to) return { ok: false, error: "Telefone inválido" };

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: `+55${to}`, From: from, Body: body }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      return { ok: false, error: `SMS [${res.status}]: ${errBody.slice(0, 400)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `SMS: ${(e as Error).message}` };
  }
}

interface DispatchOptions {
  emailPatient?: boolean;
  whatsappPatient?: boolean;
  smsPatient?: boolean;
  notifyProfessional?: boolean;
}

interface ApptRecord {
  id: string;
  clinic_id: string;
  starts_at: string;
  clinic: { name: string | null } | null;
  patient: {
    full_name: string | null;
    email: string | null;
    whatsapp: string | null;
    phone: string | null;
  } | null;
  professional: {
    name: string | null;
    email: string | null;
    phone: string | null;
    user_id: string | null;
  } | null;
}

/** Insert a bell notification for one user. Best-effort: never throws. */
async function notifyInApp(row: {
  clinicId: string;
  recipientId: string;
  type:
    | "appointment_reminder"
    | "appointment_confirmed"
    | "appointment_cancelled"
    | "appointment_no_show"
    | "negotiation_update"
    | "system";
  title: string;
  body?: string;
  link?: string;
  appointmentId?: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("app_notifications").insert({
    clinic_id: row.clinicId,
    recipient_id: row.recipientId,
    type: row.type,
    title: row.title,
    body: row.body ?? null,
    link: row.link ?? null,
    appointment_id: row.appointmentId ?? null,
  });
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
      "id, clinic_id, starts_at, clinic:clinics(name), patient:patients(full_name, email, whatsapp, phone), professional:professionals(name, email, phone, user_id)",
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
      track({
        clinic_id: record.clinic_id,
        appointment_id: record.id,
        channel: "whatsapp",
        recipient_type: "patient",
        recipient: null,
        kind,
        status: "skipped",
        error: "Paciente sem WhatsApp",
      });
    } else {
      const r = await sendWhatsApp(phone, msg.patient);
      track({
        clinic_id: record.clinic_id,
        appointment_id: record.id,
        channel: "whatsapp",
        recipient_type: "patient",
        recipient: phone,
        kind,
        status: r.ok ? "sent" : "failed",
        error: r.error,
      });
    }
  }

  // ---- Patient: Email ----
  if (opts.emailPatient) {
    const email = record.patient?.email || null;
    if (!email) {
      track({
        clinic_id: record.clinic_id,
        appointment_id: record.id,
        channel: "email",
        recipient_type: "patient",
        recipient: null,
        kind,
        status: "skipped",
        error: "Paciente sem e-mail",
      });
    } else {
      const r = await sendEmail(email, msg.subject, msg.patient);
      track({
        clinic_id: record.clinic_id,
        appointment_id: record.id,
        channel: "email",
        recipient_type: "patient",
        recipient: email,
        kind,
        status: r.ok ? "sent" : r.skipped ? "skipped" : "failed",
        error: r.error,
      });
    }
  }

  // ---- Patient: SMS ----
  if (opts.smsPatient) {
    const phone = record.patient?.whatsapp || record.patient?.phone || null;
    if (!phone) {
      track({
        clinic_id: record.clinic_id,
        appointment_id: record.id,
        channel: "sms",
        recipient_type: "patient",
        recipient: null,
        kind,
        status: "skipped",
        error: "Paciente sem telefone",
      });
    } else {
      const r = await sendSMS(phone, msg.patient);
      track({
        clinic_id: record.clinic_id,
        appointment_id: record.id,
        channel: "sms",
        recipient_type: "patient",
        recipient: phone,
        kind,
        status: r.ok ? "sent" : "failed",
        error: r.error,
      });
    }
  }

  // ---- Professional (collaborator) ----
  if (opts.notifyProfessional && msg.professional) {
    const proPhone = record.professional?.phone || null;
    if (proPhone) {
      const r = await sendWhatsApp(proPhone, msg.professional);
      track({
        clinic_id: record.clinic_id,
        appointment_id: record.id,
        channel: "whatsapp",
        recipient_type: "professional",
        recipient: proPhone,
        kind,
        status: r.ok ? "sent" : "failed",
        error: r.error,
      });
    }
    const proEmail = record.professional?.email || null;
    if (proEmail) {
      const r = await sendEmail(proEmail, msg.subject, msg.professional);
      track({
        clinic_id: record.clinic_id,
        appointment_id: record.id,
        channel: "email",
        recipient_type: "professional",
        recipient: proEmail,
        kind,
        status: r.ok ? "sent" : r.skipped ? "skipped" : "failed",
        error: r.error,
      });
    }
  }

  // ---- Professional (collaborator): in-app bell, independent of whether
  // WhatsApp/e-mail are configured — this always works since it's just a
  // DB row, not an external send.
  if (opts.notifyProfessional && record.professional?.user_id) {
    await notifyInApp({
      clinicId: record.clinic_id,
      recipientId: record.professional.user_id,
      type: kind === "reminder" ? "appointment_reminder" : "appointment_confirmed",
      title: kind === "reminder" ? "Consulta se aproximando" : "Nova consulta agendada",
      body: msg.professional || msg.patient,
      link: "/agenda",
      appointmentId: record.id,
    });
  }

  if (logs.length) {
    await supabaseAdmin.from("notification_log").insert(logs);
  }
  return counters;
}

export { notifyInApp };

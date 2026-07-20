import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  appointmentId: z.string().uuid(),
  emailPatient: z.boolean().default(true),
  whatsappPatient: z.boolean().default(true),
});

/**
 * Send the "appointment scheduled" confirmation to the patient (email + WhatsApp).
 * Verifies the appointment belongs to the caller's clinic before sending.
 */
export const sendAppointmentConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // RLS-scoped read: only returns the appointment if it is in the user's clinic.
    const { data: appt, error } = await supabase
      .from("appointments")
      .select("id, clinic_id")
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!appt) throw new Error("Agendamento não encontrado.");

    const { dispatchAppointmentNotifications } = await import("@/lib/notifications.server");
    const result = await dispatchAppointmentNotifications(data.appointmentId, "confirmation", {
      emailPatient: data.emailPatient,
      whatsappPatient: data.whatsappPatient,
      notifyProfessional: false,
    });
    return { ok: true, ...result };
  });

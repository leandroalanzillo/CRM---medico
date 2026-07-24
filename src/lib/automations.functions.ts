import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  appointmentId: z.string().uuid(),
  newStatus: z.enum(["finished", "cancelled", "no_show"]),
});

/**
 * Runs the automation matching an appointment's new status: auto-logs
 * revenue when finished, or pings the waitlist when cancelled/no-show.
 * Called right after the status update succeeds (see agenda.tsx,
 * planilha.tsx). RLS-scoped read first, so a user can't trigger this for
 * an appointment outside their own clinic.
 */
export const runAppointmentAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: appt, error } = await supabase
      .from("appointments")
      .select("id, clinic_id, patient_id, professional_id, procedure_id, produced_value, starts_at")
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!appt) throw new Error("Agendamento não encontrado.");

    if (data.newStatus === "finished") {
      const { autoCreateRevenueOnFinish } = await import("@/lib/automations.server");
      const result = await autoCreateRevenueOnFinish(appt);
      return { ok: true, revenue: result };
    } else if (data.newStatus === "cancelled" || data.newStatus === "no_show") {
      const { notifyWaitlistOnCancellation } = await import("@/lib/automations.server");
      await notifyWaitlistOnCancellation(appt);
    }

    return { ok: true };
  });

import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint, meant to be called hourly by pg_cron (see the
// `cron.schedule(...)` snippet in this migration's companion notes —
// supabase/migrations/20260720120000_convenios_storage_reminders.sql).
// For each clinic with reminders enabled, finds appointments whose
// `starts_at` falls inside [now + reminder_hours_before, now +
// reminder_hours_before + 1h) — a rolling window relative to the
// appointment itself (e.g. "18h antes"), not a fixed daily clock time.
// Sends to the patient (email + WhatsApp + SMS, per clinic settings) and
// optionally the professional. Deduplicates against notification_log so a
// given appointment only gets one reminder even if the cron overlaps.
export const Route = createFileRoute("/api/public/hooks/appointment-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // SECURITY: this must NOT be the Supabase anon/publishable key —
        // that key is shipped to every browser by design, so checking
        // against it would let anyone who inspects the frontend trigger
        // bulk notification sends. CRON_SECRET is a separate, server-only
        // value (never read via import.meta.env / VITE_*), set only in
        // the Supabase project's Edge/cron config and here.
        const provided =
          request.headers.get("x-cron-secret") ??
          request.headers.get("authorization")?.replace("Bearer ", "");
        const expected = process.env.CRON_SECRET;
        if (!expected || !provided || provided !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { dispatchAppointmentNotifications } = await import("@/lib/notifications.server");

        const { data: settings } = await supabaseAdmin
          .from("notification_settings")
          .select(
            "clinic_id, reminder_hours_before, notify_professional, notify_patient_email, notify_patient_whatsapp, notify_patient_sms",
          )
          .eq("reminder_enabled", true);

        const clinics = settings ?? [];
        let processed = 0;
        const totals = { sent: 0, failed: 0, skipped: 0 };

        for (const s of clinics) {
          const hoursBefore = s.reminder_hours_before ?? 18;
          const windowStart = new Date(Date.now() + hoursBefore * 60 * 60 * 1000);
          const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000); // 1h-wide slice, matching the hourly cron tick

          const { data: appts } = await supabaseAdmin
            .from("appointments")
            .select("id")
            .eq("clinic_id", s.clinic_id)
            .gte("starts_at", windowStart.toISOString())
            .lt("starts_at", windowEnd.toISOString())
            .not("status", "in", "(cancelled,no_show,finished)");

          for (const a of appts ?? []) {
            const { count } = await supabaseAdmin
              .from("notification_log")
              .select("id", { count: "exact", head: true })
              .eq("appointment_id", a.id)
              .eq("kind", "reminder");
            if ((count ?? 0) > 0) continue;

            const r = await dispatchAppointmentNotifications(a.id, "reminder", {
              emailPatient: s.notify_patient_email,
              whatsappPatient: s.notify_patient_whatsapp,
              smsPatient: s.notify_patient_sms,
              notifyProfessional: s.notify_professional,
            });
            totals.sent += r.sent;
            totals.failed += r.failed;
            totals.skipped += r.skipped;
            processed += 1;
          }
        }

        return new Response(JSON.stringify({ ok: true, processed, ...totals }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

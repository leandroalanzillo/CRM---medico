import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint (called daily/hourly by pg_cron). For each clinic whose
// reminder hour matches the current hour (America/Sao_Paulo) and has reminders
// enabled, sends day-before reminders to the patient (email + WhatsApp) and the
// professional. Deduplicates against notification_log so a reminder is sent once.
export const Route = createFileRoute("/api/public/hooks/appointment-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? request.headers.get("authorization")?.replace("Bearer ", "");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { dispatchAppointmentNotifications } = await import("@/lib/notifications.server");

        // Current hour + tomorrow's date in America/Sao_Paulo (UTC-3, no DST).
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
        }).formatToParts(new Date());
        const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
        const currentHour = Number(get("hour"));
        const today = new Date(`${get("year")}-${get("month")}-${get("day")}T12:00:00-03:00`);
        const tmr = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        const y = tmr.getFullYear();
        const m = String(tmr.getMonth() + 1).padStart(2, "0");
        const d = String(tmr.getDate()).padStart(2, "0");
        const windowStart = new Date(`${y}-${m}-${d}T00:00:00-03:00`).toISOString();
        const windowEnd = new Date(`${y}-${m}-${d}T23:59:59-03:00`).toISOString();

        // Clinics that want reminders at this hour.
        const { data: settings } = await supabaseAdmin
          .from("notification_settings")
          .select("clinic_id, reminder_enabled, reminder_hour, notify_professional")
          .eq("reminder_enabled", true)
          .eq("reminder_hour", currentHour);

        const clinics = settings ?? [];
        let processed = 0;
        const totals = { sent: 0, failed: 0, skipped: 0 };

        for (const s of clinics) {
          const { data: appts } = await supabaseAdmin
            .from("appointments")
            .select("id")
            .eq("clinic_id", s.clinic_id)
            .gte("starts_at", windowStart)
            .lte("starts_at", windowEnd)
            .not("status", "in", "(cancelled,no_show,finished)");

          for (const a of appts ?? []) {
            // Dedup: skip if a reminder was already logged for this appointment.
            const { count } = await supabaseAdmin
              .from("notification_log")
              .select("id", { count: "exact", head: true })
              .eq("appointment_id", a.id)
              .eq("kind", "reminder");
            if ((count ?? 0) > 0) continue;

            const r = await dispatchAppointmentNotifications(a.id, "reminder", {
              emailPatient: true,
              whatsappPatient: true,
              notifyProfessional: s.notify_professional,
            });
            totals.sent += r.sent; totals.failed += r.failed; totals.skipped += r.skipped;
            processed += 1;
          }
        }

        return new Response(JSON.stringify({ ok: true, hour: currentHour, processed, ...totals }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

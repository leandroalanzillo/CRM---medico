import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint, meant to be called once a day by pg_cron (same
// CRON_SECRET pattern as appointment-reminders.ts — see the companion
// cron.schedule(...) template in that migration's comments; register a
// second job here pointing at this URL, e.g. daily at 08:00).
//
// Does two things:
//  1. Every day: notifies staff about patients whose birthday is today.
//  2. Mondays only: notifies admins/managers with the count of active
//     patients who have no future appointment scheduled — the same
//     number shown on the Dashboard KPI, just pushed proactively instead
//     of requiring someone to go look.
export const Route = createFileRoute("/api/public/hooks/daily-checks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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

        const { data: clinics } = await supabaseAdmin.from("clinics").select("id");
        const today = new Date();
        const isMonday = today.getDay() === 1;
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");

        let birthdayNotifications = 0;
        let noReturnNotifications = 0;

        for (const clinic of clinics ?? []) {
          const { data: staff } = await supabaseAdmin
            .from("user_roles")
            .select("user_id")
            .eq("clinic_id", clinic.id)
            .in("role", ["admin", "manager", "receptionist"]);
          if (!staff || staff.length === 0) continue;

          // ---- 1. Birthdays today ----
          const { data: patients } = await supabaseAdmin
            .from("patients")
            .select("id, full_name, birth_date, phone")
            .eq("clinic_id", clinic.id)
            .eq("active", true)
            .not("birth_date", "is", null);

          const birthdayPatients = (patients ?? []).filter((p) => {
            if (!p.birth_date) return false;
            const [, bMonth, bDay] = p.birth_date.split("-");
            return bMonth === mm && bDay === dd;
          });

          if (birthdayPatients.length > 0) {
            const names = birthdayPatients.map((p) => p.full_name).join(", ");
            const rows = staff.map((s) => ({
              clinic_id: clinic.id,
              recipient_id: s.user_id,
              type: "system" as const,
              title:
                birthdayPatients.length === 1
                  ? "Aniversário de paciente hoje"
                  : `${birthdayPatients.length} aniversários de pacientes hoje`,
              body: names,
              link: "/pacientes",
            }));
            await supabaseAdmin.from("app_notifications").insert(rows);
            birthdayNotifications += rows.length;
          }

          // ---- 2. Weekly: patients with no future appointment (Mondays) ----
          if (isMonday) {
            const nowIso = new Date().toISOString();
            const [{ data: allPatients }, { data: futureAppts }] = await Promise.all([
              supabaseAdmin
                .from("patients")
                .select("id")
                .eq("clinic_id", clinic.id)
                .eq("active", true),
              supabaseAdmin
                .from("appointments")
                .select("patient_id")
                .eq("clinic_id", clinic.id)
                .neq("status", "cancelled")
                .gte("starts_at", nowIso),
            ]);
            const withFuture = new Set(
              (futureAppts ?? []).map((a) => a.patient_id).filter(Boolean),
            );
            const noReturnCount = (allPatients ?? []).filter((p) => !withFuture.has(p.id)).length;

            if (noReturnCount > 0) {
              const rows = staff.map((s) => ({
                clinic_id: clinic.id,
                recipient_id: s.user_id,
                type: "system" as const,
                title: "Resumo semanal: retornos em aberto",
                body: `${noReturnCount} paciente(s) ativo(s) sem nenhuma consulta futura agendada. Veja o KPI no Dashboard ou filtre em Pacientes.`,
                link: "/dashboard",
              }));
              await supabaseAdmin.from("app_notifications").insert(rows);
              noReturnNotifications += rows.length;
            }
          }
        }

        return new Response(
          JSON.stringify({ ok: true, birthdayNotifications, noReturnNotifications, isMonday }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});

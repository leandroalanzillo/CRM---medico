import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_FINANCIAL_CATEGORIES } from "@/lib/format";

const bootstrapSchema = z.object({
  clinicName: z.string().trim().min(2).max(120),
  clinicType: z.enum(["medical", "dental"]),
  fullName: z.string().trim().min(2).max(120),
});

const DEFAULT_STAGES = [
  { name: "Agendar Consulta", slug: "agendar", position: 0, color: "#64748b" },
  { name: "Consulta Agendada", slug: "agendada", position: 1, color: "#3b82f6" },
  { name: "Em Consulta", slug: "em_consulta", position: 2, color: "#f59e0b" },
  { name: "Negociação", slug: "negociacao", position: 3, color: "#10b981" },
];

export const bootstrapClinic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => bootstrapSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("clinic_id")
      .eq("id", userId)
      .maybeSingle();
    if (existing?.clinic_id) return { ok: true, clinicId: existing.clinic_id };

    const { data: clinic, error: clinicErr } = await supabaseAdmin
      .from("clinics")
      .insert({ name: data.clinicName, type: data.clinicType })
      .select("id")
      .single();
    if (clinicErr) throw new Error(clinicErr.message);
    const clinicId = clinic.id as string;

    const email = (claims as { email?: string })?.email ?? null;

    await supabaseAdmin.from("profiles").upsert({
      id: userId,
      clinic_id: clinicId,
      full_name: data.fullName,
    });

    await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: userId, clinic_id: clinicId, role: "admin" },
        { onConflict: "user_id,role" },
      );

    await supabaseAdmin.from("professionals").insert({
      clinic_id: clinicId,
      user_id: userId,
      name: data.fullName,
      color: "#2dd4bf",
    });

    await supabaseAdmin
      .from("pipeline_stages")
      .insert(DEFAULT_STAGES.map((s) => ({ ...s, clinic_id: clinicId })));

    await supabaseAdmin.from("tags").insert([
      { clinic_id: clinicId, name: "Prioritário", color: "#ef4444" },
      { clinic_id: clinicId, name: "Retorno", color: "#3b82f6" },
      { clinic_id: clinicId, name: "Convênio", color: "#8b5cf6" },
    ]);

    await supabaseAdmin.from("procedures").insert([
      { clinic_id: clinicId, name: "Consulta", default_price: 250, duration_minutes: 30 },
      { clinic_id: clinicId, name: "Avaliação", default_price: 150, duration_minutes: 30 },
      { clinic_id: clinicId, name: "Retorno", default_price: 0, duration_minutes: 20 },
    ]);

    await supabaseAdmin
      .from("financial_categories")
      .insert(DEFAULT_FINANCIAL_CATEGORIES.map((c) => ({ ...c, clinic_id: clinicId })));

    await supabaseAdmin.from("whatsapp_connections").insert({
      clinic_id: clinicId,
      status: "disconnected",
    });

    await supabaseAdmin.from("notification_settings").insert({
      clinic_id: clinicId,
    });

    await supabaseAdmin.from("audit_logs").insert({
      clinic_id: clinicId,
      user_id: userId,
      action: "create",
      resource_type: "clinic",
      resource_id: clinicId,
      changes: { name: data.clinicName, email },
    });

    return { ok: true, clinicId };
  });

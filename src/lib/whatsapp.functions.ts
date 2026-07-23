import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

async function assertAdminAndGetClinic(supabase: SupabaseClient<Database>) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Não autenticado.");

  // profiles.clinic_id is the single, unambiguous source of truth for
  // "which clinic does this user belong to" — unlike picking role[0],
  // which silently breaks if the user ever ends up with more than one
  // user_roles row (duplicates, leftover test data, etc.): Postgres
  // doesn't guarantee row order without ORDER BY, so role[0] could
  // resolve to a different clinic_id on every single call. That was
  // causing connectWhatsApp() and checkWhatsAppStatus() to silently
  // read/write two different whatsapp_connections rows.
  const { data: profile } = await supabase
    .from("profiles")
    .select("clinic_id")
    .eq("id", userId)
    .maybeSingle();
  const clinicId = profile?.clinic_id;
  if (!clinicId) throw new Error("Clínica não encontrada.");

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("clinic_id", clinicId);
  const isAdmin = (roles ?? []).some(
    (r: { role: string }) => r.role === "admin" || r.role === "manager",
  );
  if (!isAdmin)
    throw new Error("Apenas administradores e gestores podem gerenciar a conexão do WhatsApp.");

  return clinicId as string;
}

/** Starts (or refreshes) WhatsApp QR pairing for the caller's clinic. */
export const connectWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const clinicId = await assertAdminAndGetClinic(supabase);
    const instanceName = `clinic-${clinicId}`;

    const { startWhatsAppPairing } = await import("@/lib/whatsapp.server");
    const result = await startWhatsAppPairing(instanceName);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("whatsapp_connections").upsert(
      {
        clinic_id: clinicId,
        instance_name: instanceName,
        provider: "evolution-api",
        status: result.ok ? "awaiting_qr" : "error",
        qr_code: result.qrCode ?? null,
        qr_expires_at: result.qrCode ? new Date(Date.now() + 60_000).toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "clinic_id" },
    );

    if (!result.ok) throw new Error(result.error ?? "Falha ao iniciar a conexão.");
    return { qrCode: result.qrCode };
  });

/** Polls current pairing status; updates the stored row so other tabs/users see it too. */
export const checkWhatsAppStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const clinicId = await assertAdminAndGetClinic(supabase);
    const instanceName = `clinic-${clinicId}`;

    const { getWhatsAppPairingStatus } = await import("@/lib/whatsapp.server");
    const result = await getWhatsAppPairingStatus(instanceName);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!result.ok) {
      // Leaving the row untouched here would keep showing a stale status
      // (e.g. "Aguardando QR Code" forever) even though we now know
      // something is actually wrong with the check itself.
      await supabaseAdmin
        .from("whatsapp_connections")
        .update({ status: "error", updated_at: new Date().toISOString() })
        .eq("clinic_id", clinicId);
      return { status: "error" as const };
    }

    const { error: updateError } = await supabaseAdmin.from("whatsapp_connections").upsert(
      {
        clinic_id: clinicId,
        instance_name: instanceName,
        status: result.status,
        phone_number: result.phoneNumber ?? null,
        ...(result.status === "connected" ? { last_connected_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "clinic_id" },
    );

    if (updateError) {
      console.error("[checkWhatsAppStatus] DB update failed:", updateError.message);
    }

    // Re-read what's actually in the DB right now — this is what proves
    // (or disproves) whether the write above really landed, instead of
    // trusting that an update() call without a checked error succeeded.
    const { data: persisted } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("status")
      .eq("clinic_id", clinicId)
      .maybeSingle();

    return {
      status: result.status,
      dbUpdateError: updateError?.message ?? null,
      dbStatusAfterUpdate: persisted?.status ?? null,
    };
  });

/** Unlinks the device. */
export const disconnectWhatsAppConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const clinicId = await assertAdminAndGetClinic(supabase);
    const instanceName = `clinic-${clinicId}`;

    const { disconnectWhatsApp } = await import("@/lib/whatsapp.server");
    await disconnectWhatsApp(instanceName);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("whatsapp_connections").upsert(
      {
        clinic_id: clinicId,
        instance_name: instanceName,
        status: "disconnected",
        qr_code: null,
        phone_number: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "clinic_id" },
    );

    return { ok: true };
  });

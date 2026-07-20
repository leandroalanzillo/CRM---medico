// Creates (or resets the password of) the two test accounts using the
// Supabase Admin API — the officially supported way to create users,
// implemented by GoTrue itself, so it's correct regardless of which
// Auth schema version this project runs. This replaces the raw SQL
// INSERT into auth.users/auth.identities from migration
// 20260716025523_*.sql, which turned out to be fragile across GoTrue
// versions (see conversation: login kept failing after that migration
// ran with no SQL error).
//
// Usage:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/seed-test-users.mjs
//
// Get both values from Supabase Dashboard -> Project Settings -> API.
// SUPABASE_SERVICE_ROLE_KEY is secret — never commit it, never expose
// it to the frontend/browser bundle. Run this script locally or in a
// trusted CI step only.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing env vars. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.",
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_USERS = [
  { email: "admin@clinica.local", password: "admin123@", fullName: "Administrador", role: "admin" },
  {
    email: "recepcionista@clinica.local",
    password: "admin123@",
    fullName: "Recepcionista",
    role: "receptionist",
  },
];

async function ensureUser({ email, password, fullName }) {
  // createUser fails if the email already exists — look it up first so
  // this script is safe to run more than once.
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email?.toLowerCase() === email);

  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw error;
    console.log(
      `Updated existing user ${email} (id=${data.user.id}) — password reset, email confirmed.`,
    );
    return data.user;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  console.log(`Created user ${email} (id=${data.user.id}).`);
  return data.user;
}

async function ensureClinic() {
  const { data: clinics, error } = await admin.from("clinics").select("id").limit(1);
  if (error) throw error;
  if (clinics && clinics.length > 0) return clinics[0].id;

  const { data: created, error: insertErr } = await admin
    .from("clinics")
    .insert({ name: "Clínica Principal" })
    .select("id")
    .single();
  if (insertErr) throw insertErr;
  console.log(`Created default clinic (id=${created.id}).`);
  return created.id;
}

async function linkProfileAndRole(user, clinicId, fullName, role) {
  const { error: profileErr } = await admin
    .from("profiles")
    .upsert({ id: user.id, clinic_id: clinicId, full_name: fullName }, { onConflict: "id" });
  if (profileErr) throw profileErr;

  const { error: roleErr } = await admin
    .from("user_roles")
    .upsert({ user_id: user.id, clinic_id: clinicId, role }, { onConflict: "user_id,role" });
  if (roleErr) throw roleErr;

  console.log(`Linked ${user.email} -> profile + role "${role}" in clinic ${clinicId}.`);
}

async function main() {
  const clinicId = await ensureClinic();
  for (const u of TEST_USERS) {
    const user = await ensureUser(u);
    await linkProfileAndRole(user, clinicId, u.fullName, u.role);
  }
  console.log("\nDone. Test accounts:");
  for (const u of TEST_USERS) {
    console.log(`  ${u.email.split("@")[0]} / ${u.password}  (role: ${u.role})`);
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

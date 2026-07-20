-- ============ TEST ACCOUNTS (admin / recepcionista) ============
-- Login screen (/auth) converts the typed "usuário" into
-- "<usuário>@clinica.local" and authenticates via native Supabase Auth
-- (see src/routes/auth.tsx -> toEmail()). These are internal-only
-- addresses, never sent real mail, just Supabase Auth's user key.
--
-- NOTE: an earlier version of this migration created the auth.users /
-- auth.identities rows directly via SQL (crypt()/gen_salt()). That
-- turned out to be fragile: it ran without SQL error but the accounts
-- still couldn't log in, most likely due to GoTrue Auth schema
-- differences on this project's Supabase version that a raw INSERT
-- can't account for. User creation now happens via the Admin API
-- instead — run:
--
--   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-test-users.mjs
--
-- That script is authoritative (implemented by GoTrue itself) and
-- also performs the profile/role linking below, so this migration
-- only needs to guarantee the linking logic runs for anyone who
-- already has these two auth.users rows from another source — it's a
-- no-op if they don't exist yet.
--
-- ⚠️ Test-only credentials (admin123@ for both, set in the script
-- above). Replace with strong, distinct passwords before any real
-- patient data touches this project.

-- Confirm receptionist email and set up profiles/roles for both accounts
UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now()) WHERE email IN ('admin@clinica.local','recepcionista@clinica.local');

DO $$
DECLARE
  admin_uid uuid;
  recep_uid uuid;
  cid uuid;
BEGIN
  SELECT id INTO cid FROM public.clinics LIMIT 1;
  IF cid IS NULL THEN
    INSERT INTO public.clinics (name) VALUES ('Clínica Principal') RETURNING id INTO cid;
  END IF;

  SELECT id INTO admin_uid FROM auth.users WHERE email='admin@clinica.local';
  SELECT id INTO recep_uid FROM auth.users WHERE email='recepcionista@clinica.local';

  IF admin_uid IS NOT NULL THEN
    INSERT INTO public.profiles (id, clinic_id, full_name) VALUES (admin_uid, cid, 'Administrador')
      ON CONFLICT (id) DO UPDATE SET clinic_id = EXCLUDED.clinic_id;
    INSERT INTO public.user_roles (user_id, clinic_id, role) VALUES (admin_uid, cid, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  IF recep_uid IS NOT NULL THEN
    INSERT INTO public.profiles (id, clinic_id, full_name) VALUES (recep_uid, cid, 'Recepcionista')
      ON CONFLICT (id) DO UPDATE SET clinic_id = EXCLUDED.clinic_id;
    INSERT INTO public.user_roles (user_id, clinic_id, role) VALUES (recep_uid, cid, 'receptionist')
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;

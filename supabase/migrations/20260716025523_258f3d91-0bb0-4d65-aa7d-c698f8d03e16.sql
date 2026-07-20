-- ============ TEST ACCOUNTS (admin / recepcionista) ============
-- Login screen (/auth) converts the typed "usuário" into
-- "<usuário>@clinica.local" and authenticates via native Supabase Auth
-- (see src/routes/auth.tsx -> toEmail()). These are internal-only
-- addresses, never sent real mail, just Supabase Auth's user key.
--
-- IMPORTANT: creating auth.users/auth.identities rows directly via SQL
-- is the common pattern for local/test seeding, but it bypasses
-- GoTrue's own validation and its exact column set can vary by
-- Supabase Auth schema version. For real user provisioning, prefer the
-- Admin API (supabase.auth.admin.createUser with the service-role
-- key) from a script or Edge Function. Kept here as plain SQL because
-- that's the pattern this migration already used.
--
-- ⚠️ Test-only credentials (admin123@ for both). Replace with strong,
-- distinct passwords before any real patient data touches this
-- project — see supabase.auth.admin.updateUserById() or the Dashboard.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@clinica.local',
  crypt('admin123@', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Administrador"}',
  now(), now(),
  '', '', '', ''
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'recepcionista@clinica.local',
  crypt('admin123@', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Recepcionista"}',
  now(), now(),
  '', '', '', ''
)
ON CONFLICT (email) DO NOTHING;

-- One identity row per user for the 'email' provider (required by some
-- GoTrue versions for password-grant sign-in to resolve the identity).
INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email),
       'email', now(), now(), now()
FROM auth.users u
WHERE u.email IN ('admin@clinica.local', 'recepcionista@clinica.local')
ON CONFLICT DO NOTHING;

-- ============ Confirm e-mail + link profiles/roles ============
-- (Original logic below, unchanged — already idempotent via
-- COALESCE/ON CONFLICT.)

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

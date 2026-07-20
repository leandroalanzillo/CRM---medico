-- ============ TEST ACCOUNTS (admin / recepcionista) ============
-- Login screen (/auth) converts the typed "usuário" into
-- "<usuário>@clinica.local" and authenticates via native Supabase Auth
-- (see src/routes/auth.tsx -> toEmail()). These are internal-only
-- addresses, never sent real mail, just Supabase Auth's user key.
--
-- ⚠️ Test-only credentials (admin123@ for both). Replace with strong,
-- distinct passwords before any real patient data touches this
-- project.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@clinica.local',
  extensions.crypt('admin123@', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Administrador"}',
  now(), now(),
  '', '', '', ''
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@clinica.local');

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'recepcionista@clinica.local',
  extensions.crypt('admin123@', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Recepcionista"}',
  now(), now(),
  '', '', '', ''
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'recepcionista@clinica.local');

-- One identity row per user for the 'email' provider (required by some
-- GoTrue versions for password-grant sign-in to resolve the identity).
INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email),
       'email', now(), now(), now()
FROM auth.users u
WHERE u.email IN ('admin@clinica.local', 'recepcionista@clinica.local')
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
  );

-- ============ Confirm e-mail + link profiles/roles ============
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
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
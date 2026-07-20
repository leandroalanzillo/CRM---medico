-- ============ CONVÊNIOS (INSURANCE PROVIDERS) ============
-- Structured registry of accepted health plans, similar in spirit to
-- ClinicCare's convênio management. Patients keep their existing free-text
-- `insurance`/`insurance_card` fields (unchanged, zero risk to old data) and
-- can additionally link to one of these structured records.
CREATE TABLE IF NOT EXISTS public.insurance_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  ans_registry text,             -- registro ANS (operadoras de saúde suplementar)
  phone text,
  email text,
  reimbursement_days int,        -- prazo médio de repasse, em dias
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_providers TO authenticated;
GRANT ALL ON public.insurance_providers TO service_role;
ALTER TABLE public.insurance_providers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_insurance_clinic ON public.insurance_providers(clinic_id);

DO $do$ BEGIN
  CREATE POLICY "insurance_read" ON public.insurance_providers FOR SELECT TO authenticated
  USING (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "insurance_manage" ON public.insurance_providers FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.get_my_clinic_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "insurance_update" ON public.insurance_providers FOR UPDATE TO authenticated
  USING (clinic_id = public.get_my_clinic_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (clinic_id = public.get_my_clinic_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "insurance_delete" ON public.insurance_providers FOR DELETE TO authenticated
  USING (clinic_id = public.get_my_clinic_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE TRIGGER trg_insurance_updated BEFORE UPDATE ON public.insurance_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS insurance_provider_id uuid REFERENCES public.insurance_providers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_patients_insurance ON public.patients(insurance_provider_id);


-- ============ CLINICAL FILES STORAGE (prontuário / receitas) ============
-- clinical_files (table) already existed with a `storage_path` column but no
-- backing bucket — files had nowhere to actually live. Creating it here.
INSERT INTO storage.buckets (id, name, public)
VALUES ('clinical-files', 'clinical-files', false)
ON CONFLICT (id) DO NOTHING;

-- Files are stored under "<clinic_id>/<patient_id>/<filename>" so RLS can
-- scope access by clinic using the path itself — same pattern Supabase docs
-- recommend for private per-tenant buckets.
DO $do$ BEGIN
  CREATE POLICY "clinical_files_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'clinical-files'
    AND (storage.foldername(name))[1] = public.get_my_clinic_id()::text
    AND public.can_view_clinical()
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "clinical_files_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'clinical-files'
    AND (storage.foldername(name))[1] = public.get_my_clinic_id()::text
    AND public.can_view_clinical()
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "clinical_files_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'clinical-files'
    AND (storage.foldername(name))[1] = public.get_my_clinic_id()::text
    AND public.can_view_clinical()
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


-- ============ REMINDER SETTINGS: 18h-before window + SMS channel ============
-- `reminder_hour` (fixed hour-of-day) is superseded by `reminder_hours_before`
-- (a rolling window relative to the appointment itself), matching "confirmação
-- 18h antes" instead of "todo mundo às Xh". Column kept (unused) for
-- backward compatibility — dropping it isn't necessary and avoids any risk
-- to already-applied migrations.
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS reminder_hours_before int NOT NULL DEFAULT 18;
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS notify_patient_sms boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.notification_settings.reminder_hours_before IS 'Lembrete enviado quando faltar essa quantidade de horas para a consulta.';
COMMENT ON COLUMN public.notification_settings.notify_patient_sms IS 'SMS desativado por padrão: requer credenciais de um provedor (ex. Twilio) configuradas no servidor.';


-- ============ CRON SCHEDULE (run manually, not part of the migration) ============
-- pg_cron/pg_net are already enabled (see 20260713004952_*.sql) but no job
-- was ever scheduled — the reminders endpoint had nothing calling it.
-- This is deliberately NOT executed by the migration itself: it embeds a
-- secret and a project-specific URL, neither of which belong in a
-- version-controlled file. Run it once yourself in the SQL Editor after
-- substituting the two placeholders below.
--
-- 1. Set CRON_SECRET as a server env var (any long random string — it is
--    the value appointment-reminders.ts now checks instead of the public
--    anon key).
-- 2. Run:
--
-- select cron.schedule(
--   'appointment-reminders-hourly',
--   '0 * * * *',
--   $cron$
--   select net.http_post(
--     url := 'https://<SEU-PROJECT-REF>.supabase.co/api/public/hooks/appointment-reminders',
--     headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<SEU_CRON_SECRET>'),
--     body := '{}'::jsonb
--   );
--   $cron$
-- );

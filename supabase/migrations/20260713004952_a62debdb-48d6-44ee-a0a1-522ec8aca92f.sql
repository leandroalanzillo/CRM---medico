-- Contatos dos profissionais (para notificar o colaborador)
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS phone text;

-- ============ NOTIFICATION SETTINGS (por clínica) ============
CREATE TABLE public.notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL UNIQUE REFERENCES public.clinics(id) ON DELETE CASCADE,
  notify_patient_email boolean NOT NULL DEFAULT true,
  notify_patient_whatsapp boolean NOT NULL DEFAULT true,
  reminder_enabled boolean NOT NULL DEFAULT true,
  reminder_hour int NOT NULL DEFAULT 18,
  notify_professional boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_settings_read" ON public.notification_settings FOR SELECT TO authenticated
  USING (clinic_id = public.get_my_clinic_id());
CREATE POLICY "notif_settings_manage" ON public.notification_settings FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (clinic_id = public.get_my_clinic_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
CREATE TRIGGER trg_notif_settings_updated BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ NOTIFICATION LOG ============
CREATE TABLE public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  channel text NOT NULL,          -- 'email' | 'whatsapp'
  recipient_type text NOT NULL,   -- 'patient' | 'professional'
  recipient text,                 -- email address or phone
  kind text NOT NULL,             -- 'confirmation' | 'reminder'
  status text NOT NULL,           -- 'sent' | 'failed' | 'skipped'
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.notification_log TO authenticated;
GRANT ALL ON public.notification_log TO service_role;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notif_log_clinic ON public.notification_log(clinic_id, created_at DESC);
CREATE INDEX idx_notif_log_appt ON public.notification_log(appointment_id);
CREATE POLICY "notif_log_read" ON public.notification_log FOR SELECT TO authenticated
  USING (clinic_id = public.get_my_clinic_id());
CREATE POLICY "notif_log_insert" ON public.notification_log FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.get_my_clinic_id());

-- Extensões para o agendador diário de lembretes
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
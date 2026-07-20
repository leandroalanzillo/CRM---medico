-- ============ WHATSAPP QR PAIRING ============
-- whatsapp_connections.status already had the right enum values
-- ('awaiting_qr', 'connecting', 'connected'...) but no columns to hold the
-- actual QR payload or the bridge's instance identifier. Adding those.
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS instance_name text;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS qr_code text; -- base64 PNG data URI, short-lived
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS qr_expires_at timestamptz;


-- ============ IN-APP NOTIFICATIONS (bell) ============
-- Separate from notification_log (external send audit trail): these are
-- notifications *for a user of this CRM*, e.g. "you have an appointment in
-- 18h", shown in the app's bell icon — not sent externally.
CREATE TYPE public.app_notification_type AS ENUM (
  'appointment_reminder', 'appointment_confirmed', 'appointment_cancelled',
  'appointment_no_show', 'negotiation_update', 'system'
);

CREATE TABLE IF NOT EXISTS public.app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.app_notification_type NOT NULL DEFAULT 'system',
  title text NOT NULL,
  body text,
  link text,                 -- in-app route to open on click, e.g. /agenda
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_notifications TO authenticated;
GRANT ALL ON public.app_notifications TO service_role;
ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_app_notif_recipient ON public.app_notifications(recipient_id, created_at DESC);

-- Recipients only ever see their own notifications. INSERT is service-role
-- only in practice (dispatched from server code after checking real
-- permissions on the underlying appointment/etc.) — no INSERT policy is
-- granted to `authenticated`, so a user cannot fabricate notifications
-- addressed to someone else.
DO $do$ BEGIN
  CREATE POLICY "app_notif_read_own" ON public.app_notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "app_notif_update_own" ON public.app_notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "app_notif_delete_own" ON public.app_notifications FOR DELETE TO authenticated
  USING (recipient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

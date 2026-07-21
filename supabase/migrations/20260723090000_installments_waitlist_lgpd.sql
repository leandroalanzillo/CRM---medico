-- ============ INSTALLMENT PAYMENTS (parcelamento) ============
-- Each installment is its own row in financial_transactions (so the
-- existing DRE/ledger/export logic works unchanged) — these three columns
-- just link the rows that belong to the same parcelamento together.
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS installment_group_id uuid;
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS installment_number int;
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS installment_total int;
CREATE INDEX IF NOT EXISTS idx_fin_tx_installment_group ON public.financial_transactions(installment_group_id);


-- ============ WAITLIST (lista de espera / encaixe) ============
DO $do$ BEGIN
  CREATE TYPE public.waitlist_status AS ENUM ('waiting', 'contacted', 'scheduled', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

CREATE TABLE IF NOT EXISTS public.waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  procedure_id uuid REFERENCES public.procedures(id) ON DELETE SET NULL,
  preferred_period text,           -- free text: "manhãs", "qualquer horário quinta", etc.
  notes text,
  status public.waitlist_status NOT NULL DEFAULT 'waiting',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waitlist TO authenticated;
GRANT ALL ON public.waitlist TO service_role;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_waitlist_clinic ON public.waitlist(clinic_id, status);

DO $do$ BEGIN
  CREATE POLICY "waitlist_all" ON public.waitlist FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id())
  WITH CHECK (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE TRIGGER trg_waitlist_updated BEFORE UPDATE ON public.waitlist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


-- ============ LGPD: data export / erasure audit ============
-- No new table needed — audit_logs already exists and is exactly the
-- right place to record "exported patient data" / "erased patient data"
-- events for compliance. Just documenting the convention here so the
-- action strings stay consistent between the two flows in the app:
--   action = 'lgpd_export'  — admin exported a patient's full data
--   action = 'lgpd_erase'   — admin anonymized/erased a patient's data
COMMENT ON TABLE public.audit_logs IS 'General audit trail. LGPD-related entries use action = lgpd_export | lgpd_erase (see patient profile page).';

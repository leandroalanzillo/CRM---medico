-- ============ LGPD: CONSENT, LEGAL GUARDIAN, DPO CONTACT ============

-- Explicit consent record — health data is "dado sensível" under LGPD
-- Art. 11, which requires a specific, documented legal basis (usually
-- consent) distinct from ordinary personal data processing.
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS consent_at timestamptz;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS consent_notes text;
COMMENT ON COLUMN public.patients.consent_at IS 'When the patient (or legal guardian) explicitly consented to data processing. NULL = no consent on record yet.';

-- Legal guardian — required whenever the patient is a minor (LGPD Art. 14
-- + ECA), since a minor cannot give valid consent themselves.
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS legal_guardian_name text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS legal_guardian_cpf text;

-- Encarregado de Dados (DPO) contact — LGPD Art. 41 requires publicizing
-- this. One row per clinic, shown in Configurações and included in LGPD
-- data exports.
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS dpo_name text;
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS dpo_contact text;

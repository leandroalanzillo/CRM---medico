-- Adds an active/inactive status to patients, mirroring public.professionals.
-- Inspired by ClinicCare's "Controle de Status: Pacientes ativos/inativos".
-- Inactivating a patient is the safe alternative to deleting one that still
-- has appointments, negotiations or timeline history attached to it.

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_patients_active ON public.patients(clinic_id, active);

COMMENT ON COLUMN public.patients.active IS
  'False = inactive/arquivado. Used instead of hard-deleting patients that have linked records.';

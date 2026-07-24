-- ============ PREFERRED PROCEDURE ON PATIENTS ============
-- Lets a patient/lead be linked directly to the procedure they're
-- interested in (shown/selectable on the patient form), separate from
-- appointments.procedure_id (which is per-consultation, not per-patient).
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS preferred_procedure_id uuid REFERENCES public.procedures(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_patients_preferred_procedure ON public.patients(preferred_procedure_id);

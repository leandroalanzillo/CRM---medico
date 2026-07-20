
-- ============ ENUMS ============
DO $do$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','manager','receptionist','professional','commercial');
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE TYPE public.clinic_type AS ENUM ('medical','dental');
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE TYPE public.appointment_status AS ENUM ('scheduled','confirmed','waiting','in_progress','finished','cancelled','no_show');
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE TYPE public.negotiation_status AS ENUM ('negotiating','awaiting','accepted','rejected','expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE TYPE public.patient_kind AS ENUM ('lead','patient');
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE TYPE public.whatsapp_status AS ENUM ('disconnected','awaiting_qr','connecting','connected','error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TABLE IF NOT EXISTS public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type public.clinic_type NOT NULL DEFAULT 'medical',
  document text, phone text, address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinics TO authenticated;
GRANT ALL ON public.clinics TO service_role;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
  full_name text, phone text, avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.get_my_clinic_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT clinic_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.can_view_clinical()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'manager')
      OR public.has_role(auth.uid(),'professional');
$$;

DO $do$ BEGIN
  CREATE POLICY "profiles_select_same_clinic" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "profiles_admin_update" ON public.profiles FOR UPDATE TO authenticated
  USING (clinic_id = public.get_my_clinic_id() AND public.has_role(auth.uid(),'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


DO $do$ BEGIN
  CREATE POLICY "clinics_select_own" ON public.clinics FOR SELECT TO authenticated
  USING (id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "clinics_update_admin" ON public.clinics FOR UPDATE TO authenticated
  USING (id = public.get_my_clinic_id() AND public.has_role(auth.uid(),'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "clinics_insert_auth" ON public.clinics FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


DO $do$ BEGIN
  CREATE POLICY "roles_select_same_clinic" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "roles_admin_manage" ON public.user_roles FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id() AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (clinic_id = public.get_my_clinic_id() AND public.has_role(auth.uid(),'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.specialties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.specialties TO authenticated;
GRANT ALL ON public.specialties TO service_role;
ALTER TABLE public.specialties ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY "specialties_clinic" ON public.specialties FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id()) WITH CHECK (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  specialty_id uuid REFERENCES public.specialties(id) ON DELETE SET NULL,
  registration text,
  color text NOT NULL DEFAULT '#2dd4bf',
  active boolean NOT NULL DEFAULT true,
  email text, phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professionals TO authenticated;
GRANT ALL ON public.professionals TO service_role;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_professionals_clinic ON public.professionals(clinic_id);
DO $do$ BEGIN
  CREATE POLICY "professionals_select" ON public.professionals FOR SELECT TO authenticated
  USING (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "professionals_manage" ON public.professionals FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (clinic_id = public.get_my_clinic_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE TRIGGER trg_professionals_updated BEFORE UPDATE ON public.professionals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL, color text NOT NULL DEFAULT '#64748b',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY "tags_clinic" ON public.tags FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id()) WITH CHECK (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  kind public.patient_kind NOT NULL DEFAULT 'lead',
  full_name text NOT NULL,
  cpf text, birth_date date, phone text, whatsapp text, email text,
  address text, occupation text, insurance text, insurance_card text,
  emergency_contact text, source text,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  avatar_url text, notes text, last_contact_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_patients_clinic ON public.patients(clinic_id);
DO $do$ BEGIN
  CREATE POLICY "patients_clinic" ON public.patients FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id()) WITH CHECK (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE TRIGGER trg_patients_updated BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.patient_tags (
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  PRIMARY KEY (patient_id, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_tags TO authenticated;
GRANT ALL ON public.patient_tags TO service_role;
ALTER TABLE public.patient_tags ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY "patient_tags_clinic" ON public.patient_tags FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id()) WITH CHECK (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL, slug text NOT NULL,
  position int NOT NULL DEFAULT 0, color text NOT NULL DEFAULT '#64748b',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_stages TO authenticated;
GRANT ALL ON public.pipeline_stages TO service_role;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_stages_clinic ON public.pipeline_stages(clinic_id);
DO $do$ BEGIN
  CREATE POLICY "stages_select" ON public.pipeline_stages FOR SELECT TO authenticated
  USING (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "stages_manage" ON public.pipeline_stages FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (clinic_id = public.get_my_clinic_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.pipeline_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE RESTRICT,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  position int NOT NULL DEFAULT 0,
  potential_value numeric(12,2) DEFAULT 0,
  next_activity text, next_activity_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_cards TO authenticated;
GRANT ALL ON public.pipeline_cards TO service_role;
ALTER TABLE public.pipeline_cards ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cards_clinic ON public.pipeline_cards(clinic_id);
CREATE INDEX IF NOT EXISTS idx_cards_stage ON public.pipeline_cards(stage_id);
DO $do$ BEGIN
  CREATE POLICY "cards_clinic" ON public.pipeline_cards FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id()) WITH CHECK (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE TRIGGER trg_cards_updated BEFORE UPDATE ON public.pipeline_cards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.patient_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  event_type text NOT NULL, description text NOT NULL,
  metadata jsonb, actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_timeline TO authenticated;
GRANT ALL ON public.patient_timeline TO service_role;
ALTER TABLE public.patient_timeline ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_timeline_patient ON public.patient_timeline(patient_id);
DO $do$ BEGIN
  CREATE POLICY "timeline_clinic" ON public.patient_timeline FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id()) WITH CHECK (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL, default_price numeric(12,2) DEFAULT 0,
  duration_minutes int DEFAULT 30, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.procedures TO authenticated;
GRANT ALL ON public.procedures TO service_role;
ALTER TABLE public.procedures ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY "procedures_clinic" ON public.procedures FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id()) WITH CHECK (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  procedure_id uuid REFERENCES public.procedures(id) ON DELETE SET NULL,
  title text, status public.appointment_status NOT NULL DEFAULT 'scheduled',
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  notes text, produced_value numeric(12,2) DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_appt_clinic ON public.appointments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_appt_prof_time ON public.appointments(professional_id, starts_at);
DO $do$ BEGIN
  CREATE POLICY "appointments_clinic" ON public.appointments FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id()) WITH CHECK (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE TRIGGER trg_appt_updated BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.appointment_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  from_status public.appointment_status,
  to_status public.appointment_status NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_status_history TO authenticated;
GRANT ALL ON public.appointment_status_history TO service_role;
ALTER TABLE public.appointment_status_history ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY "appt_history_clinic" ON public.appointment_status_history FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id()) WITH CHECK (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.negotiations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Orçamento',
  status public.negotiation_status NOT NULL DEFAULT 'negotiating',
  original_value numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  final_value numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text, installments int DEFAULT 1, valid_until date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.negotiations TO authenticated;
GRANT ALL ON public.negotiations TO service_role;
ALTER TABLE public.negotiations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_neg_clinic ON public.negotiations(clinic_id);
DO $do$ BEGIN
  CREATE POLICY "negotiations_clinic" ON public.negotiations FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id()) WITH CHECK (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE TRIGGER trg_neg_updated BEFORE UPDATE ON public.negotiations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.negotiation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  negotiation_id uuid NOT NULL REFERENCES public.negotiations(id) ON DELETE CASCADE,
  procedure_id uuid REFERENCES public.procedures(id) ON DELETE SET NULL,
  description text NOT NULL, quantity int NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.negotiation_items TO authenticated;
GRANT ALL ON public.negotiation_items TO service_role;
ALTER TABLE public.negotiation_items ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY "neg_items_clinic" ON public.negotiation_items FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id()) WITH CHECK (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.negotiation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  negotiation_id uuid NOT NULL REFERENCES public.negotiations(id) ON DELETE CASCADE,
  description text NOT NULL, metadata jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.negotiation_history TO authenticated;
GRANT ALL ON public.negotiation_history TO service_role;
ALTER TABLE public.negotiation_history ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY "neg_history_clinic" ON public.negotiation_history FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id()) WITH CHECK (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.medical_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL UNIQUE REFERENCES public.patients(id) ON DELETE CASCADE,
  anamnesis text, clinical_history text, allergies text, medications text,
  conditions text, treatment_plan text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.medical_records TO authenticated;
GRANT ALL ON public.medical_records TO service_role;
ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY "records_clinical_read" ON public.medical_records FOR SELECT TO authenticated
  USING (clinic_id = public.get_my_clinic_id() AND public.can_view_clinical());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "records_clinical_write" ON public.medical_records FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.get_my_clinic_id() AND public.can_view_clinical());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "records_clinical_update" ON public.medical_records FOR UPDATE TO authenticated
  USING (clinic_id = public.get_my_clinic_id() AND public.can_view_clinical())
  WITH CHECK (clinic_id = public.get_my_clinic_id() AND public.can_view_clinical());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE TRIGGER trg_records_updated BEFORE UPDATE ON public.medical_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.clinical_evolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  content text NOT NULL,
  edit_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.clinical_evolutions TO authenticated;
GRANT ALL ON public.clinical_evolutions TO service_role;
ALTER TABLE public.clinical_evolutions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_evolutions_patient ON public.clinical_evolutions(patient_id);
DO $do$ BEGIN
  CREATE POLICY "evolutions_clinical_read" ON public.clinical_evolutions FOR SELECT TO authenticated
  USING (clinic_id = public.get_my_clinic_id() AND public.can_view_clinical());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "evolutions_clinical_write" ON public.clinical_evolutions FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.get_my_clinic_id() AND public.can_view_clinical());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "evolutions_clinical_update" ON public.clinical_evolutions FOR UPDATE TO authenticated
  USING (clinic_id = public.get_my_clinic_id() AND public.can_view_clinical())
  WITH CHECK (clinic_id = public.get_my_clinic_id() AND public.can_view_clinical());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE TRIGGER trg_evolutions_updated BEFORE UPDATE ON public.clinical_evolutions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.clinical_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  name text NOT NULL, storage_path text NOT NULL, file_type text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinical_files TO authenticated;
GRANT ALL ON public.clinical_files TO service_role;
ALTER TABLE public.clinical_files ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY "files_clinical" ON public.clinical_files FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id() AND public.can_view_clinical())
  WITH CHECK (clinic_id = public.get_my_clinic_id() AND public.can_view_clinical());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  phone text NOT NULL, contact_name text,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message text, last_message_at timestamptz,
  unread_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY "conversations_clinic" ON public.conversations FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id()) WITH CHECK (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE TRIGGER trg_conv_updated BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT 'inbound',
  body text NOT NULL,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_messages_conv ON public.messages(conversation_id);
DO $do$ BEGIN
  CREATE POLICY "messages_clinic" ON public.messages FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id()) WITH CHECK (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL UNIQUE REFERENCES public.clinics(id) ON DELETE CASCADE,
  provider text, status public.whatsapp_status NOT NULL DEFAULT 'disconnected',
  phone_number text, last_connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_connections TO authenticated;
GRANT ALL ON public.whatsapp_connections TO service_role;
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY "wa_conn_read" ON public.whatsapp_connections FOR SELECT TO authenticated
  USING (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "wa_conn_manage" ON public.whatsapp_connections FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (clinic_id = public.get_my_clinic_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE TRIGGER trg_wa_updated BEFORE UPDATE ON public.whatsapp_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL, resource_type text NOT NULL, resource_id text,
  changes jsonb, ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_audit_clinic ON public.audit_logs(clinic_id);
DO $do$ BEGIN
  CREATE POLICY "audit_read_admin" ON public.audit_logs FOR SELECT TO authenticated
  USING (clinic_id = public.get_my_clinic_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.medical_record_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.medical_record_access_logs TO authenticated;
GRANT ALL ON public.medical_record_access_logs TO service_role;
ALTER TABLE public.medical_record_access_logs ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY "mr_access_read_admin" ON public.medical_record_access_logs FOR SELECT TO authenticated
  USING (clinic_id = public.get_my_clinic_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "mr_access_insert" ON public.medical_record_access_logs FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.get_my_clinic_id() AND public.can_view_clinical());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_clinic_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_clinical() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_clinic_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_clinical() TO authenticated;

CREATE TABLE IF NOT EXISTS public.notification_settings (
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
DO $do$ BEGIN
  CREATE POLICY "notif_settings_read" ON public.notification_settings FOR SELECT TO authenticated
  USING (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "notif_settings_manage" ON public.notification_settings FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (clinic_id = public.get_my_clinic_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE TRIGGER trg_notif_settings_updated BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


CREATE TABLE IF NOT EXISTS public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  channel text NOT NULL, recipient_type text NOT NULL, recipient text,
  kind text NOT NULL, status text NOT NULL, error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.notification_log TO authenticated;
GRANT ALL ON public.notification_log TO service_role;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_notif_log_clinic ON public.notification_log(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_log_appt ON public.notification_log(appointment_id);
DO $do$ BEGIN
  CREATE POLICY "notif_log_read" ON public.notification_log FOR SELECT TO authenticated
  USING (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE POLICY "notif_log_insert" ON public.notification_log FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.get_my_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;


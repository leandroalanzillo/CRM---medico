-- ============ FINANCIAL MODULE ============
-- Receitas, despesas, contas a pagar/receber e fluxo de caixa por clínica.

CREATE TYPE public.financial_type AS ENUM ('income', 'expense');
CREATE TYPE public.financial_status AS ENUM ('pending', 'paid', 'cancelled');

-- ============ FINANCIAL CATEGORIES ============
CREATE TABLE public.financial_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  type public.financial_type NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_categories TO authenticated;
GRANT ALL ON public.financial_categories TO service_role;
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_fin_categories_clinic ON public.financial_categories(clinic_id);
CREATE POLICY "fin_categories_manage" ON public.financial_categories FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (clinic_id = public.get_my_clinic_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));

-- ============ FINANCIAL TRANSACTIONS ============
-- A single table models both "contas a receber" (type=income) and
-- "contas a pagar" (type=expense). "Vencido/overdue" is derived in the
-- app from due_date + status = 'pending' rather than stored, so no
-- scheduled job is needed to keep it in sync.
CREATE TABLE public.financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  type public.financial_type NOT NULL,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  due_date date NOT NULL,
  paid_at timestamptz,
  status public.financial_status NOT NULL DEFAULT 'pending',
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  negotiation_id uuid REFERENCES public.negotiations(id) ON DELETE SET NULL,
  payment_method text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_transactions TO authenticated;
GRANT ALL ON public.financial_transactions TO service_role;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_fin_tx_clinic ON public.financial_transactions(clinic_id);
CREATE INDEX idx_fin_tx_due_date ON public.financial_transactions(clinic_id, due_date);
CREATE INDEX idx_fin_tx_status ON public.financial_transactions(clinic_id, status);
CREATE POLICY "fin_tx_manage" ON public.financial_transactions FOR ALL TO authenticated
  USING (clinic_id = public.get_my_clinic_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (clinic_id = public.get_my_clinic_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
CREATE TRIGGER trg_fin_tx_updated BEFORE UPDATE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

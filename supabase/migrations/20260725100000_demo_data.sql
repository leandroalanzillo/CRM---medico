-- ============ DEMO DATA (fictitious, for demonstration purposes) ============
-- Populates the first clinic with realistic-looking sample data across every
-- module so the CRM can be demoed without waiting on real patients. Safe to
-- re-run: skips entirely if demo data already exists (checks for the
-- marker patient "Ana Beatriz Souza (Demo)").
--
-- All names/CPFs/phones/emails below are fictitious. CPFs are randomly
-- generated digit strings — NOT validated real documents — do not use
-- them for anything beyond visual demonstration.

DO $$
DECLARE
  cid uuid;
  prof_ids uuid[];
  proc_ids uuid[];
  ins_ids uuid[];
  cat_income_id uuid;
  cat_expense_id uuid;
  p_id uuid;
  patient_ids uuid[] := ARRAY[]::uuid[];
  names text[] := ARRAY[
    'Ana Beatriz Souza (Demo)', 'Carlos Eduardo Lima', 'Beatriz Ferreira Costa',
    'Diego Martins Alves', 'Fernanda Ribeiro Dias', 'Gustavo Henrique Pinto',
    'Isabela Cristina Nunes', 'João Pedro Rocha', 'Larissa Gomes Teixeira',
    'Marcelo Augusto Barros', 'Natália Vieira Campos', 'Otávio Ramos Cardoso',
    'Patrícia Almeida Fonseca', 'Rafael Souza Martins', 'Sabrina Oliveira Reis',
    'Thiago Henrique Nunes', 'Vanessa Cristina Lopes', 'William Santos Pereira'
  ];
  phones text[] := ARRAY[
    '11982114432','11977332201','21996548871','11966223390','31988991123',
    '11955117765','19998876612','11981234567','21974568890','11963452278',
    '11912345678','11998871123','11987654321','21999887766','31987654321',
    '11976543210','21965432198','11954321987'
  ];
  kinds public.patient_kind[] := ARRAY['patient','patient','patient','lead','patient','patient',
    'lead','patient','patient','patient','lead','patient','patient','lead','patient','patient','lead','patient']::public.patient_kind[];
  i int;
  n int;
BEGIN
  SELECT id INTO cid FROM public.clinics LIMIT 1;
  IF cid IS NULL THEN RETURN; END IF;

  -- Already seeded? Bail out cleanly (idempotent).
  IF EXISTS (SELECT 1 FROM public.patients WHERE clinic_id = cid AND full_name = 'Ana Beatriz Souza (Demo)') THEN
    RETURN;
  END IF;

  SELECT array_agg(id) INTO prof_ids FROM public.professionals WHERE clinic_id = cid;
  SELECT array_agg(id) INTO proc_ids FROM public.procedures WHERE clinic_id = cid;
  IF prof_ids IS NULL OR array_length(prof_ids, 1) = 0 THEN RETURN; END IF; -- needs the professionals seed to have run first

  -- Convênios (only add if the clinic doesn't have any yet)
  IF NOT EXISTS (SELECT 1 FROM public.insurance_providers WHERE clinic_id = cid) THEN
    INSERT INTO public.insurance_providers (clinic_id, name, ans_registry, phone, reimbursement_days, active) VALUES
      (cid, 'Unimed', '359318', '0800 123 4567', 30, true),
      (cid, 'Bradesco Saúde', '005711', '0800 765 4321', 45, true),
      (cid, 'SulAmérica', '006246', '0800 111 2222', 30, true);
  END IF;
  SELECT array_agg(id) INTO ins_ids FROM public.insurance_providers WHERE clinic_id = cid;

  -- Financial categories: this clinic was created via a raw SQL seed
  -- (not the normal bootstrapClinic() onboarding flow), so — same gap as
  -- professionals/procedures before — it likely has none yet either.
  IF NOT EXISTS (SELECT 1 FROM public.financial_categories WHERE clinic_id = cid) THEN
    INSERT INTO public.financial_categories (clinic_id, name, type, color) VALUES
      (cid, 'Consultas e procedimentos', 'income', '#10b981'),
      (cid, 'Convênios', 'income', '#3b82f6'),
      (cid, 'Outras receitas', 'income', '#0ea5e9'),
      (cid, 'Folha de pagamento', 'expense', '#ef4444'),
      (cid, 'Aluguel e contas', 'expense', '#f97316'),
      (cid, 'Materiais e insumos', 'expense', '#f59e0b'),
      (cid, 'Marketing', 'expense', '#8b5cf6'),
      (cid, 'Outras despesas', 'expense', '#64748b');
  END IF;
  SELECT id INTO cat_income_id FROM public.financial_categories WHERE clinic_id = cid AND type = 'income' ORDER BY created_at LIMIT 1;
  SELECT id INTO cat_expense_id FROM public.financial_categories WHERE clinic_id = cid AND type = 'expense' ORDER BY created_at LIMIT 1;

  -- ---- Patients ----
  n := array_length(names, 1);
  FOR i IN 1..n LOOP
    INSERT INTO public.patients (
      clinic_id, kind, full_name, cpf, birth_date, phone, whatsapp, email,
      address, insurance_provider_id, professional_id, source, active
    ) VALUES (
      cid, kinds[i], names[i],
      lpad((100000000 + (i * 7919))::text, 11, '0'),
      (date '1965-01-01' + ((i * 733) || ' days')::interval)::date,
      phones[i], phones[i],
      replace(lower(regexp_replace(split_part(names[i], ' (', 1), '[^a-zA-Z ]', '', 'g')), ' ', '.') || '@example.com',
      'Rua ' || (i + 100) || ', São Paulo - SP',
      CASE WHEN i % 3 = 0 THEN ins_ids[1 + (i % array_length(ins_ids,1))] ELSE NULL END,
      prof_ids[1 + (i % array_length(prof_ids,1))],
      CASE WHEN i % 4 = 0 THEN 'Indicação' WHEN i % 4 = 1 THEN 'Instagram' WHEN i % 4 = 2 THEN 'Google' ELSE 'WhatsApp' END,
      true
    ) RETURNING id INTO p_id;
    patient_ids := array_append(patient_ids, p_id);
  END LOOP;

  -- ---- Appointments: last 21 days (mostly finished/cancelled/no_show, with produced_value) ----
  FOR i IN 1..24 LOOP
    INSERT INTO public.appointments (
      clinic_id, patient_id, professional_id, procedure_id, title, status,
      starts_at, ends_at, produced_value, notes
    ) VALUES (
      cid,
      patient_ids[1 + (i % n)],
      prof_ids[1 + (i % array_length(prof_ids,1))],
      proc_ids[1 + (i % array_length(proc_ids,1))],
      'Consulta',
      (ARRAY['finished','finished','finished','finished','cancelled','no_show']::public.appointment_status[])[1 + (i % 6)],
      (current_date - (21 - i))::date + time '09:00' + ((i % 8) * 45 || ' minutes')::interval,
      (current_date - (21 - i))::date + time '09:30' + ((i % 8) * 45 || ' minutes')::interval,
      CASE WHEN i % 6 <= 3 THEN (150 + (i * 23) % 350)::numeric ELSE 0 END,
      NULL
    );
  END LOOP;

  -- ---- Appointments: next 14 days (scheduled/confirmed, no produced_value yet) ----
  FOR i IN 1..16 LOOP
    INSERT INTO public.appointments (
      clinic_id, patient_id, professional_id, procedure_id, title, status,
      starts_at, ends_at
    ) VALUES (
      cid,
      patient_ids[1 + (i % n)],
      prof_ids[1 + (i % array_length(prof_ids,1))],
      proc_ids[1 + (i % array_length(proc_ids,1))],
      'Consulta',
      (ARRAY['scheduled','confirmed']::public.appointment_status[])[1 + (i % 2)],
      (current_date + i)::date + time '09:00' + ((i % 8) * 45 || ' minutes')::interval,
      (current_date + i)::date + time '09:30' + ((i % 8) * 45 || ' minutes')::interval
    );
  END LOOP;

  -- ---- Financial transactions ----
  FOR i IN 1..10 LOOP
    INSERT INTO public.financial_transactions (
      clinic_id, type, category_id, description, amount, due_date, paid_at, status, patient_id
    ) VALUES (
      cid, 'income', cat_income_id,
      'Consulta - ' || (SELECT full_name FROM public.patients WHERE id = patient_ids[1 + (i % n)]),
      (180 + (i * 37) % 300)::numeric,
      (current_date - ((20 - i * 2) || ' days')::interval)::date,
      (current_date - ((20 - i * 2) || ' days')::interval)::date,
      'paid', patient_ids[1 + (i % n)]
    );
  END LOOP;
  -- a couple of pending / overdue receivables
  INSERT INTO public.financial_transactions (clinic_id, type, category_id, description, amount, due_date, status, patient_id) VALUES
    (cid, 'income', cat_income_id, 'Consulta - ' || (SELECT full_name FROM public.patients WHERE id = patient_ids[3]), 280, current_date + 4, 'pending', patient_ids[3]),
    (cid, 'income', cat_income_id, 'Consulta - ' || (SELECT full_name FROM public.patients WHERE id = patient_ids[7]), 220, current_date - 6, 'pending', patient_ids[7]); -- overdue
  -- expenses
  INSERT INTO public.financial_transactions (clinic_id, type, category_id, description, amount, due_date, paid_at, status) VALUES
    (cid, 'expense', cat_expense_id, 'Aluguel da clínica', 4500, current_date - 5, current_date - 5, 'paid'),
    (cid, 'expense', cat_expense_id, 'Material de consumo (luvas, seringas)', 620, current_date - 12, current_date - 12, 'paid'),
    (cid, 'expense', cat_expense_id, 'Internet e telefonia', 280, current_date - 3, current_date - 3, 'paid'),
    (cid, 'expense', cat_expense_id, 'Folha de pagamento - equipe', 8200, current_date + 5, NULL, 'pending'),
    (cid, 'expense', cat_expense_id, 'Marketing (anúncios)', 450, current_date + 10, NULL, 'pending'),
    (cid, 'expense', cat_expense_id, 'Manutenção de equipamentos', 340, current_date - 20, current_date - 18, 'paid');

  -- ---- Negotiations ----
  INSERT INTO public.negotiations (clinic_id, patient_id, professional_id, title, status, original_value, discount, final_value, payment_method, installments) VALUES
    (cid, patient_ids[2], prof_ids[1], 'Tratamento completo', 'accepted', 2400, 200, 2200, 'Cartão de crédito', 4),
    (cid, patient_ids[5], prof_ids[2], 'Pacote de sessões', 'negotiating', 1800, 0, 1800, NULL, 1),
    (cid, patient_ids[9], prof_ids[3], 'Avaliação + procedimento', 'awaiting', 950, 50, 900, 'Pix', 1),
    (cid, patient_ids[12], prof_ids[1], 'Orçamento inicial', 'rejected', 3200, 0, 3200, NULL, 1);

  -- ---- Waitlist ----
  INSERT INTO public.waitlist (clinic_id, patient_id, professional_id, procedure_id, preferred_period, status) VALUES
    (cid, patient_ids[11], prof_ids[1], proc_ids[1], 'Manhãs', 'waiting'),
    (cid, patient_ids[14], prof_ids[2], proc_ids[2], 'Qualquer horário quinta-feira', 'waiting'),
    (cid, patient_ids[17], NULL, NULL, 'Tardes', 'waiting');

END $$;

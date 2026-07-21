-- ============ DEFAULT PROFESSIONALS + PROCEDURES ============
-- Clinics created through the raw-SQL admin/recepcionista seed
-- (20260716025523_*.sql inserts a bare `clinics` row directly) never went
-- through bootstrapClinic(), which is what normally seeds one professional
-- (the signing-up admin) and 3 procedures. Without at least one
-- professional, "Novo agendamento" has nothing to put in the Profissional
-- dropdown and can never be submitted — exactly the empty-dropdown bug
-- reported. This backfills 3 generic professional profiles + procedures
-- for any clinic that currently has zero of either, so the form is usable
-- immediately; rename/replace them with the real team in Configurações.

DO $$
DECLARE
  cid uuid;
BEGIN
  FOR cid IN SELECT id FROM public.clinics LOOP
    IF NOT EXISTS (SELECT 1 FROM public.professionals WHERE clinic_id = cid) THEN
      INSERT INTO public.professionals (clinic_id, name, color, active) VALUES
        (cid, 'Dr. Ricardo Mendes', '#2dd4bf', true),
        (cid, 'Dra. Fernanda Alves', '#8b5cf6', true),
        (cid, 'Dr. Paulo Sousa', '#f59e0b', true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.procedures WHERE clinic_id = cid) THEN
      INSERT INTO public.procedures (clinic_id, name, default_price, duration_minutes) VALUES
        (cid, 'Consulta', 250, 30),
        (cid, 'Avaliação', 150, 30),
        (cid, 'Retorno', 0, 20),
        (cid, 'Consulta inicial', 300, 45);
    END IF;
  END LOOP;
END $$;

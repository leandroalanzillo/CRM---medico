-- ============ AUDIT ACCESS: ADMIN ONLY ============
-- Auditoria was readable by admin OR manager; tightening to admin only,
-- matching the app's access gate.
DROP POLICY IF EXISTS "audit_read_admin" ON public.audit_logs;
CREATE POLICY "audit_read_admin" ON public.audit_logs FOR SELECT TO authenticated
USING (clinic_id = public.get_my_clinic_id() AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "mr_access_read_admin" ON public.medical_record_access_logs;
CREATE POLICY "mr_access_read_admin" ON public.medical_record_access_logs FOR SELECT TO authenticated
USING (clinic_id = public.get_my_clinic_id() AND public.has_role(auth.uid(), 'admin'));

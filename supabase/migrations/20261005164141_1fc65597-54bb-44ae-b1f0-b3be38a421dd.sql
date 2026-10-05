-- SEC-CRIT-01B: defect found during reviewer/persona proof. External users hold
-- application_management.view (for their own applications), which made the broad
-- permission branch of secure_documents_read expose EVERY registration upload.
-- Registration uploads are now readable only by internal staff / super admin here;
-- applicants read their own bound files via "Registration owner reads bound
-- registration uploads", and pre-login applicants via the capability function.
-- Non-registration folders keep their existing behaviour (unchanged).
DROP POLICY IF EXISTS secure_documents_read ON storage.objects;
CREATE POLICY secure_documents_read ON storage.objects FOR SELECT TO public
USING (
  bucket_id = 'secure-documents' AND (
    public.is_super_admin(auth.uid())
    OR (auth.uid())::text = (storage.foldername(name))[1]
    OR (
      ((storage.foldername(name))[1] IS DISTINCT FROM 'registrations' OR public.is_internal_staff(auth.uid()))
      AND (
        public.has_permission(auth.uid(), 'licensee_management', 'view_all_entities')
        OR public.has_permission(auth.uid(), 'audit_management', 'view')
        OR public.has_permission(auth.uid(), 'application_management', 'view')
        OR public.has_permission(auth.uid(), 'complaint_management', 'view')
        OR public.has_permission(auth.uid(), 'returns_management', 'view')
      )
    )
  )
);
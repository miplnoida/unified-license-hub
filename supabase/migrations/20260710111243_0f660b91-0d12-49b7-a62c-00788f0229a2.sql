
-- audit_logs SELECT: allow all internal staff
DROP POLICY IF EXISTS "Admins can read audit logs" ON public.audit_logs;
CREATE POLICY "Internal staff can read audit logs"
  ON public.audit_logs FOR SELECT
  USING (public.is_internal_staff(auth.uid()));

-- documents SELECT
DROP POLICY IF EXISTS "Read documents" ON public.documents;
CREATE POLICY "Read documents"
  ON public.documents FOR SELECT
  USING (auth.uid() = uploaded_by OR public.is_internal_staff(auth.uid()));

-- file_uploads SELECT
DROP POLICY IF EXISTS "Users read own uploads" ON public.file_uploads;
CREATE POLICY "Users read own uploads"
  ON public.file_uploads FOR SELECT
  USING (uploaded_by = auth.uid() OR public.is_internal_staff(auth.uid()));

-- secure-documents bucket SELECT
DROP POLICY IF EXISTS "Users read own secure-documents" ON storage.objects;
CREATE POLICY "Users read own secure-documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'secure-documents'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.is_internal_staff(auth.uid())
    )
  );

-- Extend user_can_access_document_object to include all internal staff
CREATE OR REPLACE FUNCTION public.user_can_access_document_object(_object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  rec record;
BEGIN
  IF uid IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_internal_staff(uid) THEN
    RETURN true;
  END IF;

  SELECT uploaded_by, entity_type, entity_id::text AS entity_id
    INTO rec
    FROM public.documents
   WHERE file_path = _object_name
   LIMIT 1;

  IF NOT FOUND THEN
    SELECT uploaded_by, entity_type, entity_id::text AS entity_id
      INTO rec
      FROM public.file_uploads
     WHERE file_path = _object_name
     LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF rec.uploaded_by = uid THEN
    RETURN true;
  END IF;

  IF rec.entity_type = 'application' AND rec.entity_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.applications
      WHERE id::text = rec.entity_id AND applicant_id = uid
    );
  END IF;

  RETURN false;
END;
$$;

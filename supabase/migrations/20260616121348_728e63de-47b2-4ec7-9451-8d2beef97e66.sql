-- Allow anon and authenticated registration/form uploads to also use the
-- versioned document upload path which stamps file_uploads.entity_type as
-- 'document_version'. This is what the Form Management bulk uploader does.
DROP POLICY IF EXISTS "Allow anon registration file_uploads insert" ON public.file_uploads;

CREATE POLICY "Allow anon registration file_uploads insert"
ON public.file_uploads
FOR INSERT
TO anon
WITH CHECK (
  entity_type = ANY (ARRAY['registration'::text, 'form_field'::text, 'document_version'::text])
);

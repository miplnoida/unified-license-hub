
-- Allow anon uploads to secure-documents bucket under registrations/ path
CREATE POLICY "Allow anon registration uploads"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'secure-documents'
  AND (storage.foldername(name))[1] = 'registrations'
);

-- Allow anon to read their uploaded registration files (for preview)
CREATE POLICY "Allow anon read registration uploads"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'secure-documents'
  AND (storage.foldername(name))[1] = 'registrations'
);

-- Allow anon to delete registration uploads (remove before submit)
CREATE POLICY "Allow anon delete registration uploads"
ON storage.objects
FOR DELETE
TO anon
USING (
  bucket_id = 'secure-documents'
  AND (storage.foldername(name))[1] = 'registrations'
);

-- Allow anon inserts to file_uploads for registration context
CREATE POLICY "Allow anon registration file_uploads insert"
ON public.file_uploads
FOR INSERT
TO anon
WITH CHECK (
  entity_type IN ('registration', 'form_field')
);

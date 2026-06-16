
-- Mirror the anon "registrations/" policies for authenticated users so that
-- Register Step 3 uploads work after the registration flow has created a
-- session (OTP verification). The bucket stays private; only the
-- `registrations/` prefix is opened up.

DROP POLICY IF EXISTS "Authenticated registration uploads" ON storage.objects;
CREATE POLICY "Authenticated registration uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'secure-documents'
  AND (storage.foldername(name))[1] = 'registrations'
);

DROP POLICY IF EXISTS "Authenticated read registration uploads" ON storage.objects;
CREATE POLICY "Authenticated read registration uploads"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'secure-documents'
  AND (storage.foldername(name))[1] = 'registrations'
);

DROP POLICY IF EXISTS "Authenticated delete registration uploads" ON storage.objects;
CREATE POLICY "Authenticated delete registration uploads"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'secure-documents'
  AND (storage.foldername(name))[1] = 'registrations'
);

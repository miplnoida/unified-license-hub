
CREATE POLICY "license_certificates internal read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'license-certificates' AND (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
  )
);

CREATE POLICY "license_certificates holder read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'license-certificates'
  AND EXISTS (
    SELECT 1 FROM public.licenses l
    JOIN public.licensees lic ON lic.license_id = l.id
    JOIN public.entity_user_access eua ON eua.entity_id = lic.id
    WHERE l.id::text = split_part(storage.objects.name, '/', 1)
      AND eua.user_id = auth.uid()
      AND eua.is_active = true
  )
);

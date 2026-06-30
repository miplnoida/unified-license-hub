
-- RLS policies for certificate-assets bucket
CREATE POLICY "Admins manage certificate-assets"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'certificate-assets'
  AND (public.has_role(auth.uid(), 'super_admin'::public.app_role)
       OR public.has_role(auth.uid(), 'admin'::public.app_role))
)
WITH CHECK (
  bucket_id = 'certificate-assets'
  AND (public.has_role(auth.uid(), 'super_admin'::public.app_role)
       OR public.has_role(auth.uid(), 'admin'::public.app_role))
);

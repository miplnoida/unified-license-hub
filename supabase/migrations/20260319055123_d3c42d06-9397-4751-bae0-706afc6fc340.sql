INSERT INTO storage.buckets (id, name, public) VALUES ('branding-assets', 'branding-assets', true);

CREATE POLICY "Anyone can read branding assets" ON storage.objects FOR SELECT TO public USING (bucket_id = 'branding-assets');

CREATE POLICY "Admins upload branding assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'branding-assets' AND (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Admins delete branding assets" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'branding-assets' AND (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Admins update branding assets" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'branding-assets' AND (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
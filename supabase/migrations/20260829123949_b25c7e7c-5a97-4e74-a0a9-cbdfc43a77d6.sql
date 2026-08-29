REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.post_license_fp_subject_links FROM authenticated;
REVOKE ALL ON public.post_license_fp_subject_links FROM anon;
GRANT SELECT ON public.post_license_fp_subject_links TO authenticated;
GRANT ALL ON public.post_license_fp_subject_links TO service_role;
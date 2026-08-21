CREATE OR REPLACE FUNCTION public.fp_assessment_case_licensee_name(_licensee_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT l.name FROM public.licensees l WHERE l.id = _licensee_id $$;

REVOKE ALL ON FUNCTION public.fp_assessment_case_licensee_name(uuid) FROM PUBLIC, anon, authenticated;
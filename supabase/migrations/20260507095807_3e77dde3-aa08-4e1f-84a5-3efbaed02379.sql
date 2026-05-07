CREATE OR REPLACE FUNCTION public.check_applicant_name_exists(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.registrations
    WHERE lower(btrim(applicant_name)) = lower(btrim(p_name))
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_applicant_name_exists(text) TO anon, authenticated;
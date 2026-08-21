DO $do$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.fp_assessment_case(uuid)'::regprocedure) INTO v_def;
  v_def := replace(v_def, 'SELECT l.legal_name FROM public.licensees l', 'SELECT l.name FROM public.licensees l');
  EXECUTE v_def;
END $do$;

DROP FUNCTION IF EXISTS public.fp_assessment_case_licensee_name(uuid);
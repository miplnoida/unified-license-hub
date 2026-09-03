DO $mig$
DECLARE
  d text;
  old_snip text := $old$'open_findings', (SELECT count(*) FROM public.examination_findings ef
          WHERE ef.examination_id = e.id AND ef.status <> 'closed')) AS x$old$;
  new_snip text := $new$'open_findings', (SELECT count(*) FROM public.supervisory_finding sf
          WHERE sf.examination_id = e.id
            AND lower(coalesce(sf.status,'')) NOT IN ('closed','withdrawn','superseded'))) AS x$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'entity360_section';

  IF d IS NULL THEN
    RAISE EXCEPTION 'entity360_section not found';
  END IF;
  IF position(old_snip in d) = 0 THEN
    RAISE EXCEPTION 'AMLH-31 patch target not found in entity360_section';
  END IF;

  d := replace(d, old_snip, new_snip);

  IF d LIKE '%examination_findings%' THEN
    RAISE EXCEPTION 'AMLH-31 patch incomplete: legacy examination_findings still referenced';
  END IF;
  IF d LIKE '%aml_findings%' OR d LIKE '%aml_assessments%' THEN
    RAISE EXCEPTION 'AMLH-31 patch would reintroduce a retired AML table';
  END IF;
  IF d NOT LIKE '%SECURITY DEFINER%' OR d NOT LIKE '%SET search_path%' THEN
    RAISE EXCEPTION 'AMLH-31 patch would drop definer/search_path attributes';
  END IF;

  EXECUTE d;
END $mig$;
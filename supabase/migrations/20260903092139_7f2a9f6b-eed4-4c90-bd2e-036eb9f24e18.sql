-- Retire the empty duplicate AML finding store. Canonical AML/CFT findings live
-- on public.supervisory_finding only.
DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public.aml_findings') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT count(*) FROM public.aml_findings' INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'aml_findings holds % row(s); migrate them to supervisory_finding before retirement', n;
  END IF;
  EXECUTE 'DROP TABLE public.aml_findings';
END $$;
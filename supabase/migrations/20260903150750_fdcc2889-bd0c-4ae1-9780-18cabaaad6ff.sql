-- EPIC 4 / W6 — inspection convergence: retire legacy inspection writers.
-- Both tables are empty (0 rows) and have no remaining code readers/writers.

DO $$
BEGIN
  IF (SELECT count(*) FROM public.inspections) <> 0
     OR (SELECT count(*) FROM public.inspection_findings) <> 0 THEN
    RAISE EXCEPTION 'legacy inspection tables are not empty — retirement aborted';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.inspection_create(jsonb);
DROP FUNCTION IF EXISTS public.inspection_lifecycle_save(uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.inspection_finding_save(uuid, uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.inspection_finding_escalate(uuid, text, text);

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('inspection_create','inspection_lifecycle_save',
                        'inspection_finding_save','inspection_finding_escalate')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
  END LOOP;
END $$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.inspections FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.inspection_findings FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.inspections FROM service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.inspection_findings FROM service_role;

COMMENT ON TABLE public.inspections IS
  'RETIRED_EMPTY (EPIC 4 / W6). Zero rows, zero code readers, zero writers; all write privileges revoked and the inspection_* write functions dropped. Canonical replacement: public.examinations (engagement taxonomy onsite/offsite/thematic/follow-up). Physical DROP deferred.';
COMMENT ON TABLE public.inspection_findings IS
  'RETIRED_EMPTY (EPIC 4 / W6). Zero rows, zero code readers, zero writers; all write privileges revoked. Canonical replacement: public.supervisory_finding (provenance to examination_id, entity_id, domain_code, scope/workpaper/evidence). Physical DROP deferred.';
-- AML-08 defect correction (found by scripts/verify-aml-supervisory-consequence-linkage.sql):
-- supervisory_consequence_record passed NULLIF(_payload->>'supervisory_objective','')
-- straight through to supervisory_plan_open. When the supervisor recorded a plan
-- without a separate objective, the plan was created with a NULL objective and
-- supervisory_plan_lifecycle then refused every transition out of DRAFT with
-- 'objective_required'. The plan was a dead end.
--
-- The supervisor's mandatory rationale is the recorded supervisory basis for
-- the plan, so it becomes the objective when no explicit objective is supplied.
-- Nothing else in the operation changes.
DO $$
DECLARE _def text; _old text; _new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_consequence_record';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'supervisory_consequence_record is missing';
  END IF;

  _old := 'NULLIF(_payload->>''supervisory_objective'','''')';
  _new := 'COALESCE(NULLIF(_payload->>''supervisory_objective'',''''), _rationale)';

  IF position(_old IN _def) = 0 THEN
    RAISE NOTICE 'AML-08: the plan objective already falls back to the rationale';
    RETURN;
  END IF;

  EXECUTE replace(_def, _old, _new);
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'supervisory_consequence_record'
       AND pg_get_functiondef(p.oid) LIKE '%COALESCE(NULLIF(_payload->>''supervisory_objective'',''''), _rationale)%'
  ) THEN
    RAISE EXCEPTION 'AML-08: the plan objective fallback was not applied';
  END IF;
END $$;
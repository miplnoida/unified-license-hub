-- F1-B permanent gate (GAP-F1-04).
-- Fails when an active regulatory service has a MISSING_REQUIRED configuration
-- dimension that is not explained by an active expectation justification.
-- Usage: npm run verify:service-completeness
\set ON_ERROR_STOP on
-- DEF-F5-B3R-01: pooled backends can arrive with a leaked row_security=off.
-- Every gate restores the default explicitly so RLS probes are deterministic.
SET row_security = on;

\echo '== service configuration completeness =='
SELECT dimension,
       count(*) FILTER (WHERE state = 'SATISFIED')             AS satisfied,
       count(*) FILTER (WHERE state = 'SATISFIED_BY_FALLBACK') AS fallback,
       count(*) FILTER (WHERE state = 'NOT_APPLICABLE')        AS not_applicable,
       count(*) FILTER (WHERE state = 'MISSING_REQUIRED')      AS missing_required
  FROM public.service_configuration_completeness
 GROUP BY dimension ORDER BY dimension;

\echo '== unexplained gaps (must be empty) =='
SELECT c.service_name, c.dimension, c.disposition
  FROM public.service_configuration_completeness c
 WHERE c.state = 'MISSING_REQUIRED'
   AND coalesce(c.status, 'active') = 'active'
   AND NOT EXISTS (
     SELECT 1 FROM public.service_config_expectations e
      WHERE e.is_active AND e.dimension = c.dimension
        AND e.justification IS NOT NULL
        AND (e.service_id IS NULL OR e.service_id = c.service_id))
 ORDER BY 1, 2;

DO $$
DECLARE v_unexplained int; v_enforced_without_requirement int;
BEGIN
  SELECT count(*) INTO v_unexplained
    FROM public.service_configuration_completeness c
   WHERE c.state = 'MISSING_REQUIRED'
     AND coalesce(c.status, 'active') = 'active'
     AND NOT EXISTS (
       SELECT 1 FROM public.service_config_expectations e
        WHERE e.is_active AND e.dimension = c.dimension
          AND e.justification IS NOT NULL
          AND (e.service_id IS NULL OR e.service_id = c.service_id));

  SELECT count(*) INTO v_enforced_without_requirement
    FROM public.decision_authority_rules
   WHERE status = 'active' AND enforcement_mode = 'ENFORCED'
     AND (required_module_key IS NULL OR required_permission_key IS NULL)
     AND NOT requires_committee;

  IF v_unexplained > 0 THEN
    RAISE EXCEPTION 'GATE FAILED: % unexplained incomplete service configuration item(s)', v_unexplained;
  END IF;
  IF v_enforced_without_requirement > 0 THEN
    RAISE EXCEPTION 'GATE FAILED: % enforced decision authority rule(s) carry no requirement', v_enforced_without_requirement;
  END IF;

  RAISE NOTICE 'GATE PASSED: service configuration completeness and decision authority are coherent';
END$$;

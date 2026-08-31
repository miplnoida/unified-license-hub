-- =====================================================================
-- AI GOVERNANCE — CUSTOMER-FACING VENDOR NEUTRALITY CERTIFICATION
--
-- Proves, without changing any data, that:
--   * regulator/customer-facing governance reads carry no vendor identity;
--   * true technical provenance is retained unchanged in the record;
--   * raw provenance is reachable only through a permission gate, enforced by
--     database privileges rather than by the interface.
--
-- Run:  psql -f scripts/verify-ai-governance-vendor-neutrality.sql
-- Every gate prints PASS or FAIL. Read-only.
-- =====================================================================
\set ON_ERROR_STOP off
\pset pager off

\echo '=== G1  Governance presentation columns exist on the model register'
SELECT CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL' END AS g1, count(*) AS found
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ai_governance_models'
  AND column_name IN ('governance_display_name','governance_version_label');

\echo '=== G2  Alias configuration table exists, is protected and is populated'
SELECT CASE WHEN c.relrowsecurity AND a.n >= 5 THEN 'PASS' ELSE 'FAIL' END AS g2,
       c.relrowsecurity AS rls_enabled, a.n AS alias_rows
FROM pg_class c
CROSS JOIN (SELECT count(*) n FROM public.ai_governance_presentation_aliases) a
WHERE c.oid = 'public.ai_governance_presentation_aliases'::regclass;

\echo '=== G3  Every active model carries a vendor-neutral governance identity'
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS g3,
       count(*) AS models_without_governance_identity
FROM public.ai_governance_models
WHERE governance_display_name IS NULL OR btrim(governance_display_name) = '';

\echo '=== G4  No governance identity leaks a vendor or technical model name'
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS g4, count(*) AS leaking_labels
FROM (
  SELECT governance_display_name v FROM public.ai_governance_models
  UNION ALL SELECT governance_version_label FROM public.ai_governance_models
  UNION ALL SELECT display_value FROM public.ai_governance_presentation_aliases
) s
WHERE s.v IS NOT NULL
  AND (s.v ILIKE '%gemini%' OR s.v ILIKE '%google%' OR s.v ILIKE '%lovable%'
       OR s.v ILIKE '%openai%' OR s.v ILIKE '%gpt%' OR s.v ILIKE '%anthropic%' OR s.v ILIKE '%claude%');

\echo '=== G5  True technical provenance is still recorded on every model (nothing falsified)'
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS g5,
       count(*) AS models_missing_provenance
FROM public.ai_governance_models
WHERE provider IS NULL OR btrim(provider) = ''
   OR technical_identifier IS NULL OR btrim(technical_identifier) = '';

\echo '=== G6  Historical AI activity keeps its original provider/model values'
SELECT CASE WHEN vendor_rows > 0 OR total_rows = 0 THEN 'PASS' ELSE 'FAIL' END AS g6,
       total_rows, vendor_rows
FROM (
  SELECT count(*) AS total_rows,
         count(*) FILTER (WHERE provider IS NOT NULL AND model IS NOT NULL) AS vendor_rows
  FROM public.ai_governance_activity_attempts
) s;

\echo '=== G7  The restricted-provenance gate exists and is a security definer check'
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END AS g7
FROM pg_proc
WHERE proname = 'ai_gov_can_view_technical_provenance' AND prosecdef;

\echo '=== G8  Raw provenance columns are NOT selectable by ordinary signed-in sessions'
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS g8,
       count(*) AS ungated_columns,
       coalesce(string_agg(table_name || '.' || column_name, ', '), 'none') AS detail
FROM information_schema.column_privileges
WHERE grantee = 'authenticated' AND privilege_type = 'SELECT'
  AND ((table_name = 'ai_governance_models'
        AND column_name IN ('provider','model_key','technical_identifier','model_version','display_name'))
    OR (table_name = 'ai_governance_activity_attempts'
        AND column_name IN ('provider','model','model_version'))
    OR (table_name = 'conduct_ai_insights'
        AND column_name IN ('provider','model','model_version')));

\echo '=== G9  All four presentation reads exist'
SELECT CASE WHEN count(*) = 4 THEN 'PASS' ELSE 'FAIL' END AS g9, count(*) AS found
FROM pg_views
WHERE schemaname = 'public' AND viewname IN (
  'ai_governance_models_presentation_v',
  'ai_governance_activity_presentation_v',
  'ai_governance_attempts_presentation_v',
  'conduct_ai_insights_presentation_v');

\echo '=== G10 Every presentation read gates raw provenance behind the permission check'
SELECT CASE WHEN count(*) = 4 THEN 'PASS' ELSE 'FAIL' END AS g10, count(*) AS gated_views
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN (
    'ai_governance_models_presentation_v',
    'ai_governance_activity_presentation_v',
    'ai_governance_attempts_presentation_v',
    'conduct_ai_insights_presentation_v')
  AND definition LIKE '%ai_gov_can_view_technical_provenance%'
  AND definition LIKE '%ai_gov_can_read%';

\echo '=== G11 The technical activity read model is not exposed to ordinary sessions'
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS g11, count(*) AS ungated_grants
FROM information_schema.role_table_grants
WHERE table_name = 'ai_governance_activity_v' AND grantee = 'authenticated' AND privilege_type = 'SELECT';

\echo '=== G12 An unauthorised session receives NO raw provenance from the presentation reads'
DO $$
DECLARE _leak int;
BEGIN
  -- auth.uid() is NULL in this session, so the gate must deny.
  SELECT count(*) INTO _leak FROM (
    SELECT 1 FROM public.ai_governance_models_presentation_v
     WHERE provider IS NOT NULL OR technical_identifier IS NOT NULL
        OR model_version IS NOT NULL OR registered_display_name IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.ai_governance_attempts_presentation_v
     WHERE provider IS NOT NULL OR model IS NOT NULL OR model_version IS NOT NULL
  ) s;
  IF _leak = 0 THEN RAISE NOTICE 'g12 | PASS | no raw provenance served without the permission';
  ELSE RAISE NOTICE 'g12 | FAIL | % rows leaked raw provenance', _leak;
  END IF;
END $$;

\echo '=== G13 Governance labels are served even when provenance is withheld'
DO $$
DECLARE _n int; _bad int;
BEGIN
  SELECT count(*) INTO _n FROM public.ai_governance_models;
  SELECT count(*) INTO _bad FROM public.ai_governance_models m
   WHERE COALESCE(m.governance_display_name,
                  public.ai_gov_display_alias('DISPLAY_NAME', m.display_name)) IS NULL;
  IF _bad = 0 THEN RAISE NOTICE 'g13 | PASS | % models resolve a neutral label', _n;
  ELSE RAISE NOTICE 'g13 | FAIL | % models resolve no neutral label', _bad;
  END IF;
END $$;

\echo '=== G14 Model registration still records both layers'
SELECT CASE WHEN pg_get_functiondef(oid) LIKE '%governance_display_name%'
             AND pg_get_functiondef(oid) LIKE '%technical_identifier%'
        THEN 'PASS' ELSE 'FAIL' END AS g14
FROM pg_proc WHERE proname = 'ai_governance_model_save';

\echo '=== VERIFICATION COMPLETE — every gate above must read PASS'

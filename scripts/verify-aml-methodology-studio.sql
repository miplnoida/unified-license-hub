-- AML-02 — Supervisory Methodology Studio verifier (METH-STUDIO-01..24).
-- Transactional and rollback-safe: no business row survives this script.
-- Run with: psql -v ON_ERROR_STOP=1 -f scripts/verify-aml-methodology-studio.sql
BEGIN;

CREATE TEMP TABLE studio_result(gate text, verdict text, detail text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.gate(_gate text, _ok boolean, _detail text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO studio_result VALUES (_gate, CASE WHEN _ok THEN 'PASS' ELSE 'FAIL' END, _detail);
$$;

-- ---------------------------------------------------------------- existence
SELECT pg_temp.gate('METH-STUDIO-01', count(*) = 1, 'authoring authority guard exists')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'supervisory_methodology_require_authoring';

SELECT pg_temp.gate('METH-STUDIO-02', count(*) = 7, format('%s of 7 studio operations present', count(*)))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN (
   'supervisory_methodology_question_save','supervisory_methodology_question_retire',
   'supervisory_methodology_dimension_retire','supervisory_methodology_question_fact_link',
   'supervisory_methodology_question_fact_unlink','supervisory_methodology_fact_requirement_delete',
   'supervisory_methodology_validate');

SELECT pg_temp.gate('METH-STUDIO-03', count(*) = 1, 'studio capability contract exists')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'supervisory_methodology_studio_capabilities';

-- ------------------------------------------------------- authority hardening
SELECT pg_temp.gate('METH-STUDIO-04', bool_and(p.prosecdef), 'every studio writer is SECURITY DEFINER')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN (
   'supervisory_methodology_require_authoring','supervisory_methodology_question_save',
   'supervisory_methodology_question_retire','supervisory_methodology_dimension_retire',
   'supervisory_methodology_question_fact_link','supervisory_methodology_question_fact_unlink',
   'supervisory_methodology_fact_requirement_delete');

SELECT pg_temp.gate('METH-STUDIO-05',
   bool_and(p.proconfig::text LIKE '%search_path%'), 'every studio routine pins search_path')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE 'supervisory_methodology_%'
   AND p.proname IN ('supervisory_methodology_require_authoring','supervisory_methodology_question_save',
     'supervisory_methodology_question_retire','supervisory_methodology_dimension_retire',
     'supervisory_methodology_question_fact_link','supervisory_methodology_question_fact_unlink',
     'supervisory_methodology_fact_requirement_delete','supervisory_methodology_validate',
     'supervisory_methodology_studio_capabilities');

SELECT pg_temp.gate('METH-STUDIO-06',
   NOT bool_or(has_function_privilege('anon', p.oid, 'execute')),
   'no studio routine is callable anonymously')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN (
   'supervisory_methodology_require_authoring','supervisory_methodology_question_save',
   'supervisory_methodology_question_retire','supervisory_methodology_dimension_retire',
   'supervisory_methodology_question_fact_link','supervisory_methodology_question_fact_unlink',
   'supervisory_methodology_fact_requirement_delete','supervisory_methodology_validate',
   'supervisory_methodology_studio_capabilities');

SELECT pg_temp.gate('METH-STUDIO-07',
   bool_and(has_function_privilege('authenticated', p.oid, 'execute')),
   'signed-in officers may reach every studio routine (authority is inside)')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN (
   'supervisory_methodology_question_save','supervisory_methodology_question_retire',
   'supervisory_methodology_dimension_retire','supervisory_methodology_question_fact_link',
   'supervisory_methodology_question_fact_unlink','supervisory_methodology_fact_requirement_delete',
   'supervisory_methodology_validate','supervisory_methodology_studio_capabilities');

-- Direct table writes stay denied: authority lives in the governed operations.
SELECT pg_temp.gate('METH-STUDIO-08',
   NOT bool_or(has_table_privilege('authenticated', c.oid, 'INSERT')
            OR has_table_privilege('authenticated', c.oid, 'UPDATE')
            OR has_table_privilege('authenticated', c.oid, 'DELETE')),
   'no direct write grant on methodology content tables')
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN (
   'supervisory_methodology','supervisory_methodology_dimension','supervisory_methodology_question',
   'supervisory_methodology_question_fact','supervisory_methodology_fact_requirement',
   'supervisory_methodology_semantic_profile','supervisory_methodology_parameter',
   'supervisory_methodology_event');

SELECT pg_temp.gate('METH-STUDIO-09',
   bool_and(c.relrowsecurity), 'row level security is enabled on every content table')
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN (
   'supervisory_methodology','supervisory_methodology_dimension','supervisory_methodology_question',
   'supervisory_methodology_fact_requirement','supervisory_methodology_parameter',
   'supervisory_methodology_event');

-- ------------------------------------------------- reference authoring boundary
SELECT pg_temp.gate('METH-STUDIO-10',
   pg_get_functiondef(p.oid) LIKE '%reference_authoring_denied%',
   'MIPL reference content may not be authored by a regulator officer')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'supervisory_methodology_require_authoring';

SELECT pg_temp.gate('METH-STUDIO-11',
   pg_get_functiondef(p.oid) LIKE '%methodology_immutable%',
   'an approved or active version is refused for authoring')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'supervisory_methodology_require_authoring';

SELECT pg_temp.gate('METH-STUDIO-12',
   bool_and(pg_get_functiondef(p.oid) LIKE '%supervisory_methodology_require_authoring%'),
   'every studio writer routes through the single authority guard')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN (
   'supervisory_methodology_question_save','supervisory_methodology_question_retire',
   'supervisory_methodology_dimension_retire','supervisory_methodology_question_fact_link',
   'supervisory_methodology_question_fact_unlink','supervisory_methodology_fact_requirement_delete');

SELECT pg_temp.gate('METH-STUDIO-13',
   bool_and(pg_get_functiondef(p.oid) LIKE '%supervisory_methodology_event%'),
   'every studio writer records version history')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN (
   'supervisory_methodology_question_save','supervisory_methodology_question_retire',
   'supervisory_methodology_dimension_retire','supervisory_methodology_question_fact_link',
   'supervisory_methodology_question_fact_unlink','supervisory_methodology_fact_requirement_delete');

SELECT pg_temp.gate('METH-STUDIO-14',
   pg_get_functiondef(p.oid) LIKE '%concurrent_update%',
   'question save honours optimistic concurrency')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'supervisory_methodology_question_save';

SELECT pg_temp.gate('METH-STUDIO-15',
   (SELECT bool_and(pg_get_functiondef(p.oid) LIKE '%dependency_blocked%')
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN (
       'supervisory_methodology_dimension_retire','supervisory_methodology_fact_requirement_delete')),
   'dependency guards protect dimension retirement and fact removal');

SELECT pg_temp.gate('METH-STUDIO-16',
   (SELECT bool_and(pg_get_functiondef(p.oid) LIKE '%at least 10 characters%')
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN (
       'supervisory_methodology_question_retire','supervisory_methodology_dimension_retire',
       'supervisory_methodology_fact_requirement_delete')),
   'destructive content changes require a rationale');

-- --------------------------------------------------------------- validation
SELECT pg_temp.gate('METH-STUDIO-17',
   (SELECT count(*) FROM (
      SELECT unnest(ARRAY['DIMENSION_WEIGHT_SUM','DIMENSION_WITHOUT_QUESTION',
        'QUESTION_WITHOUT_SEMANTICS','SCORED_QUESTION_WITHOUT_AXIS','PARAMETER_UNAPPROVED',
        'FACT_DEFINITION_INCOMPLETE','REQUIRED_FACT_UNLINKED','EVIDENCE_WITHOUT_MINIMUM',
        'NA_WITHOUT_CONDITIONS','QUESTION_WITHOUT_CLASS']) AS code) c
     WHERE pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='supervisory_methodology_validate')) LIKE '%'||c.code||'%') = 10,
   'all ten validation findings are implemented');

SELECT pg_temp.gate('METH-STUDIO-18',
   pg_get_functiondef(p.oid) LIKE '%enforcement point%',
   'validation states that the governed operations remain the enforcement point')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'supervisory_methodology_validate';

SELECT pg_temp.gate('METH-STUDIO-19',
   NOT p.prosecdef, 'validation runs with the caller''s own visibility')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'supervisory_methodology_validate';

SELECT pg_temp.gate('METH-STUDIO-20',
   NOT p.prosecdef, 'studio capabilities run with the caller''s own visibility')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'supervisory_methodology_studio_capabilities';

SELECT pg_temp.gate('METH-STUDIO-21',
   pg_get_functiondef(p.oid) LIKE '%supervisory_methodology_action_capabilities%',
   'studio capabilities extend the existing action contract instead of restating it')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'supervisory_methodology_studio_capabilities';

-- --------------------------------------------------------------- preservation
SELECT pg_temp.gate('METH-STUDIO-22',
   (SELECT count(*) = 1 FROM supervisory_methodology
     WHERE code = 'AML-CFT-RBA' AND version = '1.0' AND status = 'ACTIVE'),
   'AML-CFT-RBA v1.0 remains ACTIVE');

SELECT pg_temp.gate('METH-STUDIO-23',
   (SELECT count(*) = 1 FROM supervisory_methodology
     WHERE code = 'AML-CFT-RBA' AND version = '1.1'
       AND status = 'DRAFT' AND origin = 'MIPL_REFERENCE'),
   'AML-CFT-RBA v1.1 remains a DRAFT MIPL reference');

SELECT pg_temp.gate('METH-STUDIO-24',
   (SELECT count(*) FROM supervisory_methodology_question q
      JOIN supervisory_methodology m ON m.id = q.methodology_id
     WHERE m.code = 'AML-CFT-RBA' AND m.version = '1.1' AND q.active) = 70,
   'v1.1 still carries 70 active questions');

-- ------------------------------------------------------------------- report
SELECT gate, verdict, COALESCE(detail,'') AS detail FROM studio_result ORDER BY gate;
SELECT count(*) FILTER (WHERE verdict = 'PASS') AS passed,
       count(*) FILTER (WHERE verdict = 'FAIL') AS failed
  FROM studio_result;

ROLLBACK;

-- ============================================================================
-- AML/CFT assessment structural integrity verifier
--
-- Gates STRUCT-01 … STRUCT-14. Read-only: this script asserts, it never repairs.
-- Repair is the governed operation public.supervisory_assessment_structure_backfill.
--
--   psql "$DATABASE_URL" -f scripts/verify-aml-assessment-structural-integrity.sql
-- ============================================================================
\pset pager off
\set QUIET on
\set ON_ERROR_STOP off

WITH a AS (
  SELECT * FROM public.supervisory_assessment WHERE domain_code = 'AML_CFT'
),
-- ---------------------------------------------------------------------------
-- STRUCT-01  every AML/CFT assessment is bound to a methodology version
-- ---------------------------------------------------------------------------
g01 AS (
  SELECT 'STRUCT-01' gate,
         'every AML/CFT assessment is bound to a methodology version' claim,
         count(*) FILTER (WHERE methodology_id IS NULL) offenders
    FROM a
),
-- ---------------------------------------------------------------------------
-- STRUCT-02  no active methodology dimension is missing from any assessment
-- ---------------------------------------------------------------------------
g02 AS (
  SELECT 'STRUCT-02' gate,
         'the working file of every assessment carries a row for every active methodology dimension' claim,
         count(*) offenders
    FROM a
    JOIN public.supervisory_methodology_dimension md
      ON md.methodology_id = a.methodology_id AND md.active
   WHERE NOT EXISTS (
     SELECT 1 FROM public.supervisory_assessment_dimension sad
      WHERE sad.assessment_id = a.id AND sad.dimension_code = md.dimension_code)
),
-- ---------------------------------------------------------------------------
-- STRUCT-03  every resolvable assessment dimension is canonically linked
-- ---------------------------------------------------------------------------
g03 AS (
  SELECT 'STRUCT-03' gate,
         'every assessment dimension whose code exists in the bound methodology is canonically linked' claim,
         count(*) offenders
    FROM a
    JOIN public.supervisory_assessment_dimension sad ON sad.assessment_id = a.id
   WHERE sad.methodology_dimension_id IS NULL
     AND public.supervisory_methodology_dimension_resolve(a.methodology_id, sad.dimension_code) IS NOT NULL
),
-- ---------------------------------------------------------------------------
-- STRUCT-04  unlinked rows are only codes the bound methodology does not publish
-- ---------------------------------------------------------------------------
g04 AS (
  SELECT 'STRUCT-04' gate,
         'unlinked assessment dimensions are exclusively codes the bound methodology does not publish' claim,
         count(*) FILTER (
           WHERE sad.methodology_dimension_id IS NULL
             AND EXISTS (SELECT 1 FROM public.supervisory_methodology_dimension md
                          WHERE md.methodology_id = a.methodology_id
                            AND md.dimension_code = sad.dimension_code)) offenders
    FROM a JOIN public.supervisory_assessment_dimension sad ON sad.assessment_id = a.id
),
-- ---------------------------------------------------------------------------
-- STRUCT-05  no cross-methodology dimension link
-- ---------------------------------------------------------------------------
g05 AS (
  SELECT 'STRUCT-05' gate,
         'no assessment dimension points at a dimension of another methodology version' claim,
         count(*) offenders
    FROM a
    JOIN public.supervisory_assessment_dimension sad ON sad.assessment_id = a.id
    JOIN public.supervisory_methodology_dimension md ON md.id = sad.methodology_dimension_id
   WHERE md.methodology_id IS DISTINCT FROM a.methodology_id
),
-- ---------------------------------------------------------------------------
-- STRUCT-06  no dimension-code mismatch across the link
-- ---------------------------------------------------------------------------
g06 AS (
  SELECT 'STRUCT-06' gate,
         'no assessment dimension carries a code different from the methodology dimension it links to' claim,
         count(*) offenders
    FROM a
    JOIN public.supervisory_assessment_dimension sad ON sad.assessment_id = a.id
    JOIN public.supervisory_methodology_dimension md ON md.id = sad.methodology_dimension_id
   WHERE md.dimension_code IS DISTINCT FROM sad.dimension_code
),
-- ---------------------------------------------------------------------------
-- STRUCT-07  no unbound answer where a dimension row exists for its code
-- ---------------------------------------------------------------------------
g07 AS (
  SELECT 'STRUCT-07' gate,
         'no recorded answer is left unbound while its own assessment carries the dimension row' claim,
         count(*) offenders
    FROM a
    JOIN public.supervisory_assessment_question_response r ON r.assessment_id = a.id
   WHERE r.assessment_dimension_id IS NULL
     AND EXISTS (SELECT 1 FROM public.supervisory_assessment_dimension sad
                  WHERE sad.assessment_id = a.id AND sad.dimension_code = r.dimension_code)
),
-- ---------------------------------------------------------------------------
-- STRUCT-08  no answer bound to another assessment's dimension
-- ---------------------------------------------------------------------------
g08 AS (
  SELECT 'STRUCT-08' gate,
         'no recorded answer is bound to a dimension row of a different assessment' claim,
         count(*) offenders
    FROM a
    JOIN public.supervisory_assessment_question_response r ON r.assessment_id = a.id
    JOIN public.supervisory_assessment_dimension sad ON sad.id = r.assessment_dimension_id
   WHERE sad.assessment_id <> r.assessment_id
),
-- ---------------------------------------------------------------------------
-- STRUCT-09  answer code agrees with the dimension row it is bound to
-- ---------------------------------------------------------------------------
g09 AS (
  SELECT 'STRUCT-09' gate,
         'every bound answer carries the same dimension code as the dimension row it is bound to' claim,
         count(*) offenders
    FROM a
    JOIN public.supervisory_assessment_question_response r ON r.assessment_id = a.id
    JOIN public.supervisory_assessment_dimension sad ON sad.id = r.assessment_dimension_id
   WHERE sad.dimension_code IS DISTINCT FROM r.dimension_code
),
-- ---------------------------------------------------------------------------
-- STRUCT-10  answers are bound to the methodology question's own dimension
-- ---------------------------------------------------------------------------
g10 AS (
  SELECT 'STRUCT-10' gate,
         'every answer is bound to the dimension its methodology question belongs to' claim,
         count(*) offenders
    FROM a
    JOIN public.supervisory_assessment_question_response r ON r.assessment_id = a.id
    JOIN public.supervisory_methodology_question mq ON mq.id = r.methodology_question_id
    JOIN public.supervisory_assessment_dimension sad ON sad.id = r.assessment_dimension_id
   WHERE sad.methodology_dimension_id IS DISTINCT FROM mq.methodology_dimension_id
),
-- ---------------------------------------------------------------------------
-- STRUCT-11  both database guards are installed and enabled
-- ---------------------------------------------------------------------------
g11 AS (
  SELECT 'STRUCT-11' gate,
         'the dimension-link and answer-link database guards are installed and enabled' claim,
         2 - count(*) offenders
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE NOT t.tgisinternal AND t.tgenabled = 'O'
     AND t.tgname IN ('supervisory_assessment_dimension_link_guard_trg',
                      'supervisory_assessment_response_link_guard_trg')
),
-- ---------------------------------------------------------------------------
-- STRUCT-12  creation materialises the working file
-- ---------------------------------------------------------------------------
g12 AS (
  SELECT 'STRUCT-12' gate,
         'assessment creation materialises the methodology dimension universe in the same transaction' claim,
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'supervisory_assessment_create'
              AND pg_get_functiondef(p.oid) LIKE '%supervisory_assessment_dimension_materialise_internal%')
         THEN 0 ELSE 1 END offenders
),
-- ---------------------------------------------------------------------------
-- STRUCT-13  the answer writer owns the linkage
-- ---------------------------------------------------------------------------
g13 AS (
  SELECT 'STRUCT-13' gate,
         'the answer writer resolves and guarantees the dimension row instead of trusting a lookup that may miss' claim,
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'supervisory_assessment_question_upsert'
              AND pg_get_functiondef(p.oid) LIKE '%INSERT INTO public.supervisory_assessment_dimension%')
         THEN 0 ELSE 1 END offenders
),
-- ---------------------------------------------------------------------------
-- STRUCT-14  the calculation outcome contract carries reason codes
-- ---------------------------------------------------------------------------
g14 AS (
  SELECT 'STRUCT-14' gate,
         'the calculation engine emits a machine-readable reason code and reports CALCULATED only with a recommendation' claim,
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'supervisory_calc_compute_policy'
              AND pg_get_functiondef(p.oid) LIKE '%METHODOLOGY_PUBLISHES_NO_QUESTION%'
              AND pg_get_functiondef(p.oid) LIKE '%NO_CALCULABLE_DIMENSION%'
              AND pg_get_functiondef(p.oid) LIKE '%''reason_code'', _reason_code%')
         THEN 0 ELSE 1 END offenders
),
all_gates AS (
  SELECT * FROM g01 UNION ALL SELECT * FROM g02 UNION ALL SELECT * FROM g03
  UNION ALL SELECT * FROM g04 UNION ALL SELECT * FROM g05 UNION ALL SELECT * FROM g06
  UNION ALL SELECT * FROM g07 UNION ALL SELECT * FROM g08 UNION ALL SELECT * FROM g09
  UNION ALL SELECT * FROM g10 UNION ALL SELECT * FROM g11 UNION ALL SELECT * FROM g12
  UNION ALL SELECT * FROM g13 UNION ALL SELECT * FROM g14
)
SELECT gate,
       CASE WHEN COALESCE(offenders,0) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       COALESCE(offenders,0) AS offenders,
       claim
  FROM all_gates
 ORDER BY gate;

-- Census used by the closure report.
WITH a AS (SELECT * FROM public.supervisory_assessment WHERE domain_code = 'AML_CFT')
SELECT (SELECT count(*) FROM a) AS assessments,
       (SELECT count(*) FROM public.supervisory_assessment_dimension sad JOIN a ON a.id = sad.assessment_id) AS dimensions,
       (SELECT count(*) FROM public.supervisory_assessment_dimension sad JOIN a ON a.id = sad.assessment_id
         WHERE sad.methodology_dimension_id IS NULL) AS dimensions_unlinked,
       (SELECT count(*) FROM public.supervisory_assessment_question_response r JOIN a ON a.id = r.assessment_id) AS answers,
       (SELECT count(*) FROM public.supervisory_assessment_question_response r JOIN a ON a.id = r.assessment_id
         WHERE r.assessment_dimension_id IS NULL) AS answers_unbound;

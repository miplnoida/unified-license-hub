-- ============================================================================
-- AML-07 preservation census and risk digest
--
-- Read-only. Run before and after the certification chain; every value must be
-- identical. The AML-07 risk digest is defined here canonically:
--
--   md5 of the ordered, tab-joined projection of the AML/CFT published
--   risk-of-record spine — entity_risk_state rows (domain AML_CFT) ordered by
--   id, with NULLs serialised as the empty string via concat_ws.
--
-- This is NOT the AML-06 digest (a different column set over a different
-- projection). The two values are not comparable.
--   psql -f scripts/aml07-preservation-census.sql
-- ============================================================================
\pset pager off
\pset tuples_only off

SELECT 'assessments_total' AS metric, count(*)::text AS value FROM public.supervisory_assessment
UNION ALL SELECT 'assessments_rated', count(*)::text FROM public.supervisory_assessment
  WHERE COALESCE(approved_rating, residual_rating, overall_rating) IS NOT NULL
UNION ALL SELECT 'assessments_current', count(*)::text FROM public.supervisory_assessment WHERE is_current
UNION ALL SELECT 'status_'||lower(status), count(*)::text FROM public.supervisory_assessment GROUP BY status
UNION ALL SELECT 'responses', count(*)::text FROM public.supervisory_assessment_question_response
UNION ALL SELECT 'question_plan_rows', count(*)::text FROM public.supervisory_assessment_question_plan
UNION ALL SELECT 'evidence', count(*)::text FROM public.supervisory_assessment_evidence_basis
UNION ALL SELECT 'facts', count(*)::text FROM public.supervisory_assessment_fact
UNION ALL SELECT 'calculation_policies_live', count(*)::text FROM public.supervisory_calculation_config WHERE status = 'ACTIVE'
UNION ALL SELECT 'calculation_policies_all', count(*)::text FROM public.supervisory_calculation_config
UNION ALL SELECT 'calculation_runs', count(*)::text FROM public.supervisory_assessment_calculation_run
UNION ALL SELECT 'calculation_overrides', count(*)::text FROM public.supervisory_assessment_calculation_override
UNION ALL SELECT 'calculation_results_historical', count(*)::text FROM public.supervisory_assessment_calculation
UNION ALL SELECT 'review_rounds', count(*)::text FROM public.supervisory_assessment_review_round
UNION ALL SELECT 'review_challenges', count(*)::text FROM public.supervisory_assessment_review_challenge
UNION ALL SELECT 'approval_decisions', count(*)::text FROM public.supervisory_assessment_approval_decision
UNION ALL SELECT 'risk_publications', count(*)::text FROM public.supervisory_assessment_risk_publication
UNION ALL SELECT 'entity_risk_state', count(*)::text FROM public.entity_risk_state
UNION ALL SELECT 'entity_risk_state_aml', count(*)::text FROM public.entity_risk_state WHERE domain_code = 'AML_CFT'
UNION ALL SELECT 'entity_risk_movements', count(*)::text FROM public.entity_risk_state_movement
UNION ALL SELECT 'risk_ratings', count(*)::text FROM public.risk_ratings
UNION ALL SELECT 'regulators', count(*)::text FROM public.regulators
UNION ALL SELECT 'methodology_'||code||'_v'||version, status||'/'||COALESCE(origin,'-') FROM public.supervisory_methodology
  WHERE domain_code = 'AML_CFT'
UNION ALL SELECT 'v11_questions', count(*)::text FROM public.supervisory_methodology_question q
  JOIN public.supervisory_methodology m ON m.id = q.methodology_id
  WHERE m.domain_code = 'AML_CFT' AND m.version = '1.1'
UNION ALL SELECT 'v11_dimensions', count(*)::text FROM public.supervisory_methodology_dimension d
  JOIN public.supervisory_methodology m ON m.id = d.methodology_id
  WHERE m.domain_code = 'AML_CFT' AND m.version = '1.1'
UNION ALL SELECT 'programme_sets', count(*)::text FROM public.supervisory_assessment_programme_set
UNION ALL SELECT 'programmes', count(*)::text FROM public.supervisory_assessment_programme
UNION ALL SELECT 'fixtures_aml07cert', count(*)::text FROM public.supervisory_assessment WHERE reference LIKE 'AML07CERT%'
UNION ALL SELECT 'fixtures_aml06cert', count(*)::text FROM public.supervisory_assessment WHERE reference LIKE 'AML06CERT%'
UNION ALL SELECT 'fixtures_aml05cert', count(*)::text FROM public.supervisory_assessment WHERE reference LIKE 'AML05CERT%'
UNION ALL SELECT 'fixtures_plancert', count(*)::text FROM public.supervisory_assessment WHERE reference LIKE 'PLANCERT%'
UNION ALL SELECT 'aml07_risk_digest', md5(string_agg(row_repr, E'\n' ORDER BY row_repr))
  FROM (
    SELECT concat_ws(E'\t', s.id::text, s.entity_id::text, s.domain_code, s.residual_rating,
                     s.inherent_rating, s.control_rating, s.driving_assessment_id::text,
                     s.effective_from::text) AS row_repr
      FROM public.entity_risk_state s
     WHERE s.domain_code = 'AML_CFT'
  ) d
ORDER BY 1;

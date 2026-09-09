REVOKE ALL ON FUNCTION public.supervisory_assessment_evidence_link_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supervisory_assessment_fact_gaps_internal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_fact_gaps_internal(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.supervisory_assessment_readiness_internal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_readiness_internal(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.supervisory_assessment_fact_typed_value(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_fact_typed_value(text, jsonb) TO authenticated;
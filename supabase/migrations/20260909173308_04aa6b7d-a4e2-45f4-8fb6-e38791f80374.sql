REVOKE EXECUTE ON FUNCTION public.supervisory_calc_band_of_policy(jsonb, text, numeric) FROM anon, authenticated, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.smra_integrity_guard() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_assessment_dimension_link_guard() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_assessment_programme_event_append_only() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_assessment_programme_period_for(public.supervisory_assessment_programme, date, date) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_assessment_programme_touch() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_assessment_question_plan_immutable() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_assessment_response_link_guard() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_detection_register(text, text, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_detector_assurance() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_domain_module(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_entity_detected_conditions(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_methodology_question_rule_touch() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_methodology_question_semantic_scope_chk() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_methodology_reference_decision_target_chk() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_methodology_semantic_profile_freeze() FROM anon, PUBLIC;
-- Trigger routines must never be directly callable; PUBLIC grant removed.
REVOKE ALL ON FUNCTION public.aml_assessment_notify() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aml_finding_notify() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aml_remediation_notify() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aml_reassessment_notify() FROM PUBLIC;

-- Pre-existing AI governance leakage: revoke the PUBLIC grant (anon inherits it).
REVOKE ALL ON FUNCTION public.ai_governance_model_save(uuid,text,text,text,text,text,text,text,text,boolean,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_governance_model_save(uuid,text,text,text,text,text,text,text,text,boolean,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_governance_model_save(uuid,text,text,text,text,text,text,text,text,boolean,text,text) TO service_role;

REVOKE ALL ON FUNCTION public.ai_gov_can_view_technical_provenance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_gov_can_view_technical_provenance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_gov_can_view_technical_provenance(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.ai_gov_display_alias(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_gov_display_alias(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_gov_display_alias(text,text) TO service_role;
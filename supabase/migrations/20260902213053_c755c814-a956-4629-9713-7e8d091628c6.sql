REVOKE EXECUTE ON FUNCTION public.aml_assessment_notify() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aml_finding_notify() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aml_reassessment_notify() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aml_remediation_notify() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aml_assessment_notify() TO service_role;
GRANT EXECUTE ON FUNCTION public.aml_finding_notify() TO service_role;
GRANT EXECUTE ON FUNCTION public.aml_reassessment_notify() TO service_role;
GRANT EXECUTE ON FUNCTION public.aml_remediation_notify() TO service_role;
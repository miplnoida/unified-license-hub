ALTER FUNCTION public.conduct_mi_entity_coverage(date,date,uuid,uuid,integer) SECURITY DEFINER;
ALTER FUNCTION public.conduct_mi_sector_coverage(date,date,uuid,uuid) SECURITY DEFINER;
ALTER FUNCTION public.conduct_mi_risk_reporting(date,date,uuid,uuid) SECURITY DEFINER;
ALTER FUNCTION public.conduct_mi_outcome_reporting(date,date,uuid,uuid) SECURITY DEFINER;
ALTER FUNCTION public.conduct_reporting_ai_context(text,date,date,uuid,uuid,uuid,integer) SECURITY DEFINER;
ALTER FUNCTION public.conduct_reporting_narratives_list(date,date,uuid,uuid,integer) SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.conduct_mi_entity_coverage(date,date,uuid,uuid,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_mi_sector_coverage(date,date,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_mi_risk_reporting(date,date,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_mi_outcome_reporting(date,date,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_reporting_ai_context(text,date,date,uuid,uuid,uuid,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_reporting_narratives_list(date,date,uuid,uuid,integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.conduct_mi_entity_coverage(date,date,uuid,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conduct_mi_sector_coverage(date,date,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conduct_mi_risk_reporting(date,date,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conduct_mi_outcome_reporting(date,date,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conduct_reporting_ai_context(text,date,date,uuid,uuid,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conduct_reporting_narratives_list(date,date,uuid,uuid,integer) TO authenticated;
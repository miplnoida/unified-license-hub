DROP VIEW IF EXISTS public.ai_governance_models_presentation_v;
CREATE VIEW public.ai_governance_models_presentation_v AS
SELECT
  m.id,
  COALESCE(m.governance_display_name,
           public.ai_gov_display_alias('DISPLAY_NAME', m.display_name),
           m.display_name)                                    AS governance_display_name,
  COALESCE(m.governance_version_label,
           public.ai_gov_display_alias('MODEL_VERSION', m.model_version),
           m.model_version)                                   AS governance_version_label,
  m.regulatory_purpose, m.known_limitations, m.data_handling_class,
  m.external_data_capable, m.lifecycle_state,
  m.effective_from, m.retired_at, m.approved_at, m.approved_by,
  m.suspended_at, m.suspended_by, m.suspension_reason,
  m.created_by, m.created_at, m.updated_at,
  public.ai_gov_can_view_technical_provenance(auth.uid())      AS technical_provenance_available,
  CASE WHEN public.ai_gov_can_view_technical_provenance(auth.uid()) THEN m.display_name END          AS registered_display_name,
  CASE WHEN public.ai_gov_can_view_technical_provenance(auth.uid()) THEN m.provider END              AS provider,
  CASE WHEN public.ai_gov_can_view_technical_provenance(auth.uid()) THEN m.model_key END             AS model_key,
  CASE WHEN public.ai_gov_can_view_technical_provenance(auth.uid()) THEN m.technical_identifier END  AS technical_identifier,
  CASE WHEN public.ai_gov_can_view_technical_provenance(auth.uid()) THEN m.model_version END         AS model_version
FROM public.ai_governance_models m
WHERE public.ai_gov_can_read(auth.uid());

GRANT SELECT ON public.ai_governance_models_presentation_v TO authenticated, service_role;

REVOKE SELECT (display_name) ON public.ai_governance_models FROM authenticated;
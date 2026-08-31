CREATE OR REPLACE VIEW public.conduct_ai_insights_presentation_v AS
SELECT
  i.id, i.insight_id, i.use_case_code, i.subject_type, i.subject_key, i.emerging_risk_id,
  i.entity_id, i.regulator_id, i.sector_id, i.window_start, i.window_end,
  i.generated_at, i.generated_by, i.ai_output, i.human_output, i.human_rationale,
  i.source_references, i.confidence, i.uncertainty, i.limitations,
  i.staleness_state, i.staleness_checked_at, i.review_state, i.reviewed_by, i.reviewed_at,
  i.prompt_template_code, i.prompt_template_version, i.snapshot_fingerprint,
  i.subject_population, i.created_at, i.updated_at,
  COALESCE(public.ai_gov_display_alias('SERVICE', i.provider), 'Managed AI Runtime')   AS governance_service_label,
  COALESCE(public.ai_gov_display_alias('MODEL', i.model), 'Regulatory AI')             AS governance_model_label,
  COALESCE(public.ai_gov_display_alias('MODEL_VERSION', i.model_version),
           public.ai_gov_display_alias('MODEL_VERSION', i.model))                      AS governance_version_label,
  public.ai_gov_can_view_technical_provenance(auth.uid())                              AS technical_provenance_available,
  CASE WHEN public.ai_gov_can_view_technical_provenance(auth.uid()) THEN i.provider END      AS provider,
  CASE WHEN public.ai_gov_can_view_technical_provenance(auth.uid()) THEN i.model END         AS model,
  CASE WHEN public.ai_gov_can_view_technical_provenance(auth.uid()) THEN i.model_version END AS model_version,
  i.superseded_by_id
FROM public.conduct_ai_insights i
WHERE public.ai_gov_can_read(auth.uid());

GRANT SELECT ON public.conduct_ai_insights_presentation_v TO authenticated, service_role;
GRANT SELECT (superseded_by_id) ON public.conduct_ai_insights TO authenticated;
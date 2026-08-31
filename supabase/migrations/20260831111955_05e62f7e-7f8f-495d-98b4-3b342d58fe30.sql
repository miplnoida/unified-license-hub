-- =====================================================================
-- AI Governance — customer-facing vendor neutralisation.
-- PRESENTATION ABSTRACTION ONLY. No provenance is deleted or altered.
-- =====================================================================

-- 1. Additive governance presentation fields on the canonical register.
ALTER TABLE public.ai_governance_models
  ADD COLUMN IF NOT EXISTS governance_display_name text,
  ADD COLUMN IF NOT EXISTS governance_version_label text;

COMMENT ON COLUMN public.ai_governance_models.governance_display_name IS
  'Vendor-neutral governance identity shown on regulator/customer-facing screens. The provider, technical_identifier and model_version columns remain the authoritative technical provenance.';
COMMENT ON COLUMN public.ai_governance_models.governance_version_label IS
  'Governance version/alias shown on regulator/customer-facing screens (e.g. 2026.08-R1). Never replaces model_version.';

-- 2. Configuration-driven aliases (no hard-coded wording in the interface).
CREATE TABLE IF NOT EXISTS public.ai_governance_presentation_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_kind text NOT NULL CHECK (alias_kind IN ('SERVICE','MODEL','MODEL_VERSION','DISPLAY_NAME')),
  source_value text NOT NULL,
  display_value text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias_kind, source_value)
);

GRANT SELECT ON public.ai_governance_presentation_aliases TO authenticated;
GRANT ALL ON public.ai_governance_presentation_aliases TO service_role;
ALTER TABLE public.ai_governance_presentation_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_governance_presentation_aliases_read ON public.ai_governance_presentation_aliases;
CREATE POLICY ai_governance_presentation_aliases_read
  ON public.ai_governance_presentation_aliases FOR SELECT TO authenticated
  USING (public.ai_gov_can_read(auth.uid()));

DROP TRIGGER IF EXISTS trg_ai_gov_aliases_updated ON public.ai_governance_presentation_aliases;
CREATE TRIGGER trg_ai_gov_aliases_updated
  BEFORE UPDATE ON public.ai_governance_presentation_aliases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Who may see actual provider / technical identifier / provider model version.
CREATE OR REPLACE FUNCTION public.ai_gov_can_view_technical_provenance(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL AND (
    public.is_super_admin(_uid)
    OR public.has_permission(_uid, 'ai_management', 'approve')
    OR public.has_permission(_uid, 'audit_management', 'export')
  );
$$;

COMMENT ON FUNCTION public.ai_gov_can_view_technical_provenance(uuid) IS
  'Restricted technical/audit access to actual AI provider, gateway, technical identifier and provider model version.';

-- 4. Alias resolver.
CREATE OR REPLACE FUNCTION public.ai_gov_display_alias(_kind text, _value text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT a.display_value FROM public.ai_governance_presentation_aliases a
      WHERE a.alias_kind = _kind AND a.source_value = _value),
    NULL);
$$;

-- 5. Presentation reads. Definer views (owner postgres) that repeat the base
--    read predicate, so row visibility is identical while the raw provenance
--    columns are served only to authorised technical/audit users.
CREATE OR REPLACE VIEW public.ai_governance_models_presentation_v AS
SELECT
  m.id,
  COALESCE(m.governance_display_name,
           public.ai_gov_display_alias('DISPLAY_NAME', m.display_name),
           m.display_name)                                    AS governance_display_name,
  COALESCE(m.governance_version_label,
           public.ai_gov_display_alias('MODEL_VERSION', m.model_version),
           m.model_version)                                   AS governance_version_label,
  m.display_name                                              AS registered_display_name,
  m.regulatory_purpose, m.known_limitations, m.data_handling_class,
  m.external_data_capable, m.lifecycle_state,
  m.effective_from, m.retired_at, m.approved_at, m.approved_by,
  m.suspended_at, m.suspended_by, m.suspension_reason,
  m.created_by, m.created_at, m.updated_at,
  public.ai_gov_can_view_technical_provenance(auth.uid())      AS technical_provenance_available,
  CASE WHEN public.ai_gov_can_view_technical_provenance(auth.uid()) THEN m.provider END              AS provider,
  CASE WHEN public.ai_gov_can_view_technical_provenance(auth.uid()) THEN m.model_key END             AS model_key,
  CASE WHEN public.ai_gov_can_view_technical_provenance(auth.uid()) THEN m.technical_identifier END  AS technical_identifier,
  CASE WHEN public.ai_gov_can_view_technical_provenance(auth.uid()) THEN m.model_version END         AS model_version
FROM public.ai_governance_models m
WHERE public.ai_gov_can_read(auth.uid());

CREATE OR REPLACE VIEW public.ai_governance_activity_presentation_v AS
SELECT
  v.activity_id, v.activity_kind, v.occurred_at, v.owning_module,
  v.use_case_code, v.use_case_label, v.advisory_classification, v.use_case_lifecycle,
  v.entity_id, v.regulator_id, v.sector_id, v.requested_by, v.requested_role,
  v.outcome, v.reason_code,
  COALESCE(public.ai_gov_display_alias('SERVICE', v.provider), 'Managed AI Runtime')   AS governance_service_label,
  COALESCE(public.ai_gov_display_alias('MODEL', v.model), 'Regulatory AI')             AS governance_model_label,
  COALESCE(public.ai_gov_display_alias('MODEL_VERSION', v.model_version),
           public.ai_gov_display_alias('MODEL_VERSION', v.model))                      AS governance_version_label,
  v.prompt_template_code, v.prompt_template_version, v.snapshot_fingerprint,
  v.window_start, v.window_end, v.confidence, v.uncertainty, v.limitations,
  v.staleness_state, v.staleness_checked_at, v.review_state, v.reviewed_by, v.reviewed_at,
  v.human_rationale, v.has_human_wording, v.citation_count, v.latency_ms,
  v.conduct_ai_insight_id,
  public.ai_gov_can_view_technical_provenance(auth.uid())                              AS technical_provenance_available,
  CASE WHEN public.ai_gov_can_view_technical_provenance(auth.uid()) THEN v.provider END      AS provider,
  CASE WHEN public.ai_gov_can_view_technical_provenance(auth.uid()) THEN v.model END         AS model,
  CASE WHEN public.ai_gov_can_view_technical_provenance(auth.uid()) THEN v.model_version END AS model_version
FROM public.ai_governance_activity_v v
WHERE public.ai_gov_can_read(auth.uid());

CREATE OR REPLACE VIEW public.ai_governance_attempts_presentation_v AS
SELECT
  t.id, t.use_case_code, t.owning_module, t.entity_id, t.requested_by, t.requested_role,
  t.outcome, t.reason_code, t.detail,
  COALESCE(public.ai_gov_display_alias('SERVICE', t.provider), 'Managed AI Runtime')   AS governance_service_label,
  COALESCE(public.ai_gov_display_alias('MODEL', t.model), 'Regulatory AI')             AS governance_model_label,
  COALESCE(public.ai_gov_display_alias('MODEL_VERSION', t.model_version),
           public.ai_gov_display_alias('MODEL_VERSION', t.model))                      AS governance_version_label,
  t.instruction_template_code, t.instruction_version, t.snapshot_fingerprint,
  t.window_start, t.window_end, t.latency_ms, t.conduct_ai_insight_id,
  t.requested_at, t.completed_at, t.metadata, t.created_at,
  public.ai_gov_can_view_technical_provenance(auth.uid())                              AS technical_provenance_available,
  CASE WHEN public.ai_gov_can_view_technical_provenance(auth.uid()) THEN t.provider END      AS provider,
  CASE WHEN public.ai_gov_can_view_technical_provenance(auth.uid()) THEN t.model END         AS model,
  CASE WHEN public.ai_gov_can_view_technical_provenance(auth.uid()) THEN t.model_version END AS model_version
FROM public.ai_governance_activity_attempts t
WHERE public.ai_gov_can_read(auth.uid());

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
  CASE WHEN public.ai_gov_can_view_technical_provenance(auth.uid()) THEN i.model_version END AS model_version
FROM public.conduct_ai_insights i
WHERE public.ai_gov_can_read(auth.uid());

GRANT SELECT ON public.ai_governance_models_presentation_v      TO authenticated, service_role;
GRANT SELECT ON public.ai_governance_activity_presentation_v    TO authenticated, service_role;
GRANT SELECT ON public.ai_governance_attempts_presentation_v    TO authenticated, service_role;
GRANT SELECT ON public.conduct_ai_insights_presentation_v       TO authenticated, service_role;

-- 6. Restricted columns: the raw provenance is no longer readable straight from
--    the tables by ordinary supervisory sessions. Not CSS hiding — privileges.
REVOKE SELECT ON public.ai_governance_models FROM authenticated;
GRANT SELECT (
  id, display_name, governance_display_name, governance_version_label,
  regulatory_purpose, known_limitations, data_handling_class, external_data_capable,
  lifecycle_state, effective_from, retired_at, approved_at, approved_by,
  suspended_at, suspended_by, suspension_reason, created_by, created_at, updated_at
) ON public.ai_governance_models TO authenticated;

REVOKE SELECT ON public.ai_governance_activity_attempts FROM authenticated;
GRANT SELECT (
  id, use_case_code, owning_module, entity_id, requested_by, requested_role,
  outcome, reason_code, detail, instruction_template_code, instruction_version,
  snapshot_fingerprint, window_start, window_end, latency_ms, conduct_ai_insight_id,
  requested_at, completed_at, metadata, created_at
) ON public.ai_governance_activity_attempts TO authenticated;

REVOKE SELECT ON public.conduct_ai_insights FROM authenticated;
GRANT SELECT (
  id, insight_id, use_case_code, subject_type, subject_key, emerging_risk_id,
  entity_id, regulator_id, sector_id, window_start, window_end, generated_at, generated_by,
  ai_output, human_output, human_rationale, source_references, confidence, uncertainty,
  limitations, staleness_state, staleness_checked_at, review_state, reviewed_by, reviewed_at,
  prompt_template_code, prompt_template_version, snapshot_fingerprint, subject_population,
  created_at, updated_at
) ON public.conduct_ai_insights TO authenticated;

-- The technical activity read model keeps the raw columns; it is no longer a
-- client-facing object, so ordinary sessions do not read it directly.
REVOKE SELECT ON public.ai_governance_activity_v FROM authenticated;
GRANT SELECT ON public.ai_governance_activity_v TO service_role;

-- 7. Model registration also captures the governance presentation fields.
DROP FUNCTION IF EXISTS public.ai_governance_model_save(uuid, text, text, text, text, text, text, text, text, boolean);
CREATE OR REPLACE FUNCTION public.ai_governance_model_save(
  _id uuid,
  _provider text,
  _technical_identifier text,
  _model_key text,
  _display_name text,
  _regulatory_purpose text,
  _model_version text DEFAULT NULL::text,
  _known_limitations text DEFAULT NULL::text,
  _data_handling_class text DEFAULT 'INTERNAL_REGULATORY_FACTS'::text,
  _external_data_capable boolean DEFAULT false,
  _governance_display_name text DEFAULT NULL::text,
  _governance_version_label text DEFAULT NULL::text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _out uuid; _state public.ai_gov_lifecycle;
BEGIN
  _uid := public.ai_gov_require(ARRAY['create','edit']);
  IF _id IS NULL THEN
    INSERT INTO public.ai_governance_models
      (provider, model_key, technical_identifier, model_version, display_name, regulatory_purpose,
       known_limitations, data_handling_class, external_data_capable, lifecycle_state, created_by,
       governance_display_name, governance_version_label)
    VALUES (_provider, _model_key, _technical_identifier, NULLIF(btrim(COALESCE(_model_version,'')),''),
            _display_name, _regulatory_purpose, _known_limitations,
            _data_handling_class, COALESCE(_external_data_capable,false), 'DRAFT', _uid,
            NULLIF(btrim(COALESCE(_governance_display_name,'')),''),
            NULLIF(btrim(COALESCE(_governance_version_label,'')),''))
    RETURNING id INTO _out;
    PERFORM public.ai_gov_log_event('MODEL', _out, _display_name, 'CREATED', NULL, 'DRAFT', _uid, NULL, '{}'::jsonb);
  ELSE
    SELECT lifecycle_state INTO _state FROM public.ai_governance_models WHERE id = _id;
    IF _state IS NULL THEN RAISE EXCEPTION 'model_not_found' USING ERRCODE = 'P0002'; END IF;
    IF _state NOT IN ('DRAFT','TESTING') THEN
      RAISE EXCEPTION 'immutable_released_configuration: register a new model entry instead of editing a % model', _state
        USING ERRCODE = '42501';
    END IF;
    UPDATE public.ai_governance_models
       SET provider = _provider, model_key = _model_key, technical_identifier = _technical_identifier,
           model_version = NULLIF(btrim(COALESCE(_model_version,'')),''), display_name = _display_name,
           regulatory_purpose = _regulatory_purpose, known_limitations = _known_limitations,
           data_handling_class = _data_handling_class,
           external_data_capable = COALESCE(_external_data_capable,false),
           governance_display_name = COALESCE(NULLIF(btrim(COALESCE(_governance_display_name,'')),''), governance_display_name),
           governance_version_label = COALESCE(NULLIF(btrim(COALESCE(_governance_version_label,'')),''), governance_version_label),
           updated_at = now()
     WHERE id = _id;
    _out := _id;
    PERFORM public.ai_gov_log_event('MODEL', _out, _display_name, 'UPDATED', _state::text, _state::text, _uid, NULL, '{}'::jsonb);
  END IF;
  RETURN _out;
END $function$;

GRANT EXECUTE ON FUNCTION public.ai_governance_model_save(uuid, text, text, text, text, text, text, text, text, boolean, text, text) TO authenticated;
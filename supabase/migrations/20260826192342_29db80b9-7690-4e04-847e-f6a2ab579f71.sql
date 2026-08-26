-- 1. Vocabulary extensions -------------------------------------------------
ALTER TABLE public.conduct_ai_use_cases DROP CONSTRAINT IF EXISTS conduct_ai_use_cases_source_chk;
ALTER TABLE public.conduct_ai_use_cases ADD CONSTRAINT conduct_ai_use_cases_source_chk CHECK (allowed_source = ANY (ARRAY[
  'conduct_360_snapshot','conduct_intelligence_snapshot','conduct_planning_snapshot','conduct_reporting_snapshot']));

ALTER TABLE public.conduct_ai_use_cases DROP CONSTRAINT IF EXISTS conduct_ai_use_cases_code_chk;
ALTER TABLE public.conduct_ai_use_cases ADD CONSTRAINT conduct_ai_use_cases_code_chk CHECK (code = ANY (ARRAY[
  'SUPERVISORY_SUMMARY','MATERIAL_CHANGE_EXPLANATION','RECORDS_TO_REVIEW','SUPERVISORY_QUESTIONS','RISK_HYPOTHESIS',
  'CROSS_ENTITY_INTERPRETATION','THEME_MATERIAL_CHANGE','SECTOR_SUPERVISORY_QUESTIONS','EMERGING_RISK_NARRATIVE',
  'EMERGING_RISK_HYPOTHESIS','ATTENTION_SUMMARY','PLANNING_RECORDS_TO_REVIEW','PLANNING_QUESTIONS',
  'INTERVENTION_OPTIONS','SUPERVISORY_PLAN_DRAFT','FOLLOWUP_CONSIDERATIONS',
  'MANAGEMENT_SUMMARY_DRAFT','MATERIAL_MOVEMENT_EXPLANATION','RISK_REPORTING_NARRATIVE',
  'COVERAGE_COMMENTARY','EVIDENCE_PACK_SUMMARY']));

ALTER TABLE public.conduct_ai_insights DROP CONSTRAINT IF EXISTS conduct_ai_insights_subject_chk;
ALTER TABLE public.conduct_ai_insights ADD CONSTRAINT conduct_ai_insights_subject_chk CHECK (
  subject_type = ANY (ARRAY['entity','sector_theme','emerging_risk','attention_item','supervisory_plan','intervention','management_report'])
  AND (subject_type <> 'entity' OR entity_id IS NOT NULL)
  AND (subject_type <> 'sector_theme' OR COALESCE(btrim(subject_key),'') <> '')
  AND (subject_type <> 'emerging_risk' OR emerging_risk_id IS NOT NULL)
  AND (subject_type <> ALL (ARRAY['attention_item','supervisory_plan','intervention','management_report'])
       OR COALESCE(btrim(subject_key),'') <> ''));

-- 2. Surface, stop control, released instructions, approved use cases -------
INSERT INTO public.ai_governance_surfaces
  (code, label, owning_module, business_purpose, advisory_classification, production_status, lifecycle_state,
   approved_model_id, instruction_governance, human_review, authoritative_write_path, edge_function, created_at)
VALUES
  ('MANAGEMENT_REPORTING_ASSISTANCE', 'Supervisory management reporting assistance', 'market_conduct',
   'Assists supervisors in drafting management commentary strictly from deterministic supervisory management information: summarising the reported period, explaining recorded movements, narrating emerging risk reporting, commenting on recorded supervisory coverage and summarising an evidence pack.',
   'ADVISORY_HUMAN_REVIEWED', 'IN_PRODUCTION', 'ACTIVE',
   (SELECT id FROM public.ai_governance_models WHERE model_key = 'gemini-2.5-pro' LIMIT 1),
   'Released instruction versions only, resolved server-side.',
   'Mandatory human review before any wording is adopted into management reporting.',
   'NONE', 'conduct-reporting-ai-advise', now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.ai_governance_kill_switches (scope_key, scope_label)
VALUES ('module:market_conduct_reporting', 'Market Conduct management reporting assistance')
ON CONFLICT (scope_key) DO NOTHING;

INSERT INTO public.ai_governance_instructions
  (template_code, version, title, purpose, use_case_code, instruction_body, allowed_fact_scope,
   prohibited_behaviours, required_caveats, citation_expectation, confidence_expectation,
   lifecycle_state, effective_from, released_at)
VALUES
 ('MC11_MANAGEMENT_SUMMARY','v1','Management summary draft','Draft a management summary of the reported supervisory period from the supplied deterministic figures only.','MANAGEMENT_SUMMARY_DRAFT',
  'You assist a financial services supervisor preparing management reporting. Use ONLY the supplied deterministic supervisory management information. Never state a figure, count, percentage or trend that is not present in the supplied measures; quote supplied figures exactly. Never assert a breach, finding, sanction, outcome, rating or supervisory conclusion. Never present the absence of recorded activity as evidence of compliance or of low risk. Where a population is flagged as immaterial, do not express movement as a percentage. Cite the supplied measure code for every figure you state. State limitations and what the figures do not evidence.',
  'conduct_reporting_snapshot',
  ARRAY['stating any figure not supplied','recalculating or estimating figures','asserting a breach, finding or outcome','presenting absence of activity as compliance','expressing movement as a percentage for immaterial populations','changing any record'],
  ARRAY['AI-drafted commentary — requires human review','Figures are deterministic management information; the narrative is not','External data: none'],
  'Every figure must cite its supplied measure code.','State confidence and uncertainty explicitly.','ACTIVE', now(), now()),
 ('MC11_MATERIAL_MOVEMENT','v1','Material movement explanation','Explain recorded period-on-period movements from the supplied comparison only.','MATERIAL_MOVEMENT_EXPLANATION',
  'You assist a financial services supervisor explaining recorded movements in supervisory management information. Use ONLY the supplied period comparison. Describe what changed and what the change may reflect in recorded supervisory activity. Never invent a cause, never attribute a movement to entity behaviour that is not evidenced, and never state a figure that is not supplied. Where the comparison flags interpretation as limited by a small population, say so plainly instead of quoting a percentage. Cite the measure code for every movement discussed.',
  'conduct_reporting_snapshot',
  ARRAY['inventing a cause','stating unsupplied figures','quoting percentages for immaterial populations','asserting a breach or outcome','changing any record'],
  ARRAY['AI-drafted commentary — requires human review','Movements describe recorded supervisory activity, not entity conduct','External data: none'],
  'Every movement must cite its supplied measure code.','State confidence and uncertainty explicitly.','ACTIVE', now(), now()),
 ('MC11_RISK_REPORTING','v1','Emerging risk reporting narrative','Narrate emerging risk reporting from the supplied risk records and their recorded response chain.','RISK_REPORTING_NARRATIVE',
  'You assist a financial services supervisor reporting on emerging risks. Use ONLY the supplied emerging risk records and their recorded supervisory response chain. Describe what has been recorded at each stage and where the chain has no recorded response. Never assert systemic harm, a breach or an outcome that is not recorded. Never state a figure that is not supplied. Cite the supplied risk reference for every statement.',
  'conduct_reporting_snapshot',
  ARRAY['asserting systemic harm','asserting a breach or outcome','stating unsupplied figures','inventing risks or records','changing any record'],
  ARRAY['AI-drafted commentary — requires human review','Recorded response chain only','External data: none'],
  'Every statement must cite a supplied risk reference or measure code.','State confidence and uncertainty explicitly.','ACTIVE', now(), now()),
 ('MC11_COVERAGE_COMMENTARY','v1','Supervisory coverage commentary','Comment on recorded supervisory coverage and response gaps from the supplied coverage figures only.','COVERAGE_COMMENTARY',
  'You assist a financial services supervisor commenting on recorded supervisory coverage. Use ONLY the supplied coverage figures and gap records. Describe where the recorded supervisory chain is incomplete. Never describe an entity with no recorded supervisory activity as low risk, compliant or assessed. Never state a figure that is not supplied. Cite the supplied measure code or record reference for every statement.',
  'conduct_reporting_snapshot',
  ARRAY['describing unmonitored entities as compliant or low risk','stating unsupplied figures','asserting a breach or outcome','changing any record'],
  ARRAY['AI-drafted commentary — requires human review','Coverage reflects recorded activity only','External data: none'],
  'Every statement must cite a supplied measure code or record reference.','State confidence and uncertainty explicitly.','ACTIVE', now(), now()),
 ('MC11_PACK_SUMMARY','v1','Evidence pack summary','Summarise a point-in-time evidence pack strictly from its stored contents.','EVIDENCE_PACK_SUMMARY',
  'You assist a financial services supervisor summarising a point-in-time supervisory evidence pack. Use ONLY the stored pack contents supplied to you. Describe the supervisory chain as recorded in the pack and state explicitly that the pack is a point-in-time record. Never add facts, figures or conclusions beyond the pack. Cite the supplied pack reference and record references for every statement.',
  'conduct_reporting_snapshot',
  ARRAY['adding facts beyond the pack','stating unsupplied figures','asserting a breach or outcome not recorded in the pack','changing any record'],
  ARRAY['AI-drafted commentary — requires human review','Point-in-time record as at the pack generation time','External data: none'],
  'Every statement must cite a supplied reference.','State confidence and uncertainty explicitly.','ACTIVE', now(), now())
ON CONFLICT (template_code, version) DO NOTHING;

INSERT INTO public.conduct_ai_use_cases
  (code, label, purpose, governance_level, is_enabled, allowed_source, human_review_required,
   citations_required, workflow_mutation_allowed, allowed_output_classes, prohibited_output_classes,
   prompt_template_code, prompt_template_version, model_policy, confidence_policy, limitation_policy,
   lifecycle_state, owning_module, advisory_classification, risk_classification,
   approved_roles, required_permission_actions, approved_model_id, approved_instruction_id,
   governance_owner, use_case_version, effective_from, approved_at)
SELECT v.code, v.label, v.purpose, 'ADVISORY_HUMAN_REVIEWED', true, 'conduct_reporting_snapshot', true, true, false,
  ARRAY['interpretation','narrative','suggestion'],
  ARRAY['decision','rating','priority','approval','enforcement'],
  v.tpl, 'v1',
  jsonb_build_object('allowed_providers', jsonb_build_array('lovable_ai_gateway'),
                     'allowed_models', jsonb_build_array('google/gemini-2.5-pro'),
                     'temperature_max', 0.2, 'external_data_allowed', false),
  jsonb_build_object('require_confidence', true, 'require_uncertainty', true),
  'Advisory only. The deterministic management information is the authoritative record; narrative wording carries no supervisory conclusion until a supervisor adopts it.',
  'ACTIVE', 'market_conduct', 'ADVISORY_ONLY', 'high',
  ARRAY['super_admin','admin','supervisor','analyst'],
  ARRAY['run_conduct_analytics'],
  (SELECT id FROM public.ai_governance_models WHERE model_key = 'gemini-2.5-pro' LIMIT 1),
  (SELECT i.id FROM public.ai_governance_instructions i WHERE i.template_code = v.tpl AND i.version = 'v1' LIMIT 1),
  'Market Conduct Supervision', 1, now(), now()
FROM (VALUES
  ('MANAGEMENT_SUMMARY_DRAFT','Management summary draft','Draft management commentary on the reported supervisory period from deterministic figures.','MC11_MANAGEMENT_SUMMARY'),
  ('MATERIAL_MOVEMENT_EXPLANATION','Material movement explanation','Explain recorded period-on-period movements in supervisory management information.','MC11_MATERIAL_MOVEMENT'),
  ('RISK_REPORTING_NARRATIVE','Emerging risk reporting narrative','Narrate emerging risk reporting and the recorded supervisory response chain.','MC11_RISK_REPORTING'),
  ('COVERAGE_COMMENTARY','Supervisory coverage commentary','Comment on recorded supervisory coverage and response gaps.','MC11_COVERAGE_COMMENTARY'),
  ('EVIDENCE_PACK_SUMMARY','Evidence pack summary','Summarise a point-in-time evidence pack from its stored contents.','MC11_PACK_SUMMARY')
) AS v(code, label, purpose, tpl)
ON CONFLICT (code) DO NOTHING;

-- 3. Governed reporting fact package ---------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_reporting_ai_context(
  _use_case_code text,
  _period_start  date DEFAULT (current_date - 90),
  _period_end    date DEFAULT current_date,
  _sector_id     uuid DEFAULT NULL,
  _regulator_id  uuid DEFAULT NULL,
  _pack_id       uuid DEFAULT NULL,
  _pack_version  integer DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE _uid uuid; _sectors uuid[]; _dash jsonb; _cmp jsonb; _risks jsonb; _cov jsonb;
        _sect jsonb; _pack jsonb; _snapshot jsonb; _figures jsonb; _refs jsonb;
BEGIN
  _uid := public.market_conduct_require(ARRAY['view']);
  _sectors := public.conduct_planning_scope(_uid, _sector_id, _regulator_id);

  IF NOT EXISTS (SELECT 1 FROM public.conduct_ai_use_cases u
                  WHERE u.code = _use_case_code AND u.allowed_source = 'conduct_reporting_snapshot') THEN
    RAISE EXCEPTION 'unknown_use_case: %', _use_case_code USING ERRCODE = '22023';
  END IF;

  _dash := public.conduct_mi_dashboard(_period_start, _period_end, _sector_id, _regulator_id);

  IF _use_case_code = 'EVIDENCE_PACK_SUMMARY' THEN
    IF _pack_id IS NULL THEN
      RAISE EXCEPTION 'pack_required' USING ERRCODE = '22023';
    END IF;
    _pack := public.conduct_evidence_pack_read(_pack_id, _pack_version);
    _snapshot := jsonb_build_object(
      'kind', 'evidence_pack',
      'scope', _dash -> 'scope',
      'pack', _pack -> 'pack',
      'pack_version', (_pack -> 'version') - 'ai_assistance',
      'point_in_time', true);
  ELSE
    IF _use_case_code IN ('MANAGEMENT_SUMMARY_DRAFT','MATERIAL_MOVEMENT_EXPLANATION') THEN
      _cmp := public.conduct_mi_period_compare(_period_start, _period_end, _sector_id, _regulator_id);
    END IF;
    IF _use_case_code IN ('MANAGEMENT_SUMMARY_DRAFT','RISK_REPORTING_NARRATIVE') THEN
      _risks := public.conduct_mi_risk_reporting(_period_start, _period_end, _sector_id, _regulator_id);
    END IF;
    IF _use_case_code IN ('MANAGEMENT_SUMMARY_DRAFT','COVERAGE_COMMENTARY') THEN
      _cov := public.conduct_planning_coverage(_sector_id, _regulator_id);
      _sect := public.conduct_mi_sector_coverage(_period_start, _period_end, _sector_id, _regulator_id);
    END IF;
    _snapshot := jsonb_strip_nulls(jsonb_build_object(
      'kind', 'management_information',
      'scope', _dash -> 'scope',
      'metrics', _dash -> 'metrics',
      'metric_groups', _dash -> 'metric_groups',
      'definitions', _dash -> 'definitions',
      'period_comparison', _cmp,
      'emerging_risk_reporting', _risks,
      'response_coverage', _cov,
      'sector_coverage', _sect,
      'point_in_time', false));
  END IF;

  -- The complete set of figures the narrative may state, and the complete set of
  -- references it may cite. Anything outside these lists invalidates the draft.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('code', d.code, 'label', d.label, 'value', m.value)), '[]'::jsonb)
    INTO _figures
    FROM jsonb_array_elements(COALESCE(_dash -> 'definitions', '[]'::jsonb)) d(x)
    CROSS JOIN LATERAL (SELECT (d.x ->> 'code') AS code, (d.x ->> 'label') AS label) d(code, label)
    CROSS JOIN LATERAL (SELECT (_dash -> 'metrics' -> d.code) AS value) m(value)
   WHERE _dash -> 'metrics' ? d.code;

  _refs := (
    SELECT COALESCE(jsonb_agg(DISTINCT r), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('section','measure','reference', d ->> 'code','label', d ->> 'label') r
        FROM jsonb_array_elements(COALESCE(_dash -> 'definitions','[]'::jsonb)) d
      UNION ALL
      SELECT jsonb_build_object('section','emerging_risk','reference', x ->> 'reference','label', x ->> 'title')
        FROM jsonb_array_elements(COALESCE(_risks -> 'risks','[]'::jsonb)) x
       WHERE COALESCE(x ->> 'reference','') <> ''
      UNION ALL
      SELECT jsonb_build_object('section','evidence_pack','reference', (_pack -> 'pack') ->> 'reference',
                                'label', (_pack -> 'pack') ->> 'subject_label')
       WHERE _pack IS NOT NULL AND COALESCE((_pack -> 'pack') ->> 'reference','') <> ''
    ) q);

  RETURN jsonb_build_object(
    'use_case_code', _use_case_code,
    'snapshot', _snapshot,
    'permitted_figures', COALESCE(_figures, '[]'::jsonb),
    'permitted_references', _refs,
    'facts_signature', COALESCE(_dash ->> 'facts_signature',
                                encode(digest(COALESCE(_snapshot,'{}'::jsonb)::text, 'sha256'), 'hex')),
    'period', jsonb_build_object('start', _period_start, 'end', _period_end),
    'generated_at', now()
  );
END $$;

REVOKE ALL ON FUNCTION public.conduct_reporting_ai_context(text,date,date,uuid,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_reporting_ai_context(text,date,date,uuid,uuid,uuid,integer) TO authenticated;

-- 4. Recorder --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_reporting_ai_insight_record(
  _use_case_code text,
  _subject_key text,
  _sector_id uuid,
  _regulator_id uuid,
  _window_start date,
  _window_end date,
  _snapshot_fingerprint text,
  _ai_output jsonb,
  _source_references jsonb,
  _provider text,
  _model text,
  _model_version text,
  _prompt_template_version text,
  _confidence numeric,
  _uncertainty text,
  _limitations text[],
  _generated_by uuid,
  _pack_id uuid DEFAULT NULL,
  _pack_version integer DEFAULT NULL,
  _title text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uc public.conduct_ai_use_cases; _insight_id uuid; _id uuid;
BEGIN
  SELECT * INTO _uc FROM public.conduct_ai_use_cases WHERE code = _use_case_code;
  IF _uc.code IS NULL THEN RAISE EXCEPTION 'unknown_use_case: %', _use_case_code USING ERRCODE = '22023'; END IF;
  IF _uc.allowed_source <> 'conduct_reporting_snapshot' THEN
    RAISE EXCEPTION 'fact_source_not_permitted: %', _use_case_code USING ERRCODE = '42501'; END IF;
  IF NOT _uc.is_enabled THEN RAISE EXCEPTION 'use_case_disabled: %', _use_case_code USING ERRCODE = '42501'; END IF;
  IF _uc.workflow_mutation_allowed THEN
    RAISE EXCEPTION 'mutation_policy_violation: %', _use_case_code USING ERRCODE = '42501'; END IF;
  IF COALESCE(btrim(COALESCE(_subject_key,'')),'') = '' THEN
    RAISE EXCEPTION 'subject_key_required' USING ERRCODE = '22023'; END IF;
  IF _ai_output IS NULL OR _ai_output = '{}'::jsonb THEN
    RAISE EXCEPTION 'ai_output_required' USING ERRCODE = '22023'; END IF;
  IF COALESCE(btrim(COALESCE(_snapshot_fingerprint,'')),'') = '' THEN
    RAISE EXCEPTION 'fingerprint_required' USING ERRCODE = '22023'; END IF;
  IF _uc.citations_required
     AND (_source_references IS NULL OR jsonb_array_length(COALESCE(_source_references,'[]'::jsonb)) = 0) THEN
    RAISE EXCEPTION 'citations_required: % needs at least one source reference', _use_case_code USING ERRCODE = '22023'; END IF;
  IF _provider IS NOT NULL AND _uc.model_policy ? 'allowed_providers'
     AND NOT (_uc.model_policy -> 'allowed_providers' ? _provider) THEN
    RAISE EXCEPTION 'provider_not_permitted: %', _provider USING ERRCODE = '42501'; END IF;
  IF _model IS NOT NULL AND _uc.model_policy ? 'allowed_models'
     AND NOT (_uc.model_policy -> 'allowed_models' ? _model) THEN
    RAISE EXCEPTION 'model_not_permitted: %', _model USING ERRCODE = '42501'; END IF;

  INSERT INTO public.ai_insights (
    title, module, entity_id, insight_kind, analysis_type, scope, scope_id,
    period_key, source_records, citations, provider, model, provider_state,
    confidence, input_fingerprint, payload, review_status, generated_at,
    generated_by, regulator_id, source_modules
  ) VALUES (
    COALESCE(_title, _uc.label || ' — ' || _subject_key),
    'market_conduct', NULL, 'conduct_intelligence', _use_case_code,
    'sector', _sector_id,
    to_char(COALESCE(_window_end, current_date),'YYYY-MM-DD'),
    COALESCE(_source_references,'[]'::jsonb), COALESCE(_source_references,'[]'::jsonb),
    _provider, _model, CASE WHEN _provider IS NULL THEN 'NOT_CONFIGURED' ELSE 'SUCCESS' END,
    _confidence, _snapshot_fingerprint, _ai_output, 'pending', now(),
    _generated_by, _regulator_id, ARRAY['market_conduct']
  ) RETURNING id INTO _insight_id;

  INSERT INTO public.conduct_ai_insights (
    insight_id, use_case_code, entity_id, regulator_id, sector_id,
    subject_type, subject_key, subject_population,
    window_start, window_end, snapshot_fingerprint, source_references,
    provider, model, model_version, prompt_template_code, prompt_template_version,
    generated_by, ai_output, confidence, uncertainty, limitations
  ) VALUES (
    _insight_id, _uc.code, NULL, _regulator_id, _sector_id,
    'management_report', btrim(_subject_key),
    jsonb_build_object('pack_id', _pack_id, 'pack_version', _pack_version,
                       'period_start', _window_start, 'period_end', _window_end),
    COALESCE(_window_start, current_date), COALESCE(_window_end, current_date),
    _snapshot_fingerprint, COALESCE(_source_references,'[]'::jsonb),
    _provider, _model, _model_version, _uc.prompt_template_code,
    COALESCE(_prompt_template_version, _uc.prompt_template_version),
    _generated_by, _ai_output, _confidence, _uncertainty, COALESCE(_limitations,'{}'::text[])
  ) RETURNING id INTO _id;

  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.conduct_reporting_ai_insight_record(text,text,uuid,uuid,date,date,text,jsonb,jsonb,text,text,text,text,numeric,text,text[],uuid,uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_reporting_ai_insight_record(text,text,uuid,uuid,date,date,text,jsonb,jsonb,text,text,text,text,numeric,text,text[],uuid,uuid,integer,text) TO service_role;

-- 5. Adoption register (append-only) ---------------------------------------
CREATE TABLE IF NOT EXISTS public.conduct_reporting_adopted_narratives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conduct_ai_insight_id uuid NOT NULL REFERENCES public.conduct_ai_insights(id) ON DELETE RESTRICT,
  use_case_code text NOT NULL,
  section text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  sector_id uuid,
  regulator_id uuid,
  pack_id uuid REFERENCES public.conduct_evidence_packs(id) ON DELETE RESTRICT,
  pack_version integer,
  review_state text NOT NULL,
  facts_signature text NOT NULL,
  adopted_text jsonb NOT NULL,
  adoption_rationale text NOT NULL,
  adopted_by uuid NOT NULL,
  adopted_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.conduct_reporting_adopted_narratives TO authenticated;
GRANT ALL ON public.conduct_reporting_adopted_narratives TO service_role;
ALTER TABLE public.conduct_reporting_adopted_narratives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "internal market conduct staff read adopted narratives" ON public.conduct_reporting_adopted_narratives;
CREATE POLICY "internal market conduct staff read adopted narratives"
  ON public.conduct_reporting_adopted_narratives FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'market_conduct', 'view'));

CREATE OR REPLACE FUNCTION public.conduct_reporting_adoption_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'adopted reporting narratives are append-only' USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS conduct_reporting_adoption_no_change ON public.conduct_reporting_adopted_narratives;
CREATE TRIGGER conduct_reporting_adoption_no_change
  BEFORE UPDATE OR DELETE ON public.conduct_reporting_adopted_narratives
  FOR EACH ROW EXECUTE FUNCTION public.conduct_reporting_adoption_immutable();

CREATE OR REPLACE FUNCTION public.conduct_reporting_narrative_adopt(
  _insight_id uuid,
  _section text,
  _rationale text,
  _pack_id uuid DEFAULT NULL,
  _pack_version integer DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE _uid uuid; _row public.conduct_ai_insights; _id uuid;
BEGIN
  _uid := public.market_conduct_require(ARRAY['run_conduct_analytics']);
  SELECT * INTO _row FROM public.conduct_ai_insights WHERE id = _insight_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'insight_not_found' USING ERRCODE = '22023'; END IF;
  IF _row.subject_type <> 'management_report' THEN
    RAISE EXCEPTION 'not_a_reporting_narrative' USING ERRCODE = '22023'; END IF;
  IF _row.review_state NOT IN ('ACCEPTED','MODIFIED') THEN
    RAISE EXCEPTION 'human_review_required: a narrative must be accepted or modified before adoption' USING ERRCODE = '42501'; END IF;
  IF _row.staleness_state <> 'CURRENT' THEN
    RAISE EXCEPTION 'stale_narrative: the underlying figures have changed; regenerate before adopting' USING ERRCODE = '42501'; END IF;
  IF COALESCE(btrim(COALESCE(_rationale,'')),'') = '' THEN
    RAISE EXCEPTION 'rationale_required' USING ERRCODE = '22023'; END IF;
  IF COALESCE(btrim(COALESCE(_section,'')),'') = '' THEN
    RAISE EXCEPTION 'section_required' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.conduct_reporting_adopted_narratives (
    conduct_ai_insight_id, use_case_code, section, period_start, period_end,
    sector_id, regulator_id, pack_id, pack_version, review_state, facts_signature,
    adopted_text, adoption_rationale, adopted_by)
  VALUES (
    _row.id, _row.use_case_code, btrim(_section), _row.window_start, _row.window_end,
    _row.sector_id, _row.regulator_id, _pack_id, _pack_version, _row.review_state,
    _row.snapshot_fingerprint, COALESCE(_row.human_output, _row.ai_output),
    btrim(_rationale), _uid)
  RETURNING id INTO _id;

  INSERT INTO public.ai_governance_events (object_type, object_id, object_code, event_type,
    from_state, to_state, actor_id, rationale, metadata)
  VALUES ('conduct_ai_insight', _row.id, _row.use_case_code, 'NARRATIVE_ADOPTED',
    _row.review_state, 'ADOPTED', _uid, btrim(_rationale),
    jsonb_build_object('section', btrim(_section), 'pack_id', _pack_id, 'pack_version', _pack_version));

  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.conduct_reporting_narrative_adopt(uuid,text,text,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_reporting_narrative_adopt(uuid,text,text,uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.conduct_reporting_narratives_list(
  _period_start date DEFAULT (current_date - 90),
  _period_end   date DEFAULT current_date,
  _sector_id    uuid DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL,
  _limit        integer DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE _uid uuid; _sectors uuid[]; _rows jsonb;
BEGIN
  _uid := public.market_conduct_require(ARRAY['view']);
  _sectors := public.conduct_planning_scope(_uid, _sector_id, _regulator_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'use_case_code', c.use_case_code,
      'subject_key', c.subject_key,
      'window_start', c.window_start,
      'window_end', c.window_end,
      'sector_id', c.sector_id,
      'review_state', c.review_state,
      'staleness_state', c.staleness_state,
      'confidence', c.confidence,
      'uncertainty', c.uncertainty,
      'limitations', c.limitations,
      'provider', c.provider,
      'model', c.model,
      'model_version', c.model_version,
      'prompt_template_code', c.prompt_template_code,
      'prompt_template_version', c.prompt_template_version,
      'snapshot_fingerprint', c.snapshot_fingerprint,
      'source_references', c.source_references,
      'ai_output', c.ai_output,
      'human_output', c.human_output,
      'human_rationale', c.human_rationale,
      'reviewed_at', c.reviewed_at,
      'generated_at', c.generated_at,
      'adoptions', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', a.id, 'section', a.section,
                        'adopted_at', a.adopted_at, 'rationale', a.adoption_rationale)), '[]'::jsonb)
                      FROM public.conduct_reporting_adopted_narratives a WHERE a.conduct_ai_insight_id = c.id)
    ) ORDER BY c.generated_at DESC), '[]'::jsonb) INTO _rows
    FROM public.conduct_ai_insights c
   WHERE c.subject_type = 'management_report'
     AND (_sectors IS NULL OR c.sector_id IS NULL OR c.sector_id = ANY(_sectors))
     AND c.window_end >= _period_start AND c.window_start <= _period_end;

  RETURN jsonb_build_object('narratives', _rows, 'generated_at', now());
END $$;

REVOKE ALL ON FUNCTION public.conduct_reporting_narratives_list(date,date,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_reporting_narratives_list(date,date,uuid,uuid,integer) TO authenticated;
-- =====================================================================
-- MC-09 (part B) — governed AI boundary + human assessment layer
-- =====================================================================

-- 1. supervisor assessment history (append-only) ---------------------------
CREATE TABLE IF NOT EXISTS public.conduct_emerging_risk_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id uuid NOT NULL REFERENCES public.conduct_emerging_risks(id) ON DELETE CASCADE,
  version integer NOT NULL,
  severity text NOT NULL,
  systemic_potential text NOT NULL,
  confidence text NOT NULL,
  judgement text NOT NULL,
  actions_considered text,
  next_review_date date,
  fact_fingerprint text,
  assessed_by uuid,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_er_assessments_uniq UNIQUE (risk_id, version),
  CONSTRAINT conduct_er_assessments_sev_chk CHECK (severity IN ('low','medium','high','critical')),
  CONSTRAINT conduct_er_assessments_sys_chk CHECK (systemic_potential IN ('unassessed','low','moderate','high')),
  CONSTRAINT conduct_er_assessments_conf_chk CHECK (confidence IN ('indicative','probable','established')),
  CONSTRAINT conduct_er_assessments_judgement_chk CHECK (length(btrim(judgement)) >= 20)
);

CREATE INDEX IF NOT EXISTS conduct_er_assessments_risk_idx
  ON public.conduct_emerging_risk_assessments (risk_id, version DESC);

REVOKE ALL ON public.conduct_emerging_risk_assessments FROM anon;
REVOKE ALL ON public.conduct_emerging_risk_assessments FROM authenticated;
GRANT SELECT ON public.conduct_emerging_risk_assessments TO authenticated;
GRANT ALL ON public.conduct_emerging_risk_assessments TO service_role;
ALTER TABLE public.conduct_emerging_risk_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conduct_er_assessments_read ON public.conduct_emerging_risk_assessments;
CREATE POLICY conduct_er_assessments_read ON public.conduct_emerging_risk_assessments
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.conduct_emerging_risks r WHERE r.id = risk_id));

CREATE OR REPLACE FUNCTION public.tg_conduct_er_assessments_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'conduct_emerging_risk_assessments is append-only' USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS trg_conduct_er_assessments_append_only ON public.conduct_emerging_risk_assessments;
CREATE TRIGGER trg_conduct_er_assessments_append_only
  BEFORE UPDATE OR DELETE ON public.conduct_emerging_risk_assessments
  FOR EACH ROW EXECUTE FUNCTION public.tg_conduct_er_assessments_append_only();

-- 2. governed assessment + follow-up operations ----------------------------
CREATE OR REPLACE FUNCTION public.conduct_emerging_risk_assess(_risk_id uuid, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid; _row public.conduct_emerging_risks; _v integer; _id uuid;
  _sev text; _sys text; _conf text; _judgement text;
BEGIN
  _row := public.conduct_emerging_risk_guard(_risk_id, ARRAY['manage_complaints','run_conduct_analytics']);
  _uid := auth.uid();
  IF _row.status IN ('CLOSED','DISMISSED') THEN
    RAISE EXCEPTION 'emerging_risk_closed: a concluded risk cannot be assessed further' USING ERRCODE = '22023';
  END IF;

  _judgement := btrim(COALESCE(_payload->>'judgement',''));
  IF length(_judgement) < 20 THEN
    RAISE EXCEPTION 'A supervisory judgement of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;
  _sev  := COALESCE(nullif(_payload->>'severity',''), _row.severity);
  _sys  := COALESCE(nullif(_payload->>'systemic_potential',''), _row.systemic_potential);
  _conf := COALESCE(nullif(_payload->>'confidence',''), _row.confidence);

  SELECT COALESCE(max(version), 0) + 1 INTO _v
    FROM public.conduct_emerging_risk_assessments WHERE risk_id = _risk_id;

  INSERT INTO public.conduct_emerging_risk_assessments(
    risk_id, version, severity, systemic_potential, confidence, judgement,
    actions_considered, next_review_date, fact_fingerprint, assessed_by)
  VALUES (_risk_id, _v, _sev, _sys, _conf, _judgement,
          nullif(btrim(COALESCE(_payload->>'actions_considered','')),''),
          nullif(_payload->>'next_review_date','')::date,
          nullif(btrim(COALESCE(_payload->>'fact_fingerprint','')),''),
          _uid)
  RETURNING id INTO _id;

  UPDATE public.conduct_emerging_risks
     SET severity = _sev, systemic_potential = _sys, confidence = _conf, updated_at = now()
   WHERE id = _risk_id;

  INSERT INTO public.conduct_emerging_risk_events(risk_id, event_type, from_status, to_status, rationale, metadata, actor_id)
  VALUES (_risk_id, 'ASSESSMENT_RECORDED', _row.status, _row.status, _judgement,
          jsonb_build_object('version', _v, 'severity', _sev,
                             'systemic_potential', _sys, 'confidence', _conf), _uid);

  PERFORM public.log_compliance_audit('UPDATE', 'conduct_emerging_risk', _risk_id,
    jsonb_build_object('severity', _row.severity, 'systemic_potential', _row.systemic_potential,
                       'confidence', _row.confidence),
    jsonb_build_object('severity', _sev, 'systemic_potential', _sys, 'confidence', _conf),
    'Supervisory assessment v' || _v || ' recorded for emerging conduct risk ' || _row.reference);

  RETURN jsonb_build_object('id', _id, 'risk_id', _risk_id, 'version', _v);
END $$;

CREATE OR REPLACE FUNCTION public.conduct_emerging_risk_followup(
  _risk_id uuid, _kind text, _reference text DEFAULT NULL, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _row public.conduct_emerging_risks;
BEGIN
  _row := public.conduct_emerging_risk_guard(_risk_id, ARRAY['manage_complaints','run_conduct_analytics']);
  _uid := auth.uid();
  IF _kind NOT IN ('signal_raised','alert_raised','investigation','thematic_review',
                   'correspondence','entity_engagement','other') THEN
    RAISE EXCEPTION 'unsupported_follow_up_kind: %', _kind USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(_note,''))) < 10 THEN
    RAISE EXCEPTION 'A follow-up note of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.conduct_emerging_risk_events(risk_id, event_type, from_status, to_status, rationale, metadata, actor_id)
  VALUES (_risk_id, 'FOLLOW_UP_RECORDED', _row.status, _row.status, btrim(_note),
          jsonb_build_object('kind', _kind, 'reference', nullif(btrim(COALESCE(_reference,'')),'')), _uid);

  PERFORM public.log_compliance_audit('UPDATE', 'conduct_emerging_risk', _risk_id, NULL,
    jsonb_build_object('follow_up_kind', _kind, 'reference', _reference),
    'Supervisory follow-up recorded against emerging conduct risk ' || _row.reference);

  RETURN jsonb_build_object('risk_id', _risk_id, 'kind', _kind);
END $$;

-- 3. AI context for a cross-entity subject ---------------------------------
CREATE OR REPLACE FUNCTION public.conduct_intel_ai_context(
  _use_case_code text,
  _subject_type text,
  _subject_key text DEFAULT NULL,
  _emerging_risk_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _window_days integer DEFAULT 180,
  _regulator_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uc public.conduct_ai_use_cases;
  _risk public.conduct_emerging_risks;
  _snap jsonb; _refs jsonb; _theme text; _sector uuid; _reg uuid;
BEGIN
  SELECT * INTO _uc FROM public.conduct_ai_use_cases WHERE code = _use_case_code;
  IF _uc.code IS NULL THEN
    RAISE EXCEPTION 'unknown_use_case: %', _use_case_code USING ERRCODE = '22023';
  END IF;
  IF _uc.allowed_source <> 'conduct_intelligence_snapshot' THEN
    RAISE EXCEPTION 'fact_source_not_permitted: % may not read cross-entity intelligence facts', _use_case_code
      USING ERRCODE = '42501';
  END IF;
  IF NOT _uc.is_enabled THEN
    RAISE EXCEPTION 'use_case_disabled: %', _use_case_code USING ERRCODE = '42501';
  END IF;
  IF _subject_type NOT IN ('sector_theme','emerging_risk') THEN
    RAISE EXCEPTION 'unsupported_subject_type: %', _subject_type USING ERRCODE = '22023';
  END IF;

  _theme := nullif(btrim(COALESCE(_subject_key,'')),'');
  _sector := _sector_id;
  _reg := _regulator_id;

  IF _subject_type = 'emerging_risk' THEN
    IF _emerging_risk_id IS NULL THEN
      RAISE EXCEPTION 'emerging_risk_required' USING ERRCODE = '22023';
    END IF;
    -- permission + regulatory scope enforced by the guard
    _risk := public.conduct_emerging_risk_guard(_emerging_risk_id, ARRAY['view','run_conduct_analytics','manage_complaints']);
    _sector := _risk.sector_id;
    _reg := _risk.regulator_id;
    _theme := COALESCE(_theme, nullif(_risk.driver_metrics->>'theme',''), _risk.title);
  END IF;

  -- theme fact pack (permission + scope enforced inside)
  _snap := public.conduct_intel_theme_snapshot(_theme, _sector, _window_days, _reg);
  _snap := _snap || jsonb_build_object(
    'comparison', public.conduct_cross_entity_compare(_sector, _window_days, _reg));

  IF _subject_type = 'emerging_risk' THEN
    _snap := _snap || jsonb_build_object(
      'emerging_risk', jsonb_build_object(
        'reference', _risk.reference, 'title', _risk.title, 'summary', _risk.summary,
        'status', _risk.status, 'severity', _risk.severity,
        'systemic_potential', _risk.systemic_potential, 'confidence', _risk.confidence,
        'basis', _risk.basis, 'entity_count', _risk.entity_count,
        'window_start', _risk.window_start, 'window_end', _risk.window_end),
      'linked_records', jsonb_build_object('items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'reference', COALESCE(record_reference, upper(record_type) || '-' || left(record_id::text, 8)),
          'record_type', record_type, 'note', note, 'linked_at', linked_at)
          ORDER BY linked_at)
          FROM public.conduct_emerging_risk_records WHERE risk_id = _risk.id), '[]'::jsonb)),
      'supervisory_assessments', jsonb_build_object('items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'reference', _risk.reference || ' assessment v' || version,
          'severity', severity, 'systemic_potential', systemic_potential,
          'confidence', confidence, 'judgement', judgement, 'assessed_at', assessed_at)
          ORDER BY version)
          FROM public.conduct_emerging_risk_assessments WHERE risk_id = _risk.id), '[]'::jsonb)));
  END IF;

  SELECT COALESCE(jsonb_agg(ref), '[]'::jsonb) INTO _refs
    FROM (
      SELECT DISTINCT jsonb_build_object(
               'section', s.key,
               'reference', i ->> 'reference',
               'href', i ->> 'href'
             ) AS ref
        FROM jsonb_each(_snap) s
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.value -> 'items', '[]'::jsonb)) i
       WHERE jsonb_typeof(s.value) = 'object'
         AND COALESCE(i ->> 'reference', '') <> ''
      UNION
      SELECT jsonb_build_object('section', 'comparison', 'reference', i ->> 'reference', 'href', i ->> 'href')
        FROM jsonb_array_elements(COALESCE(_snap -> 'comparison' -> 'entities', '[]'::jsonb)) i
       WHERE COALESCE(i ->> 'reference', '') <> ''
    ) q;

  RETURN jsonb_build_object(
    'use_case', jsonb_build_object(
      'code', _uc.code, 'label', _uc.label, 'governance_level', _uc.governance_level,
      'allowed_source', _uc.allowed_source,
      'human_review_required', _uc.human_review_required,
      'citations_required', _uc.citations_required,
      'workflow_mutation_allowed', _uc.workflow_mutation_allowed,
      'allowed_output_classes', to_jsonb(_uc.allowed_output_classes),
      'prohibited_output_classes', to_jsonb(_uc.prohibited_output_classes),
      'prompt_template_code', _uc.prompt_template_code,
      'prompt_template_version', _uc.prompt_template_version,
      'model_policy', _uc.model_policy, 'confidence_policy', _uc.confidence_policy,
      'limitation_policy', _uc.limitation_policy),
    'subject', jsonb_build_object(
      'subject_type', _subject_type, 'subject_key', _theme,
      'emerging_risk_id', _emerging_risk_id,
      'sector_id', _sector, 'regulator_id', _reg),
    'snapshot', _snap,
    'input_fingerprint', public.conduct_360_fingerprint(_snap),
    'permitted_source_references', _refs,
    'window', _snap -> 'window',
    'provenance', jsonb_build_object(
      'source', 'conduct_intelligence_snapshot', 'content_class', 'fact',
      'ai_content', false, 'prepared_at', now())
  );
END $$;

-- 4. governed recording of a cross-entity advisory item --------------------
CREATE OR REPLACE FUNCTION public.conduct_intel_ai_insight_record(
  _use_case_code text,
  _subject_type text,
  _subject_key text,
  _emerging_risk_id uuid,
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
  _prompt_template_version text DEFAULT NULL,
  _confidence numeric DEFAULT NULL,
  _uncertainty text DEFAULT NULL,
  _limitations text[] DEFAULT '{}'::text[],
  _generated_by uuid DEFAULT NULL,
  _title text DEFAULT NULL,
  _subject_population jsonb DEFAULT '[]'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uc public.conduct_ai_use_cases; _insight_id uuid; _id uuid; _subject_label text;
BEGIN
  SELECT * INTO _uc FROM public.conduct_ai_use_cases WHERE code = _use_case_code;
  IF _uc.code IS NULL THEN
    RAISE EXCEPTION 'unknown_use_case: %', _use_case_code USING ERRCODE = '22023';
  END IF;
  IF _uc.allowed_source <> 'conduct_intelligence_snapshot' THEN
    RAISE EXCEPTION 'fact_source_not_permitted: %', _use_case_code USING ERRCODE = '42501';
  END IF;
  IF NOT _uc.is_enabled THEN
    RAISE EXCEPTION 'use_case_disabled: %', _use_case_code USING ERRCODE = '42501';
  END IF;
  IF _subject_type NOT IN ('sector_theme','emerging_risk') THEN
    RAISE EXCEPTION 'unsupported_subject_type: %', _subject_type USING ERRCODE = '22023';
  END IF;
  IF _ai_output IS NULL OR _ai_output = '{}'::jsonb THEN
    RAISE EXCEPTION 'ai_output_required' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(btrim(_snapshot_fingerprint), '') = '' THEN
    RAISE EXCEPTION 'fingerprint_required' USING ERRCODE = '22023';
  END IF;
  IF _uc.citations_required
     AND (_source_references IS NULL OR jsonb_array_length(COALESCE(_source_references, '[]'::jsonb)) = 0) THEN
    RAISE EXCEPTION 'citations_required: % needs at least one source reference', _use_case_code
      USING ERRCODE = '22023';
  END IF;
  IF _uc.confidence_policy ->> 'required' = 'true' AND _confidence IS NULL THEN
    RAISE EXCEPTION 'confidence_required: % must state a confidence', _use_case_code USING ERRCODE = '22023';
  END IF;
  IF _provider IS NOT NULL AND _uc.model_policy ? 'allowed_providers'
     AND NOT (_uc.model_policy -> 'allowed_providers' ? _provider) THEN
    RAISE EXCEPTION 'provider_not_permitted: %', _provider USING ERRCODE = '42501';
  END IF;
  IF _model IS NOT NULL AND _uc.model_policy ? 'allowed_models'
     AND NOT (_uc.model_policy -> 'allowed_models' ? _model) THEN
    RAISE EXCEPTION 'model_not_permitted: %', _model USING ERRCODE = '42501';
  END IF;
  IF _subject_type = 'emerging_risk' AND _emerging_risk_id IS NULL THEN
    RAISE EXCEPTION 'emerging_risk_required' USING ERRCODE = '22023';
  END IF;
  IF _subject_type = 'sector_theme' AND COALESCE(btrim(_subject_key), '') = '' THEN
    RAISE EXCEPTION 'subject_key_required' USING ERRCODE = '22023';
  END IF;

  _subject_label := CASE
    WHEN _subject_type = 'emerging_risk'
      THEN COALESCE((SELECT reference || ' — ' || title FROM public.conduct_emerging_risks WHERE id = _emerging_risk_id), 'Emerging risk')
    ELSE COALESCE(_subject_key, 'Sector theme') END;

  INSERT INTO public.ai_insights (
    title, module, entity_id, insight_kind, analysis_type, scope, scope_id,
    period_key, source_records, citations, provider, model, provider_state,
    confidence, input_fingerprint, payload, review_status, generated_at,
    generated_by, regulator_id, source_modules
  ) VALUES (
    COALESCE(_title, _uc.label || ' — ' || _subject_label),
    'market_conduct', NULL, 'conduct_intelligence', _use_case_code,
    CASE WHEN _subject_type = 'emerging_risk' THEN 'emerging_risk' ELSE 'sector' END,
    COALESCE(_emerging_risk_id, _sector_id),
    _window_start::text || '..' || _window_end::text,
    COALESCE(_source_references, '[]'::jsonb), COALESCE(_source_references, '[]'::jsonb),
    _provider, _model, CASE WHEN _provider IS NULL THEN 'NOT_CONFIGURED' ELSE 'SUCCESS' END,
    _confidence, _snapshot_fingerprint, _ai_output, 'pending', now(),
    _generated_by, _regulator_id, ARRAY['market_conduct']
  ) RETURNING id INTO _insight_id;

  INSERT INTO public.conduct_ai_insights (
    insight_id, use_case_code, entity_id, regulator_id, sector_id,
    subject_type, subject_key, emerging_risk_id, subject_population,
    window_start, window_end, snapshot_fingerprint, source_references,
    provider, model, model_version, prompt_template_code, prompt_template_version,
    generated_by, ai_output, confidence, uncertainty, limitations
  ) VALUES (
    _insight_id, _uc.code, NULL, _regulator_id, _sector_id,
    _subject_type, nullif(btrim(COALESCE(_subject_key,'')),''), _emerging_risk_id,
    COALESCE(_subject_population, '[]'::jsonb),
    _window_start, _window_end, _snapshot_fingerprint, COALESCE(_source_references, '[]'::jsonb),
    _provider, _model, _model_version, _uc.prompt_template_code,
    COALESCE(_prompt_template_version, _uc.prompt_template_version),
    _generated_by, _ai_output, _confidence, _uncertainty, COALESCE(_limitations, '{}'::text[])
  ) RETURNING id INTO _id;

  RETURN _id;
END $$;

-- 5. freshness re-check for a cross-entity advisory item -------------------
CREATE OR REPLACE FUNCTION public.conduct_intel_ai_refresh_staleness(_insight_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _row public.conduct_ai_insights; _ctx jsonb; _fp text; _state text; _days integer;
BEGIN
  SELECT * INTO _row FROM public.conduct_ai_insights WHERE id = _insight_id;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'insight_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF _row.subject_type = 'entity' THEN
    RETURN public.conduct_ai_insight_refresh_staleness(_insight_id);
  END IF;

  _days := GREATEST(1, (_row.window_end - _row.window_start));
  _ctx := public.conduct_intel_ai_context(
            _row.use_case_code, _row.subject_type, _row.subject_key,
            _row.emerging_risk_id, _row.sector_id, _days, _row.regulator_id);
  _fp := _ctx ->> 'input_fingerprint';
  _state := CASE WHEN _fp = _row.snapshot_fingerprint THEN 'CURRENT' ELSE 'STALE' END;

  UPDATE public.conduct_ai_insights
     SET staleness_state = _state, staleness_checked_at = now()
   WHERE id = _insight_id;

  RETURN jsonb_build_object('insight_id', _insight_id, 'staleness_state', _state,
                            'recorded_fingerprint', _row.snapshot_fingerprint,
                            'current_fingerprint', _fp, 'checked_at', now());
END $$;

-- 6. grants ----------------------------------------------------------------
REVOKE ALL ON FUNCTION public.conduct_emerging_risk_assess(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_emerging_risk_followup(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_intel_ai_context(text, text, text, uuid, uuid, integer, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_intel_ai_refresh_staleness(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_emerging_risk_assess(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_emerging_risk_followup(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_intel_ai_context(text, text, text, uuid, uuid, integer, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_intel_ai_refresh_staleness(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.conduct_intel_ai_insight_record(
  text, text, text, uuid, uuid, uuid, date, date, text, jsonb, jsonb, text, text, text,
  text, numeric, text, text[], uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conduct_intel_ai_insight_record(
  text, text, text, uuid, uuid, uuid, date, date, text, jsonb, jsonb, text, text, text,
  text, numeric, text, text[], uuid, text, jsonb) TO service_role;

DO $$
DECLARE _r text; _f text;
BEGIN
  FOREACH _r IN ARRAY ARRAY['sandbox_exec','sandbox_exec_sndfttzqmbkmkcnrvpfn'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = _r) THEN
      FOREACH _f IN ARRAY ARRAY[
        'public.conduct_emerging_risk_assess(uuid,jsonb)',
        'public.conduct_emerging_risk_followup(uuid,text,text,text)',
        'public.conduct_intel_ai_context(text,text,text,uuid,uuid,integer,uuid)',
        'public.conduct_intel_ai_refresh_staleness(uuid)',
        'public.conduct_intel_ai_insight_record(text,text,text,uuid,uuid,uuid,date,date,text,jsonb,jsonb,text,text,text,text,numeric,text,text[],uuid,text,jsonb)'
      ] LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', _f, _r);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- 7. register the MC-09 AI capabilities under MC-08 governance -------------
INSERT INTO public.conduct_ai_use_cases
  (code, label, purpose, allowed_source, prompt_template_code, prompt_template_version,
   model_policy, confidence_policy, limitation_policy, owning_module,
   advisory_classification, risk_classification, required_permission_actions,
   approved_roles, governance_owner, lifecycle_state, is_enabled, approved_at, effective_from)
VALUES
 ('CROSS_ENTITY_INTERPRETATION', 'Cross-entity interpretation',
  'Narrative reading of the recorded cross-entity conduct position for a theme in a sector.',
  'conduct_intelligence_snapshot', 'MC09_CROSS_ENTITY_INTERPRETATION', 'v1',
  '{"allowed_providers":["lovable_ai_gateway"],"allowed_models":["google/gemini-2.5-flash"]}'::jsonb,
  '{"required":true}'::jsonb,
  'Describes recorded facts across entities only. It is not a sector assessment, rating or finding.',
  'market_conduct', 'ADVISORY_NARRATIVE', 'MEDIUM', ARRAY['view'],
  ARRAY['supervisor','senior_supervisor','analyst','admin','super_admin'],
  'Market Conduct Supervision', 'ACTIVE', true, now(), now()),
 ('THEME_MATERIAL_CHANGE', 'Theme movement explanation',
  'What moved for this theme against the preceding window, and which records the movement sits in.',
  'conduct_intelligence_snapshot', 'MC09_THEME_MATERIAL_CHANGE', 'v1',
  '{"allowed_providers":["lovable_ai_gateway"],"allowed_models":["google/gemini-2.5-flash"]}'::jsonb,
  '{"required":true}'::jsonb,
  'Describes movement in the records. Causation is not established.',
  'market_conduct', 'ADVISORY_EXPLANATION', 'MEDIUM', ARRAY['view'],
  ARRAY['supervisor','senior_supervisor','analyst','admin','super_admin'],
  'Market Conduct Supervision', 'ACTIVE', true, now(), now()),
 ('SECTOR_SUPERVISORY_QUESTIONS', 'Sector supervisory questions',
  'Draft questions a supervisor may consider putting to entities in scope of this theme.',
  'conduct_intelligence_snapshot', 'MC09_SECTOR_SUPERVISORY_QUESTIONS', 'v1',
  '{"allowed_providers":["lovable_ai_gateway"],"allowed_models":["google/gemini-2.5-flash"]}'::jsonb,
  '{"required":true}'::jsonb,
  'Working material only. No information request or correspondence is issued from here.',
  'market_conduct', 'ADVISORY_QUESTION', 'MEDIUM', ARRAY['view'],
  ARRAY['supervisor','senior_supervisor','analyst','admin','super_admin'],
  'Market Conduct Supervision', 'ACTIVE', true, now(), now()),
 ('EMERGING_RISK_NARRATIVE', 'Emerging risk narrative',
  'Narrative summary of the facts and linked records recorded against an emerging conduct risk.',
  'conduct_intelligence_snapshot', 'MC09_EMERGING_RISK_NARRATIVE', 'v1',
  '{"allowed_providers":["lovable_ai_gateway"],"allowed_models":["google/gemini-2.5-flash"]}'::jsonb,
  '{"required":true}'::jsonb,
  'Summary of recorded facts only. It is not an assessment, finding or decision on the risk.',
  'market_conduct', 'ADVISORY_NARRATIVE', 'MEDIUM', ARRAY['view'],
  ARRAY['supervisor','senior_supervisor','analyst','admin','super_admin'],
  'Market Conduct Supervision', 'ACTIVE', true, now(), now()),
 ('EMERGING_RISK_HYPOTHESIS', 'Emerging risk hypothesis',
  'Possible explanations a supervisor could test against the records behind an emerging conduct risk.',
  'conduct_intelligence_snapshot', 'MC09_EMERGING_RISK_HYPOTHESIS', 'v1',
  '{"allowed_providers":["lovable_ai_gateway"],"allowed_models":["google/gemini-2.5-pro"]}'::jsonb,
  '{"required":true}'::jsonb,
  'Hypothesis — not a risk rating, systemic determination or finding.',
  'market_conduct', 'ADVISORY_HYPOTHESIS', 'HIGH', ARRAY['view'],
  ARRAY['supervisor','senior_supervisor','analyst','admin','super_admin'],
  'Market Conduct Supervision', 'ACTIVE', true, now(), now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.ai_governance_instructions
  (template_code, version, title, purpose, use_case_code, instruction_body, allowed_fact_scope,
   prohibited_behaviours, required_caveats, lifecycle_state, released_at, effective_from)
SELECT uc.prompt_template_code, uc.prompt_template_version,
       uc.label || ' — governed instruction',
       'Server-controlled instruction governing ' || uc.label || ' advisory drafting.',
       uc.code,
       'You are an advisory drafting assistant for a financial services regulator''s market-conduct '
       || 'supervision team, working across a population of entities. You are NOT a decision maker.' || E'\n\n'
       || 'ABSOLUTE RULES' || E'\n'
       || '1. Your ONLY permitted information source is the cross-entity supervisory intelligence context '
       || 'supplied in this request. You have no database access, no tools and no web access. If the '
       || 'context does not contain something, you do not know it.' || E'\n'
       || '2. You must NEVER decide, rate, grade, confirm, dismiss, escalate, instruct or conclude. You do '
       || 'not confirm an emerging risk, set a systemic determination, raise signals or alerts, open '
       || 'investigations, create findings or change any status. You only describe, suggest and ask.' || E'\n'
       || '3. Every material statement must cite at least one reference from "permitted_source_references", '
       || 'exactly as written there. Never invent, reformat or extrapolate a reference. If you cannot cite '
       || 'a supplied reference for a statement, do not make the statement.' || E'\n'
       || '4. Comparison between entities is positional only, drawn from the supplied comparison measures. '
       || 'Never imply wrongdoing, breach or non-compliance by any named entity, and never make statements '
       || 'about individuals.' || E'\n'
       || '5. State your confidence between 0 and 1, what you are uncertain about, and the limitations of '
       || 'your advice. Be candid when the population or the window is too thin to support a reading.' || E'\n'
       || '6. Where the context is empty or immaterial, say so plainly with low confidence rather than '
       || 'manufacturing content.',
       'conduct_intelligence_snapshot',
       ARRAY['regulatory_decision','risk_rating','systemic_determination','status_change','enforcement',
             'legal_conclusion','evidence_alteration','external_data_retrieval','statements_about_individuals'],
       ARRAY[uc.limitation_policy],
       'ACTIVE', now(), now()
  FROM public.conduct_ai_use_cases uc
 WHERE uc.allowed_source = 'conduct_intelligence_snapshot'
ON CONFLICT (template_code, version) DO NOTHING;

UPDATE public.conduct_ai_use_cases uc
   SET approved_model_id = (
         SELECT m.id FROM public.ai_governance_models m
          WHERE m.technical_identifier = (uc.model_policy->'allowed_models'->>0)
            AND m.lifecycle_state = 'ACTIVE' LIMIT 1),
       approved_instruction_id = (
         SELECT i.id FROM public.ai_governance_instructions i
          WHERE i.template_code = uc.prompt_template_code AND i.version = uc.prompt_template_version
          LIMIT 1),
       updated_at = now()
 WHERE uc.allowed_source = 'conduct_intelligence_snapshot'
   AND (uc.approved_model_id IS NULL OR uc.approved_instruction_id IS NULL);

INSERT INTO public.ai_governance_events (object_type, object_code, event_type, from_state, to_state, rationale, metadata)
SELECT 'USE_CASE', uc.code, 'REGISTERED_UNDER_GOVERNANCE', NULL, 'ACTIVE',
       'MC-09: cross-entity supervisory intelligence advisory capability registered under the institutional AI use-case register.',
       jsonb_build_object('model_id', uc.approved_model_id, 'instruction_id', uc.approved_instruction_id)
  FROM public.conduct_ai_use_cases uc
 WHERE uc.allowed_source = 'conduct_intelligence_snapshot'
   AND NOT EXISTS (SELECT 1 FROM public.ai_governance_events e
                    WHERE e.object_type = 'USE_CASE' AND e.object_code = uc.code
                      AND e.event_type = 'REGISTERED_UNDER_GOVERNANCE');

INSERT INTO public.ai_governance_surfaces
  (code, label, owning_module, business_purpose, lifecycle_state, edge_function,
   approved_model_id, approved_at, human_review, authoritative_write_path)
SELECT 'CROSS_ENTITY_INTELLIGENCE', 'Cross-entity supervisory intelligence advisory',
       'market_conduct',
       'Drafts narrative readings, movement explanations, questions and hypotheses over deterministic cross-entity conduct facts for supervisory review. It confirms no risk and changes no record.',
       'ACTIVE'::public.ai_gov_lifecycle, 'conduct-intel-ai-advise',
       (SELECT id FROM public.ai_governance_models
         WHERE technical_identifier = 'google/gemini-2.5-flash' AND lifecycle_state = 'ACTIVE' LIMIT 1),
       now(), 'HUMAN_REVIEW_REQUIRED', 'NONE'
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE public.conduct_emerging_risk_assessments IS
 'MC-09 append-only supervisory assessment history for an emerging conduct risk. Human judgement only; AI advisory content is never written here.';
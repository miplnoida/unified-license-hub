-- MC-07.2 — Conduct 360 AI GOVERNANCE BACKEND (no model calls, no narrative generation)

-- =========================================================================
-- 1. Approved use-case register
-- =========================================================================
CREATE TABLE public.conduct_ai_use_cases (
  code                      text PRIMARY KEY,
  label                     text NOT NULL,
  purpose                   text NOT NULL,
  governance_level          text NOT NULL DEFAULT 'ADVISORY_HUMAN_REVIEWED',
  is_enabled                boolean NOT NULL DEFAULT true,
  allowed_source            text NOT NULL DEFAULT 'conduct_360_snapshot',
  human_review_required     boolean NOT NULL DEFAULT true,
  citations_required        boolean NOT NULL DEFAULT true,
  workflow_mutation_allowed boolean NOT NULL DEFAULT false,
  allowed_output_classes    text[] NOT NULL DEFAULT ARRAY['narrative','observation','suggestion','question','hypothesis'],
  prohibited_output_classes text[] NOT NULL DEFAULT ARRAY['decision','rating','status_change','instruction','enforcement','legal_conclusion'],
  prompt_template_code      text NOT NULL,
  prompt_template_version   text NOT NULL DEFAULT 'v1',
  model_policy              jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_policy         jsonb NOT NULL DEFAULT '{}'::jsonb,
  limitation_policy         text NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_ai_use_cases_code_chk CHECK (code = ANY (ARRAY[
    'SUPERVISORY_SUMMARY','MATERIAL_CHANGE_EXPLANATION','RECORDS_TO_REVIEW',
    'SUPERVISORY_QUESTIONS','RISK_HYPOTHESIS'])),
  CONSTRAINT conduct_ai_use_cases_source_chk CHECK (allowed_source = 'conduct_360_snapshot'),
  CONSTRAINT conduct_ai_use_cases_review_chk CHECK (human_review_required IS TRUE),
  CONSTRAINT conduct_ai_use_cases_citations_chk CHECK (citations_required IS TRUE),
  CONSTRAINT conduct_ai_use_cases_no_mutation_chk CHECK (workflow_mutation_allowed IS FALSE),
  CONSTRAINT conduct_ai_use_cases_governance_chk CHECK (governance_level = ANY (ARRAY['ADVISORY_HUMAN_REVIEWED'])),
  CONSTRAINT conduct_ai_use_cases_output_classes_chk CHECK (
    array_length(allowed_output_classes, 1) > 0
    AND NOT (allowed_output_classes && prohibited_output_classes))
);

GRANT SELECT ON public.conduct_ai_use_cases TO authenticated;
GRANT ALL    ON public.conduct_ai_use_cases TO service_role;
ALTER TABLE public.conduct_ai_use_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read conduct AI use cases" ON public.conduct_ai_use_cases
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'market_conduct', 'view'));

-- =========================================================================
-- 2. Advisory record store (provenance + review state)
-- =========================================================================
CREATE TABLE public.conduct_ai_insights (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_id              uuid NOT NULL REFERENCES public.ai_insights(id) ON DELETE CASCADE,
  use_case_code           text NOT NULL REFERENCES public.conduct_ai_use_cases(code),
  entity_id               uuid NOT NULL,
  regulator_id            uuid,
  sector_id               uuid,
  window_start            date NOT NULL,
  window_end              date NOT NULL,
  snapshot_fingerprint    text NOT NULL,
  source_references       jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider                text,
  model                   text,
  model_version           text,
  prompt_template_code    text NOT NULL,
  prompt_template_version text NOT NULL,
  generated_at            timestamptz NOT NULL DEFAULT now(),
  generated_by            uuid,
  ai_output               jsonb NOT NULL,
  confidence              numeric,
  uncertainty             text,
  limitations             text[] NOT NULL DEFAULT '{}'::text[],
  staleness_state         text NOT NULL DEFAULT 'CURRENT',
  staleness_checked_at    timestamptz,
  review_state            text NOT NULL DEFAULT 'NOT_REVIEWED',
  human_output            jsonb,
  human_rationale         text,
  reviewed_by             uuid,
  reviewed_at             timestamptz,
  superseded_by_id        uuid REFERENCES public.conduct_ai_insights(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_ai_insights_window_chk CHECK (window_start <= window_end),
  CONSTRAINT conduct_ai_insights_confidence_chk CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CONSTRAINT conduct_ai_insights_staleness_chk CHECK (staleness_state = ANY (ARRAY['CURRENT','STALE'])),
  CONSTRAINT conduct_ai_insights_review_state_chk CHECK (review_state = ANY (ARRAY[
    'NOT_REVIEWED','ACCEPTED','MODIFIED','REJECTED','SUPERSEDED'])),
  CONSTRAINT conduct_ai_insights_modified_chk CHECK (
    review_state <> 'MODIFIED' OR (human_output IS NOT NULL AND COALESCE(btrim(human_rationale), '') <> '')),
  CONSTRAINT conduct_ai_insights_rejected_chk CHECK (
    review_state <> 'REJECTED' OR COALESCE(btrim(human_rationale), '') <> '')
);

CREATE INDEX idx_conduct_ai_insights_entity  ON public.conduct_ai_insights (entity_id, use_case_code, window_start, window_end);
CREATE INDEX idx_conduct_ai_insights_state   ON public.conduct_ai_insights (review_state, staleness_state);
CREATE UNIQUE INDEX idx_conduct_ai_insights_link ON public.conduct_ai_insights (insight_id);

GRANT SELECT ON public.conduct_ai_insights TO authenticated;
GRANT ALL    ON public.conduct_ai_insights TO service_role;
ALTER TABLE public.conduct_ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read conduct AI insights" ON public.conduct_ai_insights
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'market_conduct', 'view'));

-- Original AI output and provenance are permanently immutable.
CREATE OR REPLACE FUNCTION public.tg_conduct_ai_insight_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'conduct_ai_insight_immutable: AI advisory records cannot be deleted'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.ai_output IS DISTINCT FROM OLD.ai_output
     OR NEW.snapshot_fingerprint IS DISTINCT FROM OLD.snapshot_fingerprint
     OR NEW.use_case_code IS DISTINCT FROM OLD.use_case_code
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.window_start IS DISTINCT FROM OLD.window_start
     OR NEW.window_end IS DISTINCT FROM OLD.window_end
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.model IS DISTINCT FROM OLD.model
     OR NEW.model_version IS DISTINCT FROM OLD.model_version
     OR NEW.prompt_template_code IS DISTINCT FROM OLD.prompt_template_code
     OR NEW.prompt_template_version IS DISTINCT FROM OLD.prompt_template_version
     OR NEW.source_references IS DISTINCT FROM OLD.source_references
     OR NEW.generated_at IS DISTINCT FROM OLD.generated_at
     OR NEW.insight_id IS DISTINCT FROM OLD.insight_id THEN
    RAISE EXCEPTION 'conduct_ai_insight_immutable: original AI output and provenance cannot be altered'
      USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_conduct_ai_insight_immutable
  BEFORE UPDATE OR DELETE ON public.conduct_ai_insights
  FOR EACH ROW EXECUTE FUNCTION public.tg_conduct_ai_insight_immutable();

-- =========================================================================
-- 3. Append-only human review history
-- =========================================================================
CREATE TABLE public.conduct_ai_review_events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conduct_ai_insight_id  uuid NOT NULL REFERENCES public.conduct_ai_insights(id) ON DELETE RESTRICT,
  action                 text NOT NULL,
  rationale              text,
  from_state             text NOT NULL,
  to_state               text NOT NULL,
  human_output           jsonb,
  actor_id               uuid NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_ai_review_events_action_chk CHECK (action = ANY (ARRAY['accept','modify','reject','supersede'])),
  CONSTRAINT conduct_ai_review_events_rationale_chk CHECK (
    action NOT IN ('modify','reject') OR COALESCE(btrim(rationale), '') <> '')
);

CREATE INDEX idx_conduct_ai_review_events_insight ON public.conduct_ai_review_events (conduct_ai_insight_id, created_at);

GRANT SELECT ON public.conduct_ai_review_events TO authenticated;
GRANT ALL    ON public.conduct_ai_review_events TO service_role;
ALTER TABLE public.conduct_ai_review_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read conduct AI review history" ON public.conduct_ai_review_events
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'market_conduct', 'view'));

CREATE OR REPLACE FUNCTION public.tg_conduct_ai_review_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'conduct_ai_review_events is append-only'
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER trg_conduct_ai_review_events_append_only
  BEFORE UPDATE OR DELETE ON public.conduct_ai_review_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_conduct_ai_review_events_append_only();

-- =========================================================================
-- 4. Seed the five approved use cases
-- =========================================================================
INSERT INTO public.conduct_ai_use_cases
  (code, label, purpose, prompt_template_code, prompt_template_version,
   model_policy, confidence_policy, limitation_policy)
VALUES
  ('SUPERVISORY_SUMMARY', 'Supervisory summary',
   'Plain-language summary of the Conduct 360 facts for an authorised supervisor.',
   'conduct360.summary', 'v1',
   '{"allowed_providers":["lovable_ai_gateway"],"allowed_models":["google/gemini-2.5-flash"],"temperature_max":0.2,"external_data_allowed":false}',
   '{"required":true,"scale":"0_to_1","must_state_uncertainty":true}',
   'Advisory only. Derived solely from the Conduct 360 view for the stated window; may be incomplete and must be verified against source records.'),
  ('MATERIAL_CHANGE_EXPLANATION', 'Material-change explanation',
   'Explains window-on-window movement in the Conduct 360 measures.',
   'conduct360.material_change', 'v1',
   '{"allowed_providers":["lovable_ai_gateway"],"allowed_models":["google/gemini-2.5-flash"],"temperature_max":0.2,"external_data_allowed":false}',
   '{"required":true,"scale":"0_to_1","must_state_uncertainty":true}',
   'Advisory only. Describes movement present in the snapshot; does not establish cause and is not a supervisory conclusion.'),
  ('RECORDS_TO_REVIEW', 'Records to review',
   'Suggests which existing records an authorised supervisor may wish to open.',
   'conduct360.records_to_review', 'v1',
   '{"allowed_providers":["lovable_ai_gateway"],"allowed_models":["google/gemini-2.5-flash"],"temperature_max":0.1,"external_data_allowed":false}',
   '{"required":true,"scale":"0_to_1","must_state_uncertainty":true}',
   'Advisory only. Suggestions are limited to records already present in the snapshot and confer no priority or decision.'),
  ('SUPERVISORY_QUESTIONS', 'Supervisory questions',
   'Suggests questions an authorised supervisor may consider putting to the entity.',
   'conduct360.questions', 'v1',
   '{"allowed_providers":["lovable_ai_gateway"],"allowed_models":["google/gemini-2.5-flash"],"temperature_max":0.3,"external_data_allowed":false}',
   '{"required":true,"scale":"0_to_1","must_state_uncertainty":true}',
   'Advisory only. Draft questions require supervisory judgement before any use in correspondence.'),
  ('RISK_HYPOTHESIS', 'Risk hypothesis',
   'Suggests a possible risk explanation for an authorised supervisor to test.',
   'conduct360.risk_hypothesis', 'v1',
   '{"allowed_providers":["lovable_ai_gateway"],"allowed_models":["google/gemini-2.5-pro"],"temperature_max":0.3,"external_data_allowed":false}',
   '{"required":true,"scale":"0_to_1","must_state_uncertainty":true}',
   'Advisory only. A hypothesis to be tested by a supervisor; never a finding, rating or conclusion.');

-- =========================================================================
-- 5. Deterministic input fingerprint
-- =========================================================================
CREATE OR REPLACE FUNCTION public.conduct_360_fingerprint(_snapshot jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT md5(((_snapshot #- '{generated_at}') #- '{provenance,calculated_at}')::text);
$$;

REVOKE ALL ON FUNCTION public.conduct_360_fingerprint(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_360_fingerprint(jsonb) TO authenticated, service_role;

-- =========================================================================
-- 6. Context operation for future AI generation (no model is called)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.conduct_360_ai_context(
  _entity_id uuid,
  _use_case_code text,
  _window_start date DEFAULT NULL,
  _window_end date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uc public.conduct_ai_use_cases;
  _snap jsonb;
  _refs jsonb;
BEGIN
  SELECT * INTO _uc FROM public.conduct_ai_use_cases WHERE code = _use_case_code;
  IF _uc.code IS NULL THEN
    RAISE EXCEPTION 'unknown_use_case: %', _use_case_code USING ERRCODE = '22023';
  END IF;
  IF NOT _uc.is_enabled THEN
    RAISE EXCEPTION 'use_case_disabled: %', _use_case_code USING ERRCODE = '42501';
  END IF;

  -- permission + regulator/ROS scope are enforced inside the fact read model
  _snap := public.conduct_360_snapshot(_entity_id, _window_start, _window_end);

  SELECT COALESCE(jsonb_agg(ref), '[]'::jsonb) INTO _refs
    FROM (
      SELECT jsonb_build_object(
               'section', s.key,
               'reference', i ->> 'reference',
               'href', i ->> 'href'
             ) AS ref
        FROM jsonb_each(_snap) s
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.value -> 'items', '[]'::jsonb)) i
       WHERE jsonb_typeof(s.value) = 'object'
         AND COALESCE(i ->> 'reference', '') <> ''
    ) q;

  RETURN jsonb_build_object(
    'use_case', jsonb_build_object(
      'code', _uc.code,
      'label', _uc.label,
      'governance_level', _uc.governance_level,
      'allowed_source', _uc.allowed_source,
      'human_review_required', _uc.human_review_required,
      'citations_required', _uc.citations_required,
      'workflow_mutation_allowed', _uc.workflow_mutation_allowed,
      'allowed_output_classes', to_jsonb(_uc.allowed_output_classes),
      'prohibited_output_classes', to_jsonb(_uc.prohibited_output_classes),
      'prompt_template_code', _uc.prompt_template_code,
      'prompt_template_version', _uc.prompt_template_version,
      'model_policy', _uc.model_policy,
      'confidence_policy', _uc.confidence_policy,
      'limitation_policy', _uc.limitation_policy
    ),
    'snapshot', _snap,
    'input_fingerprint', public.conduct_360_fingerprint(_snap),
    'permitted_source_references', _refs,
    'window', _snap -> 'window',
    'provenance', jsonb_build_object(
      'source', 'conduct_360_snapshot',
      'content_class', 'fact',
      'ai_content', false,
      'prepared_at', now()
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.conduct_360_ai_context(uuid, text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_360_ai_context(uuid, text, date, date) TO authenticated, service_role;

-- =========================================================================
-- 7. Governed recording of a generated advisory item (no model call here)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.conduct_ai_insight_record(
  _entity_id uuid,
  _use_case_code text,
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
  _title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uc public.conduct_ai_use_cases;
  _lic record;
  _insight_id uuid;
  _id uuid;
BEGIN
  SELECT * INTO _uc FROM public.conduct_ai_use_cases WHERE code = _use_case_code;
  IF _uc.code IS NULL THEN
    RAISE EXCEPTION 'unknown_use_case: %', _use_case_code USING ERRCODE = '22023';
  END IF;
  IF NOT _uc.is_enabled THEN
    RAISE EXCEPTION 'use_case_disabled: %', _use_case_code USING ERRCODE = '42501';
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
  IF _provider IS NOT NULL
     AND _uc.model_policy ? 'allowed_providers'
     AND NOT (_uc.model_policy -> 'allowed_providers' ? _provider) THEN
    RAISE EXCEPTION 'provider_not_permitted: %', _provider USING ERRCODE = '42501';
  END IF;
  IF _model IS NOT NULL
     AND _uc.model_policy ? 'allowed_models'
     AND NOT (_uc.model_policy -> 'allowed_models' ? _model) THEN
    RAISE EXCEPTION 'model_not_permitted: %', _model USING ERRCODE = '42501';
  END IF;

  SELECT l.id, l.name, l.lead_regulator_id, l.sector_id INTO _lic
    FROM public.licensees l WHERE l.id = _entity_id;
  IF _lic.id IS NULL THEN
    RAISE EXCEPTION 'entity_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.ai_insights (
    title, module, entity_id, insight_kind, analysis_type, scope, scope_id,
    period_key, source_records, citations, provider, model, provider_state,
    confidence, input_fingerprint, payload, review_status, generated_at,
    generated_by, regulator_id, source_modules
  ) VALUES (
    COALESCE(_title, _uc.label || ' — ' || _lic.name),
    'market_conduct', _entity_id, 'conduct_360', _use_case_code, 'entity', _entity_id,
    _window_start::text || '..' || _window_end::text,
    COALESCE(_source_references, '[]'::jsonb), COALESCE(_source_references, '[]'::jsonb),
    _provider, _model, CASE WHEN _provider IS NULL THEN 'NOT_CONFIGURED' ELSE 'SUCCESS' END,
    _confidence, _snapshot_fingerprint, _ai_output, 'pending', now(),
    _generated_by, _lic.lead_regulator_id, ARRAY['market_conduct']
  ) RETURNING id INTO _insight_id;

  INSERT INTO public.conduct_ai_insights (
    insight_id, use_case_code, entity_id, regulator_id, sector_id,
    window_start, window_end, snapshot_fingerprint, source_references,
    provider, model, model_version, prompt_template_code, prompt_template_version,
    generated_by, ai_output, confidence, uncertainty, limitations
  ) VALUES (
    _insight_id, _uc.code, _entity_id, _lic.lead_regulator_id, _lic.sector_id,
    _window_start, _window_end, _snapshot_fingerprint, COALESCE(_source_references, '[]'::jsonb),
    _provider, _model, _model_version, _uc.prompt_template_code,
    COALESCE(_prompt_template_version, _uc.prompt_template_version),
    _generated_by, _ai_output, _confidence, _uncertainty, COALESCE(_limitations, '{}'::text[])
  ) RETURNING id INTO _id;

  RETURN _id;
END;
$function$;

REVOKE ALL ON FUNCTION public.conduct_ai_insight_record(uuid, text, date, date, text, jsonb, jsonb, text, text, text, text, numeric, text, text[], uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conduct_ai_insight_record(uuid, text, date, date, text, jsonb, jsonb, text, text, text, text, numeric, text, text[], uuid, text) TO service_role;

-- =========================================================================
-- 8. Governed human review operations
-- =========================================================================
CREATE OR REPLACE FUNCTION public.conduct_ai_insight_review(
  _insight_id uuid,
  _action text,
  _rationale text DEFAULT NULL,
  _human_output jsonb DEFAULT NULL,
  _superseded_by_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid;
  _row public.conduct_ai_insights;
  _from text;
  _to text;
BEGIN
  IF _action NOT IN ('accept','modify','reject','supersede') THEN
    RAISE EXCEPTION 'unsupported_review_action: %', _action USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _row FROM public.conduct_ai_insights WHERE id = _insight_id;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'insight_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- authority + regulator/ROS scope: the caller must be able to read the entity's facts,
  -- and reviewing requires a decision-capable market-conduct permission.
  _uid := public.conduct_pattern_require(ARRAY['manage_complaints','run_conduct_analytics','approve']);
  PERFORM public.conduct_360_snapshot(_row.entity_id, _row.window_start, _row.window_end);

  _from := _row.review_state;
  IF _from = 'SUPERSEDED' THEN
    RAISE EXCEPTION 'insight_superseded: no further review is permitted' USING ERRCODE = '22023';
  END IF;

  IF _action IN ('modify','reject') AND COALESCE(btrim(_rationale), '') = '' THEN
    RAISE EXCEPTION 'rationale_required: % requires a written rationale', _action USING ERRCODE = '22023';
  END IF;
  IF _action = 'modify' AND (_human_output IS NULL OR _human_output = '{}'::jsonb) THEN
    RAISE EXCEPTION 'human_output_required: modify requires the supervisor''s revised text'
      USING ERRCODE = '22023';
  END IF;

  _to := CASE _action
           WHEN 'accept' THEN 'ACCEPTED'
           WHEN 'modify' THEN 'MODIFIED'
           WHEN 'reject' THEN 'REJECTED'
           WHEN 'supersede' THEN 'SUPERSEDED'
         END;

  UPDATE public.conduct_ai_insights
     SET review_state     = _to,
         human_output     = CASE WHEN _action = 'modify' THEN _human_output ELSE human_output END,
         human_rationale  = COALESCE(NULLIF(btrim(_rationale), ''), human_rationale),
         reviewed_by      = _uid,
         reviewed_at      = now(),
         superseded_by_id = CASE WHEN _action = 'supersede' THEN _superseded_by_id ELSE superseded_by_id END
   WHERE id = _insight_id;

  INSERT INTO public.conduct_ai_review_events
    (conduct_ai_insight_id, action, rationale, from_state, to_state, human_output, actor_id)
  VALUES (_insight_id, _action, NULLIF(btrim(_rationale), ''), _from, _to,
          CASE WHEN _action = 'modify' THEN _human_output ELSE NULL END, _uid);

  RETURN jsonb_build_object(
    'insight_id', _insight_id,
    'action', _action,
    'from_state', _from,
    'review_state', _to,
    'reviewed_at', now(),
    'ai_output_preserved', true,
    'supervisory_objects_changed', 0
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.conduct_ai_insight_review(uuid, text, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_ai_insight_review(uuid, text, text, jsonb, uuid) TO authenticated, service_role;

-- =========================================================================
-- 9. Derived staleness re-check (facts changed under the advisory item)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.conduct_ai_insight_refresh_staleness(_insight_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.conduct_ai_insights;
  _fp text;
  _state text;
BEGIN
  SELECT * INTO _row FROM public.conduct_ai_insights WHERE id = _insight_id;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'insight_not_found' USING ERRCODE = 'P0002';
  END IF;

  _fp := public.conduct_360_fingerprint(
           public.conduct_360_snapshot(_row.entity_id, _row.window_start, _row.window_end));
  _state := CASE WHEN _fp = _row.snapshot_fingerprint THEN 'CURRENT' ELSE 'STALE' END;

  UPDATE public.conduct_ai_insights
     SET staleness_state = _state, staleness_checked_at = now()
   WHERE id = _insight_id;

  RETURN jsonb_build_object(
    'insight_id', _insight_id,
    'staleness_state', _state,
    'recorded_fingerprint', _row.snapshot_fingerprint,
    'current_fingerprint', _fp,
    'checked_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.conduct_ai_insight_refresh_staleness(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_ai_insight_refresh_staleness(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.conduct_ai_use_cases IS
  'MC-07.2 approved Conduct 360 AI use cases. Advisory only: source locked to conduct_360_snapshot, human review and citations mandatory, workflow mutation permanently forbidden.';
COMMENT ON TABLE public.conduct_ai_insights IS
  'MC-07.2 Conduct 360 AI advisory records with full provenance. Original AI output is immutable; human edits are stored separately. No mutation_spec / action executor exists in this layer.';
COMMENT ON TABLE public.conduct_ai_review_events IS
  'MC-07.2 append-only human review history for Conduct 360 AI advisory records.';
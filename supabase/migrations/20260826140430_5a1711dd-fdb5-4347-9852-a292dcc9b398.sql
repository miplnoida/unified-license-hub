-- =====================================================================
-- MC-08 (part 4) — register the existing Conduct 360 AI capabilities,
-- their models and their instruction versions, plus governance reads.
-- =====================================================================

-- 1. Models actually used by MC-07.4, registered and approved.
INSERT INTO public.ai_governance_models
  (provider, model_key, technical_identifier, model_version, display_name, regulatory_purpose,
   known_limitations, data_handling_class, external_data_capable, lifecycle_state,
   approved_at, effective_from)
VALUES
 ('lovable_ai_gateway','gemini-2.5-flash','google/gemini-2.5-flash','google/gemini-2.5-flash',
  'Platform AI service — Gemini 2.5 Flash',
  'Narrative advisory drafting over Conduct 360 recorded regulatory facts.',
  'Generative model. May omit material context, may phrase uncertainty imprecisely, and must never be relied on as a regulatory conclusion. Output requires supervisory review.',
  'INTERNAL_REGULATORY_FACTS', false, 'ACTIVE', now(), now()),
 ('lovable_ai_gateway','gemini-2.5-pro','google/gemini-2.5-pro','google/gemini-2.5-pro',
  'Platform AI service — Gemini 2.5 Pro',
  'Hypothesis-style advisory drafting over Conduct 360 recorded regulatory facts where deeper reasoning is required.',
  'Generative model. Hypotheses are untested propositions, never findings. Output requires supervisory review.',
  'INTERNAL_REGULATORY_FACTS', false, 'ACTIVE', now(), now())
ON CONFLICT (provider, technical_identifier, model_version_key) DO NOTHING;

-- 2. Instruction versions for the five governed advisory capabilities.
--    `instruction_body` holds the governed common instruction clauses; the
--    per-capability task text for this version is held in server code and is
--    never accepted from a client.
INSERT INTO public.ai_governance_instructions
  (template_code, version, title, purpose, use_case_code, instruction_body, allowed_fact_scope,
   prohibited_behaviours, required_caveats, lifecycle_state, released_at, effective_from)
SELECT uc.prompt_template_code, uc.prompt_template_version,
       uc.label || ' — governed instruction',
       'Server-controlled instruction governing ' || uc.label || ' advisory drafting.',
       uc.code,
       'You are an advisory drafting assistant for a financial services regulator''s market-conduct '
       || 'supervision team. You are NOT a decision maker.' || E'\n\n'
       || 'ABSOLUTE RULES' || E'\n'
       || '1. Your ONLY permitted information source is the Conduct 360 context supplied in this request. '
       || 'You have no database access, no tools, and no web access. If the context does not contain '
       || 'something, you do not know it.' || E'\n'
       || '2. You must NEVER decide, rate, grade, confirm, dismiss, escalate, instruct or conclude. You do '
       || 'not set risk ratings, validate or dismiss signals, confirm patterns, raise alerts, open '
       || 'investigations, create findings, take enforcement action, alter complaint outcomes, or change '
       || 'any status. You only describe, suggest and ask.' || E'\n'
       || '3. Every material statement you make must cite at least one reference from '
       || '"permitted_source_references". Cite references EXACTLY as written there. Never invent, reformat, '
       || 'guess or extrapolate a reference. If you cannot cite a supplied reference for a statement, do '
       || 'not make the statement.' || E'\n'
       || '4. Use plain professional supervisory English. No legal conclusions, no allegations of '
       || 'wrongdoing, no statements about individuals.' || E'\n'
       || '5. State your confidence between 0 and 1, what you are uncertain about, and the limitations of '
       || 'your advice. Be candid when the data is thin.' || E'\n'
       || '6. Where the context is empty or immaterial, say so plainly with low confidence rather than '
       || 'manufacturing content.',
       'conduct_360_snapshot',
       ARRAY['regulatory_decision','risk_rating','status_change','enforcement','legal_conclusion',
             'evidence_alteration','external_data_retrieval','statements_about_individuals'],
       ARRAY[uc.limitation_policy],
       'ACTIVE', now(), now()
  FROM public.conduct_ai_use_cases uc
ON CONFLICT (template_code, version) DO NOTHING;

-- 3. Bring the five existing capabilities under institutional governance.
UPDATE public.conduct_ai_use_cases uc
   SET lifecycle_state = 'ACTIVE',
       owning_module = 'market_conduct',
       advisory_classification = CASE uc.code
         WHEN 'SUPERVISORY_SUMMARY' THEN 'ADVISORY_NARRATIVE'
         WHEN 'MATERIAL_CHANGE_EXPLANATION' THEN 'ADVISORY_EXPLANATION'
         WHEN 'RECORDS_TO_REVIEW' THEN 'ADVISORY_SUGGESTION'
         WHEN 'SUPERVISORY_QUESTIONS' THEN 'ADVISORY_QUESTION'
         WHEN 'RISK_HYPOTHESIS' THEN 'ADVISORY_HYPOTHESIS'
         ELSE 'ADVISORY_NARRATIVE' END,
       risk_classification = CASE uc.code WHEN 'RISK_HYPOTHESIS' THEN 'HIGH' ELSE 'MEDIUM' END,
       required_permission_actions = ARRAY['view'],
       approved_roles = ARRAY['supervisor','senior_supervisor','analyst','admin','super_admin'],
       governance_owner = 'Market Conduct Supervision',
       effective_from = COALESCE(uc.effective_from, now()),
       approved_at = COALESCE(uc.approved_at, now()),
       approved_model_id = (
         SELECT m.id FROM public.ai_governance_models m
          WHERE m.technical_identifier = (uc.model_policy->'allowed_models'->>0)
          LIMIT 1),
       approved_instruction_id = (
         SELECT i.id FROM public.ai_governance_instructions i
          WHERE i.template_code = uc.prompt_template_code AND i.version = uc.prompt_template_version
          LIMIT 1),
       updated_at = now()
 WHERE uc.code IN ('SUPERVISORY_SUMMARY','MATERIAL_CHANGE_EXPLANATION','RECORDS_TO_REVIEW',
                   'SUPERVISORY_QUESTIONS','RISK_HYPOTHESIS');

INSERT INTO public.ai_governance_events (object_type, object_code, event_type, from_state, to_state, rationale, metadata)
SELECT 'USE_CASE', code, 'REGISTERED_UNDER_GOVERNANCE', NULL, 'ACTIVE',
       'MC-08 baseline: existing Conduct 360 advisory capability brought under the institutional AI use-case register.',
       jsonb_build_object('model_id', approved_model_id, 'instruction_id', approved_instruction_id)
  FROM public.conduct_ai_use_cases
 WHERE NOT EXISTS (
   SELECT 1 FROM public.ai_governance_events e
    WHERE e.object_type = 'USE_CASE' AND e.object_code = conduct_ai_use_cases.code
      AND e.event_type = 'REGISTERED_UNDER_GOVERNANCE');

-- 4. Canonical activity register view: recorded AI evidence joined to its
--    governed execution attempt, plus refusals/failures that never produced one.
CREATE OR REPLACE VIEW public.ai_governance_activity_v
WITH (security_invoker = true) AS
SELECT
  i.id                                AS activity_id,
  'INSIGHT'::text                     AS activity_kind,
  i.generated_at                       AS occurred_at,
  COALESCE(uc.owning_module, 'market_conduct') AS owning_module,
  i.use_case_code,
  uc.label                             AS use_case_label,
  uc.advisory_classification,
  uc.lifecycle_state::text             AS use_case_lifecycle,
  i.entity_id,
  i.regulator_id,
  i.sector_id,
  i.generated_by                       AS requested_by,
  a.requested_role,
  'SUCCESS'::text                      AS outcome,
  NULL::text                           AS reason_code,
  i.provider, i.model, i.model_version,
  i.prompt_template_code, i.prompt_template_version,
  i.snapshot_fingerprint, i.window_start, i.window_end,
  i.confidence, i.uncertainty, i.limitations,
  i.staleness_state, i.staleness_checked_at,
  i.review_state, i.reviewed_by, i.reviewed_at, i.human_rationale,
  (i.human_output IS NOT NULL)         AS has_human_wording,
  jsonb_array_length(COALESCE(i.source_references, '[]'::jsonb)) AS citation_count,
  a.latency_ms,
  i.id                                 AS conduct_ai_insight_id
FROM public.conduct_ai_insights i
LEFT JOIN public.conduct_ai_use_cases uc ON uc.code = i.use_case_code
LEFT JOIN LATERAL (
  SELECT t.requested_role, t.latency_ms
    FROM public.ai_governance_activity_attempts t
   WHERE t.conduct_ai_insight_id = i.id
   ORDER BY t.created_at DESC LIMIT 1
) a ON true
UNION ALL
SELECT
  t.id, 'ATTEMPT'::text, t.requested_at,
  t.owning_module, t.use_case_code, uc.label, uc.advisory_classification,
  uc.lifecycle_state::text, t.entity_id, NULL::uuid, NULL::uuid,
  t.requested_by, t.requested_role, t.outcome, t.reason_code,
  t.provider, t.model, t.model_version,
  t.instruction_template_code, t.instruction_version,
  t.snapshot_fingerprint, t.window_start, t.window_end,
  NULL::numeric, NULL::text, '{}'::text[],
  NULL::text, NULL::timestamptz,
  'NOT_APPLICABLE'::text, NULL::uuid, NULL::timestamptz, NULL::text,
  false, 0, t.latency_ms, NULL::uuid
FROM public.ai_governance_activity_attempts t
LEFT JOIN public.conduct_ai_use_cases uc ON uc.code = t.use_case_code
WHERE t.conduct_ai_insight_id IS NULL;

GRANT SELECT ON public.ai_governance_activity_v TO authenticated, service_role;

-- 5. Governance overview metrics — server-derived, drillable.
CREATE OR REPLACE FUNCTION public.ai_governance_overview(
  _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL,
  _use_case_code text DEFAULT NULL, _module text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _th public.ai_governance_thresholds; _res jsonb;
BEGIN
  _uid := public.ai_gov_require(ARRAY['view']);
  SELECT * INTO _th FROM public.ai_governance_thresholds WHERE id;

  WITH scoped AS (
    SELECT * FROM public.ai_governance_activity_v
     WHERE (_from IS NULL OR occurred_at >= _from)
       AND (_to IS NULL OR occurred_at <= _to)
       AND (_use_case_code IS NULL OR use_case_code = _use_case_code)
       AND (_module IS NULL OR owning_module = _module)
  )
  SELECT jsonb_build_object(
    'prepared',            count(*) FILTER (WHERE activity_kind = 'INSIGHT'),
    'awaiting_review',     count(*) FILTER (WHERE activity_kind = 'INSIGHT' AND review_state = 'NOT_REVIEWED'),
    'accepted',            count(*) FILTER (WHERE review_state = 'ACCEPTED'),
    'modified',            count(*) FILTER (WHERE review_state = 'MODIFIED'),
    'rejected',            count(*) FILTER (WHERE review_state = 'REJECTED'),
    'superseded',          count(*) FILTER (WHERE review_state = 'SUPERSEDED'),
    'stale',               count(*) FILTER (WHERE staleness_state = 'STALE'),
    'low_confidence',      count(*) FILTER (WHERE confidence IS NOT NULL AND confidence < _th.low_confidence_below),
    'no_citations',        count(*) FILTER (WHERE activity_kind = 'INSIGHT' AND citation_count = 0),
    'failures',            count(*) FILTER (WHERE outcome IN ('FAILURE','PROVIDER_ERROR')),
    'refusals',            count(*) FILTER (WHERE outcome = 'REFUSAL'),
    'scope_refusals',      count(*) FILTER (WHERE outcome = 'SCOPE_REFUSAL'),
    'governance_refusals', count(*) FILTER (WHERE outcome = 'GOVERNANCE_REFUSAL'),
    'attempts_total',      count(*)
  ) INTO _res FROM scoped;

  RETURN _res || jsonb_build_object(
    'suspended_use_cases', (SELECT count(*) FROM public.conduct_ai_use_cases WHERE lifecycle_state = 'SUSPENDED'),
    'suspended_models',    (SELECT count(*) FROM public.ai_governance_models WHERE lifecycle_state = 'SUSPENDED'),
    'suspended_instructions', (SELECT count(*) FROM public.ai_governance_instructions WHERE lifecycle_state = 'SUSPENDED'),
    'active_use_cases',    (SELECT count(*) FROM public.conduct_ai_use_cases WHERE lifecycle_state = 'ACTIVE'),
    'open_assurance',      (SELECT count(*) FROM public.ai_assurance_reviews WHERE status <> 'CLOSED'),
    'assurance_control_failures', (SELECT count(*) FROM public.ai_assurance_reviews WHERE conclusion = 'CONTROL_FAILURE'),
    'open_remediation',    (SELECT count(*) FROM public.ai_assurance_reviews WHERE remediation_status IN ('OPEN','IN_PROGRESS')),
    'thresholds',          to_jsonb(_th),
    'governance_caveat',   'Human-review statistics are AI governance and quality indicators and must not be interpreted as automated employee-performance measures.'
  );
END $$;
REVOKE ALL ON FUNCTION public.ai_governance_overview(timestamptz,timestamptz,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_governance_overview(timestamptz,timestamptz,text,text) TO authenticated, service_role;

-- 6. Exception queue — server-derived governance signals.
CREATE OR REPLACE FUNCTION public.ai_governance_exceptions(_limit integer DEFAULT 200)
RETURNS TABLE (
  exception_code text, severity text, activity_id uuid, activity_kind text, occurred_at timestamptz,
  use_case_code text, entity_id uuid, detail text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _th public.ai_governance_thresholds;
BEGIN
  PERFORM public.ai_gov_require(ARRAY['view']);
  SELECT * INTO _th FROM public.ai_governance_thresholds WHERE id;

  RETURN QUERY
  WITH base AS (SELECT * FROM public.ai_governance_activity_v),
  ex AS (
    SELECT 'UNREVIEWED_OVERDUE', 'high', b.activity_id, b.activity_kind, b.occurred_at, b.use_case_code, b.entity_id,
           'Awaiting human review for ' || round(extract(epoch FROM (now() - b.occurred_at))/3600)::text
           || ' hours (threshold ' || _th.unreviewed_hours || ' hours).'
      FROM base b
     WHERE b.activity_kind = 'INSIGHT' AND b.review_state = 'NOT_REVIEWED'
       AND b.occurred_at < now() - make_interval(hours => _th.unreviewed_hours)
    UNION ALL
    SELECT 'STALE_FACTS', 'medium', b.activity_id, b.activity_kind, b.occurred_at, b.use_case_code, b.entity_id,
           'Underlying regulatory facts have changed since this assistance was prepared.'
      FROM base b WHERE b.staleness_state = 'STALE'
    UNION ALL
    SELECT 'LOW_CONFIDENCE', 'low', b.activity_id, b.activity_kind, b.occurred_at, b.use_case_code, b.entity_id,
           'Stated confidence ' || to_char(b.confidence, 'FM0.00') || ' is below the governance threshold '
           || to_char(_th.low_confidence_below, 'FM0.00') || '.'
      FROM base b WHERE b.confidence IS NOT NULL AND b.confidence < _th.low_confidence_below
    UNION ALL
    SELECT 'NO_CITATION', 'high', b.activity_id, b.activity_kind, b.occurred_at, b.use_case_code, b.entity_id,
           'No supporting source reference was recorded for this assistance.'
      FROM base b WHERE b.activity_kind = 'INSIGHT' AND b.citation_count = 0
    UNION ALL
    SELECT CASE b.outcome
             WHEN 'GOVERNANCE_REFUSAL' THEN 'GOVERNANCE_REFUSAL'
             WHEN 'SCOPE_REFUSAL' THEN 'SCOPE_REFUSAL'
             WHEN 'REFUSAL' THEN 'MODEL_REFUSAL'
             ELSE 'GENERATION_FAILURE' END,
           CASE WHEN b.outcome = 'GOVERNANCE_REFUSAL' THEN 'medium' ELSE 'high' END,
           b.activity_id, b.activity_kind, b.occurred_at, b.use_case_code, b.entity_id,
           COALESCE(b.reason_code, b.outcome)
      FROM base b
     WHERE b.activity_kind = 'ATTEMPT'
       AND b.outcome IN ('FAILURE','PROVIDER_ERROR','REFUSAL','SCOPE_REFUSAL','GOVERNANCE_REFUSAL')
  )
  SELECT * FROM ex ORDER BY 5 DESC LIMIT GREATEST(1, COALESCE(_limit, 200));
END $$;
REVOKE ALL ON FUNCTION public.ai_governance_exceptions(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_governance_exceptions(integer) TO authenticated, service_role;

-- 7. Version impact analysis — evidence only, never a verdict.
CREATE OR REPLACE FUNCTION public.ai_governance_version_impact(_dimension text DEFAULT 'MODEL')
RETURNS TABLE (
  cohort text, volume bigint, accepted bigint, modified bigint, rejected bigint, superseded bigint,
  not_reviewed bigint, stale bigint, low_confidence bigint, no_citation bigint,
  avg_confidence numeric, avg_review_hours numeric, sufficient_volume boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _th public.ai_governance_thresholds;
BEGIN
  PERFORM public.ai_gov_require(ARRAY['view']);
  SELECT * INTO _th FROM public.ai_governance_thresholds WHERE id;
  IF _dimension NOT IN ('MODEL','INSTRUCTION','USE_CASE') THEN
    RAISE EXCEPTION 'unsupported_dimension: %', _dimension USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    CASE _dimension
      WHEN 'MODEL' THEN COALESCE(b.model_version, b.model, 'not recorded')
      WHEN 'INSTRUCTION' THEN COALESCE(b.prompt_template_code || ' ' || b.prompt_template_version, 'not recorded')
      ELSE COALESCE(b.use_case_code, 'not recorded') END,
    count(*),
    count(*) FILTER (WHERE b.review_state = 'ACCEPTED'),
    count(*) FILTER (WHERE b.review_state = 'MODIFIED'),
    count(*) FILTER (WHERE b.review_state = 'REJECTED'),
    count(*) FILTER (WHERE b.review_state = 'SUPERSEDED'),
    count(*) FILTER (WHERE b.review_state = 'NOT_REVIEWED'),
    count(*) FILTER (WHERE b.staleness_state = 'STALE'),
    count(*) FILTER (WHERE b.confidence IS NOT NULL AND b.confidence < _th.low_confidence_below),
    count(*) FILTER (WHERE b.citation_count = 0),
    round(avg(b.confidence), 3),
    round(avg(extract(epoch FROM (b.reviewed_at - b.occurred_at)) / 3600.0)::numeric, 2),
    count(*) >= _th.min_volume_for_analysis
  FROM public.ai_governance_activity_v b
 WHERE b.activity_kind = 'INSIGHT'
 GROUP BY 1
 ORDER BY 2 DESC;
END $$;
REVOKE ALL ON FUNCTION public.ai_governance_version_impact(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_governance_version_impact(text) TO authenticated, service_role;
-- MC-09 CERTIFICATION — cross-entity supervisory intelligence, emerging risk
-- assessment layer and the governed AI advisory boundary for cross-entity subjects.
BEGIN;
SELECT plan(20);

-- 1 deterministic fact operations exist
SELECT ok(
  (SELECT bool_and(EXISTS (SELECT 1 FROM pg_proc p
                            WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f))
     FROM unnest(ARRAY['conduct_cross_entity_snapshot','conduct_intel_theme_snapshot',
                       'conduct_cross_entity_compare','conduct_intel_ai_context',
                       'conduct_intel_ai_insight_record','conduct_intel_ai_refresh_staleness',
                       'conduct_emerging_risk_assess','conduct_emerging_risk_followup']) AS f),
  'every MC-09 governed operation exists');

-- 2 the assessment history is a browser-read-only, append-only register
SELECT ok(
  has_table_privilege('authenticated','public.conduct_emerging_risk_assessments','SELECT')
  AND NOT has_table_privilege('authenticated','public.conduct_emerging_risk_assessments','INSERT')
  AND NOT has_table_privilege('authenticated','public.conduct_emerging_risk_assessments','UPDATE')
  AND NOT has_table_privilege('authenticated','public.conduct_emerging_risk_assessments','DELETE')
  AND NOT has_table_privilege('anon','public.conduct_emerging_risk_assessments','SELECT')
  AND (SELECT relrowsecurity FROM pg_class
        WHERE relnamespace = 'public'::regnamespace AND relname = 'conduct_emerging_risk_assessments'),
  'supervisory assessments are read-only from a browser and protected by row level security');

-- 3 recording AI advisory content is a server-only operation
SELECT ok(
  NOT has_function_privilege('authenticated',
    'public.conduct_intel_ai_insight_record(text,text,text,uuid,uuid,uuid,date,date,text,jsonb,jsonb,text,text,text,text,numeric,text,text[],uuid,text,jsonb)','EXECUTE')
  AND NOT has_function_privilege('anon',
    'public.conduct_intel_ai_insight_record(text,text,text,uuid,uuid,uuid,date,date,text,jsonb,jsonb,text,text,text,text,numeric,text,text[],uuid,text,jsonb)','EXECUTE')
  AND NOT has_function_privilege('anon','public.conduct_intel_ai_context(text,text,text,uuid,uuid,integer,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.conduct_intel_theme_snapshot(text,uuid,integer,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.conduct_emerging_risk_assess(uuid,jsonb)','EXECUTE'),
  'no browser or anonymous caller can write AI advisory content');

-- 4 MC-09 capabilities are registered under the MC-08 control plane
SELECT ok(
  (SELECT count(*) FROM public.conduct_ai_use_cases
    WHERE allowed_source = 'conduct_intelligence_snapshot'
      AND lifecycle_state = 'ACTIVE'
      AND human_review_required
      AND citations_required
      AND NOT workflow_mutation_allowed
      AND approved_model_id IS NOT NULL
      AND approved_instruction_id IS NOT NULL) = 5,
  'the five cross-entity AI capabilities are approved, governed and advisory only');

-- 5 every MC-09 routine is SECURITY DEFINER with a pinned search_path
SELECT ok(
  (SELECT bool_and(p.prosecdef AND EXISTS (
             SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c
              WHERE c LIKE 'search_path=%'))
     FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND (p.proname LIKE 'conduct_intel_%' OR p.proname LIKE 'conduct_cross_entity_%'
           OR p.proname LIKE 'conduct_emerging_risk_%')
      AND p.prokind = 'f'),
  'MC-09 routines are SECURITY DEFINER and pin their search path');

CREATE TEMP TABLE mc09c (name text primary key, pass boolean, detail text);

DO $$
DECLARE
  _super uuid; _auditor uuid; _sector uuid; _lic uuid; _complaint uuid;
  _theme text; _risk uuid; _res jsonb; _ctx jsonb; _ctx2 jsonb; _cmp jsonb;
  _insight uuid; _gate jsonb; _v integer;
BEGIN
  SELECT id INTO _super   FROM public.profiles WHERE email = 'super_admin@mishainfotech.com';
  SELECT id INTO _auditor FROM public.profiles WHERE email = 'auditor@mishainfotech.com';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_super,'role','authenticated')::text, true);

  SELECT l.sector_id, c.licensee_id, c.id, COALESCE(t.name,'Unclassified')
    INTO _sector, _lic, _complaint, _theme
    FROM public.complaints c
    JOIN public.licensees l ON l.id = c.licensee_id
    LEFT JOIN public.complaint_types t ON t.id = c.complaint_type_id
   WHERE l.sector_id IS NOT NULL
   ORDER BY c.created_at DESC LIMIT 1;

  -- A. theme facts are deterministic, dated and explain their own method
  _ctx  := public.conduct_intel_theme_snapshot(_theme, _sector, 365, NULL);
  _ctx2 := public.conduct_intel_theme_snapshot(_theme, _sector, 365, NULL);
  INSERT INTO mc09c VALUES ('theme_facts_deterministic',
    (_ctx - 'generated_at') = (_ctx2 - 'generated_at')
    AND _ctx ? 'movement' AND _ctx ? 'entities' AND _ctx ? 'complaints'
    AND (_ctx->'provenance'->>'ai_content') = 'false'
    AND (_ctx->>'method') LIKE 'Deterministic%',
    (_ctx->'totals')::text);

  -- B. movement is stated against the preceding window with a method note
  INSERT INTO mc09c VALUES ('movement_explained',
    (_ctx->'movement') ? 'complaints_previous'
    AND (_ctx->'movement') ? 'direction'
    AND (_ctx->'movement'->>'method') LIKE '%preceding window%',
    (_ctx->'movement')::text);

  -- C. comparison is positional, never a rating
  _cmp := public.conduct_cross_entity_compare(_sector, 365, NULL);
  INSERT INTO mc09c VALUES ('comparison_positional',
    _cmp ? 'sector_measures' AND _cmp ? 'entities'
    AND (_cmp->>'method') LIKE '%not a rating%',
    (_cmp->'sector_measures')::text);

  -- D. an out-of-range window is refused
  BEGIN
    PERFORM public.conduct_intel_theme_snapshot(_theme, _sector, 5000, NULL);
    INSERT INTO mc09c VALUES ('window_bounded', false, 'an out-of-range window was accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc09c VALUES ('window_bounded', SQLERRM LIKE 'unsupported_window%', SQLERRM);
  END;

  -- E. an emerging risk for the assessment/AI journey
  _res := public.conduct_emerging_risk_create(jsonb_build_object(
    'title','Certification theme concentration',
    'summary','Recorded for MC-09 certification of the assessment and advisory layers.',
    'sector_id',_sector,
    'driver_metrics', jsonb_build_object('theme',_theme),
    'window_start',(current_date - 365),'window_end',current_date,
    'basis','Recorded from the deterministic cross-entity comparison for certification.'));
  _risk := (_res->>'id')::uuid;
  PERFORM public.conduct_emerging_risk_link_record(_risk, 'complaint', _complaint, NULL,
    'contributing complaint for certification');

  -- F. a supervisory assessment requires a written judgement
  BEGIN
    PERFORM public.conduct_emerging_risk_assess(_risk, jsonb_build_object('judgement','too short'));
    INSERT INTO mc09c VALUES ('judgement_required', false, 'an assessment was accepted without a judgement');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc09c VALUES ('judgement_required', SQLERRM LIKE 'A supervisory judgement%', SQLERRM);
  END;

  -- G. assessments are versioned and update the risk header
  PERFORM public.conduct_emerging_risk_assess(_risk, jsonb_build_object(
    'severity','high','systemic_potential','moderate','confidence','probable',
    'judgement','The recorded complaint volume for this theme sits above the sector upper quartile at more than one entity.',
    'actions_considered','Entity engagement and a possible thematic review.',
    'next_review_date',(current_date + 30)));
  PERFORM public.conduct_emerging_risk_assess(_risk, jsonb_build_object(
    'judgement','Second review recorded after further complaints were linked to the same theme.'));
  SELECT max(version) INTO _v FROM public.conduct_emerging_risk_assessments WHERE risk_id = _risk;
  INSERT INTO mc09c VALUES ('assessment_versioned',
    _v = 2
    AND (SELECT severity FROM public.conduct_emerging_risks WHERE id = _risk) = 'high'
    AND (SELECT systemic_potential FROM public.conduct_emerging_risks WHERE id = _risk) = 'moderate'
    AND (SELECT count(*) FROM public.conduct_emerging_risk_events
          WHERE risk_id = _risk AND event_type = 'ASSESSMENT_RECORDED') = 2,
    'versions: ' || COALESCE(_v::text,'none'));

  -- H. assessment history cannot be rewritten
  BEGIN
    UPDATE public.conduct_emerging_risk_assessments SET judgement = 'rewritten' WHERE risk_id = _risk;
    INSERT INTO mc09c VALUES ('assessment_append_only', false, 'assessment history was rewritten');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc09c VALUES ('assessment_append_only', SQLERRM LIKE '%append-only%', SQLERRM);
  END;

  -- I. follow-up action is recorded in the risk history with a note
  BEGIN
    PERFORM public.conduct_emerging_risk_followup(_risk, 'signal_raised', 'SIG-TEST', 'short');
    INSERT INTO mc09c VALUES ('followup_note_required', false, 'a follow-up was accepted without a note');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc09c VALUES ('followup_note_required', SQLERRM LIKE 'A follow-up note%', SQLERRM);
  END;
  PERFORM public.conduct_emerging_risk_followup(_risk, 'entity_engagement', NULL,
    'Supervisory engagement scheduled with the entities in scope of this theme.');
  INSERT INTO mc09c VALUES ('followup_recorded',
    (SELECT count(*) FROM public.conduct_emerging_risk_events
      WHERE risk_id = _risk AND event_type = 'FOLLOW_UP_RECORDED') = 1,
    'follow-up events recorded');

  -- J. AI context is fact-only, fingerprinted and cites only permitted references
  _ctx := public.conduct_intel_ai_context('EMERGING_RISK_NARRATIVE','emerging_risk',NULL,_risk,NULL,365,NULL);
  INSERT INTO mc09c VALUES ('ai_context_grounded',
    (_ctx->'provenance'->>'ai_content') = 'false'
    AND COALESCE(_ctx->>'input_fingerprint','') <> ''
    AND jsonb_array_length(_ctx->'permitted_source_references') >= 1
    AND (_ctx->'use_case'->>'human_review_required') = 'true'
    AND (_ctx->'use_case'->>'workflow_mutation_allowed') = 'false'
    AND _ctx->'snapshot' ? 'emerging_risk',
    'references: ' || jsonb_array_length(_ctx->'permitted_source_references')::text);

  -- K. a capability that is not permitted to read cross-entity facts is refused
  BEGIN
    PERFORM public.conduct_intel_ai_context('SUPERVISORY_SUMMARY','emerging_risk',NULL,_risk,NULL,365,NULL);
    INSERT INTO mc09c VALUES ('fact_scope_enforced', false, 'an entity-scoped capability read cross-entity facts');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc09c VALUES ('fact_scope_enforced', SQLERRM LIKE 'fact_source_not_permitted%', SQLERRM);
  END;

  -- L. recording, freshness and human review of a cross-entity advisory item
  _insight := public.conduct_intel_ai_insight_record(
    'EMERGING_RISK_NARRATIVE','emerging_risk',NULL,_risk,_sector,NULL,
    (current_date - 365), current_date, _ctx->>'input_fingerprint',
    jsonb_build_object('summary','Certification advisory text.','citations', _ctx->'permitted_source_references'),
    _ctx->'permitted_source_references',
    'lovable_ai_gateway','google/gemini-2.5-flash','google/gemini-2.5-flash',
    'v1', 0.6, 'Thin population', ARRAY['Advisory only'], _super, NULL, '[]'::jsonb);
  _res := public.conduct_intel_ai_refresh_staleness(_insight);
  INSERT INTO mc09c VALUES ('advisory_recorded_and_fresh',
    _insight IS NOT NULL
    AND (_res->>'staleness_state') = 'CURRENT'
    AND (SELECT review_state FROM public.conduct_ai_insights WHERE id = _insight) = 'NOT_REVIEWED'
    AND (SELECT entity_id IS NULL AND subject_type = 'emerging_risk'
           FROM public.conduct_ai_insights WHERE id = _insight),
    _res::text);

  -- M. original AI wording is immutable
  BEGIN
    UPDATE public.conduct_ai_insights SET ai_output = '{"summary":"rewritten"}'::jsonb WHERE id = _insight;
    INSERT INTO mc09c VALUES ('ai_output_immutable', false, 'the original AI wording was altered');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc09c VALUES ('ai_output_immutable', SQLERRM LIKE '%immutable%' OR SQLERRM LIKE '%permission denied%', SQLERRM);
  END;

  -- N. human review is mandatory and rejection needs a reason
  BEGIN
    PERFORM public.conduct_ai_insight_review(_insight, 'reject', NULL);
    INSERT INTO mc09c VALUES ('review_rationale_required', false, 'a rejection was accepted without a reason');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc09c VALUES ('review_rationale_required', SQLERRM LIKE 'rationale_required%', SQLERRM);
  END;

  -- O. the institutional stop control disables MC-09 AI immediately
  PERFORM public.ai_governance_kill_switch_set('market_conduct', true,
    'MC-09 certification of the institutional stop control.');
  _gate := public.ai_governance_resolve_execution('EMERGING_RISK_NARRATIVE', _super, NULL);
  PERFORM public.ai_governance_kill_switch_set('market_conduct', false,
    'MC-09 certification complete.');
  INSERT INTO mc09c VALUES ('stop_control_effective',
    (_gate->>'allowed') = 'false' AND (_gate->>'reason_code') = 'AI_STOPPED',
    _gate::text);

  -- P. with the stop released the capability resolves to its approved model and instruction
  _gate := public.ai_governance_resolve_execution('EMERGING_RISK_HYPOTHESIS', _super, NULL);
  INSERT INTO mc09c VALUES ('capability_resolves',
    (_gate->>'allowed') = 'true'
    AND (_gate->>'model') = 'google/gemini-2.5-pro'
    AND (_gate->>'owning_module') = 'market_conduct',
    _gate::text);

  -- Q. an auditor may read but never assess
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_auditor,'role','authenticated')::text, true);
  BEGIN
    PERFORM public.conduct_emerging_risk_assess(_risk, jsonb_build_object(
      'judgement','An auditor must not be able to record a supervisory assessment at all.'));
    INSERT INTO mc09c VALUES ('auditor_read_only', false, 'the auditor recorded an assessment');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc09c VALUES ('auditor_read_only', SQLERRM LIKE 'not_authorized%', SQLERRM);
  END;

  -- R. no anonymous access to any cross-entity intelligence
  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN
    PERFORM public.conduct_intel_theme_snapshot(_theme, _sector, 90, NULL);
    INSERT INTO mc09c VALUES ('no_anonymous_access', false, 'anonymous access to theme facts succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc09c VALUES ('no_anonymous_access', SQLERRM LIKE 'Authentication required%', SQLERRM);
  END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_super,'role','authenticated')::text, true);
END $$;

SELECT ok(COALESCE(pass,false), 'theme facts are deterministic and fact-classified' || COALESCE(' :: ' || detail,''))
  FROM mc09c WHERE name = 'theme_facts_deterministic';
SELECT ok(COALESCE(pass,false), 'movement is measured against the preceding window' || COALESCE(' :: ' || detail,''))
  FROM mc09c WHERE name = 'movement_explained';
SELECT ok(COALESCE(pass,false), 'cross-entity comparison is positional and not a rating' || COALESCE(' :: ' || detail,''))
  FROM mc09c WHERE name = 'comparison_positional';
SELECT ok(COALESCE(pass,false), 'the observation window is bounded' || COALESCE(' :: ' || detail,''))
  FROM mc09c WHERE name = 'window_bounded';
SELECT ok(COALESCE(pass,false), 'a supervisory assessment requires a written judgement' || COALESCE(' :: ' || detail,''))
  FROM mc09c WHERE name = 'judgement_required';
SELECT ok(COALESCE(pass,false), 'assessments are versioned and update the risk header' || COALESCE(' :: ' || detail,''))
  FROM mc09c WHERE name = 'assessment_versioned';
SELECT ok(COALESCE(pass,false), 'assessment history cannot be rewritten' || COALESCE(' :: ' || detail,''))
  FROM mc09c WHERE name = 'assessment_append_only';
SELECT ok(COALESCE(pass,false), 'a follow-up requires a written note' || COALESCE(' :: ' || detail,''))
  FROM mc09c WHERE name = 'followup_note_required';
SELECT ok(COALESCE(pass,false), 'follow-up action is recorded in the risk history' || COALESCE(' :: ' || detail,''))
  FROM mc09c WHERE name = 'followup_recorded';
SELECT ok(COALESCE(pass,false), 'AI context is fact-only, fingerprinted and citation-bound' || COALESCE(' :: ' || detail,''))
  FROM mc09c WHERE name = 'ai_context_grounded';
SELECT ok(COALESCE(pass,false), 'a capability may only read its approved fact source' || COALESCE(' :: ' || detail,''))
  FROM mc09c WHERE name = 'fact_scope_enforced';
SELECT ok(COALESCE(pass,false), 'a cross-entity advisory item is recorded with provenance and freshness' || COALESCE(' :: ' || detail,''))
  FROM mc09c WHERE name = 'advisory_recorded_and_fresh';
SELECT ok(COALESCE(pass,false), 'original AI wording is immutable' || COALESCE(' :: ' || detail,''))
  FROM mc09c WHERE name = 'ai_output_immutable';
SELECT ok(COALESCE(pass,false), 'rejecting advisory content requires a reason' || COALESCE(' :: ' || detail,''))
  FROM mc09c WHERE name = 'review_rationale_required';
SELECT ok(COALESCE(pass,false), 'the institutional stop control disables MC-09 AI immediately' || COALESCE(' :: ' || detail,''))
  FROM mc09c WHERE name = 'stop_control_effective';
SELECT ok(COALESCE(pass,false), 'an approved capability resolves to its governed model and instruction' || COALESCE(' :: ' || detail,''))
  FROM mc09c WHERE name = 'capability_resolves';
SELECT ok(COALESCE(pass,false), 'an auditor cannot record a supervisory assessment' || COALESCE(' :: ' || detail,''))
  FROM mc09c WHERE name = 'auditor_read_only';
SELECT ok(COALESCE(pass,false), 'anonymous callers cannot read cross-entity intelligence' || COALESCE(' :: ' || detail,''))
  FROM mc09c WHERE name = 'no_anonymous_access';

SELECT * FROM finish();
ROLLBACK;

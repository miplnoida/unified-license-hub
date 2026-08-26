-- MC-07.2 — Conduct 360 AI governance backend (no model calls, advisory only).
BEGIN;
SELECT plan(19);

-- 1 the five approved use cases exist, and only those
SELECT is(
  (SELECT string_agg(code, ',' ORDER BY code) FROM public.conduct_ai_use_cases),
  'MATERIAL_CHANGE_EXPLANATION,RECORDS_TO_REVIEW,RISK_HYPOTHESIS,SUPERVISORY_QUESTIONS,SUPERVISORY_SUMMARY',
  'exactly the five approved Conduct 360 AI use cases are registered'
);

-- 2 governance flags are locked on every use case
SELECT ok(
  (SELECT bool_and(allowed_source = 'conduct_360_snapshot'
              AND human_review_required
              AND citations_required
              AND NOT workflow_mutation_allowed
              AND governance_level = 'ADVISORY_HUMAN_REVIEWED'
              AND prompt_template_code IS NOT NULL
              AND prompt_template_version IS NOT NULL
              AND model_policy ? 'allowed_models'
              AND confidence_policy ? 'required'
              AND btrim(limitation_policy) <> ''
              AND array_length(allowed_output_classes, 1) > 0
              AND array_length(prohibited_output_classes, 1) > 0)
     FROM public.conduct_ai_use_cases),
  'every use case locks source, review, citations, no-mutation, prompt version and model/confidence policy'
);

-- 3 the locks cannot be configured away (enforced by database constraints)
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
           WHERE conrelid = 'public.conduct_ai_use_cases'::regclass
             AND conname = 'conduct_ai_use_cases_source_chk'
             AND pg_get_constraintdef(oid) ILIKE '%conduct_360_snapshot%'),
  'allowed source is constrained to the Conduct 360 view');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
           WHERE conrelid = 'public.conduct_ai_use_cases'::regclass
             AND conname = 'conduct_ai_use_cases_no_mutation_chk'
             AND pg_get_constraintdef(oid) ILIKE '%workflow_mutation_allowed IS FALSE%'),
  'a use case can never be allowed to change supervisory records');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
           WHERE conrelid = 'public.conduct_ai_use_cases'::regclass
             AND conname = 'conduct_ai_use_cases_review_chk')
  AND EXISTS (SELECT 1 FROM pg_constraint
           WHERE conrelid = 'public.conduct_ai_use_cases'::regclass
             AND conname = 'conduct_ai_use_cases_citations_chk'),
  'human review and citations cannot be switched off');


-- 4 no generic mutation/action executor anywhere in the AI layer
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('conduct_ai_insight_record','conduct_ai_insight_review',
                         'conduct_ai_insight_refresh_staleness','conduct_360_ai_context')
       AND (p.prosrc ~* 'mutation_spec|execute\s+format|conduct_signal_(validate|dismiss)|conduct_cluster_(confirm|raise_alert)|conduct_alert_|conduct_investigation|conduct_finding|enforcement_action|complaint_outcome|workflow_transition|risk_rating'
            OR p.prosrc ~* 'insert into public\.(conduct_signals|conduct_clusters|conduct_alerts|conduct_findings|conduct_investigations|complaints|enforcement_actions)')),
  'AI-layer functions contain no mutation executor and touch no supervisory decision object'
);

-- 5 no anonymous execute on any AI-layer operation; recording is service-side only
SELECT ok(
  NOT has_function_privilege('anon', 'public.conduct_360_ai_context(uuid,text,date,date)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.conduct_ai_insight_review(uuid,text,text,jsonb,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon',
        'public.conduct_ai_insight_record(uuid,text,date,date,text,jsonb,jsonb,text,text,text,text,numeric,text,text[],uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated',
        'public.conduct_ai_insight_record(uuid,text,date,date,text,jsonb,jsonb,text,text,text,text,numeric,text,text[],uuid,text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.conduct_ai_insight_review(uuid,text,text,jsonb,uuid)', 'EXECUTE'),
  'anon cannot call the AI layer; browsers cannot record insights; supervisors can review'
);

-- 6 no direct browser writes to the AI store
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.conduct_ai_insights', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.conduct_ai_insights', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.conduct_ai_insights', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.conduct_ai_review_events', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.conduct_ai_insights', 'SELECT')
  AND has_table_privilege('authenticated', 'public.conduct_ai_insights', 'SELECT'),
  'all writes go through governed operations; anon has no read'
);

-- ---------------------------------------------------------------------------
-- runtime behaviour
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE mc072 (name text primary key, pass boolean, detail text);

DO $$
DECLARE
  _super uuid; _officer uuid; _auditor uuid;
  _entity uuid; _out_entity uuid;
  _ctx jsonb; _fp text; _refs jsonb;
  _id uuid; _row public.conduct_ai_insights; _res jsonb; _n int;
BEGIN
  SELECT id INTO _super   FROM public.profiles WHERE email = 'super_admin@mishainfotech.com';
  SELECT id INTO _auditor FROM public.profiles WHERE email = 'auditor@mishainfotech.com';
  SELECT id INTO _officer FROM public.profiles WHERE email = 'conduct_supervisor@mishainfotech.com';

  SELECT c.licensee_id INTO _entity FROM public.complaints c WHERE c.licensee_id IS NOT NULL
   GROUP BY c.licensee_id ORDER BY count(*) DESC, c.licensee_id LIMIT 1;
  SELECT l.id INTO _out_entity FROM public.licensees l
   WHERE NOT public.regulatory_scope_allows(_officer,'market_conduct','view',
           l.lead_regulator_id, l.sector_id, NULL, l.id, _officer)
   ORDER BY l.id LIMIT 1;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',_super,'role','authenticated')::text, true);

  -- 7 context operation: facts + fingerprint + permitted references, no AI content
  _ctx := public.conduct_360_ai_context(_entity, 'SUPERVISORY_SUMMARY', '2000-01-01', '2100-01-01');
  _fp  := _ctx ->> 'input_fingerprint';
  _refs := _ctx -> 'permitted_source_references';
  INSERT INTO mc072 VALUES ('context_payload',
    _ctx ? 'snapshot' AND coalesce(_fp,'') <> ''
    AND jsonb_array_length(_refs) > 0
    AND (_ctx -> 'use_case' ->> 'allowed_source') = 'conduct_360_snapshot'
    AND (_ctx -> 'use_case' ->> 'workflow_mutation_allowed') = 'false'
    AND (_ctx -> 'provenance' ->> 'ai_content') = 'false'
    AND _fp = public.conduct_360_fingerprint(_ctx -> 'snapshot'), NULL);

  -- 8 an insight preserves the full provenance set
  _id := public.conduct_ai_insight_record(
           _entity, 'SUPERVISORY_SUMMARY', '2000-01-01', '2100-01-01', _fp,
           jsonb_build_object('summary','MC-07.2 governance test output','output_class','narrative'),
           _refs, 'lovable_ai_gateway', 'google/gemini-2.5-flash', '2026-08',
           NULL, 0.62, 'Limited to the snapshot window',
           ARRAY['Advisory only','Requires verification against source records'], _super);
  SELECT * INTO _row FROM public.conduct_ai_insights WHERE id = _id;
  INSERT INTO mc072 VALUES ('provenance_preserved',
    _row.entity_id = _entity AND _row.use_case_code = 'SUPERVISORY_SUMMARY'
    AND _row.snapshot_fingerprint = _fp
    AND jsonb_array_length(_row.source_references) > 0
    AND _row.provider = 'lovable_ai_gateway' AND _row.model IS NOT NULL AND _row.model_version = '2026-08'
    AND _row.prompt_template_code = 'conduct360.summary' AND _row.prompt_template_version = 'v1'
    AND _row.generated_at IS NOT NULL AND _row.ai_output ? 'summary'
    AND _row.confidence = 0.62 AND _row.uncertainty IS NOT NULL
    AND array_length(_row.limitations,1) = 2
    AND _row.staleness_state = 'CURRENT' AND _row.review_state = 'NOT_REVIEWED'
    AND _row.insight_id IS NOT NULL, NULL);

  -- 9 citations are mandatory when the use case requires them
  BEGIN
    PERFORM public.conduct_ai_insight_record(_entity,'SUPERVISORY_SUMMARY','2000-01-01','2100-01-01',_fp,
      '{"summary":"no citations"}'::jsonb, '[]'::jsonb, 'lovable_ai_gateway','google/gemini-2.5-flash',NULL,
      NULL, 0.5, NULL, '{}'::text[], _super);
    INSERT INTO mc072 VALUES ('citations_enforced', false, 'accepted without citations');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc072 VALUES ('citations_enforced', SQLERRM LIKE 'citations_required%', SQLERRM);
  END;

  -- 10 rationale mandatory for modify and reject
  BEGIN
    PERFORM public.conduct_ai_insight_review(_id, 'reject', NULL);
    INSERT INTO mc072 VALUES ('rationale_enforced', false, 'reject accepted without rationale');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'rationale_required%' THEN
      BEGIN
        PERFORM public.conduct_ai_insight_review(_id, 'modify', 'wording tightened', NULL);
        INSERT INTO mc072 VALUES ('rationale_enforced', false, 'modify accepted without revised text');
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO mc072 VALUES ('rationale_enforced', SQLERRM LIKE 'human_output_required%', SQLERRM);
      END;
    ELSE
      INSERT INTO mc072 VALUES ('rationale_enforced', false, SQLERRM);
    END IF;
  END;

  -- 11 modify records the human version and preserves the AI original
  _res := public.conduct_ai_insight_review(_id, 'modify', 'Supervisor rewrote the summary',
            jsonb_build_object('summary','Supervisor-authored summary'));
  SELECT * INTO _row FROM public.conduct_ai_insights WHERE id = _id;
  INSERT INTO mc072 VALUES ('modify_preserves_original',
    _row.review_state = 'MODIFIED'
    AND (_row.ai_output ->> 'summary') = 'MC-07.2 governance test output'
    AND (_row.human_output ->> 'summary') = 'Supervisor-authored summary'
    AND _row.human_rationale IS NOT NULL AND _row.reviewed_by IS NOT NULL
    AND (_res ->> 'ai_output_preserved') = 'true', NULL);

  -- 12 the AI original is structurally immutable and undeletable
  BEGIN
    UPDATE public.conduct_ai_insights SET ai_output = '{"summary":"tampered"}'::jsonb WHERE id = _id;
    INSERT INTO mc072 VALUES ('ai_output_immutable', false, 'update succeeded');
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      DELETE FROM public.conduct_ai_insights WHERE id = _id;
      INSERT INTO mc072 VALUES ('ai_output_immutable', false, 'delete succeeded');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO mc072 VALUES ('ai_output_immutable', true, NULL);
    END;
  END;

  -- 13 accept then supersede, with append-only history
  PERFORM public.conduct_ai_insight_review(_id, 'accept', 'Accepted as drafted');
  PERFORM public.conduct_ai_insight_review(_id, 'supersede', 'Newer advisory item issued');
  SELECT count(*) INTO _n FROM public.conduct_ai_review_events WHERE conduct_ai_insight_id = _id;
  SELECT * INTO _row FROM public.conduct_ai_insights WHERE id = _id;
  BEGIN
    UPDATE public.conduct_ai_review_events SET rationale = 'rewritten' WHERE conduct_ai_insight_id = _id;
    INSERT INTO mc072 VALUES ('review_history_append_only', false, 'history update succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc072 VALUES ('review_history_append_only',
      _n = 3 AND _row.review_state = 'SUPERSEDED', _n::text);
  END;

  -- 14 staleness is derived from the fingerprint
  _res := public.conduct_ai_insight_refresh_staleness(_id);
  INSERT INTO mc072 VALUES ('staleness_current', (_res ->> 'staleness_state') = 'CURRENT', _res::text);

  -- 15 out-of-scope entity: neither context nor recording is permitted for that officer
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_officer,'role','authenticated')::text, true);
  BEGIN
    PERFORM public.conduct_360_ai_context(_out_entity, 'SUPERVISORY_SUMMARY');
    INSERT INTO mc072 VALUES ('out_of_scope_denied', false, 'context returned');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO mc072 VALUES ('out_of_scope_denied', true, NULL);
  WHEN OTHERS THEN
    INSERT INTO mc072 VALUES ('out_of_scope_denied', false, SQLERRM);
  END;

  -- 16 auditor can read but cannot review
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_auditor,'role','authenticated')::text, true);
  BEGIN
    PERFORM public.conduct_ai_insight_review(_id, 'accept', 'auditor attempt');
    INSERT INTO mc072 VALUES ('auditor_read_only', false, 'auditor review succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc072 VALUES ('auditor_read_only', true, SQLERRM);
  END;

  -- 17 anonymous review denied
  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN
    PERFORM public.conduct_ai_insight_review(_id, 'accept', 'anon attempt');
    INSERT INTO mc072 VALUES ('anonymous_denied', false, 'anon review succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc072 VALUES ('anonymous_denied', true, SQLERRM);
  END;
END $$;

SELECT ok(COALESCE(pass,false), 'context operation returns facts, fingerprint and permitted references only'
  || COALESCE(' :: ' || detail, '')) FROM mc072 WHERE name = 'context_payload';
SELECT ok(COALESCE(pass,false), 'an advisory record preserves the full provenance set'
  || COALESCE(' :: ' || detail, '')) FROM mc072 WHERE name = 'provenance_preserved';
SELECT ok(COALESCE(pass,false), 'citations are mandatory when the use case requires them'
  || COALESCE(' :: ' || detail, '')) FROM mc072 WHERE name = 'citations_enforced';
SELECT ok(COALESCE(pass,false), 'rationale required to reject; revised text required to modify'
  || COALESCE(' :: ' || detail, '')) FROM mc072 WHERE name = 'rationale_enforced';
SELECT ok(COALESCE(pass,false), 'modify stores the human version and preserves the AI original'
  || COALESCE(' :: ' || detail, '')) FROM mc072 WHERE name = 'modify_preserves_original';
SELECT ok(COALESCE(pass,false), 'original AI output cannot be altered or deleted'
  || COALESCE(' :: ' || detail, '')) FROM mc072 WHERE name = 'ai_output_immutable';
SELECT ok(COALESCE(pass,false), 'accept and supersede work and review history is append-only'
  || COALESCE(' :: ' || detail, '')) FROM mc072 WHERE name = 'review_history_append_only';
SELECT ok(COALESCE(pass,false), 'staleness is derived from the recorded fingerprint')
  FROM mc072 WHERE name = 'staleness_current';
SELECT ok(COALESCE(pass,false), 'out-of-scope entity is denied' || COALESCE(' :: ' || detail, ''))
  FROM mc072 WHERE name = 'out_of_scope_denied';
SELECT ok(COALESCE(pass,false), 'auditor cannot perform review actions')
  FROM mc072 WHERE name = 'auditor_read_only';
SELECT ok(COALESCE(pass,false), 'anonymous review is denied')
  FROM mc072 WHERE name = 'anonymous_denied';

SELECT * FROM finish();
ROLLBACK;

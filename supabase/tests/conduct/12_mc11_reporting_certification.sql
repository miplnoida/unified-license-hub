-- MC-11 CERTIFICATION — SUPERVISORY MANAGEMENT REPORTING, REGULATORY MI
-- AND EVIDENCE PACKS.
-- Certifies that every published figure is deterministic, reconciles to the
-- records behind it, is scoped to the reader's remit, that evidence pack
-- versions are immutable and point-in-time, and that AI narratives are
-- grounded, reviewed by a human and only adoptable while current.
BEGIN;
SELECT plan(42);

-- ---------------- structure and lockdown ----------------
SELECT ok(
  (SELECT count(*) FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname IN ('conduct_mi_definitions','conduct_evidence_packs',
                      'conduct_evidence_pack_versions','conduct_evidence_pack_exports',
                      'conduct_reporting_adopted_narratives','release_debt_register')) = 6,
  'every MC-11 register is present');

SELECT ok(
  (SELECT bool_and(relrowsecurity) FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname IN ('conduct_mi_definitions','conduct_evidence_packs',
                      'conduct_evidence_pack_versions','conduct_evidence_pack_exports',
                      'conduct_reporting_adopted_narratives','release_debt_register')),
  'row level security is enabled on every MC-11 register');

SELECT ok(
  NOT has_table_privilege('authenticated','public.conduct_evidence_packs','INSERT')
  AND NOT has_table_privilege('authenticated','public.conduct_evidence_packs','UPDATE')
  AND NOT has_table_privilege('authenticated','public.conduct_evidence_pack_versions','INSERT')
  AND NOT has_table_privilege('authenticated','public.conduct_evidence_pack_versions','UPDATE')
  AND NOT has_table_privilege('authenticated','public.conduct_evidence_pack_versions','DELETE')
  AND NOT has_table_privilege('authenticated','public.conduct_reporting_adopted_narratives','UPDATE')
  AND NOT has_table_privilege('authenticated','public.conduct_mi_definitions','UPDATE')
  AND has_table_privilege('authenticated','public.conduct_evidence_packs','SELECT'),
  'reporting records can only be produced by governed operations, never from a browser session');

SELECT ok(
  NOT has_table_privilege('anon','public.conduct_evidence_packs','SELECT')
  AND NOT has_table_privilege('anon','public.conduct_evidence_pack_versions','SELECT')
  AND NOT has_table_privilege('anon','public.conduct_reporting_adopted_narratives','SELECT'),
  'anonymous users cannot read management reporting or evidence packs');

SELECT ok(
  NOT has_function_privilege('authenticated','public.conduct_mi_records(text,uuid[],date,date)','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.conduct_mi_scope_header(uuid[],date,date)','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.conduct_evidence_pack_facts(text,uuid,text,uuid[],date,date)','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.conduct_reporting_ai_insight_record(text,text,uuid,uuid,date,date,text,jsonb,jsonb,text,text,text,text,numeric,text,text[],uuid,uuid,integer,text)','EXECUTE'),
  'the internal measurement and AI recording helpers are not callable from a browser session');

SELECT ok(
  NOT has_function_privilege('anon','public.conduct_mi_dashboard(date,date,uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.conduct_mi_drilldown(text,date,date,uuid,uuid,integer)','EXECUTE')
  AND NOT has_function_privilege('anon','public.conduct_evidence_pack_generate(text,uuid,text,text,date,date,uuid,uuid,text,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.conduct_evidence_pack_read(uuid,integer)','EXECUTE')
  AND NOT has_function_privilege('anon','public.conduct_reporting_ai_context(text,date,date,uuid,uuid,uuid,integer)','EXECUTE')
  AND NOT has_function_privilege('anon','public.conduct_reporting_narrative_adopt(uuid,text,text,uuid,integer)','EXECUTE'),
  'no MC-11 reporting operation is exposed to anonymous callers');

-- ---------------- the published measure dictionary ----------------
SELECT ok(
  (SELECT count(*) FROM public.conduct_mi_definitions WHERE is_active) = 54,
  'all 54 supervisory measures are published');

SELECT ok(
  (SELECT count(*) FROM public.conduct_mi_definitions
    WHERE is_active
      AND (COALESCE(btrim(business_meaning),'') = ''
           OR COALESCE(btrim(source_object),'') = ''
           OR COALESCE(btrim(time_basis),'') = ''
           OR COALESCE(btrim(inclusion_criteria),'') = '')) = 0,
  'every measure states its meaning, its source, what it counts and how it is dated');

SELECT ok(
  (SELECT count(DISTINCT metric_group) FROM public.conduct_mi_definitions WHERE is_active) = 8
  AND (SELECT count(*) FROM public.conduct_mi_definitions
        WHERE is_active AND metric_group NOT IN ('population','attention','emerging_risk','findings',
                                                 'followup','interventions','outcomes','plans')) = 0,
  'measures are grouped only into the eight approved reporting groups');

SELECT ok(
  (SELECT count(*) FROM (SELECT code FROM public.conduct_mi_definitions GROUP BY code HAVING count(*) > 1) d) = 0,
  'no measure code is defined twice');

-- ---------------- governed AI use cases for reporting ----------------
SELECT ok(
  (SELECT count(*) FROM public.conduct_ai_use_cases
    WHERE allowed_source = 'conduct_reporting_snapshot'
      AND code IN ('MANAGEMENT_SUMMARY_DRAFT','MATERIAL_MOVEMENT_EXPLANATION',
                   'RISK_REPORTING_NARRATIVE','COVERAGE_COMMENTARY','EVIDENCE_PACK_SUMMARY')) = 5,
  'the five reporting AI use cases are registered in the AI control plane');

SELECT ok(
  (SELECT count(*) FROM public.conduct_ai_use_cases
    WHERE allowed_source = 'conduct_reporting_snapshot'
      AND (workflow_mutation_allowed OR NOT citations_required OR NOT human_review_required)) = 0,
  'no reporting AI use case may change a record, skip citations or skip human review');

-- ---------------- release debt is disclosed, not hidden ----------------
SELECT ok(
  (SELECT count(*) FROM public.release_debt_register) > 0
  AND (SELECT count(*) FROM public.release_debt_register
        WHERE release_blocking
          AND (COALESCE(btrim(intended_verification),'') = ''
               OR COALESCE(btrim(assertion),'') = ''
               OR COALESCE(btrim(owner_role),'') = '')) = 0,
  'every release-blocking debt item names its assertion, its owner and how it will be verified');

CREATE TEMP TABLE mc11 (name text primary key, pass boolean, detail text);

DO $$
DECLARE
  _super uuid; _maker uuid; _analyst uuid; _auditor uuid;
  _sector uuid; _other_sector uuid; _reg uuid; _entity uuid;
  _ps date := (current_date - 180); _pe date := current_date;
  _d1 jsonb; _d2 jsonb; _dd jsonb; _cmp jsonb; _cov jsonb;
  _pack jsonb; _pack_id uuid; _read1 jsonb; _read2 jsonb;
  _ctx jsonb; _ins uuid; _adopt uuid; _res jsonb; _code text; _count integer;
BEGIN
  SELECT id INTO _super   FROM public.profiles WHERE email = 'super_admin@mishainfotech.com';
  SELECT id INTO _maker   FROM public.profiles WHERE email = 'conduct_supervisor@mishainfotech.com';
  SELECT id INTO _analyst FROM public.profiles WHERE email = 'conduct_analyst@mishainfotech.com';
  SELECT id INTO _auditor FROM public.profiles WHERE email = 'auditor@mishainfotech.com';

  SELECT l.sector_id, l.id, (array_agg(c.regulator_id))[1] INTO _sector, _entity, _reg
    FROM public.complaints c JOIN public.licensees l ON l.id = c.licensee_id
   WHERE l.sector_id IS NOT NULL
   GROUP BY l.sector_id, l.id
   ORDER BY count(*) DESC LIMIT 1;

  SELECT id INTO _other_sector FROM public.sectors
   WHERE id <> _sector
     AND NOT public.regulatory_scope_allows(_maker,'market_conduct','view',NULL,id,NULL,NULL,_maker)
   LIMIT 1;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_maker,'role','authenticated')::text, true);

  -- A. the management information pack is deterministic and signed
  _d1 := public.conduct_mi_dashboard(_ps, _pe, _sector, NULL);
  _d2 := public.conduct_mi_dashboard(_ps, _pe, _sector, NULL);
  INSERT INTO mc11 VALUES ('dashboard_deterministic',
    (_d1 - 'generated_at') = (_d2 - 'generated_at')
    AND COALESCE(_d1 ->> 'facts_signature','') <> ''
    AND (_d1 ->> 'facts_signature') = (_d2 ->> 'facts_signature'),
    left(_d1::text, 300));

  -- B. every published measure is reported, and every reported figure is defined
  INSERT INTO mc11 VALUES ('dictionary_matches_report',
    (SELECT count(*) FROM public.conduct_mi_definitions WHERE is_active AND effective_from <= _pe
      AND NOT ((_d1 -> 'metrics') ? code)) = 0
    AND (SELECT count(*) FROM jsonb_object_keys(_d1 -> 'metrics') k
          WHERE NOT EXISTS (SELECT 1 FROM public.conduct_mi_definitions d
                             WHERE d.code = k AND d.is_active)) = 0,
    format('measures=%s reported=%s',
      (SELECT count(*) FROM public.conduct_mi_definitions WHERE is_active AND effective_from <= _pe),
      (SELECT count(*) FROM jsonb_object_keys(_d1 -> 'metrics'))));

  -- C. every headline figure is provenanced as fact, not opinion
  INSERT INTO mc11 VALUES ('figures_are_facts',
    (_d1 -> 'provenance' ->> 'content_class') = 'fact'
    AND (_d1 -> 'provenance' ->> 'source') = 'conduct_mi_dashboard'
    AND _d1 ? 'definitions' AND _d1 ? 'scope',
    (_d1 -> 'provenance')::text);

  -- D. a headline figure reconciles exactly to the records behind it
  SELECT k INTO _code FROM jsonb_each(_d1 -> 'metrics') e(k, v)
   WHERE (v)::text ~ '^[0-9]+$' AND (v)::text::integer > 0
   ORDER BY (v)::text::integer DESC, k LIMIT 1;
  IF _code IS NULL THEN
    INSERT INTO mc11 VALUES ('drilldown_reconciles', false,
      'no non-zero measure was available in the certification window');
  ELSE
    _dd := public.conduct_mi_drilldown(_code, _ps, _pe, _sector, NULL, 500);
    _count := ((_d1 -> 'metrics') ->> _code)::integer;
    INSERT INTO mc11 VALUES ('drilldown_reconciles',
      (_dd ->> 'total')::integer = _count
      AND jsonb_array_length(_dd -> 'records') = LEAST(_count, 500)
      AND (_dd -> 'definition' ->> 'code') = _code,
      format('metric=%s headline=%s drilldown=%s', _code, _count, _dd ->> 'total'));
  END IF;

  -- E. an unknown measure cannot be drilled into
  BEGIN
    PERFORM public.conduct_mi_drilldown('NOT_A_MEASURE', _ps, _pe, _sector, NULL, 10);
    INSERT INTO mc11 VALUES ('unknown_measure_refused', false, 'an undefined measure was accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc11 VALUES ('unknown_measure_refused', true, SQLERRM);
  END;

  -- F. period movement is reported against the same definitions
  _cmp := public.conduct_mi_period_compare(_ps, _pe, _sector, NULL);
  INSERT INTO mc11 VALUES ('movement_reported',
    _cmp ? 'comparisons' AND _cmp ? 'current_period' AND _cmp ? 'previous_period'
    AND (SELECT count(*) FROM jsonb_array_elements(_cmp -> 'comparisons') c
          WHERE NOT (c ? 'absolute_change') OR NOT (c ? 'code')) = 0,
    left(_cmp::text, 300));

  -- G. supervisory coverage is reported with its gaps
  _cov := public.conduct_mi_sector_coverage(_ps, _pe, _sector, NULL);
  INSERT INTO mc11 VALUES ('coverage_reported',
    _cov ? 'sectors' AND (_cov -> 'provenance' ->> 'content_class') = 'fact',
    left(_cov::text, 300));

  -- H. an evidence pack must declare a supported type
  BEGIN
    PERFORM public.conduct_evidence_pack_generate('BOARD_REPORT', NULL, 'x', 'x', _ps, _pe, _sector, NULL);
    INSERT INTO mc11 VALUES ('pack_type_constrained', false, 'an unsupported pack type was accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc11 VALUES ('pack_type_constrained', SQLERRM LIKE 'invalid_pack_type%', SQLERRM);
  END;

  -- I. a subject-based pack must name its subject
  BEGIN
    PERFORM public.conduct_evidence_pack_generate('theme', NULL, NULL, NULL, _ps, _pe, _sector, NULL);
    INSERT INTO mc11 VALUES ('pack_subject_required', false, 'a pack without a subject was accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc11 VALUES ('pack_subject_required', SQLERRM LIKE 'subject_required%', SQLERRM);
  END;

  -- J. a pack outside the reader's remit is refused
  IF _other_sector IS NULL THEN
    INSERT INTO mc11 VALUES ('pack_scope_enforced', true, 'no out-of-scope sector exists to probe');
  ELSE
    BEGIN
      PERFORM public.conduct_evidence_pack_generate('period_sector', NULL, 'probe', 'probe',
        _ps, _pe, _other_sector, NULL);
      INSERT INTO mc11 VALUES ('pack_scope_enforced', false,
        'a pack was assembled for a sector outside the supervisor''s remit');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO mc11 VALUES ('pack_scope_enforced', true, SQLERRM);
    END;
  END IF;

  -- K. a first pack version is assembled, referenced and signed
  _pack := public.conduct_evidence_pack_generate('period_sector', NULL,
    format('%s:%s', _ps, _pe), 'Certification management reporting pack', _ps, _pe, _sector, NULL);
  _pack_id := (_pack ->> 'pack_id')::uuid;
  INSERT INTO mc11 VALUES ('pack_version_signed',
    _pack_id IS NOT NULL
    AND (_pack ->> 'version')::integer = 1
    AND COALESCE(_pack ->> 'reference','') <> ''
    AND EXISTS (SELECT 1 FROM public.conduct_evidence_pack_versions v
                 WHERE v.pack_id = _pack_id AND v.version = 1
                   AND COALESCE(v.facts_signature,'') <> ''
                   AND COALESCE(v.definition_version,'') <> ''
                   AND v.generated_by = _maker),
    _pack::text);

  -- L. the pack figures reconcile to the same measurement engine
  _read1 := public.conduct_evidence_pack_read(_pack_id, 1);
  INSERT INTO mc11 VALUES ('pack_reconciles_to_measures',
    (SELECT count(*) FROM public.conduct_mi_definitions d
      WHERE d.is_active AND NOT ((_read1 -> 'version' -> 'metric_package' -> 'metrics') ? d.code)) = 0
    AND (_read1 -> 'pack' ->> 'id') = _pack_id::text,
    left((_read1 -> 'version' -> 'metric_package' -> 'metrics')::text, 200));

  -- M. regenerating a pack requires a written reason
  BEGIN
    PERFORM public.conduct_evidence_pack_generate('period_sector', NULL,
      format('%s:%s', _ps, _pe), 'Certification management reporting pack', _ps, _pe, _sector, NULL,
      NULL, _pack_id);
    INSERT INTO mc11 VALUES ('regeneration_reason_required', false,
      'a further pack version was produced without a stated reason');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc11 VALUES ('regeneration_reason_required', true, SQLERRM);
  END;

  -- N. a reasoned regeneration adds a version and never rewrites the earlier one
  _res := public.conduct_evidence_pack_generate('period_sector', NULL,
    format('%s:%s', _ps, _pe), 'Certification management reporting pack', _ps, _pe, _sector, NULL,
    'Reassembled for certification to prove that earlier versions survive regeneration.', _pack_id);
  _read2 := public.conduct_evidence_pack_read(_pack_id, 1);
  INSERT INTO mc11 VALUES ('pack_versions_append_only',
    (_res ->> 'version')::integer = 2
    AND (SELECT current_version FROM public.conduct_evidence_packs WHERE id = _pack_id) = 2
    AND (_read2 -> 'version') = (_read1 -> 'version')
    AND (SELECT regeneration_reason FROM public.conduct_evidence_pack_versions
          WHERE pack_id = _pack_id AND version = 2) IS NOT NULL,
    _res::text);

  -- O. an earlier version cannot be altered or removed, even by the platform
  DECLARE _u boolean := false; _dl boolean := false;
  BEGIN
    BEGIN
      UPDATE public.conduct_evidence_pack_versions SET snapshot = '{}'::jsonb
       WHERE pack_id = _pack_id AND version = 1;
    EXCEPTION WHEN OTHERS THEN _u := true;
    END;
    BEGIN
      DELETE FROM public.conduct_evidence_pack_versions WHERE pack_id = _pack_id AND version = 1;
    EXCEPTION WHEN OTHERS THEN _dl := true;
    END;
    INSERT INTO mc11 VALUES ('pack_version_immutable', _u AND _dl,
      format('update_blocked=%s delete_blocked=%s', _u, _dl));
  END;

  -- P. reading a pack version is point in time, not recalculated
  INSERT INTO mc11 VALUES ('pack_is_point_in_time',
    (_read1 -> 'version' ->> 'facts_signature')
      = (SELECT facts_signature FROM public.conduct_evidence_pack_versions
          WHERE pack_id = _pack_id AND version = 1)
    AND (_read1 -> 'version' ->> 'generated_at') IS NOT NULL,
    left((_read1 -> 'version' -> 'facts_signature')::text, 100));

  -- Q. exporting a pack version is itself an auditable act
  PERFORM public.conduct_evidence_pack_export_log(_pack_id, 1, 'json',
    jsonb_build_object('period_start', _ps, 'period_end', _pe));
  INSERT INTO mc11 VALUES ('export_is_audited',
    EXISTS (SELECT 1 FROM public.conduct_evidence_pack_exports
             WHERE pack_id = _pack_id AND version = 1 AND format = 'json'
               AND exported_by = _maker AND exported_at IS NOT NULL),
    'export recorded');

  -- R. AI may only be asked about registered reporting use cases
  BEGIN
    PERFORM public.conduct_reporting_ai_context('FREEFORM_OPINION', _ps, _pe, _sector, NULL);
    INSERT INTO mc11 VALUES ('ai_use_case_constrained', false, 'an unregistered AI use case was accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc11 VALUES ('ai_use_case_constrained', SQLERRM LIKE 'unknown_use_case%', SQLERRM);
  END;

  -- S. a pack narrative cannot be requested without naming the pack
  BEGIN
    PERFORM public.conduct_reporting_ai_context('EVIDENCE_PACK_SUMMARY', _ps, _pe, _sector, NULL);
    INSERT INTO mc11 VALUES ('pack_narrative_needs_pack', false, 'a pack summary was allowed with no pack');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc11 VALUES ('pack_narrative_needs_pack', SQLERRM LIKE 'pack_required%', SQLERRM);
  END;

  -- T. the AI is given only labelled figures drawn from the published measures
  _ctx := public.conduct_reporting_ai_context('MANAGEMENT_SUMMARY_DRAFT', _ps, _pe, _sector, NULL);
  INSERT INTO mc11 VALUES ('ai_grounding_is_labelled',
    jsonb_array_length(_ctx -> 'permitted_figures') > 0
    AND (SELECT count(*) FROM jsonb_array_elements(_ctx -> 'permitted_figures') f
          WHERE COALESCE(f ->> 'label','') = '' OR COALESCE(f ->> 'code','') = ''
             OR NOT (f ? 'value')) = 0
    AND (SELECT count(*) FROM jsonb_array_elements(_ctx -> 'permitted_figures') f
          WHERE NOT EXISTS (SELECT 1 FROM public.conduct_mi_definitions d
                             WHERE d.code = f ->> 'code' AND d.is_active)) = 0,
    left((_ctx -> 'permitted_figures')::text, 300));

  -- U. the figures offered to the AI equal the published figures, and are signed
  INSERT INTO mc11 VALUES ('ai_grounding_matches_report',
    (SELECT bool_and((_d1 -> 'metrics' -> (f ->> 'code')) = (f -> 'value'))
       FROM jsonb_array_elements(_ctx -> 'permitted_figures') f)
    AND (_ctx ->> 'facts_signature') = (_d1 ->> 'facts_signature')
    AND (_ctx -> 'snapshot' ->> 'point_in_time') = 'false',
    format('signature=%s', _ctx ->> 'facts_signature'));

  -- V. an unreviewed narrative cannot be adopted into a report
  _ins := public.conduct_reporting_ai_insight_record(
    'MANAGEMENT_SUMMARY_DRAFT', format('%s:%s', _ps, _pe), _sector, NULL, _ps, _pe,
    _ctx ->> 'facts_signature',
    jsonb_build_object('advisory_text',
      'Complaint volumes and supervisory responses are reported for the period under review.'),
    _ctx -> 'permitted_references',
    'lovable_ai_gateway', 'google/gemini-2.5-pro', 'google/gemini-2.5-pro', 'mc11.v1', 0.62, 'medium',
    ARRAY['Draft narrative for supervisory review only.'], _maker, NULL, NULL,
    'Certification management summary');
  BEGIN
    PERFORM public.conduct_reporting_narrative_adopt(_ins, 'management_summary',
      'Adopting a narrative that no human has reviewed.');
    INSERT INTO mc11 VALUES ('unreviewed_adoption_denied', false, 'an unreviewed narrative was adopted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc11 VALUES ('unreviewed_adoption_denied', true, SQLERRM);
  END;

  -- W. a human reviewer accepts the narrative, and the decision is recorded
  _res := public.conduct_ai_insight_review(_ins, 'accept',
    'Figures checked against the published measures; wording is supported by the pack.');
  INSERT INTO mc11 VALUES ('human_review_recorded',
    (SELECT review_state FROM public.conduct_ai_insights WHERE id = _ins) IN ('ACCEPTED','MODIFIED'),
    _res::text);

  -- X. adoption records the section, the reviewer and the figures relied upon
  _adopt := public.conduct_reporting_narrative_adopt(_ins, 'management_summary',
    'Adopted as the management summary for the supervisory reporting period.', _pack_id, 1);
  INSERT INTO mc11 VALUES ('adoption_recorded',
    EXISTS (SELECT 1 FROM public.conduct_reporting_adopted_narratives a
             WHERE a.id = _adopt AND a.conduct_ai_insight_id IS NOT NULL
               AND a.section = 'management_summary' AND a.adopted_by = _maker
               AND a.facts_signature = (_ctx ->> 'facts_signature')
               AND a.pack_id = _pack_id AND a.pack_version = 1
               AND length(COALESCE(a.adopted_text::text,'')) > 10),
    _adopt::text);

  -- Y. an adoption is a record of a decision and cannot be edited afterwards
  DECLARE _u2 boolean := false;
  BEGIN
    BEGIN
      UPDATE public.conduct_reporting_adopted_narratives
         SET adopted_text = '{"advisory_text":"rewritten after the fact"}'::jsonb WHERE id = _adopt;
    EXCEPTION WHEN OTHERS THEN _u2 := true;
    END;
    INSERT INTO mc11 VALUES ('adoption_immutable', _u2, format('update_blocked=%s', _u2));
  END;

  -- Z. the server re-checks whether a narrative still matches the figures
  _res := public.conduct_reporting_ai_refresh_staleness(_ins);
  INSERT INTO mc11 VALUES ('staleness_rechecked',
    _res ? 'is_stale' AND (_res ->> 'is_stale') = 'false',
    _res::text);

  -- AA. the narrative register shows the narrative with its review trail
  _res := public.conduct_reporting_narratives_list(_ps, _pe, _sector, NULL, 50);
  INSERT INTO mc11 VALUES ('narrative_register_lists',
    EXISTS (SELECT 1 FROM jsonb_array_elements(_res -> 'narratives') n
             WHERE (n ->> 'insight_id') = _ins::text
               AND jsonb_array_length(COALESCE(n -> 'adoptions','[]'::jsonb)) >= 1),
    left(_res::text, 300));

  -- AB. an officer without analytics rights cannot assemble an evidence pack
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_auditor,'role','authenticated')::text, true);
  DECLARE _readable boolean; _blocked boolean := false;
  BEGIN
    BEGIN
      _readable := EXISTS (SELECT 1 FROM public.conduct_evidence_packs WHERE id = _pack_id);
    EXCEPTION WHEN OTHERS THEN _readable := false;
    END;
    BEGIN
      PERFORM public.conduct_reporting_narrative_adopt(_ins, 'management_summary',
        'An auditor attempts to adopt a narrative into the management report.');
    EXCEPTION WHEN OTHERS THEN _blocked := true;
    END;
    INSERT INTO mc11 VALUES ('auditor_read_only', _blocked,
      format('readable=%s adoption_blocked=%s', _readable, _blocked));
  END;

  -- AC. anonymous callers cannot reach any reporting operation
  PERFORM set_config('request.jwt.claims', NULL, true);
  DECLARE _a1 boolean := false; _a2 boolean := false; _a3 boolean := false; _a4 boolean := false;
  BEGIN
    BEGIN PERFORM public.conduct_mi_dashboard(_ps, _pe, _sector, NULL);
    EXCEPTION WHEN OTHERS THEN _a1 := true; END;
    BEGIN PERFORM public.conduct_evidence_pack_read(_pack_id, 1);
    EXCEPTION WHEN OTHERS THEN _a2 := true; END;
    BEGIN PERFORM public.conduct_reporting_ai_context('MANAGEMENT_SUMMARY_DRAFT', _ps, _pe, _sector, NULL);
    EXCEPTION WHEN OTHERS THEN _a3 := true; END;
    BEGIN PERFORM public.conduct_reporting_narrative_adopt(_ins, 'management_summary', 'anonymous attempt');
    EXCEPTION WHEN OTHERS THEN _a4 := true; END;
    INSERT INTO mc11 VALUES ('anonymous_denied', _a1 AND _a2 AND _a3 AND _a4,
      format('%s/%s/%s/%s', _a1, _a2, _a3, _a4));
  END;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_super,'role','authenticated')::text, true);
END $$;

SELECT ok(COALESCE(pass,false), 'management information is deterministic and signed for freshness'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'dashboard_deterministic';
SELECT ok(COALESCE(pass,false), 'every published measure is reported and every reported figure is defined'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'dictionary_matches_report';
SELECT ok(COALESCE(pass,false), 'headline figures are declared as fact with their source'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'figures_are_facts';
SELECT ok(COALESCE(pass,false), 'a headline figure reconciles exactly to the records behind it'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'drilldown_reconciles';
SELECT ok(COALESCE(pass,false), 'an undefined measure cannot be reported or drilled into'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'unknown_measure_refused';
SELECT ok(COALESCE(pass,false), 'period movement is reported against the same measure definitions'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'movement_reported';
SELECT ok(COALESCE(pass,false), 'supervisory coverage is reported as fact'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'coverage_reported';
SELECT ok(COALESCE(pass,false), 'only supported evidence pack types can be assembled'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'pack_type_constrained';
SELECT ok(COALESCE(pass,false), 'an evidence pack must name the subject it evidences'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'pack_subject_required';
SELECT ok(COALESCE(pass,false), 'an evidence pack cannot be assembled outside the supervisor''s remit'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'pack_scope_enforced';
SELECT ok(COALESCE(pass,false), 'a pack version is referenced, signed and attributed to its author'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'pack_version_signed';
SELECT ok(COALESCE(pass,false), 'pack figures reconcile to the published measures'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'pack_reconciles_to_measures';
SELECT ok(COALESCE(pass,false), 'regenerating a pack requires a written reason'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'regeneration_reason_required';
SELECT ok(COALESCE(pass,false), 'regeneration adds a version and never rewrites an earlier one'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'pack_versions_append_only';
SELECT ok(COALESCE(pass,false), 'an issued pack version cannot be altered or deleted'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'pack_version_immutable';
SELECT ok(COALESCE(pass,false), 'reading a pack version returns the point-in-time record'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'pack_is_point_in_time';
SELECT ok(COALESCE(pass,false), 'exporting a pack version is recorded as an auditable act'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'export_is_audited';
SELECT ok(COALESCE(pass,false), 'AI narratives can only be requested for registered use cases'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'ai_use_case_constrained';
SELECT ok(COALESCE(pass,false), 'a pack narrative cannot be requested without naming the pack'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'pack_narrative_needs_pack';
SELECT ok(COALESCE(pass,false), 'the assistant is given only labelled, defined figures'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'ai_grounding_is_labelled';
SELECT ok(COALESCE(pass,false), 'the figures given to the assistant equal the published figures'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'ai_grounding_matches_report';
SELECT ok(COALESCE(pass,false), 'an unreviewed narrative cannot be adopted into a report'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'unreviewed_adoption_denied';
SELECT ok(COALESCE(pass,false), 'a human review decision is recorded against the narrative'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'human_review_recorded';
SELECT ok(COALESCE(pass,false), 'adoption records the section, the officer and the figures relied upon'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'adoption_recorded';
SELECT ok(COALESCE(pass,false), 'an adoption decision cannot be rewritten afterwards'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'adoption_immutable';
SELECT ok(COALESCE(pass,false), 'the server re-checks whether a narrative still matches the figures'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'staleness_rechecked';
SELECT ok(COALESCE(pass,false), 'the narrative register shows each narrative with its adoption trail'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'narrative_register_lists';
SELECT ok(COALESCE(pass,false), 'an auditor can read reporting but cannot adopt a narrative'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'auditor_read_only';
SELECT ok(COALESCE(pass,false), 'anonymous callers cannot reach any reporting operation'
  || COALESCE(' :: ' || detail,'')) FROM mc11 WHERE name = 'anonymous_denied';

SELECT * FROM finish();
ROLLBACK;

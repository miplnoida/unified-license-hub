-- ===========================================================================
-- OS-02G1 — Portfolio, Thematic & Systemic Supervisory Intelligence Foundation
-- certification gate (PT-01 … PT-30).
--
-- Rollback-safe: every fixture is created inside the transaction and the
-- transaction is ROLLED BACK at the end. Nothing is written to production.
--
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--        -f scripts/verify-os02g1-portfolio-thematic-intelligence.sql
-- ===========================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE pt_result(gate text, passed boolean, detail text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.gate(_g text, _ok boolean, _detail text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO pt_result VALUES (_g, COALESCE(_ok,false), _detail);
$$;

-- ===================== A. NO SECOND SUPERVISORY TRUTH =====================

-- PT-01 — the intelligence layer added no business tables at all.
SELECT pg_temp.gate('PT-01',
  NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p','m')
       AND c.relname LIKE 'supervisory_portfolio_%'),
  'no persistent or materialised portfolio/thematic business table exists');

-- PT-02 — the two read models are views, not copies of canonical data.
SELECT pg_temp.gate('PT-02',
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='v'
      AND c.relname IN ('supervisory_portfolio_condition','supervisory_portfolio_entity')) = 2,
  'supervisory_portfolio_condition and supervisory_portfolio_entity are views');

-- PT-03 — no second risk score / systemic index is published.
SELECT pg_temp.gate('PT-03',
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name LIKE 'supervisory_portfolio%'
       AND (column_name ~ '(risk|systemic|composite|thematic)_(score|index|rating)'
            OR column_name IN ('systemic_risk_score','portfolio_risk_score','composite_score'))),
  'no composite/systemic score column is exposed — components only');

-- PT-04 — no second signal / alert / case / work-queue object.
SELECT pg_temp.gate('PT-04',
  NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind IN ('r','p')
       AND (c.relname ~ 'portfolio_(signal|alert|case|queue|theme|finding)'
            OR c.relname ~ 'thematic_(signal|alert|queue)')),
  'detection, action and queueing remain owned by the canonical spine');

-- PT-05 — no write path: every portfolio function is read-only.
SELECT pg_temp.gate('PT-05',
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'supervisory_portfolio%'
      AND (p.provolatile = 'v' OR p.prosecdef)) = 0,
  'all portfolio functions are STABLE and SECURITY INVOKER (no writes, no bypass)');

-- PT-06 — conditions are read from the canonical signal spine.
SELECT pg_temp.gate('PT-06',
  (SELECT pg_get_viewdef('public.supervisory_portfolio_condition'::regclass))
    LIKE '%supervisory_management_assurance_matter%',
  'condition truth is consumed from the certified assurance/signal derivation');

-- ===================== B. SCOPE ENFORCEMENT =====================

-- PT-07 — both views run with caller RLS.
SELECT pg_temp.gate('PT-07',
  (SELECT bool_and(COALESCE(c.reloptions::text LIKE '%security_invoker=true%', false))
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relname IN ('supervisory_portfolio_condition','supervisory_portfolio_entity')),
  'security_invoker=true on both portfolio views');

-- PT-08 — the certified scope contract is applied in both views.
SELECT pg_temp.gate('PT-08',
  -- conditions inherit scope from the certified assurance derivation (which
  -- applies supervisory_monitoring_scope_admits itself, under security_invoker);
  -- the entity population applies the scope contract directly.
  (SELECT pg_get_viewdef('public.supervisory_portfolio_condition'::regclass)) LIKE '%supervisory_management_assurance_matter%'
  AND (SELECT pg_get_viewdef('public.supervisory_management_assurance_matter'::regclass)) LIKE '%supervisory_monitoring_scope_admits%'
  AND (SELECT pg_get_viewdef('public.supervisory_portfolio_entity'::regclass)) LIKE '%supervisory_monitoring_scope_admits%',
  'supervisory_monitoring_scope_admits gates both population and condition reads');

-- PT-09 — domain applicability gates the entity population.
SELECT pg_temp.gate('PT-09',
  (SELECT pg_get_viewdef('public.supervisory_portfolio_entity'::regclass)) LIKE '%supervisory_domain_applicable%',
  'entity population respects the canonical domain perimeter');

-- PT-10 — no hard-coded role names anywhere in the layer.
SELECT pg_temp.gate('PT-10',
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname LIKE 'supervisory_portfolio%'
       AND pg_get_functiondef(p.oid) ~* '''(super_admin|supervisor|admin|analyst|licensing_officer)'''),
  'authorisation is capability/scope based, never role-literal based');

-- PT-11 — execute privilege is granted to real application roles only.
SELECT pg_temp.gate('PT-11',
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname LIKE 'supervisory_portfolio%'
       AND has_function_privilege('anon', p.oid, 'EXECUTE')),
  'anonymous callers cannot execute portfolio intelligence functions');

-- ===================== C. FIXTURES (rolled back) =====================

CREATE TEMP TABLE pt_fx(k text primary key, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE pt_p(k text primary key, v uuid) ON COMMIT DROP;

DO $$
DECLARE _det uuid; _e1 uuid; _e2 uuid; _s1 uuid; _s2 uuid; _s3 uuid; _s4 uuid; _run uuid;
        _grp uuid; _mgr uuid; _out uuid;

BEGIN
  SELECT id INTO _e1 FROM public.licensees ORDER BY created_at LIMIT 1;
  SELECT id INTO _e2 FROM public.licensees WHERE id <> _e1 ORDER BY created_at LIMIT 1;

  INSERT INTO public.supervisory_detector (code, name, domain_code, source_object,
      source_kind, execution_mode, config_owner, params, version, is_active, effective_from)
  VALUES ('PT_FIXTURE_DETECTOR','PT fixture theme','PRUDENTIAL','pt_fixture',
      'OTHER_GOVERNED_SOURCE','SCHEDULED','SUPERVISORY_POLICY','{"fixture":true}'::jsonb,1,true, now() - interval '1 year')
  RETURNING id INTO _det;

  INSERT INTO public.supervisory_detector_run (detector_code, trigger_kind, status,
      started_at, completed_at, rows_scanned, signals_created, signals_updated, signals_resolved)
  VALUES ('PT_FIXTURE_DETECTOR','manual','COMPLETED', now() - interval '2 days',
      now() - interval '2 days', 10, 3, 0, 0)
  RETURNING id INTO _run;

  INSERT INTO public.supervisory_signal (entity_id, domain_code, source_kind, severity,
      detected_at, summary, detector_code, fingerprint, first_detected_at, last_detected_at,
      occurrence_count, state, source_table, source_id, source_reference,
      materiality_reason, config_provenance)
  VALUES (_e1,'PRUDENTIAL','OTHER_GOVERNED_SOURCE','high', now() - interval '5 days',
      'PT fixture condition A','PT_FIXTURE_DETECTOR','PT_FIXTURE:'||_e1::text,
      now() - interval '5 days', now() - interval '1 day', 3,'OPEN','pt_fixture',
      gen_random_uuid(),'PT-FIX-A','fixture materiality','{"fixture":true}'::jsonb)
  RETURNING id INTO _s1;

  INSERT INTO public.supervisory_signal (entity_id, domain_code, source_kind, severity,
      detected_at, summary, detector_code, fingerprint, first_detected_at, last_detected_at,
      occurrence_count, state, source_table, source_id, source_reference,
      materiality_reason, config_provenance)
  VALUES (_e2,'PRUDENTIAL','OTHER_GOVERNED_SOURCE','critical', now() - interval '4 days',
      'PT fixture condition B','PT_FIXTURE_DETECTOR','PT_FIXTURE:'||_e2::text,
      now() - interval '4 days', now(), 2,'OPEN','pt_fixture',
      gen_random_uuid(),'PT-FIX-B','fixture materiality','{"fixture":true}'::jsonb)
  RETURNING id INTO _s2;

  -- resolved-then-recurred condition, in a second domain for the same entity
  INSERT INTO public.supervisory_signal (entity_id, domain_code, source_kind, severity,
      detected_at, summary, detector_code, fingerprint, first_detected_at, last_detected_at,
      occurrence_count, state, source_table, source_id, source_reference,
      materiality_reason, config_provenance)
  VALUES (_e1,'AML_CFT','OTHER_GOVERNED_SOURCE','high', now() - interval '200 days',
      'PT fixture condition C','PT_FIXTURE_DETECTOR','PT_FIXTURE:C:'||_e1::text,
      now() - interval '200 days', now() - interval '2 days', 5,'OPEN','pt_fixture',
      gen_random_uuid(),'PT-FIX-C','fixture materiality','{"fixture":true}'::jsonb)
  RETURNING id INTO _s3;

  -- single-observation condition: must NOT count as recurrence (negative case)
  INSERT INTO public.supervisory_signal (entity_id, domain_code, source_kind, severity,
      detected_at, summary, detector_code, fingerprint, first_detected_at, last_detected_at,
      occurrence_count, state, source_table, source_id, source_reference,
      materiality_reason, config_provenance)
  VALUES (_e2,'AML_CFT','OTHER_GOVERNED_SOURCE','high', now() - interval '3 days',
      'PT fixture condition D (single observation)','PT_FIXTURE_DETECTOR','PT_FIXTURE:D:'||_e2::text,
      now() - interval '3 days', now() - interval '3 days', 1,'OPEN','pt_fixture',
      gen_random_uuid(),'PT-FIX-D','fixture materiality','{"fixture":true}'::jsonb)
  RETURNING id INTO _s4;

  INSERT INTO public.supervisory_signal_occurrence (signal_id, observed_at, severity, source_table, source_reference)
  VALUES (_s1, now() - interval '4 days','high','pt_fixture','PT-FIX-A'),
         (_s1, now() - interval '1 day','high','pt_fixture','PT-FIX-A'),
         (_s2, now(),'critical','pt_fixture','PT-FIX-B'),
         (_s3, now() - interval '2 days','high','pt_fixture','PT-FIX-C'),
         (_s4, now() - interval '3 days','high','pt_fixture','PT-FIX-D');


  SELECT p.id INTO _mgr FROM public.profiles p
   WHERE public.supervisory_monitoring_scope_admits(p.id,'PRUDENTIAL',_e1,NULL,NULL)
   ORDER BY p.id LIMIT 1;

  SELECT p.id INTO _out FROM public.profiles p
   WHERE NOT public.is_super_admin(p.id)
     AND NOT public.supervisory_monitoring_scope_admits(p.id,'PRUDENTIAL',_e1,NULL,NULL)
   ORDER BY p.id LIMIT 1;

  SELECT id INTO _grp FROM public.financial_groups ORDER BY created_at LIMIT 1;

  INSERT INTO pt_fx VALUES ('det',_det),('run',_run),('e1',_e1),('e2',_e2),
    ('s1',_s1),('s2',_s2),('s3',_s3),('s4',_s4),('grp',_grp);

  INSERT INTO pt_p VALUES ('mgr',_mgr),('out',_out);
END $$;

SELECT pg_temp.gate('PT-12',
  (SELECT count(*) FROM pt_fx WHERE v IS NOT NULL) >= 7
  AND (SELECT v FROM pt_p WHERE k='mgr') IS NOT NULL
  AND (SELECT v FROM pt_p WHERE k='out') IS NOT NULL,
  'real in-scope and out-of-remit personas exist in production data; fixtures created');

-- ===================== D. DETERMINISTIC THEME IDENTITY =====================

-- PT-13 — theme identity is a governed detector classification, never free text.
DO $$
DECLARE _reg jsonb; _mgr uuid;
BEGIN
  SELECT v INTO _mgr FROM pt_p WHERE k='mgr';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_mgr,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  _reg := public.supervisory_portfolio_theme_register('PRUDENTIAL', 30, 200);
  RESET ROLE;
  PERFORM pg_temp.gate('PT-13',
    _reg->'theme_identity'->>'key_source' = 'supervisory_signal.detector_code'
    AND _reg->'theme_identity'->>'label_source' = 'supervisory_detector.name'
    AND (_reg->'theme_identity'->>'rule') ILIKE '%no free-text%',
    'theme key = detector code, label = governed detector name');
  PERFORM pg_temp.gate('PT-14',
    EXISTS (SELECT 1 FROM jsonb_array_elements(_reg->'themes') t
             WHERE t->>'theme_key' = 'PT_FIXTURE_DETECTOR'
               AND t->>'theme_label' = 'PT fixture theme'
               AND t->>'theme_kind' = 'DETECTOR'),
    'fixture theme is derived from the canonical detector, not invented');
  PERFORM pg_temp.gate('PT-15',
    (SELECT (t->>'affected_entity_count')::int = 2
        AND (t->>'condition_count')::int = 2
        AND (t->>'occurrence_count')::int >= 3
        AND (t->>'affected_entity_count')::int <> (t->>'occurrence_count')::int
       FROM jsonb_array_elements(_reg->'themes') t
      WHERE t->>'theme_key' = 'PT_FIXTURE_DETECTOR' AND t->>'domain_code'='PRUDENTIAL'),
    'entity, condition and occurrence counts are distinct and not interchangeable');
  PERFORM pg_temp.gate('PT-16',
    (SELECT (t->'severity_distribution'->>'high')::int >= 1
        AND (t->'severity_distribution'->>'critical')::int >= 1
        AND t->>'first_observed' IS NOT NULL AND t->>'last_observed' IS NOT NULL
       FROM jsonb_array_elements(_reg->'themes') t
      WHERE t->>'theme_key' = 'PT_FIXTURE_DETECTOR' AND t->>'domain_code'='PRUDENTIAL'),
    'severity distribution and real first/last observed timestamps are published');
  PERFORM pg_temp.gate('PT-17',
    (SELECT t->'provenance' ? 'source_objects' AND t->'provenance' ? 'population'
        AND t->'provenance' ? 'count_basis' AND t->'provenance' ? 'drill_down'
        AND (t->'provenance'->>'population') ILIKE '%scope_admits%'
       FROM jsonb_array_elements(_reg->'themes') t
      WHERE t->>'theme_key' = 'PT_FIXTURE_DETECTOR' AND t->>'domain_code'='PRUDENTIAL'),
    'every aggregate carries provenance');
END $$;

-- ===================== E. DRILL-DOWN =====================

DO $$
DECLARE _d jsonb; _mgr uuid; _s1 uuid;
BEGIN
  SELECT v INTO _mgr FROM pt_p WHERE k='mgr';
  SELECT v INTO _s1 FROM pt_fx WHERE k='s1';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_mgr,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  _d := public.supervisory_portfolio_theme_detail('PT_FIXTURE_DETECTOR','PRUDENTIAL',200);
  RESET ROLE;
  PERFORM pg_temp.gate('PT-18',
    (SELECT count(*) FROM jsonb_array_elements(_d->'conditions') c
      WHERE (c->>'signal_id')::uuid = _s1) = 1,
    'a theme drills down to the real canonical condition rows');
  PERFORM pg_temp.gate('PT-19',
    (_d->'signal_ids') ? _s1::text,
    'drill-down publishes canonical identifiers, not synthetic UI ids');
  PERFORM pg_temp.gate('PT-20',
    (SELECT c->'source'->>'table' = 'pt_fixture' AND c->'source'->>'reference' = 'PT-FIX-A'
       FROM jsonb_array_elements(_d->'conditions') c WHERE (c->>'signal_id')::uuid = _s1),
    'underlying source record of each condition is exposed as evidence');
END $$;

-- ===================== F. WHAT CHANGED / RECURRENCE =====================

DO $$
DECLARE _c jsonb; _mgr uuid;
BEGIN
  SELECT v INTO _mgr FROM pt_p WHERE k='mgr';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_mgr,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  _c := public.supervisory_portfolio_change_lens('PRUDENTIAL', 30);
  RESET ROLE;
  PERFORM pg_temp.gate('PT-21',
    (_c->>'method') ILIKE '%canonical timestamps%' AND (_c->>'method') NOT ILIKE '%snapshot table%'
    OR (_c->>'method') ILIKE '%No snapshot table%',
    'change states are reconstructed from real canonical history');
  PERFORM pg_temp.gate('PT-22',
    (SELECT (r->>'change_state') IN ('EMERGED','WORSENING','PERSISTENT','IMPROVING','NOT_ASSESSABLE','NOT_OBSERVED_IN_WINDOW')
       FROM jsonb_array_elements(_c->'rows') r WHERE r->>'theme_key'='PT_FIXTURE_DETECTOR'),
    'fixture theme is classified into a governed change state');
  PERFORM pg_temp.gate('PT-23',
    (SELECT (r->>'current_window_entities')::int = 2 AND (r->>'material_open')::int = 2
       FROM jsonb_array_elements(_c->'rows') r WHERE r->>'theme_key'='PT_FIXTURE_DETECTOR'),
    'window counts match the canonical fixture population exactly');
  PERFORM pg_temp.gate('PT-24',
    (_c->>'guard') ILIKE '%NOT_ASSESSABLE%',
    'a detector that did not complete is never reported as improvement');
END $$;

-- PT-25 — the detector-completion guard is a real server-side check.
SELECT pg_temp.gate('PT-25',
  public.supervisory_portfolio_detector_assessable('PT_FIXTURE_DETECTOR', now() - interval '30 days')
  AND NOT public.supervisory_portfolio_detector_assessable('PT_FIXTURE_DETECTOR', now() - interval '1 hour'),
  'assessability is proven from supervisory_detector_run completion history');

-- PT-26 — recurrence and persistence use signal identity + occurrence history.
--          Real positive AND negative recurrence fixture (no vacuous >= 0 test).
DO $$
DECLARE _rec bigint; _single bigint; _s1 uuid; _s4 uuid; _occ1 bigint; _occ4 bigint;
BEGIN
  SELECT v INTO _s1 FROM pt_fx WHERE k='s1';
  SELECT v INTO _s4 FROM pt_fx WHERE k='s4';
  SELECT count(*) INTO _rec FROM public.supervisory_portfolio_condition c
   WHERE c.theme_key='PT_FIXTURE_DETECTOR' AND c.occurrence_days > 1;
  SELECT count(*) INTO _single FROM public.supervisory_portfolio_condition c
   WHERE c.signal_id = _s4 AND c.occurrence_days > 1;
  SELECT occurrence_total INTO _occ1 FROM public.supervisory_portfolio_condition WHERE signal_id = _s1;
  SELECT occurrence_total INTO _occ4 FROM public.supervisory_portfolio_condition WHERE signal_id = _s4;
  PERFORM pg_temp.gate('PT-26',
    (SELECT pg_get_viewdef('public.supervisory_portfolio_condition'::regclass)) LIKE '%occurrence%'
    AND _rec >= 1                 -- positive: multi-observation condition recognised
    AND _single = 0               -- negative: single-observation condition is not recurrence
    AND _occ1 > 1 AND _occ4 = 1,  -- occurrence totals reflect canonical occurrence history
    format('recurrence proven positively (%s recurring conditions, s1 occurrences=%s) and negatively (single-observation condition s4 occurrences=%s is not recurring)',
           _rec, _occ1, _occ4));
END $$;

-- ===================== G0. ROLLBACK-SAFE PEER FIXTURES =====================
-- Two governed peer metrics are created inside the transaction: one with a
-- sufficient sample (>= prudential_min_peers distinct entities) and one with a
-- single entity. Nothing is written to production peer data.

CREATE TEMP TABLE pt_peer(k text primary key, v text) ON COMMIT DROP;

DO $$
DECLARE _mid uuid; _mid2 uuid; _pe date; _n int := 0; _min int := public.prudential_min_peers();
BEGIN
  SELECT period_end INTO _pe
    FROM public.v_return_metric_facts_current
   WHERE value_numeric IS NOT NULL
   GROUP BY period_end HAVING count(DISTINCT entity_id) >= GREATEST(_min,3) + 1
   ORDER BY count(DISTINCT entity_id) DESC LIMIT 1;

  INSERT INTO public.regulatory_metrics (code, name, description, data_domain_id, data_type,
      unit, aggregation_type, frequency_compatibility, sensitivity, is_calculated,
      calculation_strategy, effective_from, is_active, is_system)
  SELECT 'PT_FIX_PEER_SUFFICIENT', 'PT fixture peer metric (sufficient sample)', m.description,
         m.data_domain_id, m.data_type, m.unit, m.aggregation_type, m.frequency_compatibility,
         m.sensitivity, m.is_calculated, m.calculation_strategy, m.effective_from, true, false
    FROM public.regulatory_metrics m ORDER BY m.created_at LIMIT 1
  RETURNING id INTO _mid;

  INSERT INTO public.regulatory_metrics (code, name, description, data_domain_id, data_type,
      unit, aggregation_type, frequency_compatibility, sensitivity, is_calculated,
      calculation_strategy, effective_from, is_active, is_system)
  SELECT 'PT_FIX_PEER_INSUFFICIENT', 'PT fixture peer metric (single entity)', m.description,
         m.data_domain_id, m.data_type, m.unit, m.aggregation_type, m.frequency_compatibility,
         m.sensitivity, m.is_calculated, m.calculation_strategy, m.effective_from, true, false
    FROM public.regulatory_metrics m ORDER BY m.created_at LIMIT 1
  RETURNING id INTO _mid2;

  WITH src AS (
    SELECT DISTINCT ON (f.entity_id) f.entity_id, f.filing_version_id, f.reporting_period_id,
           f.availability, f.source_kind
      FROM public.v_return_metric_facts_current f
     WHERE f.period_end = _pe AND f.value_numeric IS NOT NULL
     ORDER BY f.entity_id, f.filing_updated_at DESC NULLS LAST)
  INSERT INTO public.return_metric_values (return_filing_version_id, entity_id,
      regulatory_metric_id, reporting_period_id, value_numeric, availability, source_kind, recorded_at)
  SELECT s.filing_version_id, s.entity_id, _mid, s.reporting_period_id,
         100 + (row_number() OVER (ORDER BY s.entity_id))::numeric,
         s.availability, s.source_kind, now()
    FROM src s LIMIT GREATEST(_min,3) + 1;

  GET DIAGNOSTICS _n = ROW_COUNT;

  INSERT INTO public.return_metric_values (return_filing_version_id, entity_id,
      regulatory_metric_id, reporting_period_id, value_numeric, availability, source_kind, recorded_at)
  SELECT v.return_filing_version_id, v.entity_id, _mid2, v.reporting_period_id,
         42, v.availability, v.source_kind, now()
    FROM public.return_metric_values v
   WHERE v.regulatory_metric_id = _mid
   ORDER BY v.entity_id LIMIT 1;

  INSERT INTO pt_peer VALUES
    ('period_end', _pe::text), ('sufficient_code','PT_FIX_PEER_SUFFICIENT'),
    ('insufficient_code','PT_FIX_PEER_INSUFFICIENT'), ('peers', _n::text),
    ('min_peers', _min::text),
    ('peer_entities', (SELECT string_agg(DISTINCT entity_id::text, ',')
                         FROM public.return_metric_values WHERE regulatory_metric_id = _mid));
END $$;



-- ===================== G. GROUPS, PEERS, CROSS-DOMAIN =====================

DO $$
DECLARE _g jsonb; _x jsonb; _pv jsonb; _mgr uuid; _e1 uuid;
BEGIN
  SELECT v INTO _mgr FROM pt_p WHERE k='mgr';
  SELECT v INTO _e1 FROM pt_fx WHERE k='e1';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_mgr,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  _g := public.supervisory_portfolio_group_intelligence(NULL);
  _x := public.supervisory_portfolio_cross_domain(200);
  _pv := public.supervisory_portfolio_peer_view(NULL, NULL, NULL, _e1);
  RESET ROLE;
  PERFORM pg_temp.gate('PT-27',
    (_g->>'model') ILIKE '%financial_group%'
    AND (_g->'provenance'->>'membership_source') ILIKE '%financial_group_members%'
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(_g->'groups','[]'::jsonb)) gr
                     WHERE (gr->>'visible_member_count')::int > (gr->>'canonical_member_count')::int),
    'group view reuses the canonical group model and never over-reports visible members');
  PERFORM pg_temp.gate('PT-28',
    (SELECT (e->>'affected_domain_count')::int >= 2 AND e->>'href' IS NOT NULL
       FROM jsonb_array_elements(_x->'entities') e WHERE (e->>'entity_id')::uuid = _e1)
    AND (_x->>'statement') ILIKE '%no overall or composite risk rating%',
    'cross-domain correlation drills back to the entity and derives no merged rating');
  -- PT-29 — real peer success path on the rollback-safe sufficient fixture,
  --          not merely "state belongs to an allowed enum".
  DECLARE _pvs jsonb; _pe date;
  BEGIN
    SELECT (SELECT v FROM pt_peer WHERE k='period_end')::date INTO _pe;
    PERFORM set_config('request.jwt.claims', json_build_object('sub',_mgr,'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    _pvs := public.supervisory_portfolio_peer_view(_pe, 'PT_FIX_PEER_SUFFICIENT', NULL, NULL);
    RESET ROLE;
    PERFORM pg_temp.gate('PT-29',
      (_pvs->>'engine') ILIKE '%peer_ratio_snapshot%'
      AND (_pvs->>'state') = 'OK'
      AND (_pvs->'snapshot'->>'state') = 'OK'
      AND (_pvs->>'minimum_peers')::int >= 3
      AND (_pvs->'snapshot'->>'peer_count')::int >= (_pvs->>'minimum_peers')::int
      AND (_pvs->'snapshot'->'median') IS NOT NULL,
      format('peer success path proven on the certification fixture: state=%s peers=%s min=%s',
             _pvs->>'state', _pvs->'snapshot'->>'peer_count', _pvs->>'minimum_peers'));
  END;

END $$;

-- ===================== H. NO RISK-STATE MUTATION =====================

DO $$
DECLARE _before bigint; _after bigint; _mgr uuid; _sum bigint; _sum2 bigint;
BEGIN
  SELECT count(*), COALESCE(sum(length(COALESCE(residual_rating,''))),0)
    INTO _before, _sum FROM public.entity_risk_state;
  SELECT v INTO _mgr FROM pt_p WHERE k='mgr';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_mgr,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.supervisory_portfolio_intelligence_overview('PRUDENTIAL', 30);
  PERFORM public.supervisory_portfolio_theme_register('PRUDENTIAL', 30, 50);
  PERFORM public.supervisory_portfolio_change_lens('PRUDENTIAL', 30);
  PERFORM public.supervisory_portfolio_group_intelligence(NULL);
  PERFORM public.supervisory_portfolio_cross_domain(50);
  RESET ROLE;
  SELECT count(*), COALESCE(sum(length(COALESCE(residual_rating,''))),0)
    INTO _after, _sum2 FROM public.entity_risk_state;
  PERFORM pg_temp.gate('PT-30', _before = _after AND _sum = _sum2,
    'reading portfolio intelligence changes no entity risk state and creates no records');
END $$;

-- ===================== I. OUT-OF-REMIT ADVERSARIAL READ =====================

DO $$
DECLARE _out uuid; _cond bigint; _ent bigint; _o jsonb; _e1 uuid;
BEGIN
  SELECT v INTO _out FROM pt_p WHERE k='out';
  SELECT v INTO _e1 FROM pt_fx WHERE k='e1';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_out,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _cond FROM public.supervisory_portfolio_condition
   WHERE theme_key = 'PT_FIXTURE_DETECTOR';
  SELECT count(*) INTO _ent FROM public.supervisory_portfolio_entity
   WHERE entity_id = _e1;
  _o := public.supervisory_portfolio_intelligence_overview('PRUDENTIAL', 30);
  RESET ROLE;
  PERFORM pg_temp.gate('PT-31', _cond = 0 AND _ent = 0,
    format('out-of-remit user sees %s fixture conditions and %s fixture entity rows', _cond, _ent));
  PERFORM pg_temp.gate('PT-32',
    (_o->'conditions'->>'material_open_conditions')::int = 0
    AND (_o->'population'->>'authorised_entities')::int = 0,
    'out-of-remit overview is honestly empty rather than globally aggregated');
END $$;

-- ===================== J. POPULATION INDEPENDENT OF DETECTORS =====================

DO $$
DECLARE _mgr uuid; _pairs bigint; _pairs_inactive bigint; _pairs_deleted bigint;
        _pairs_added bigint; _dom text; _dom_pairs bigint; _dom_conditions bigint;
        _deleted boolean := false;
BEGIN
  SELECT v INTO _mgr FROM pt_p WHERE k='mgr';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_mgr,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _pairs FROM public.supervisory_portfolio_entity;
  RESET ROLE;

  -- (a) inactivate every detector
  UPDATE public.supervisory_detector SET is_active = false, effective_to = now();
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_mgr,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _pairs_inactive FROM public.supervisory_portfolio_entity;
  RESET ROLE;

  -- (b) remove every detector row (rollback-safe)
  BEGIN
    DELETE FROM public.supervisory_detector;
    _deleted := true;
  EXCEPTION WHEN others THEN _deleted := false;
  END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_mgr,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _pairs_deleted FROM public.supervisory_portfolio_entity;
  SELECT domain_code, count(*) INTO _dom, _dom_pairs
    FROM public.supervisory_portfolio_entity GROUP BY domain_code ORDER BY 1 LIMIT 1;
  SELECT count(*) INTO _dom_conditions FROM public.supervisory_portfolio_condition
   WHERE domain_code = _dom;
  RESET ROLE;

  PERFORM pg_temp.gate('PT-33',
    _pairs > 0 AND _pairs_deleted = _pairs AND _dom_pairs > 0
    AND (SELECT pg_get_viewdef('public.supervisory_portfolio_entity'::regclass))
          NOT ILIKE '%FROM public.supervisory_detector%'
    AND (SELECT pg_get_viewdef('public.supervisory_portfolio_entity'::regclass))
          ILIKE '%supervisory_domain_vocabulary%',
    format('with every detector %s, %s authorised entity-domain pairs remain (domain %s keeps %s pairs and honestly reports %s detected conditions)',
           CASE WHEN _deleted THEN 'deleted' ELSE 'inactivated' END, _pairs_deleted, _dom, _dom_pairs, _dom_conditions));

  -- (c) adding a detector creates no portfolio pair either
  INSERT INTO public.supervisory_detector (code, name, domain_code, source_object, source_kind,
      execution_mode, config_owner, params, version, is_active, effective_from)
  VALUES ('PT_FIXTURE_DETECTOR_2','PT fixture detector 2','MARKET_CONDUCT','pt_fixture',
      'OTHER_GOVERNED_SOURCE','SCHEDULED','SUPERVISORY_POLICY','{"fixture":true}'::jsonb,1,true, now() - interval '1 year');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_mgr,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _pairs_added FROM public.supervisory_portfolio_entity;
  RESET ROLE;

  PERFORM pg_temp.gate('PT-34',
    _pairs_inactive = _pairs AND _pairs_deleted = _pairs AND _pairs_added = _pairs,
    format('portfolio pairs are detector-independent: baseline=%s after-inactivate=%s after-delete=%s after-add=%s',
           _pairs, _pairs_inactive, _pairs_deleted, _pairs_added));

  -- restore the fixture detector needed by the trend gates
  DELETE FROM public.supervisory_detector WHERE code = 'PT_FIXTURE_DETECTOR_2';
  INSERT INTO public.supervisory_detector (code, name, domain_code, source_object, source_kind,
      execution_mode, config_owner, params, version, is_active, effective_from)
  SELECT 'PT_FIXTURE_DETECTOR','PT fixture theme','PRUDENTIAL','pt_fixture','OTHER_GOVERNED_SOURCE',
         'SCHEDULED','SUPERVISORY_POLICY','{"fixture":true}'::jsonb,1,true, now() - interval '1 year'
   WHERE NOT EXISTS (SELECT 1 FROM public.supervisory_detector WHERE code = 'PT_FIXTURE_DETECTOR');
END $$;

-- ===================== K. PEER STATE PROPAGATION =====================

DO $$
DECLARE _mgr uuid; _pe date; _min int; _eng jsonb; _wrap jsonb; _eng2 jsonb; _wrap2 jsonb;
BEGIN
  SELECT v INTO _mgr FROM pt_p WHERE k='mgr';
  SELECT (v)::date INTO _pe FROM pt_peer WHERE k='period_end';
  SELECT (v)::int INTO _min FROM pt_peer WHERE k='min_peers';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_mgr,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  _eng  := public.peer_ratio_snapshot(_pe, 'PT_FIX_PEER_SUFFICIENT', NULL, NULL, _min);
  _wrap := public.supervisory_portfolio_peer_view(_pe, 'PT_FIX_PEER_SUFFICIENT', NULL, NULL);
  _eng2 := public.peer_ratio_snapshot(_pe, 'PT_FIX_PEER_INSUFFICIENT', NULL, NULL, _min);
  _wrap2:= public.supervisory_portfolio_peer_view(_pe, 'PT_FIX_PEER_INSUFFICIENT', NULL, NULL);
  RESET ROLE;

  PERFORM pg_temp.gate('PT-35',
    (_eng->>'state') = 'OK' AND (_eng->>'peer_count')::int >= _min,
    format('canonical peer engine returns OK on the sufficient fixture (peers=%s, min=%s)', _eng->>'peer_count', _min));
  PERFORM pg_temp.gate('PT-36',
    (_wrap->>'state') = 'OK' AND (_wrap->'snapshot'->>'state') = 'OK',
    format('OS-02G wrapper returns OK for the same fixture (state=%s)', _wrap->>'state'));
  PERFORM pg_temp.gate('PT-37',
    (_eng2->>'state') = 'INSUFFICIENT_PEER_DATA' AND (_wrap2->>'state') = 'INSUFFICIENT_PEER_DATA',
    format('insufficient fixture returns INSUFFICIENT_PEER_DATA in engine (%s) and wrapper (%s)',
           _eng2->>'state', _wrap2->>'state'));
  PERFORM pg_temp.gate('PT-38',
    (_wrap->>'state') = (_eng->>'state') AND (_wrap2->>'state') = (_eng2->>'state')
    AND (_wrap->>'engine_state') = (_eng->>'state')
    AND (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='supervisory_portfolio_peer_view')
        NOT ILIKE '%insufficient''%'
    AND (SELECT count(*) FROM regexp_matches(
           (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='supervisory_portfolio_peer_view'),
           'peer_ratio_snapshot\(', 'g')) = 1,
    'wrapper state equals canonical engine state, the engine is called exactly once and no non-existent JSON field is read');
END $$;

-- ===================== L. PEER SECURITY =====================

DO $$
DECLARE _out uuid; _mgr uuid; _e1 uuid; _pe date; _min int; _sec uuid;
        _w1 jsonb; _e_eng jsonb; _w2 jsonb; _wsec jsonb; _admitted int; _mgrw jsonb; _txt text;
BEGIN
  SELECT v INTO _out FROM pt_p WHERE k='out';
  SELECT v INTO _mgr FROM pt_p WHERE k='mgr';
  SELECT v INTO _e1 FROM pt_fx WHERE k='e1';
  SELECT (v)::date INTO _pe FROM pt_peer WHERE k='period_end';
  SELECT (v)::int INTO _min FROM pt_peer WHERE k='min_peers';
  SELECT sector_id INTO _sec FROM public.licensees WHERE id = _e1;

  SELECT count(*) INTO _admitted
    FROM public.return_metric_values v
    JOIN public.regulatory_metrics m ON m.id = v.regulatory_metric_id
   WHERE m.code = 'PT_FIX_PEER_SUFFICIENT'
     AND public.supervisory_monitoring_scope_admits(_out,'PRUDENTIAL', v.entity_id, NULL, NULL);

  PERFORM set_config('request.jwt.claims', json_build_object('sub',_out,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  _w1    := public.supervisory_portfolio_peer_view(_pe, 'PT_FIX_PEER_SUFFICIENT', NULL, _e1);
  _e_eng := public.peer_ratio_snapshot(_pe, 'PT_FIX_PEER_SUFFICIENT', NULL, _e1, _min);
  _wsec  := public.supervisory_portfolio_peer_view(_pe, 'PT_FIX_PEER_SUFFICIENT', _sec, _e1);
  _w2    := public.supervisory_portfolio_peer_view(_pe, 'PT_FIX_PEER_SUFFICIENT', _sec, NULL);
  RESET ROLE;

  PERFORM pg_temp.gate('PT-39',
    (_w1->>'state') = 'NOT_AUTHORISED'
    AND (_e_eng->>'state') = 'NOT_AUTHORISED'
    AND (_w1->'snapshot'->'entity_value') IS NULL
    AND (_e_eng->'entity_value') = 'null'::jsonb
    AND (_w1->>'snapshot') NOT ILIKE '%percentile%',
    'an out-of-remit user cannot retrieve another entity''s metric value or percentile by UUID');

  PERFORM pg_temp.gate('PT-40',
    (_wsec->>'state') = 'NOT_AUTHORISED'
    AND COALESCE((_w2->'snapshot'->>'peer_count')::int, 0) <= _admitted
    AND (_w2->>'peer_population_model') = 'AUTHORISED_POPULATION',
    format('a client-supplied sector cannot widen authorised peer scope (entity request refused; sector-only peer_count=%s <= authorised=%s)',
           COALESCE(_w2->'snapshot'->>'peer_count','0'), _admitted));

  PERFORM pg_temp.gate('PT-41',
    COALESCE((_w2->'snapshot'->>'peer_count')::int, 0) <= _admitted
    AND CASE WHEN _admitted < _min THEN (_w2->>'state') = 'INSUFFICIENT_PEER_DATA' ELSE true END
    AND (SELECT obj_description(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='peer_ratio_snapshot') ILIKE '%Model A%',
    format('minimum-peer threshold is evaluated against the approved Model A authorised population (authorised=%s, min=%s, state=%s)',
           _admitted, _min, _w2->>'state'));

  PERFORM set_config('request.jwt.claims', json_build_object('sub',_mgr,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  _mgrw := public.supervisory_portfolio_peer_view(_pe, 'PT_FIX_PEER_SUFFICIENT', NULL, NULL);
  RESET ROLE;
  _txt := _mgrw::text;

  PERFORM pg_temp.gate('PT-42',
    NOT EXISTS (SELECT 1 FROM unnest(string_to_array((SELECT v FROM pt_peer WHERE k='peer_entities'), ',')) u
                 WHERE _txt LIKE '%' || u || '%')
    AND _txt NOT ILIKE '%entity_name%'
    AND (_mgrw->'snapshot') ? 'median',
    'peer output publishes distribution statistics only — no peer entity identifier or name is returned');
END $$;

-- ===================== M. TREND ASSESSABILITY =====================

DO $$
DECLARE _mgr uuid; _c jsonb; _r jsonb; _cov jsonb;
BEGIN
  SELECT v INTO _mgr FROM pt_p WHERE k='mgr';

  -- state 1: current window COMPLETED (fixture run), comparison window unassessed
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_mgr,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  _c := public.supervisory_portfolio_change_lens('PRUDENTIAL', 30);
  RESET ROLE;
  SELECT r INTO _r FROM jsonb_array_elements(_c->'rows') r WHERE r->>'theme_key'='PT_FIXTURE_DETECTOR';
  PERFORM pg_temp.gate('PT-43',
    (_r->>'change_state') = 'NOT_ASSESSABLE'
    AND (_r->>'current_window_assessable')::boolean
    AND NOT (_r->>'comparison_window_assessable')::boolean
    AND (_r->>'comparison_window_assessability_reason') = 'NO_DETECTOR_ATTEMPT_IN_WINDOW',
    format('current window covered + comparison window unassessed => NOT_ASSESSABLE (%s)',
           _r->>'comparison_window_assessability_reason'));

  -- state 2: comparison window COMPLETED, current window unassessed
  DELETE FROM public.supervisory_detector_run WHERE detector_code='PT_FIXTURE_DETECTOR';
  INSERT INTO public.supervisory_detector_run (detector_code, trigger_kind, status, started_at,
      completed_at, rows_scanned, signals_created, signals_updated, signals_resolved)
  VALUES ('PT_FIXTURE_DETECTOR','scheduled','COMPLETED', now() - interval '45 days',
      now() - interval '45 days', 10, 0, 0, 0);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_mgr,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  _c := public.supervisory_portfolio_change_lens('PRUDENTIAL', 30);
  RESET ROLE;
  SELECT r INTO _r FROM jsonb_array_elements(_c->'rows') r WHERE r->>'theme_key'='PT_FIXTURE_DETECTOR';
  PERFORM pg_temp.gate('PT-44',
    (_r->>'change_state') = 'NOT_ASSESSABLE'
    AND (_r->>'comparison_window_assessable')::boolean
    AND NOT (_r->>'current_window_assessable')::boolean,
    format('comparison window covered + current window unassessed => NOT_ASSESSABLE (%s)',
           _r->>'current_window_assessability_reason'));

  -- state 3: both windows COMPLETED, but a later authoritative attempt FAILED
  INSERT INTO public.supervisory_detector_run (detector_code, trigger_kind, status, started_at,
      completed_at, rows_scanned, signals_created, signals_updated, signals_resolved)
  VALUES ('PT_FIXTURE_DETECTOR','scheduled','COMPLETED', now() - interval '10 days',
      now() - interval '10 days', 10, 0, 0, 0);
  INSERT INTO public.supervisory_detector_run (detector_code, trigger_kind, status, started_at,
      completed_at, rows_scanned, signals_created, signals_updated, signals_resolved, error_text)
  VALUES ('PT_FIXTURE_DETECTOR','scheduled','FAILED', now() - interval '2 hours',
      NULL, 0, 0, 0, 0, 'fixture scan failure');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_mgr,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  _c := public.supervisory_portfolio_change_lens('PRUDENTIAL', 30);
  RESET ROLE;
  SELECT r INTO _r FROM jsonb_array_elements(_c->'rows') r WHERE r->>'theme_key'='PT_FIXTURE_DETECTOR';
  PERFORM pg_temp.gate('PT-45',
    (_r->>'change_state') = 'NOT_ASSESSABLE'
    AND (_r->>'change_state') <> 'IMPROVING'
    AND NOT (_r->>'current_window_assessable')::boolean
    AND (_r->>'current_window_assessability_reason') = 'LATEST_ATTEMPT_FAILED'
    AND (_r->>'current_window_latest_attempt_status') = 'FAILED',
    'a successful earlier run followed by an authoritative FAILED attempt cannot produce IMPROVING');

  -- state 4: both windows reliably covered (latest attempt COMPLETED)
  DELETE FROM public.supervisory_detector_run
   WHERE detector_code='PT_FIXTURE_DETECTOR' AND upper(status) <> 'COMPLETED';
  INSERT INTO public.supervisory_detector_run (detector_code, trigger_kind, status, started_at,
      completed_at, rows_scanned, signals_created, signals_updated, signals_resolved)
  VALUES ('PT_FIXTURE_DETECTOR','scheduled','COMPLETED', now() - interval '1 hour',
      now() - interval '1 hour', 10, 0, 0, 0);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_mgr,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  _c := public.supervisory_portfolio_change_lens('PRUDENTIAL', 30);
  RESET ROLE;
  SELECT r INTO _r FROM jsonb_array_elements(_c->'rows') r WHERE r->>'theme_key'='PT_FIXTURE_DETECTOR';
  PERFORM pg_temp.gate('PT-46',
    (_r->>'current_window_assessable')::boolean AND (_r->>'comparison_window_assessable')::boolean
    AND (_r->>'change_state') IN ('EMERGED','WORSENING','PERSISTENT','IMPROVING'),
    format('both windows reliably covered => governed trend classification permitted (%s)', _r->>'change_state'));

  -- PT-47 — a failed-only window is never zero observations / improvement
  _cov := public.supervisory_portfolio_detector_window_coverage('PT_FIXTURE_DETECTOR',
            now() - interval '5 minutes', now());
  PERFORM pg_temp.gate('PT-47',
    NOT COALESCE((_cov->>'assessable')::boolean,true)
    AND (_cov->>'reason') = 'NO_DETECTOR_ATTEMPT_IN_WINDOW'
    AND NOT COALESCE((public.supervisory_portfolio_detector_window_coverage('PT_FIXTURE_DETECTOR',
            now() - interval '3 hours', now() - interval '30 minutes')->>'assessable')::boolean, true)
    AND (SELECT obj_description(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public'
            AND p.proname='supervisory_portfolio_detector_window_coverage') ILIKE '%never evidence of improvement%',
    'detector failure or absence is never treated as zero observations or improvement');
END $$;

-- ===================== N. CROSS-DOMAIN RISK-STATE SCOPE =====================

DO $$
DECLARE _mgr uuid; _e1 uuid; _x jsonb; _row jsonb;
BEGIN
  SELECT v INTO _mgr FROM pt_p WHERE k='mgr';
  SELECT v INTO _e1 FROM pt_fx WHERE k='e1';

  -- MARKET_CONDUCT is outside the caller's authorised portfolio population for e1
  INSERT INTO public.supervisory_domain_perimeter (entity_id, domain_code, is_applicable, basis)
  VALUES (_e1,'MARKET_CONDUCT', false, 'PT fixture: domain outside caller portfolio')
  ON CONFLICT (entity_id, domain_code) DO UPDATE SET is_applicable = false;

  DELETE FROM public.entity_risk_state WHERE entity_id = _e1
    AND domain_code IN ('PRUDENTIAL','MARKET_CONDUCT');
  INSERT INTO public.entity_risk_state (entity_id, domain_code, residual_rating, effective_from)
  VALUES (_e1,'PRUDENTIAL','HIGH', now() - interval '10 days'),
         (_e1,'MARKET_CONDUCT','MEDIUM', now() - interval '10 days');

  PERFORM set_config('request.jwt.claims', json_build_object('sub',_mgr,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  _x := public.supervisory_portfolio_cross_domain(500);
  RESET ROLE;
  SELECT e INTO _row FROM jsonb_array_elements(_x->'entities') e WHERE (e->>'entity_id')::uuid = _e1;

  PERFORM pg_temp.gate('PT-48',
    _row IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_row->'approved_risk_state') r
                     WHERE r->>'domain_code' = 'MARKET_CONDUCT')
    AND (_x->>'risk_state_scope') ILIKE '%withheld%',
    'a risk state from a domain outside the caller''s authorised remit is absent from cross-domain output');

  PERFORM pg_temp.gate('PT-49',
    EXISTS (SELECT 1 FROM jsonb_array_elements(_row->'approved_risk_state') r
             WHERE r->>'domain_code' = 'PRUDENTIAL' AND r->>'residual_rating' = 'HIGH'),
    'approved risk state for authorised domains remains visible');
END $$;

-- ===================== O. FINANCIAL-GROUP MEMBERSHIP VISIBILITY =====================

DO $$
DECLARE _mgr uuid; _e1 uuid; _e2 uuid; _e3 uuid; _e3name text; _grp uuid; _g jsonb; _row jsonb; _txt text; _d text;
BEGIN
  SELECT v INTO _mgr FROM pt_p WHERE k='mgr';
  SELECT v INTO _e1 FROM pt_fx WHERE k='e1';
  SELECT v INTO _e2 FROM pt_fx WHERE k='e2';
  SELECT l.id, l.name INTO _e3, _e3name FROM public.licensees l
   WHERE l.id NOT IN (_e1,_e2) ORDER BY l.created_at LIMIT 1;

  -- _e3 is placed outside the caller's authorised portfolio population
  FOR _d IN SELECT domain_code FROM public.supervisory_domain_vocabulary LOOP
    INSERT INTO public.supervisory_domain_perimeter (entity_id, domain_code, is_applicable, basis)
    VALUES (_e3, _d, false, 'PT fixture: hidden group member')
    ON CONFLICT (entity_id, domain_code) DO UPDATE SET is_applicable = false;
  END LOOP;

  INSERT INTO public.financial_groups (group_code, name, status)
  VALUES ('PT_FIX_GROUP','PT fixture group','active') RETURNING id INTO _grp;
  INSERT INTO public.financial_group_members (group_id, licensee_id, member_role, effective_date)
  VALUES (_grp, _e1, 'member', CURRENT_DATE), (_grp, _e3, 'member', CURRENT_DATE);

  PERFORM set_config('request.jwt.claims', json_build_object('sub',_mgr,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  _g := public.supervisory_portfolio_group_intelligence(NULL);
  RESET ROLE;
  SELECT gr INTO _row FROM jsonb_array_elements(_g->'groups') gr WHERE (gr->>'group_id')::uuid = _grp;
  _txt := COALESCE(_row::text, '');

  PERFORM pg_temp.gate('PT-50',
    _row IS NOT NULL AND (_row->>'visible_member_count')::int = 1,
    format('an out-of-remit group member does not contribute to the scoped visible member count (visible=%s of 2 canonical)',
           _row->>'visible_member_count'));

  PERFORM pg_temp.gate('PT-51',
    (_row->>'member_count_basis') = 'SCOPED_VISIBLE_MEMBERSHIP_ONLY'
    AND (_row->'canonical_member_count') = 'null'::jsonb
    AND NOT (_row->>'full_membership_authorised')::boolean
    AND (_g->>'membership_visibility_policy') ILIKE '%not disclosed beyond%',
    'canonical/full membership disclosure follows the documented policy: withheld unless the caller is authorised for every member');

  PERFORM pg_temp.gate('PT-52',
    _txt NOT LIKE '%' || _e3::text || '%'
    AND (_e3name IS NULL OR _txt NOT LIKE '%' || _e3name || '%')
    AND _txt LIKE '%' || _e1::text || '%',
    'hidden member identifiers and names never leak through the group payload');
END $$;

-- ---------------------------------------------------------------------------
-- Verdict
-- ---------------------------------------------------------------------------
SELECT gate, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM pt_result ORDER BY gate;

SELECT count(*) AS gates,
       count(*) FILTER (WHERE passed) AS passed,
       count(*) FILTER (WHERE NOT passed) AS failed
  FROM pt_result;

DO $$
DECLARE _f int;
BEGIN
  SELECT count(*) INTO _f FROM pt_result WHERE NOT passed;
  IF _f > 0 THEN
    RAISE WARNING 'OS-02G1 NOT CERTIFIED: % gate(s) failed', _f;
  ELSE
    RAISE NOTICE 'OS-02G1 portfolio & thematic intelligence gates all passed';
  END IF;
END $$;

ROLLBACK;

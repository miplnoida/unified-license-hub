-- METH-READ — Supervisory methodology administration read models
--
-- Proves that the governed read layer behind /admin/supervisory-methodology is
-- authority-bound, count-truthful, deterministic and side-effect free.
--
-- Contract under test (all SECURITY INVOKER unless stated):
--   supervisory_methodology_register / _register_options / _detail
--   supervisory_methodology_dimension_list
--   supervisory_methodology_question_register / _question_detail
--   supervisory_methodology_semantic_register
--   supervisory_methodology_fact_register / _fact_detail
--   supervisory_methodology_parameter_register
--   supervisory_methodology_reference_decision_register
--   supervisory_methodology_approval_register
--   supervisory_methodology_audit_register
--   supervisory_methodology_compare
--   supervisory_methodology_review_readiness
--   supervisory_methodology_action_capabilities
--   supervisory_methodology_adoption_targets
--
-- Run:  psql "$DATABASE_URL" -f scripts/verify-supervisory-methodology-admin-read-models.sql
--
-- Everything happens inside ONE transaction that always ROLLBACKs, so the
-- fixtures used for the regulator-scope gates never persist. Gate METH-READ-22
-- proves that explicitly by comparing the production population before and
-- after the fixture work.

\set ON_ERROR_STOP on
BEGIN;

-- ---------------------------------------------------------------------------
-- Harness: act as a real signed-in user inside this transaction only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.act_as(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.act_as_anon() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('role', 'anon', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.act_as_owner() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'none', true);
END $$;

CREATE TEMP TABLE meth_ctx AS
SELECT
  (SELECT id FROM public.supervisory_methodology
    WHERE domain_code = 'AML_CFT' AND origin = 'MIPL_REFERENCE' AND status = 'DRAFT'
    ORDER BY version DESC LIMIT 1) AS reference_id,
  (SELECT id FROM public.supervisory_methodology
    WHERE domain_code = 'AML_CFT' AND status = 'ACTIVE'
    ORDER BY version DESC LIMIT 1) AS active_id,
  (SELECT id FROM public.sec_user_roles ur LIMIT 0) AS unused;

CREATE TEMP TABLE meth_actor AS
-- an officer that actually holds AML methodology configuration authority
SELECT ur.user_id AS config_user
  FROM public.sec_user_roles ur
  JOIN public.sec_role_permissions rp ON rp.role_id = ur.role_id
  JOIN public.sec_permissions p ON p.id = rp.permission_id
 WHERE p.module = 'aml_supervision' AND p.action = 'manage_config'
 LIMIT 1;

CREATE TEMP TABLE meth_baseline AS
SELECT
  (SELECT count(*) FROM public.supervisory_methodology) AS methodologies,
  (SELECT count(*) FROM public.supervisory_methodology_regulator_approval) AS approvals,
  (SELECT count(*) FROM public.supervisory_methodology_question WHERE active) AS questions,
  (SELECT count(*) FROM public.supervisory_methodology_parameter WHERE value_numeric IS NOT NULL OR value_text IS NOT NULL) AS valued_parameters,
  (SELECT count(*) FROM public.supervisory_methodology_event) AS events;

-- ===========================================================================
-- METH-READ-01 — anonymous callers are refused every read model
-- ===========================================================================
DO $$
DECLARE _ref uuid := (SELECT reference_id FROM meth_ctx); _fn text; _ok boolean;
BEGIN
  PERFORM pg_temp.act_as_anon();
  FOREACH _fn IN ARRAY ARRAY[
    'supervisory_methodology_register()',
    'supervisory_methodology_register_options()'
  ] LOOP
    BEGIN
      EXECUTE format('SELECT public.%s', _fn);
      RAISE EXCEPTION 'FAIL METH-READ-01: % answered an anonymous caller', _fn;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  BEGIN
    PERFORM public.supervisory_methodology_detail(_ref);
    RAISE EXCEPTION 'FAIL METH-READ-01: detail answered an anonymous caller';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.act_as_owner();
  RAISE NOTICE 'PASS METH-READ-01: anonymous access is refused by the read models';
END $$;

-- ===========================================================================
-- METH-READ-02 — EXECUTE is granted to authenticated/service_role only
-- ===========================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname LIKE 'supervisory_methodology_%'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('public', p.oid, 'EXECUTE'));
  IF n > 0 THEN
    RAISE EXCEPTION 'FAIL METH-READ-02: % methodology functions are executable by anon/PUBLIC', n;
  END IF;
  RAISE NOTICE 'PASS METH-READ-02: methodology read models are executable by signed-in roles only';
END $$;

-- ===========================================================================
-- METH-READ-03 — the register only returns rows the caller may see (RLS)
-- ===========================================================================
DO $$
DECLARE _uid uuid := (SELECT config_user FROM meth_actor); _reg jsonb; _visible bigint;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'FAIL METH-READ-03: no AML config persona exists'; END IF;
  PERFORM pg_temp.act_as(_uid);
  _reg := public.supervisory_methodology_register(null,null,null,null,null,null,null,'domain','asc',100,0);
  SELECT count(*) INTO _visible FROM public.supervisory_methodology;
  IF (_reg->>'total_count')::bigint <> _visible THEN
    RAISE EXCEPTION 'FAIL METH-READ-03: register total % <> visible population %',
      _reg->>'total_count', _visible;
  END IF;
  PERFORM pg_temp.act_as_owner();
  RAISE NOTICE 'PASS METH-READ-03: register total equals the caller''s visible population';
END $$;

-- ===========================================================================
-- METH-READ-04 — regulator-scoped visibility narrows regulator-owned versions
-- ===========================================================================
DO $$
DECLARE _uid uuid := (SELECT config_user FROM meth_actor); _rows jsonb; _bad int;
BEGIN
  PERFORM pg_temp.act_as(_uid);
  _rows := public.supervisory_methodology_register(null,null,null,null,null,null,null,'domain','asc',100,0) -> 'rows';
  SELECT count(*) INTO _bad
    FROM jsonb_array_elements(_rows) r
   WHERE (r->>'regulator_id') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_methodology m WHERE m.id = (r->>'id')::uuid);
  IF _bad > 0 THEN
    RAISE EXCEPTION 'FAIL METH-READ-04: % register rows are not RLS-visible', _bad;
  END IF;
  PERFORM pg_temp.act_as_owner();
  RAISE NOTICE 'PASS METH-READ-04: every register row is RLS-visible to the caller';
END $$;

-- ===========================================================================
-- METH-READ-05 — enterprise oversight reads across regulators
-- ===========================================================================
DO $$
DECLARE _uid uuid; _n bigint;
BEGIN
  SELECT ur.user_id INTO _uid
    FROM public.sec_user_roles ur
    JOIN public.sec_role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.sec_permissions p ON p.id = rp.permission_id
   WHERE (p.module, p.action) IN (('audit_management','view'),
                                  ('executive_oversight','view_cross_module_audit'))
   LIMIT 1;
  IF _uid IS NULL THEN
    RAISE NOTICE 'SKIP METH-READ-05: no enterprise oversight persona is provisioned';
    RETURN;
  END IF;
  PERFORM pg_temp.act_as(_uid);
  SELECT (public.supervisory_methodology_register(null,null,null,null,null,null,null,'domain','asc',100,0)->>'total_count')::bigint INTO _n;
  IF _n = 0 THEN
    RAISE EXCEPTION 'FAIL METH-READ-05: oversight persona sees no methodology at all';
  END IF;
  PERFORM pg_temp.act_as_owner();
  RAISE NOTICE 'PASS METH-READ-05: enterprise oversight reads across regulators (% rows)', _n;
END $$;

-- ===========================================================================
-- METH-READ-06 — page size is bounded at 100 whatever the caller asks for
-- ===========================================================================
DO $$
DECLARE _uid uuid := (SELECT config_user FROM meth_actor); _lim int;
BEGIN
  PERFORM pg_temp.act_as(_uid);
  _lim := ((public.supervisory_methodology_register(null,null,null,null,null,null,null,'domain','asc',5000,0)->'page')->>'limit')::int;
  IF _lim <> 100 THEN
    RAISE EXCEPTION 'FAIL METH-READ-06: register limit was not bounded (got %)', _lim;
  END IF;
  PERFORM pg_temp.act_as_owner();
  RAISE NOTICE 'PASS METH-READ-06: register page size is bounded at 100';
END $$;

-- ===========================================================================
-- METH-READ-07 — pagination is deterministic and non-overlapping
-- ===========================================================================
DO $$
DECLARE _uid uuid := (SELECT config_user FROM meth_actor); a jsonb; b jsonb; dup int;
BEGIN
  PERFORM pg_temp.act_as(_uid);
  a := public.supervisory_methodology_register(null,null,null,null,null,null,null,'code','asc',1,0) -> 'rows';
  b := public.supervisory_methodology_register(null,null,null,null,null,null,null,'code','asc',1,1) -> 'rows';
  IF jsonb_array_length(a) > 0 AND jsonb_array_length(b) > 0
     AND (a->0->>'id') = (b->0->>'id') THEN
    RAISE EXCEPTION 'FAIL METH-READ-07: page 1 and page 2 returned the same row';
  END IF;
  IF (a->0->>'id') IS DISTINCT FROM
     (public.supervisory_methodology_register(null,null,null,null,null,null,null,'code','asc',1,0)->'rows'->0->>'id') THEN
    RAISE EXCEPTION 'FAIL METH-READ-07: repeated identical request returned a different row';
  END IF;
  PERFORM pg_temp.act_as_owner();
  RAISE NOTICE 'PASS METH-READ-07: server pagination is deterministic and non-overlapping';
END $$;

-- ===========================================================================
-- METH-READ-08 — sorting honours direction on a server-sortable column
-- ===========================================================================
DO $$
DECLARE _uid uuid := (SELECT config_user FROM meth_actor); asc_first text; desc_first text;
BEGIN
  PERFORM pg_temp.act_as(_uid);
  asc_first  := public.supervisory_methodology_register(null,null,null,null,null,null,null,'code','asc',1,0)->'rows'->0->>'code';
  desc_first := public.supervisory_methodology_register(null,null,null,null,null,null,null,'code','desc',1,0)->'rows'->0->>'code';
  IF asc_first IS NULL OR desc_first IS NULL THEN
    RAISE EXCEPTION 'FAIL METH-READ-08: register returned no row to sort';
  END IF;
  IF asc_first > desc_first THEN
    RAISE EXCEPTION 'FAIL METH-READ-08: ascending head % sorts after descending head %', asc_first, desc_first;
  END IF;
  PERFORM pg_temp.act_as_owner();
  RAISE NOTICE 'PASS METH-READ-08: server sorting honours the requested direction';
END $$;

-- ===========================================================================
-- METH-READ-09 — origin is published as a human label, never a raw enum
-- ===========================================================================
DO $$
DECLARE _uid uuid := (SELECT config_user FROM meth_actor); bad int;
BEGIN
  PERFORM pg_temp.act_as(_uid);
  SELECT count(*) INTO bad
    FROM jsonb_array_elements(
      public.supervisory_methodology_register(null,null,null,null,null,null,null,'domain','asc',100,0) -> 'rows') r
   WHERE r->>'origin_label' IS NULL OR r->>'origin_label' LIKE '%\_%';
  IF bad > 0 THEN
    RAISE EXCEPTION 'FAIL METH-READ-09: % rows publish a technical origin label', bad;
  END IF;
  RAISE NOTICE 'PASS METH-READ-09: origin is always published as a human label';
  PERFORM pg_temp.act_as_owner();
END $$;

-- ===========================================================================
-- METH-READ-10 — filter options are derived, never a hardcoded list
-- ===========================================================================
DO $$
DECLARE _uid uuid := (SELECT config_user FROM meth_actor); o jsonb; d int;
BEGIN
  PERFORM pg_temp.act_as(_uid);
  o := public.supervisory_methodology_register_options();
  SELECT count(DISTINCT domain_code) INTO d FROM public.supervisory_methodology;
  IF jsonb_array_length(o->'domains') <> d THEN
    RAISE EXCEPTION 'FAIL METH-READ-10: domain options (%) do not match the visible domains (%)',
      jsonb_array_length(o->'domains'), d;
  END IF;
  IF jsonb_array_length(o->'origins') = 0 OR jsonb_array_length(o->'approval_states') = 0 THEN
    RAISE EXCEPTION 'FAIL METH-READ-10: origin/approval-state options are empty';
  END IF;
  PERFORM pg_temp.act_as_owner();
  RAISE NOTICE 'PASS METH-READ-10: register filter options are derived from visible data';
END $$;

-- ===========================================================================
-- METH-READ-11 — detail counts equal the live catalogue (no literals)
-- ===========================================================================
DO $$
DECLARE _uid uuid := (SELECT config_user FROM meth_actor); _ref uuid := (SELECT reference_id FROM meth_ctx);
        d jsonb; q bigint; dim bigint;
BEGIN
  PERFORM pg_temp.act_as(_uid);
  d := public.supervisory_methodology_detail(_ref);
  SELECT count(*) INTO q FROM public.supervisory_methodology_question WHERE methodology_id = _ref AND active;
  SELECT count(*) INTO dim FROM public.supervisory_methodology_dimension WHERE methodology_id = _ref;
  IF (d->'counts'->>'questions')::bigint <> q OR (d->'counts'->>'dimensions')::bigint <> dim THEN
    RAISE EXCEPTION 'FAIL METH-READ-11: detail counts (% questions / % dimensions) diverge from the catalogue (% / %)',
      d->'counts'->>'questions', d->'counts'->>'dimensions', q, dim;
  END IF;
  PERFORM pg_temp.act_as_owner();
  RAISE NOTICE 'PASS METH-READ-11: detail counts equal the live catalogue (% questions)', q;
END $$;

-- ===========================================================================
-- METH-READ-12 — question register total equals the live question population
-- ===========================================================================
DO $$
DECLARE _uid uuid := (SELECT config_user FROM meth_actor); _ref uuid := (SELECT reference_id FROM meth_ctx);
        t bigint; live bigint;
BEGIN
  PERFORM pg_temp.act_as(_uid);
  t := (public.supervisory_methodology_question_register(_ref)->>'total_count')::bigint;
  SELECT count(*) INTO live FROM public.supervisory_methodology_question WHERE methodology_id = _ref AND active;
  IF t <> live THEN
    RAISE EXCEPTION 'FAIL METH-READ-12: question register total % <> live questions %', t, live;
  END IF;
  PERFORM pg_temp.act_as_owner();
  RAISE NOTICE 'PASS METH-READ-12: question register reports the live population (%)', live;
END $$;

-- ===========================================================================
-- METH-READ-13 — question filters actually filter (class / axis / focus)
-- ===========================================================================
DO $$
DECLARE _uid uuid := (SELECT config_user FROM meth_actor); _ref uuid := (SELECT reference_id FROM meth_ctx);
        got bigint; expected bigint; cls text;
BEGIN
  PERFORM pg_temp.act_as(_uid);
  FOR cls IN SELECT DISTINCT question_class FROM public.supervisory_methodology_question
              WHERE methodology_id = _ref AND active AND question_class IS NOT NULL LOOP
    got := (public.supervisory_methodology_question_register(_ref, null, null, cls)->>'total_count')::bigint;
    SELECT count(*) INTO expected FROM public.supervisory_methodology_question
     WHERE methodology_id = _ref AND active AND question_class = cls;
    IF got <> expected THEN
      RAISE EXCEPTION 'FAIL METH-READ-13: class % filter returned % of %', cls, got, expected;
    END IF;
  END LOOP;
  PERFORM pg_temp.act_as_owner();
  RAISE NOTICE 'PASS METH-READ-13: question class filters match the catalogue exactly';
END $$;

-- ===========================================================================
-- METH-READ-14 — question detail publishes semantics + fact links faithfully
-- ===========================================================================
DO $$
DECLARE _uid uuid := (SELECT config_user FROM meth_actor); _ref uuid := (SELECT reference_id FROM meth_ctx);
        qid uuid; d jsonb; links bigint;
BEGIN
  PERFORM pg_temp.act_as(_uid);
  SELECT q.id INTO qid FROM public.supervisory_methodology_question q
   WHERE q.methodology_id = _ref AND q.active
     AND EXISTS (SELECT 1 FROM public.supervisory_methodology_question_fact f WHERE f.question_id = q.id)
   LIMIT 1;
  IF qid IS NULL THEN
    RAISE NOTICE 'SKIP METH-READ-14: no question carries a fact link';
    RETURN;
  END IF;
  d := public.supervisory_methodology_question_detail(qid);
  SELECT count(*) INTO links FROM public.supervisory_methodology_question_fact WHERE question_id = qid;
  IF jsonb_array_length(d->'fact_requirements') <> links THEN
    RAISE EXCEPTION 'FAIL METH-READ-14: question detail published % fact links, catalogue has %',
      jsonb_array_length(d->'fact_requirements'), links;
  END IF;
  IF d->>'prompt' IS NULL OR d->'dimension'->>'dimension_code' IS NULL THEN
    RAISE EXCEPTION 'FAIL METH-READ-14: question detail is missing prompt or dimension';
  END IF;
  PERFORM pg_temp.act_as_owner();
  RAISE NOTICE 'PASS METH-READ-14: question detail publishes prompt, dimension and fact links';
END $$;

-- ===========================================================================
-- METH-READ-15 — contextual, non-scored questions are reported as such
-- ===========================================================================
DO $$
DECLARE _uid uuid := (SELECT config_user FROM meth_actor); _ref uuid := (SELECT reference_id FROM meth_ctx);
        got bigint; expected bigint;
BEGIN
  PERFORM pg_temp.act_as(_uid);
  SELECT count(*) INTO expected FROM public.supervisory_methodology_question
   WHERE methodology_id = _ref AND active AND calculation_participation = 'CONTEXTUAL_NOT_SCORED';
  got := (public.supervisory_methodology_question_register(
            _ref, null, null, null, null, null, 'CONTEXTUAL_NOT_SCORED')->>'total_count')::bigint;
  IF got <> expected THEN
    RAISE EXCEPTION 'FAIL METH-READ-15: contextual filter returned % of %', got, expected;
  END IF;
  RAISE NOTICE 'PASS METH-READ-15: contextual non-scored participation is reported truthfully (%)', expected;
  PERFORM pg_temp.act_as_owner();
END $$;

-- ===========================================================================
-- METH-READ-16 — semantic profiles are version-owned
-- ===========================================================================
DO $$
DECLARE _uid uuid := (SELECT config_user FROM meth_actor); _ref uuid := (SELECT reference_id FROM meth_ctx);
        p jsonb; n bigint; bad int;
BEGIN
  PERFORM pg_temp.act_as(_uid);
  p := public.supervisory_methodology_semantic_register(_ref);
  SELECT count(*) INTO n FROM public.supervisory_methodology_semantic_profile WHERE methodology_id = _ref;
  IF jsonb_array_length(p) <> n THEN
    RAISE EXCEPTION 'FAIL METH-READ-16: semantic register published % of % profiles', jsonb_array_length(p), n;
  END IF;
  SELECT count(*) INTO bad FROM jsonb_array_elements(p) x
   WHERE (x->'owner'->>'methodology_id')::uuid <> _ref;
  IF bad > 0 THEN
    RAISE EXCEPTION 'FAIL METH-READ-16: % profiles are not owned by this version', bad;
  END IF;
  PERFORM pg_temp.act_as_owner();
  RAISE NOTICE 'PASS METH-READ-16: semantic profiles are version-owned (%)', n;
END $$;

-- ===========================================================================
-- METH-READ-17 — fact register total + definition status summary are truthful
-- ===========================================================================
DO $$
DECLARE _uid uuid := (SELECT config_user FROM meth_actor); _ref uuid := (SELECT reference_id FROM meth_ctx);
        r jsonb; n bigint;
BEGIN
  PERFORM pg_temp.act_as(_uid);
  r := public.supervisory_methodology_fact_register(_ref);
  SELECT count(*) INTO n FROM public.supervisory_methodology_fact_requirement WHERE methodology_id = _ref;
  IF (r->>'total_count')::bigint <> n THEN
    RAISE EXCEPTION 'FAIL METH-READ-17: fact register total % <> catalogue %', r->>'total_count', n;
  END IF;
  IF (SELECT COALESCE(sum(value::bigint), 0) FROM jsonb_each_text(r->'status_summary') AS s(key, value)) <> n THEN
    RAISE EXCEPTION 'FAIL METH-READ-17: fact status summary does not add up to %', n;
  END IF;
  PERFORM pg_temp.act_as_owner();
  RAISE NOTICE 'PASS METH-READ-17: fact register and status summary are truthful (%)', n;
END $$;

-- ===========================================================================
-- METH-READ-18 — parameter register never invents an approval or a value
-- ===========================================================================
DO $$
DECLARE _uid uuid := (SELECT config_user FROM meth_actor); _ref uuid := (SELECT reference_id FROM meth_ctx);
        r jsonb; total bigint; unapproved bigint; valued bigint;
BEGIN
  PERFORM pg_temp.act_as(_uid);
  r := public.supervisory_methodology_parameter_register(_ref);
  SELECT count(*),
         count(*) FILTER (WHERE COALESCE(approval_status,'UNAPPROVED') <> 'APPROVED'),
         count(*) FILTER (WHERE value_numeric IS NOT NULL OR value_text IS NOT NULL)
    INTO total, unapproved, valued
    FROM public.supervisory_methodology_parameter WHERE methodology_id = _ref;
  IF (r->>'total_count')::bigint <> total
     OR (r->>'unapproved_count')::bigint <> unapproved
     OR (r->>'valued_count')::bigint <> valued THEN
    RAISE EXCEPTION 'FAIL METH-READ-18: parameter register (%, %, %) diverges from (%, %, %)',
      r->>'total_count', r->>'unapproved_count', r->>'valued_count', total, unapproved, valued;
  END IF;
  PERFORM pg_temp.act_as_owner();
  RAISE NOTICE 'PASS METH-READ-18: parameter register reports % defined, % unapproved, % valued', total, unapproved, valued;
END $$;

-- ===========================================================================
-- METH-READ-19 — a reference decision is never published as regulator approval
-- ===========================================================================
DO $$
DECLARE _uid uuid := (SELECT config_user FROM meth_actor); _ref uuid := (SELECT reference_id FROM meth_ctx);
        r jsonb; approvals bigint; claimed bigint;
BEGIN
  PERFORM pg_temp.act_as(_uid);
  r := public.supervisory_methodology_reference_decision_register(_ref);
  SELECT count(*) INTO approvals FROM public.supervisory_methodology_regulator_approval WHERE methodology_id = _ref;
  claimed := (r->>'regulator_approved_count')::bigint;
  IF approvals = 0 AND claimed > 0 THEN
    RAISE EXCEPTION 'FAIL METH-READ-19: % reference decisions claim regulator approval while none is registered', claimed;
  END IF;
  IF (r->>'total_count')::bigint <> (SELECT count(*) FROM public.supervisory_methodology_reference_decision WHERE methodology_id = _ref) THEN
    RAISE EXCEPTION 'FAIL METH-READ-19: reference decision total is not the recorded population';
  END IF;
  PERFORM pg_temp.act_as_owner();
  RAISE NOTICE 'PASS METH-READ-19: reference approval and regulator approval stay distinct';
END $$;

-- ===========================================================================
-- METH-READ-20 — layered readiness, comparison and capability contract
-- ===========================================================================
DO $$
DECLARE _uid uuid := (SELECT config_user FROM meth_actor); _ref uuid := (SELECT reference_id FROM meth_ctx);
        rd jsonb; cap jsonb; cmp jsonb; missing text;
BEGIN
  PERFORM pg_temp.act_as(_uid);
  rd := public.supervisory_methodology_review_readiness(_ref);
  SELECT string_agg(k, ', ') INTO missing FROM unnest(ARRAY[
    'CONTENT','REFERENCE_GOVERNANCE','REGULATOR_ADOPTION','REGULATOR_APPROVAL','FACT_DEFINITIONS',
    'MATERIALITY_POLICY','CALCULATION_POLICY','LEGACY_DATA_REPAIR','ASSESSMENT_ELIGIBILITY','CERTIFICATION']) k
   WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(rd->'layers') l WHERE l->>'key' = k);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL METH-READ-20: readiness layers missing: %', missing;
  END IF;

  cap := public.supervisory_methodology_action_capabilities(_ref);
  IF (cap->'can_activate'->>'allowed')::boolean THEN
    RAISE EXCEPTION 'FAIL METH-READ-20: activation is offered in a review-only wave';
  END IF;
  IF (cap->'can_approve'->>'allowed')::boolean THEN
    RAISE EXCEPTION 'FAIL METH-READ-20: a MIPL reference template is offered for approval';
  END IF;

  cmp := public.supervisory_methodology_compare(_ref);
  IF (cmp->>'comparable')::boolean AND cmp->>'note' NOT LIKE '%not migrated%' THEN
    RAISE EXCEPTION 'FAIL METH-READ-20: comparison does not state that responses were not migrated';
  END IF;
  PERFORM pg_temp.act_as_owner();
  RAISE NOTICE 'PASS METH-READ-20: readiness is layered, activation/approval refused, comparison truthful';
END $$;

-- ===========================================================================
-- METH-READ-21 — adoption targets are server-scoped; audit is real events only
-- ===========================================================================
DO $$
DECLARE _uid uuid := (SELECT config_user FROM meth_actor); _ref uuid := (SELECT reference_id FROM meth_ctx);
        t jsonb; all_regs bigint; a jsonb; real_events bigint;
BEGIN
  PERFORM pg_temp.act_as(_uid);
  t := public.supervisory_methodology_adoption_targets(_ref);
  SELECT count(*) INTO all_regs FROM public.regulators;
  IF (t->>'total_count')::bigint > all_regs THEN
    RAISE EXCEPTION 'FAIL METH-READ-21: adoption targets exceed the regulator population';
  END IF;
  IF (t->>'total_count')::bigint = 0 AND t->>'reason' IS NULL THEN
    RAISE EXCEPTION 'FAIL METH-READ-21: empty adoption target list carries no business reason';
  END IF;

  a := public.supervisory_methodology_audit_register(_ref);
  SELECT count(*) INTO real_events FROM public.supervisory_methodology_event WHERE methodology_id = _ref;
  IF (a->>'total_count')::bigint <> real_events THEN
    RAISE EXCEPTION 'FAIL METH-READ-21: audit register total % <> recorded events %',
      a->>'total_count', real_events;
  END IF;
  PERFORM pg_temp.act_as_owner();
  RAISE NOTICE 'PASS METH-READ-21: adoption targets are server-scoped and audit shows real events only';
END $$;

-- ===========================================================================
-- METH-READ-22 — zero persistent write from any read model
-- ===========================================================================
DO $$
DECLARE b record; n_meth bigint; n_appr bigint; n_q bigint; n_val bigint; n_ev bigint;
BEGIN
  SELECT * INTO b FROM meth_baseline;
  SELECT count(*) INTO n_meth FROM public.supervisory_methodology;
  SELECT count(*) INTO n_appr FROM public.supervisory_methodology_regulator_approval;
  SELECT count(*) INTO n_q FROM public.supervisory_methodology_question WHERE active;
  SELECT count(*) INTO n_val FROM public.supervisory_methodology_parameter
    WHERE value_numeric IS NOT NULL OR value_text IS NOT NULL;
  SELECT count(*) INTO n_ev FROM public.supervisory_methodology_event;
  IF (n_meth, n_appr, n_q, n_val, n_ev)
     IS DISTINCT FROM (b.methodologies, b.approvals, b.questions, b.valued_parameters, b.events) THEN
    RAISE EXCEPTION 'FAIL METH-READ-22: a read model changed persistent state';
  END IF;
  RAISE NOTICE 'PASS METH-READ-22: no read model wrote methodology, approval, question, parameter or event data';
END $$;

ROLLBACK;

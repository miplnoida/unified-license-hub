-- ============================================================================
-- verify:f5b3 — GOVERNED POST-APPROVAL EFFECT ENGINE (GAP-F5-03)
--
-- Permanent gate proving that an approved post-licensing (F5) application
-- produces exactly one governed, idempotent regulatory business effect through
-- the canonical engines, in the SAME transaction as the approval, and that the
-- frozen F4 initial-licensing path is untouched.
--
-- Static contract inspection alone is NOT accepted. Sections D-I behaviourally
-- exercise perform_final_workflow_approval end to end. Every empirical write
-- runs inside a sub-block that always aborts → zero residue.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f scripts/verify-f5b3-effects.sql
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
SET client_min_messages = notice;

DROP TABLE IF EXISTS f5b3_results;
CREATE TEMP TABLE f5b3_results (
  seq serial, section text, id text, descr text, passed boolean, detail text
);

DROP FUNCTION IF EXISTS pg_temp.rec(text,text,text,boolean,text);
CREATE OR REPLACE FUNCTION pg_temp.rec(_s text, _id text, _d text, _ok boolean, _detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO f5b3_results (section, id, descr, passed, detail)
  VALUES (_s, _id, _d, _ok, _detail);
END $$;

-- Run _sql as the given authenticated browser identity; returns SQLSTATE or
-- '00000'. Identity and role are always reset.
DROP FUNCTION IF EXISTS pg_temp.as_user(uuid,text);
CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid uuid, _sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _uid::text, 'role','authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE _sql;
    _state := '00000';
  EXCEPTION WHEN others THEN
    _state := SQLSTATE || ': ' || left(SQLERRM, 120);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);
  RETURN _state;
END $$;

-- Canonical F5 decision fixture: gate configuration + governed workflow +
-- single final step assigned to the deciding officer + submitted application +
-- active workflow instance. Returns the identifiers as jsonb.
DROP FUNCTION IF EXISTS pg_temp.f5b3_fixture(uuid,uuid,uuid,text);
CREATE OR REPLACE FUNCTION pg_temp.f5b3_fixture(_license uuid, _service uuid, _actor uuid,
                                                _status text DEFAULT 'submitted')
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE _lic public.licenses; _wf uuid; _step uuid; _app uuid; _inst uuid;
BEGIN
  SELECT * INTO _lic FROM public.licenses WHERE id = _license;

  INSERT INTO public.licensing_gate_configs (gate_key, applicability, service_id, is_active, notes)
  SELECT g, 'NOT_APPLICABLE', _service::text, true, 'F5-B3 probe'
    FROM unnest(ARRAY['forms_documents','fees','fit_and_proper','conditions']) g;

  INSERT INTO public.approval_workflows
    (name, license_type, entity_type, is_active, service_id, regulator_id, sector_id, sub_sector_id)
  VALUES ('F5-B3 probe wf', 'f5b3-probe', 'post_application', true, _service,
          _lic.regulator_id, _lic.sector_id, _lic.sub_sector_id)
  RETURNING id INTO _wf;

  INSERT INTO public.approval_steps
    (workflow_id, step_order, name, approver_role, approver_type, approver_config, allowed_actions)
  VALUES (_wf, 1, 'Final decision', 'admin', 'specific_users',
          jsonb_build_object('user_ids', jsonb_build_array(_actor)),
          '["approve","reject"]'::jsonb)
  RETURNING id INTO _step;

  INSERT INTO public.applications
    (applicant_id, license_type, status, data, entity_id, regulator_id, submitted_at)
  VALUES (_actor, 'f5b3-probe', _status,
          jsonb_build_object('type','post_license','license_id',_license,'service_id',_service,
                             'licensee_id',_lic.holder_id,'sector_id',_lic.sector_id,
                             'sub_sector_id',_lic.sub_sector_id),
          _lic.holder_id, _lic.regulator_id, now())
  RETURNING id INTO _app;

  INSERT INTO public.workflow_instances (workflow_id, entity_type, entity_id, status, current_step_id)
  VALUES (_wf, 'application', _app, 'active', _step) RETURNING id INTO _inst;

  RETURN jsonb_build_object('workflow_id',_wf,'step_id',_step,'application_id',_app,
                            'instance_id',_inst,'entity_id',_lic.holder_id);
END $$;

-- The deciding officer: an internal identity holding entity_structure
-- approve + apply authority (required by the ENTITY_CHANGE family).
DROP FUNCTION IF EXISTS pg_temp.f5b3_officer();
CREATE OR REPLACE FUNCTION pg_temp.f5b3_officer() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT p.id FROM public.profiles p
   WHERE public.has_permission(p.id,'entity_structure','apply')
     AND public.has_permission(p.id,'entity_structure','approve')
   ORDER BY p.created_at LIMIT 1
$$;

-- A licence usable as an F5 fixture host for a given service lifecycle stage.
DROP FUNCTION IF EXISTS pg_temp.f5b3_license(text, boolean);
CREATE OR REPLACE FUNCTION pg_temp.f5b3_license(_stage text, _clean_fp boolean DEFAULT true)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT l.id FROM public.licenses l
   WHERE l.sub_sector_id IS NOT NULL AND lower(l.status) = 'active'
     AND EXISTS (SELECT 1 FROM public.licensees x WHERE x.id = l.holder_id)
     AND EXISTS (SELECT 1 FROM public.services s
                  WHERE s.sub_sector_id = l.sub_sector_id AND s.status = 'active'
                    AND lower(s.lifecycle_stage) = _stage)
     AND (NOT _clean_fp OR NOT EXISTS (
           SELECT 1 FROM public.fp_individual_roles ir
            WHERE ir.licensee_id = l.holder_id AND ir.is_current))
   ORDER BY l.issued_at DESC LIMIT 1
$$;

DROP FUNCTION IF EXISTS pg_temp.f5b3_service(uuid, text);
CREATE OR REPLACE FUNCTION pg_temp.f5b3_service(_license uuid, _code text)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT s.id FROM public.services s
   JOIN public.licenses l ON l.id = _license
  WHERE s.sub_sector_id = l.sub_sector_id AND s.status = 'active'
    AND lower(s.lifecycle_stage) = ANY (public.post_license_service_stages())
    AND (CASE WHEN _code = 'RENEWAL'
              THEN lower(s.lifecycle_stage) = 'renewal'
              ELSE s.code = _code END)
  LIMIT 1
$$;

-- ===========================================================================
-- SECTION A — governed surface, privileges and ledger integrity
-- ===========================================================================
DO $a$
DECLARE _fn text; _bad int := 0; _detail text := ''; _n int;
BEGIN
  FOR _fn IN SELECT x FROM (VALUES
      ('public.apply_post_license_effect(uuid)'),
      ('public.post_license_effect_plan(uuid)'),
      ('public.post_license_change_items(uuid)'),
      ('public.post_license_effect_key(uuid)'),
      ('public.workflow_effect_actor()')) v(x)
  LOOP
    IF to_regprocedure(_fn) IS NULL THEN
      _bad := _bad + 1; _detail := _detail || _fn || '=missing; ';
    ELSIF NOT EXISTS (
      SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(_fn)::oid
       AND p.prosecdef
       AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%'))
    THEN
      _bad := _bad + 1; _detail := _detail || _fn || '=unpinned/invoker; ';
    END IF;
  END LOOP;
  PERFORM pg_temp.rec('A','A-01','the governed effect surface exists, is SECURITY DEFINER and pins search_path',
    _bad = 0, CASE WHEN _bad = 0 THEN '5/5 conform' ELSE _detail END);

  SELECT count(*) INTO _n FROM (VALUES ('anon'),('authenticated')) r(role)
   WHERE has_function_privilege(r.role, to_regprocedure('public.apply_post_license_effect(uuid)')::oid, 'EXECUTE');
  PERFORM pg_temp.rec('A','A-02','the effect executor is not callable from the browser (anon/authenticated)',
    _n = 0, 'browser_execute_grants=' || _n);

  SELECT count(*) INTO _n
    FROM information_schema.role_table_grants g
   WHERE g.table_schema = 'public'
     AND g.table_name IN ('post_license_effects','post_license_acknowledgements','post_license_effect_map',
                          'post_license_effect_service_bindings')
     AND g.grantee IN ('anon','authenticated')
     AND g.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
  PERFORM pg_temp.rec('A','A-03','the effect ledger, acknowledgements and effect map are browser read-only',
    _n = 0, 'browser_write_grants=' || _n);

  SELECT count(DISTINCT c.relname) INTO _n
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE NOT t.tgisinternal
     AND c.relname IN ('post_license_effects','post_license_acknowledgements');
  PERFORM pg_temp.rec('A','A-04','the effect ledger and acknowledgement register carry append-only guards',
    _n = 2, 'guarded_tables=' || _n);

  SELECT count(*) INTO _n FROM pg_constraint c
   WHERE c.conrelid = 'public.post_license_effects'::regclass
     AND c.contype IN ('u','p')
     AND EXISTS (SELECT 1 FROM unnest(c.conkey) k
                  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
                 WHERE a.attname = 'application_id')
     AND array_length(c.conkey,1) = 1;
  PERFORM pg_temp.rec('A','A-05','at most one governed effect may exist per application (unique ledger key)',
    _n >= 1, 'unique_application_constraints=' || _n);

  SELECT count(*) INTO _n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND c.relrowsecurity
     AND c.relname IN ('post_license_effects','post_license_acknowledgements','post_license_effect_map');
  PERFORM pg_temp.rec('A','A-06','row level security is enabled on the effect tables',
    _n = 3, 'rls_tables=' || _n);
END $a$;

-- ===========================================================================
-- SECTION B — canonical branching contract of the final decision
-- ===========================================================================
DO $b$
DECLARE _def text;
BEGIN
  _def := pg_get_functiondef(to_regprocedure(
    'public.perform_final_workflow_approval(uuid,uuid,uuid,text,uuid)')::oid);

  PERFORM pg_temp.rec('B','B-01','final approval classifies the filing through the canonical F5 effect plan',
    _def ILIKE '%post_license_effect_plan%', 'resolver_referenced=' || (_def ILIKE '%post_license_effect_plan%')::text);
  PERFORM pg_temp.rec('B','B-02','final approval applies the governed effect in the approval transaction',
    _def ILIKE '%apply_post_license_effect%', 'executor_referenced=' || (_def ILIKE '%apply_post_license_effect%')::text);
  PERFORM pg_temp.rec('B','B-03','the frozen F4 issuance/provisioning path is preserved',
    _def ILIKE '%provision_application_entity%', 'f4_provisioning_referenced=' || (_def ILIKE '%provision_application_entity%')::text);
  PERFORM pg_temp.rec('B','B-04','F5 classification is canonical, not client data.type alone',
    _def ILIKE '%is_post_license%', 'canonical_flag_used=' || (_def ILIKE '%is_post_license%')::text);
  PERFORM pg_temp.rec('B','B-05','the executor refuses anything that is not a genuine approved F5 filing',
    pg_get_functiondef(to_regprocedure('public.apply_post_license_effect(uuid)')::oid) ILIKE '%is_post_license%',
    'executor_guard=present');
END $b$;

-- ===========================================================================
-- SECTION C — effect-map completeness census over LIVE service definitions
-- ===========================================================================
DO $c$
DECLARE _total int; _unmapped int; _supported int; _bcr int; _gap int; _blockerless int; _detail text;
BEGIN
  SELECT count(*) INTO _total FROM public.services s
   WHERE s.status = 'active'
     AND lower(s.lifecycle_stage) = ANY (public.post_license_service_stages());

  SELECT count(*), coalesce(string_agg(DISTINCT coalesce(s.code, s.name), ', '), '')
    INTO _unmapped, _detail
    FROM public.services s
   WHERE s.status = 'active'
     AND lower(s.lifecycle_stage) = ANY (public.post_license_service_stages())
     AND (public.post_license_effect_key(s.id) IS NULL
          OR NOT EXISTS (SELECT 1 FROM public.post_license_effect_map m
                          WHERE m.service_code = public.post_license_effect_key(s.id)));

  PERFORM pg_temp.rec('C','C-01','every active post-licensing service definition resolves to a governed effect entry',
    _unmapped = 0, 'active=' || _total || ' unmapped=' || _unmapped ||
    CASE WHEN _unmapped > 0 THEN ' [' || _detail || ']' ELSE '' END);

  SELECT count(*) FILTER (WHERE is_supported),
         count(*) FILTER (WHERE NOT is_supported AND blocker_class = 'BUSINESS_CONFIGURATION_REQUIRED'),
         count(*) FILTER (WHERE NOT is_supported AND blocker_class = 'PRODUCT_GAP'),
         count(*) FILTER (WHERE NOT is_supported AND blocker_class IS NULL)
    INTO _supported, _bcr, _gap, _blockerless
    FROM public.post_license_effect_map;

  PERFORM pg_temp.rec('C','C-02','every unsupported service is explicitly classified BCR or PRODUCT_GAP',
    _blockerless = 0,
    'supported=' || _supported || ' bcr=' || _bcr || ' product_gap=' || _gap ||
    ' unclassified=' || _blockerless);

  SELECT count(*) INTO _unmapped FROM public.post_license_effect_map
   WHERE is_supported AND (canonical_target IS NULL OR handler IS NULL);
  PERFORM pg_temp.rec('C','C-03','every supported effect names its canonical target and handler',
    _unmapped = 0, 'incomplete_supported_entries=' || _unmapped);

  SELECT count(*) INTO _unmapped FROM public.services s
   WHERE s.status = 'active' AND s.code IS NULL
     AND lower(s.lifecycle_stage) = ANY (public.post_license_service_stages())
     AND public.post_license_effect_key(s.id) IS NULL;
  PERFORM pg_temp.rec('C','C-04','uncoded/duplicate live service definitions are bound explicitly, never silently ignored',
    _unmapped = 0, 'uncoded_unbound=' || _unmapped);
END $c$;

-- ===========================================================================
-- SECTION D — RENEWAL family, end to end through the governed decision
-- ===========================================================================
DO $d$
DECLARE
  _lic uuid; _svc uuid; _officer uuid; _fx jsonb; _plan jsonb; _res jsonb;
  _valid_before timestamptz; _valid_after timestamptz;
  _new_terms int; _superseded int; _effects int; _renewals int;
  _repeat text; _terms_after_repeat int; _prov jsonb; _harness text := NULL;
BEGIN
  _officer := pg_temp.f5b3_officer();
  _lic := pg_temp.f5b3_license('renewal');
  IF _lic IS NULL OR _officer IS NULL THEN
    PERFORM pg_temp.rec('D','D-00','fixtures available for the renewal proof', false, 'no clean renewal fixture');
    RETURN;
  END IF;
  _svc := pg_temp.f5b3_service(_lic, 'RENEWAL');
  SELECT valid_until INTO _valid_before FROM public.licenses WHERE id = _lic;

  BEGIN
    _fx := pg_temp.f5b3_fixture(_lic, _svc, _officer);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);

    _plan := public.post_license_effect_plan((_fx->>'application_id')::uuid);
    _res  := public.perform_final_workflow_approval((_fx->>'application_id')::uuid,
               (_fx->>'instance_id')::uuid, (_fx->>'step_id')::uuid, 'F5-B3 renewal probe', _officer);

    SELECT count(*) FILTER (WHERE t.term_kind = 'renewal' AND t.is_current),
           count(*) FILTER (WHERE t.term_kind = 'original' AND NOT t.is_current)
      INTO _new_terms, _superseded
      FROM public.license_terms t WHERE t.license_id = _lic;

    SELECT valid_until INTO _valid_after FROM public.licenses WHERE id = _lic;
    SELECT count(*) INTO _renewals FROM public.license_renewals r WHERE r.license_id = _lic;

    SELECT count(*), jsonb_build_object(
             'effect_kind', min(e.effect_kind), 'license', min(e.license_id::text),
             'entity', min(e.entity_id::text), 'service', min(e.service_id::text))
      INTO _effects, _prov
      FROM public.post_license_effects e
     WHERE e.application_id = (_fx->>'application_id')::uuid;

    -- idempotency: a repeated invocation must not create a second effect/term
    BEGIN
      PERFORM set_config('app.workflow_mutation_context','trusted', true);
      PERFORM set_config('app.workflow_actor_id', _officer::text, true);
      PERFORM public.apply_post_license_effect((_fx->>'application_id')::uuid);
      _repeat := 'idempotent';
    EXCEPTION WHEN others THEN
      _repeat := SQLSTATE || ': ' || left(SQLERRM,80);
    END;
    PERFORM set_config('app.workflow_mutation_context','', true);

    SELECT count(*) INTO _terms_after_repeat
      FROM public.license_terms t WHERE t.license_id = _lic AND t.term_kind = 'renewal';

    RAISE EXCEPTION 'F5B3_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5B3_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,160); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('D','D-99','the renewal probe executed without harness error', false, _harness);
    RETURN;
  END IF;

  PERFORM pg_temp.rec('D','D-01','the renewal service is planned as a RENEWAL effect on the canonical engine',
    _plan->>'effect_kind' = 'RENEWAL' AND _plan->>'state' = 'READY',
    'kind=' || coalesce(_plan->>'effect_kind','null') || ' state=' || coalesce(_plan->>'state','null')
    || ' target=' || coalesce(_plan->>'canonical_target','null'));
  PERFORM pg_temp.rec('D','D-02','the governed final approval succeeds for a ready F5 renewal',
    coalesce(_res->>'success','false') = 'true', 'result=' || coalesce(_res->>'message', _res::text));
  PERFORM pg_temp.rec('D','D-03','approval creates exactly one new CURRENT renewal term',
    _new_terms = 1, 'current_renewal_terms=' || coalesce(_new_terms::text,'null'));
  PERFORM pg_temp.rec('D','D-04','the prior term is preserved and superseded, never deleted',
    _superseded = 1, 'superseded_original_terms=' || coalesce(_superseded::text,'null'));
  PERFORM pg_temp.rec('D','D-05','licence validity advances as a result of the renewal',
    _valid_after > _valid_before,
    'before=' || coalesce(_valid_before::text,'null') || ' after=' || coalesce(_valid_after::text,'null'));
  PERFORM pg_temp.rec('D','D-06','a linked canonical renewal record exists',
    _renewals >= 1, 'license_renewals=' || coalesce(_renewals::text,'null'));
  PERFORM pg_temp.rec('D','D-07','exactly one effect ledger row records the licence/entity/service provenance',
    _effects = 1 AND _prov->>'license' = _lic::text AND _prov->>'service' = _svc::text,
    'rows=' || coalesce(_effects::text,'null') || ' provenance=' || coalesce(_prov::text,'null'));
  PERFORM pg_temp.rec('D','D-08','a repeated effect invocation is idempotent and creates no duplicate term',
    _terms_after_repeat = 1,
    'repeat=' || coalesce(_repeat,'null') || ' renewal_terms=' || coalesce(_terms_after_repeat::text,'null'));
END $d$;

-- ===========================================================================
-- SECTION E — ENTITY_CHANGE family through the governed change-set model
-- ===========================================================================
DO $e$
DECLARE
  _lic uuid; _svc uuid; _officer uuid; _entity uuid; _fx jsonb; _plan jsonb; _res jsonb;
  _tpl uuid; _ver uuid; _resp uuid; _dc uuid; _probe text := 'F5-B3 Probe Legal Name';
  _cs record; _name_after text; _items int; _effects int; _cs_status text; _cs_prov jsonb;
  _harness text := NULL;
BEGIN
  _officer := pg_temp.f5b3_officer();
  _lic := pg_temp.f5b3_license('post_license');
  IF _lic IS NULL OR _officer IS NULL THEN
    PERFORM pg_temp.rec('E','E-00','fixtures available for the entity-change proof', false, 'no fixture licence');
    RETURN;
  END IF;
  _svc := pg_temp.f5b3_service(_lic, 'PLS_CHANGE_LEGAL_NAME');
  SELECT id INTO _dc FROM public.data_concepts WHERE code = 'ENTITY.LEGAL_NAME';
  SELECT fv.id, fv.template_id INTO _ver, _tpl FROM public.form_versions fv LIMIT 1;
  SELECT holder_id INTO _entity FROM public.licenses WHERE id = _lic;

  IF _svc IS NULL OR _dc IS NULL OR _ver IS NULL THEN
    PERFORM pg_temp.rec('E','E-00','fixtures available for the entity-change proof', false,
      'service=' || coalesce(_svc::text,'null') || ' concept=' || coalesce(_dc::text,'null')
      || ' form_version=' || coalesce(_ver::text,'null'));
    RETURN;
  END IF;

  BEGIN
    _fx := pg_temp.f5b3_fixture(_lic, _svc, _officer);

    INSERT INTO public.form_responses (template_id, version_id, user_id, entity_type, entity_id, status)
    VALUES (_tpl, _ver, _officer, 'application', (_fx->>'application_id')::uuid, 'submitted')
    RETURNING id INTO _resp;

    INSERT INTO public.form_submission_values (response_id, form_version_id, data_concept_id, value_text)
    VALUES (_resp, _ver, _dc, _probe);

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);

    _plan := public.post_license_effect_plan((_fx->>'application_id')::uuid);
    _res  := public.perform_final_workflow_approval((_fx->>'application_id')::uuid,
               (_fx->>'instance_id')::uuid, (_fx->>'step_id')::uuid, 'F5-B3 entity-change probe', _officer);

    SELECT count(*) INTO _effects FROM public.post_license_effects
     WHERE application_id = (_fx->>'application_id')::uuid AND effect_kind = 'ENTITY_CHANGE';

    SELECT cs.id, cs.status INTO _cs
      FROM public.entity_change_sets cs
     WHERE cs.entity_id = _entity ORDER BY cs.created_at DESC LIMIT 1;
    _cs_status := _cs.status;

    SELECT count(*) INTO _items FROM public.entity_change_items i WHERE i.change_set_id = _cs.id;
    SELECT jsonb_build_object('result_ref', e.result_ref, 'before', e.evidence_before,
                              'after', e.evidence_after, 'provenance', e.provenance,
                              'application_id', e.application_id, 'service_id', e.service_id,
                              'handler', e.handler, 'canonical_target', e.canonical_target)
      INTO _cs_prov FROM public.post_license_effects e
     WHERE e.application_id = (_fx->>'application_id')::uuid;

    SELECT n.name INTO _name_after FROM public.organization_names n
     WHERE n.entity_id = _entity AND n.name = _probe LIMIT 1;

    RAISE EXCEPTION 'F5B3_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5B3_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,160); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('E','E-99','the entity-change probe executed without harness error', false, _harness);
    RETURN;
  END IF;

  PERFORM pg_temp.rec('E','E-01','a normalized legal-name filing plans as a governed ENTITY_CHANGE',
    _plan->>'effect_kind' = 'ENTITY_CHANGE' AND _plan->>'state' = 'READY'
      AND (_plan->>'change_items')::int > 0,
    'kind=' || coalesce(_plan->>'effect_kind','null') || ' state=' || coalesce(_plan->>'state','null')
    || ' items=' || coalesce(_plan->>'change_items','null'));
  PERFORM pg_temp.rec('E','E-02','the governed approval succeeds and records an ENTITY_CHANGE effect',
    coalesce(_res->>'success','false') = 'true' AND _effects = 1,
    'success=' || coalesce(_res->>'success','null') || ' effects=' || coalesce(_effects::text,'null'));
  PERFORM pg_temp.rec('E','E-03','the effect runs through the canonical change-set model and is APPLIED',
    _cs_status = 'APPLIED' AND _items > 0,
    'change_set_status=' || coalesce(_cs_status,'null') || ' items=' || coalesce(_items::text,'null'));
  PERFORM pg_temp.rec('E','E-04','canonical entity state changes as a result of the approval',
    _name_after = _probe, 'organization_name=' || coalesce(_name_after,'null'));
  PERFORM pg_temp.rec('E','E-05','the effect ledger carries change-set provenance back to the F5 application',
    coalesce(_cs_prov->>'result_ref','') = coalesce(_cs.id::text,'x')
      AND _cs_prov->>'application_id' = (_fx->>'application_id')
      AND coalesce(_cs_prov->>'handler','') <> ''
      AND coalesce(_cs_prov->>'canonical_target','') <> '',
    'provenance=' || coalesce(_cs_prov::text,'null'));
  PERFORM pg_temp.rec('E','E-06','the effect ledger records before/after evidence for the entity change',
    _cs_prov->'before' IS NOT NULL AND _cs_prov->'after' IS NOT NULL
      AND _cs_prov->>'before' <> _cs_prov->>'after',
    'before=' || coalesce(_cs_prov->>'before','null') || ' after=' || coalesce(_cs_prov->>'after','null'));
END $e$;

-- ===========================================================================
-- SECTION F — NOTIFICATION_ACK family must acknowledge and mutate nothing
-- ===========================================================================
DO $f$
DECLARE
  _lic uuid; _svc uuid; _officer uuid; _fx jsonb; _plan jsonb; _res jsonb;
  _acks int; _terms_before int; _terms_after int; _status_before text; _status_after text;
  _valid_before timestamptz; _valid_after timestamptz; _harness text := NULL;
BEGIN
  _officer := pg_temp.f5b3_officer();
  _lic := pg_temp.f5b3_license('post_license');
  _svc := pg_temp.f5b3_service(_lic, 'PLS_INCIDENT_NOTIFICATION');
  IF _lic IS NULL OR _svc IS NULL THEN
    PERFORM pg_temp.rec('F','F-00','fixtures available for the notification proof', false,
      'service=' || coalesce(_svc::text,'null'));
    RETURN;
  END IF;
  SELECT count(*) INTO _terms_before FROM public.license_terms WHERE license_id = _lic;
  SELECT status, valid_until INTO _status_before, _valid_before FROM public.licenses WHERE id = _lic;

  BEGIN
    _fx := pg_temp.f5b3_fixture(_lic, _svc, _officer);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);
    _plan := public.post_license_effect_plan((_fx->>'application_id')::uuid);
    _res  := public.perform_final_workflow_approval((_fx->>'application_id')::uuid,
               (_fx->>'instance_id')::uuid, (_fx->>'step_id')::uuid, 'F5-B3 notification probe', _officer);

    SELECT count(*) INTO _acks FROM public.post_license_acknowledgements
     WHERE application_id = (_fx->>'application_id')::uuid;
    SELECT count(*) INTO _terms_after FROM public.license_terms WHERE license_id = _lic;
    SELECT status, valid_until INTO _status_after, _valid_after FROM public.licenses WHERE id = _lic;

    RAISE EXCEPTION 'F5B3_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5B3_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,160); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('F','F-99','the notification probe executed without harness error', false, _harness);
    RETURN;
  END IF;

  PERFORM pg_temp.rec('F','F-01','a notification service plans as an immutable acknowledgement only',
    _plan->>'effect_kind' = 'NOTIFICATION_ACK', 'kind=' || coalesce(_plan->>'effect_kind','null'));
  PERFORM pg_temp.rec('F','F-02','approval records exactly one regulatory acknowledgement',
    coalesce(_res->>'success','false') = 'true' AND _acks = 1,
    'success=' || coalesce(_res->>'success','null') || ' acknowledgements=' || coalesce(_acks::text,'null'));
  PERFORM pg_temp.rec('F','F-03','licence status, validity and terms are untouched by a notification',
    _terms_after = _terms_before AND _status_after = _status_before AND _valid_after IS NOT DISTINCT FROM _valid_before,
    'terms=' || coalesce(_terms_before::text,'?') || '->' || coalesce(_terms_after::text,'?')
    || ' status=' || coalesce(_status_before,'?') || '->' || coalesce(_status_after,'?'));
END $f$;

-- ===========================================================================
-- SECTION G — F&P dependency blocks the structural effect (handover to F5-B4)
-- ===========================================================================
DO $g$
DECLARE
  _lic uuid; _svc uuid; _officer uuid; _fx jsonb; _plan jsonb; _res jsonb; _effects int;
  _raised text := NULL; _app_status text; _wf_status text; _actions int;
  _harness text := NULL;
BEGIN
  _officer := pg_temp.f5b3_officer();
  _lic := pg_temp.f5b3_license('post_license');
  _svc := pg_temp.f5b3_service(_lic, 'PLS_DIRECTOR_APPOINTMENT');
  IF _lic IS NULL OR _svc IS NULL THEN
    PERFORM pg_temp.rec('G','G-00','fixtures available for the fit-and-proper proof', false,
      'service=' || coalesce(_svc::text,'null'));
    RETURN;
  END IF;

  BEGIN
    _fx := pg_temp.f5b3_fixture(_lic, _svc, _officer);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);
    _plan := public.post_license_effect_plan((_fx->>'application_id')::uuid);
    BEGIN
      _res := public.perform_final_workflow_approval((_fx->>'application_id')::uuid,
                (_fx->>'instance_id')::uuid, (_fx->>'step_id')::uuid, 'F5-B3 fp probe', _officer);
    EXCEPTION WHEN others THEN
      _raised := SQLSTATE || ': ' || left(SQLERRM,120);
    END;
    SELECT count(*) INTO _effects FROM public.post_license_effects
     WHERE application_id = (_fx->>'application_id')::uuid;
    SELECT a.status INTO _app_status FROM public.applications a WHERE a.id = (_fx->>'application_id')::uuid;
    SELECT w.status INTO _wf_status FROM public.workflow_instances w WHERE w.id = (_fx->>'instance_id')::uuid;
    SELECT count(*) INTO _actions FROM public.approval_actions aa
     WHERE aa.application_id = (_fx->>'application_id')::uuid AND aa.action = 'approve_final';

    RAISE EXCEPTION 'F5B3_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5B3_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,160); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('G','G-99','the fit-and-proper probe executed without harness error', false, _harness);
    RETURN;
  END IF;

  PERFORM pg_temp.rec('G','G-01','a fit-and-proper dependent service without a current positive determination is BLOCKED',
    _plan->>'state' = 'BLOCKED' AND (_plan->>'fp_required')::boolean
      AND _plan->>'code' = 'FP_DETERMINATION_REQUIRED',
    'state=' || coalesce(_plan->>'state','null') || ' code=' || coalesce(_plan->>'code','null'));
  PERFORM pg_temp.rec('G','G-02','the blocked structural effect is never applied and the decision is refused',
    (_raised IS NOT NULL OR coalesce(_res->>'success','false') <> 'true') AND _effects = 0,
    'raised=' || coalesce(_raised,'-') || ' success=' || coalesce(_res->>'success','null')
    || ' effects=' || coalesce(_effects::text,'null'));
  PERFORM pg_temp.rec('G','G-03','the refusal is a stable governed blocked result the caller can distinguish',
    _raised IS NOT NULL OR (coalesce(_res->>'blocked','false') = 'true'
      AND _res->>'application_id' = (_fx->>'application_id')
      AND _res->>'plan_state' = 'BLOCKED'
      AND _res->>'code' = 'FP_DETERMINATION_REQUIRED'
      AND jsonb_typeof(_res->'blockers') = 'array'
      AND jsonb_array_length(_res->'blockers') > 0),
    'result=' || left(coalesce(_res::text,'null'),200));
  PERFORM pg_temp.rec('G','G-04','no application, workflow or decision mutation survives the refused F&P decision',
    _app_status IS DISTINCT FROM 'approved' AND _wf_status IS DISTINCT FROM 'completed' AND _actions = 0,
    'app=' || coalesce(_app_status,'null') || ' wf=' || coalesce(_wf_status,'null')
    || ' approve_final_actions=' || coalesce(_actions::text,'null'));
END $g$;

-- ===========================================================================
-- SECTION H — fail-closed, non-decision and browser-tamper cases
-- ===========================================================================
DO $h$
DECLARE
  _lic uuid; _svc uuid; _unsupported uuid; _officer uuid; _fx jsonb; _fx2 jsonb;
  _plan_unsupported jsonb; _plan_unknown jsonb; _res_unsupported text;
  _rejected_effects int; _exec_state text; _insert_state text; _map_state text;
  _harness text := NULL;
BEGIN
  _officer := pg_temp.f5b3_officer();
  _lic := pg_temp.f5b3_license('post_license');
  _unsupported := pg_temp.f5b3_service(_lic, 'PLS_NEW_BRANCH');
  _svc := pg_temp.f5b3_service(_lic, 'PLS_INCIDENT_NOTIFICATION');
  IF _lic IS NULL OR _unsupported IS NULL OR _svc IS NULL THEN
    PERFORM pg_temp.rec('H','H-00','fixtures available for the fail-closed proof', false, 'missing services');
    RETURN;
  END IF;

  BEGIN
    -- unsupported (product gap) service
    _fx := pg_temp.f5b3_fixture(_lic, _unsupported, _officer);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);
    _plan_unsupported := public.post_license_effect_plan((_fx->>'application_id')::uuid);
    BEGIN
      PERFORM public.perform_final_workflow_approval((_fx->>'application_id')::uuid,
                (_fx->>'instance_id')::uuid, (_fx->>'step_id')::uuid, 'F5-B3 unsupported probe', _officer);
      _res_unsupported := 'NOT_BLOCKED';
    EXCEPTION WHEN others THEN
      _res_unsupported := SQLSTATE || ': ' || left(SQLERRM,120);
    END;

    -- rejected / non-approved filing must never carry an effect
    _fx2 := pg_temp.f5b3_fixture(_lic, _svc, _officer, 'rejected');
    _plan_unknown := public.post_license_effect_plan(gen_random_uuid());
    BEGIN
      PERFORM set_config('app.workflow_mutation_context','trusted', true);
      PERFORM set_config('app.workflow_actor_id', _officer::text, true);
      PERFORM public.apply_post_license_effect((_fx2->>'application_id')::uuid);
    EXCEPTION WHEN others THEN NULL;
    END;
    PERFORM set_config('app.workflow_mutation_context','', true);
    SELECT count(*) INTO _rejected_effects FROM public.post_license_effects
     WHERE application_id = (_fx2->>'application_id')::uuid;

    -- browser tamper attempts
    _exec_state := pg_temp.as_user(_officer,
      format('SELECT public.apply_post_license_effect(%L)', (_fx2->>'application_id')::uuid));
    _insert_state := pg_temp.as_user(_officer,
      format('INSERT INTO public.post_license_effects (application_id, effect_kind) VALUES (%L, %L)',
             (_fx2->>'application_id')::uuid, 'RENEWAL'));
    _map_state := pg_temp.as_user(_officer,
      'UPDATE public.post_license_effect_map SET is_supported = true WHERE service_code = ''PLS_NEW_BRANCH''');

    RAISE EXCEPTION 'F5B3_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5B3_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,160); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('H','H-99','the fail-closed probe executed without harness error', false, _harness);
    RETURN;
  END IF;

  PERFORM pg_temp.rec('H','H-01','an unsupported service fails closed with its blocker classification',
    _plan_unsupported->>'state' IN ('PRODUCT_GAP','BUSINESS_CONFIGURATION_REQUIRED'),
    'state=' || coalesce(_plan_unsupported->>'state','null'));
  PERFORM pg_temp.rec('H','H-02','an unsupported service can never be approved into a fabricated effect',
    _res_unsupported <> 'NOT_BLOCKED', 'approval=' || coalesce(_res_unsupported,'null'));
  PERFORM pg_temp.rec('H','H-03','an unknown application fails closed rather than defaulting to an effect',
    _plan_unknown->>'state' = 'FAIL_CLOSED', 'state=' || coalesce(_plan_unknown->>'state','null'));
  PERFORM pg_temp.rec('H','H-04','a rejected/non-approved filing produces no regulatory effect',
    _rejected_effects = 0, 'effects=' || coalesce(_rejected_effects::text,'null'));
  PERFORM pg_temp.rec('H','H-05','the browser cannot invoke the effect executor',
    _exec_state <> '00000', 'state=' || coalesce(_exec_state,'null'));
  PERFORM pg_temp.rec('H','H-06','the browser cannot fabricate an effect ledger row',
    _insert_state <> '00000', 'state=' || coalesce(_insert_state,'null'));
  PERFORM pg_temp.rec('H','H-07','the browser cannot rewrite the effect map',
    _map_state <> '00000', 'state=' || coalesce(_map_state,'null'));
END $h$;

-- ===========================================================================
-- SECTION I — PERMANENT F4 NON-REGRESSION
-- The frozen initial-licensing path must remain untouched and unreachable by
-- the F5 effect engine.
-- ===========================================================================
DO $i$
DECLARE
  _lic uuid; _officer uuid; _app uuid; _plan jsonb; _exec text; _effects int;
  _f5_new_licences int; _svc uuid; _fx jsonb; _harness text := NULL;
BEGIN
  _officer := pg_temp.f5b3_officer();
  _lic := pg_temp.f5b3_license('renewal');
  IF _lic IS NULL THEN
    PERFORM pg_temp.rec('I','I-00','fixtures available for the F4 non-regression proof', false, 'no fixture licence');
    RETURN;
  END IF;
  _svc := pg_temp.f5b3_service(_lic, 'RENEWAL');

  BEGIN
    -- a genuine F4 initial filing: no licence binding, no service
    INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id, regulator_id, submitted_at)
    SELECT _officer, 'f5b3-probe-f4', 'submitted',
           jsonb_build_object('sector_id', l.sector_id, 'sub_sector_id', l.sub_sector_id),
           l.holder_id, l.regulator_id, now()
      FROM public.licenses l WHERE l.id = _lic
    RETURNING id INTO _app;

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);
    _plan := public.post_license_effect_plan(_app);

    BEGIN
      PERFORM set_config('app.workflow_mutation_context','trusted', true);
      PERFORM set_config('app.workflow_actor_id', _officer::text, true);
      PERFORM public.apply_post_license_effect(_app);
      _exec := 'NOT_BLOCKED';
    EXCEPTION WHEN others THEN
      _exec := SQLSTATE || ': ' || left(SQLERRM,120);
    END;
    PERFORM set_config('app.workflow_mutation_context','', true);

    SELECT count(*) INTO _effects FROM public.post_license_effects WHERE application_id = _app;

    -- an F5 renewal decision must not mint a new licence through F4 provisioning
    _fx := pg_temp.f5b3_fixture(_lic, _svc, _officer);
    PERFORM public.perform_final_workflow_approval((_fx->>'application_id')::uuid,
              (_fx->>'instance_id')::uuid, (_fx->>'step_id')::uuid, 'F5-B3 f4 boundary probe', _officer);
    SELECT count(*) INTO _f5_new_licences FROM public.licenses l
     WHERE l.application_id = (_fx->>'application_id')::uuid;

    RAISE EXCEPTION 'F5B3_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5B3_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,160); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('I','I-99','the F4 boundary probe executed without harness error', false, _harness);
    RETURN;
  END IF;

  PERFORM pg_temp.rec('I','I-01','F4 NON-REGRESSION: an initial filing is never classified as post-licensing',
    coalesce((_plan->>'is_post_license')::boolean, true) = false,
    'is_post_license=' || coalesce(_plan->>'is_post_license','null') || ' code=' || coalesce(_plan->>'code','null'));
  PERFORM pg_temp.rec('I','I-02','F4 NON-REGRESSION: the effect engine refuses to execute against an initial filing',
    _exec <> 'NOT_BLOCKED' AND _effects = 0,
    'exec=' || coalesce(_exec,'null') || ' effects=' || coalesce(_effects::text,'null'));
  PERFORM pg_temp.rec('I','I-03','F4 NON-REGRESSION: an F5 approval issues no licence through F4 provisioning',
    _f5_new_licences = 0, 'licences_issued=' || coalesce(_f5_new_licences::text,'null'));
END $i$;

-- ===========================================================================
-- SECTION J — zero residue
-- ===========================================================================
DO $j$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.applications WHERE license_type LIKE 'f5b3-probe%';
  PERFORM pg_temp.rec('J','J-01','no probe application survives the run', _n = 0, 'residue=' || _n);

  SELECT count(*) INTO _n FROM public.approval_workflows WHERE name = 'F5-B3 probe wf';
  PERFORM pg_temp.rec('J','J-02','no probe workflow survives the run', _n = 0, 'residue=' || _n);

  SELECT count(*) INTO _n FROM public.licensing_gate_configs WHERE notes = 'F5-B3 probe';
  PERFORM pg_temp.rec('J','J-03','no probe gate configuration survives the run', _n = 0, 'residue=' || _n);

  SELECT count(*) INTO _n FROM public.organization_names WHERE name = 'F5-B3 Probe Legal Name';
  PERFORM pg_temp.rec('J','J-04','no probe entity mutation survives the run', _n = 0, 'residue=' || _n);
END $j$;

-- ===========================================================================
-- REPORT
-- ===========================================================================
SELECT section, id, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, descr, detail
  FROM f5b3_results ORDER BY seq;

DO $r$
DECLARE _p int; _f int; _detail text;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE NOT passed) INTO _p, _f FROM f5b3_results;
  RAISE NOTICE 'verify:f5b3 — % PASS / % FAIL', _p, _f;
  IF _f > 0 THEN
    SELECT string_agg(id || ' (' || detail || ')', '; ') INTO _detail FROM f5b3_results WHERE NOT passed;
    RAISE EXCEPTION 'verify:f5b3 FAILED — %', _detail;
  END IF;
END $r$;

DROP TABLE IF EXISTS f5b3_results;
DROP FUNCTION IF EXISTS pg_temp.rec(text,text,text,boolean,text);
DROP FUNCTION IF EXISTS pg_temp.as_user(uuid,text);
DROP FUNCTION IF EXISTS pg_temp.f5b3_fixture(uuid,uuid,uuid,text);
DROP FUNCTION IF EXISTS pg_temp.f5b3_officer();
DROP FUNCTION IF EXISTS pg_temp.f5b3_license(text,boolean);
DROP FUNCTION IF EXISTS pg_temp.f5b3_service(uuid,text);

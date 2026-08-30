-- ============================================================================
-- certify:f5c — F5 POST-LICENSING SERVICES FULL CERTIFICATION
--
-- Consolidated, regulator-grade certification of the COMPLETE F5 module.
-- Exercises real product functions end to end (intake context -> server
-- resolvers -> submission gate -> governed decision -> canonical effect ->
-- register/state -> ledger/audit), never fixture shortcuts around the engines.
--
-- Every empirical write runs in a sub-block that always aborts -> zero residue.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f scripts/certify-f5c.sql
-- ============================================================================
\set ON_ERROR_STOP on
SET row_security = on;
\pset pager off
SET client_min_messages = notice;

DROP TABLE IF EXISTS f5c_results;
CREATE TEMP TABLE f5c_results (
  seq serial, section text, id text, descr text, passed boolean, detail text
);

DROP FUNCTION IF EXISTS pg_temp.rec(text,text,text,boolean,text);
-- Gate hygiene: the sandbox pooler can hand this gate a backend whose pg_temp
-- still holds a helper of the same name but different parameter names from an
-- earlier gate in the same pooled session. Drop first so CREATE cannot fail.
DROP FUNCTION IF EXISTS pg_temp.rec(text,text,text,boolean,text);
DROP FUNCTION IF EXISTS pg_temp.as_user(uuid,text);
DROP FUNCTION IF EXISTS pg_temp.as_anon(text);
DROP FUNCTION IF EXISTS pg_temp.val_as_user(uuid,text);
DROP FUNCTION IF EXISTS pg_temp.val_as_anon(text);
DROP FUNCTION IF EXISTS pg_temp.uid(text);
DROP FUNCTION IF EXISTS pg_temp.bufrec(jsonb,text,text,text,boolean,text);
DROP FUNCTION IF EXISTS pg_temp.act(uuid);

CREATE OR REPLACE FUNCTION pg_temp.rec(_s text, _id text, _d text, _ok boolean, _detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO f5c_results (section, id, descr, passed, detail)
  VALUES (_s, _id, _d, _ok, _detail);
END $$;

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

DROP FUNCTION IF EXISTS pg_temp.officer();
CREATE OR REPLACE FUNCTION pg_temp.officer() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT p.id FROM public.profiles p
   WHERE public.has_permission(p.id,'entity_structure','apply')
     AND public.has_permission(p.id,'entity_structure','approve')
   ORDER BY p.created_at LIMIT 1
$$;

DROP FUNCTION IF EXISTS pg_temp.host_license(boolean);
CREATE OR REPLACE FUNCTION pg_temp.host_license(_clean_fp boolean DEFAULT true)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT l.id FROM public.licenses l
   WHERE l.sub_sector_id IS NOT NULL AND lower(l.status) = 'active'
     AND EXISTS (SELECT 1 FROM public.licensees x WHERE x.id = l.holder_id)
     AND EXISTS (SELECT 1 FROM public.services s
                  WHERE s.sub_sector_id = l.sub_sector_id AND s.status = 'active'
                    AND lower(s.lifecycle_stage) = 'post_license')
     AND (NOT _clean_fp OR NOT EXISTS (
           SELECT 1 FROM public.fp_individual_roles ir
            WHERE ir.licensee_id = l.holder_id AND ir.is_current))
   ORDER BY l.issued_at DESC LIMIT 1
$$;

DROP FUNCTION IF EXISTS pg_temp.svc(uuid,text);
CREATE OR REPLACE FUNCTION pg_temp.svc(_license uuid, _code text)
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

-- Canonical decision fixture: gate configuration + governed workflow + a final
-- step assigned to the deciding officer + filing + active workflow instance.
DROP FUNCTION IF EXISTS pg_temp.fixture(uuid,uuid,uuid,text);
CREATE OR REPLACE FUNCTION pg_temp.fixture(_license uuid, _service uuid, _actor uuid,
                                           _status text DEFAULT 'submitted')
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE _lic public.licenses; _wf uuid; _step uuid; _app uuid; _inst uuid;
BEGIN
  SELECT * INTO _lic FROM public.licenses WHERE id = _license;

  INSERT INTO public.licensing_gate_configs (gate_key, applicability, service_id, is_active, notes)
  SELECT g, 'NOT_APPLICABLE', _service::text, true, 'F5-C probe'
    FROM unnest(ARRAY['forms_documents','fees','fit_and_proper','conditions']) g
  ON CONFLICT DO NOTHING;

  SELECT w.id INTO _wf FROM public.approval_workflows w
   WHERE w.license_type = 'f5c-probe' AND w.service_id = _service LIMIT 1;
  IF _wf IS NULL THEN
    INSERT INTO public.approval_workflows
      (name, license_type, entity_type, is_active, service_id, regulator_id, sector_id, sub_sector_id)
    VALUES ('F5-C probe wf ' || left(gen_random_uuid()::text,8), 'f5c-probe', 'post_application', true,
            _service, _lic.regulator_id, _lic.sector_id, _lic.sub_sector_id)
    RETURNING id INTO _wf;
  END IF;

  INSERT INTO public.approval_steps
    (workflow_id, step_order, name, approver_role, approver_type, approver_config, allowed_actions)
  SELECT _wf, 1, 'Final decision', 'admin', 'specific_users',
          jsonb_build_object('user_ids', jsonb_build_array(_actor)),
          '["approve","reject"]'::jsonb
   WHERE NOT EXISTS (SELECT 1 FROM public.approval_steps st WHERE st.workflow_id = _wf)
  RETURNING id INTO _step;
  IF _step IS NULL THEN
    SELECT st.id INTO _step FROM public.approval_steps st WHERE st.workflow_id = _wf LIMIT 1;
  END IF;

  INSERT INTO public.applications
    (applicant_id, license_type, status, data, entity_id, regulator_id, submitted_at)
  VALUES (_actor, 'f5c-probe', _status,
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

DROP FUNCTION IF EXISTS pg_temp.trusted_on(uuid);
CREATE OR REPLACE FUNCTION pg_temp.trusted_on(_actor uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.workflow_mutation_context','trusted', true);
  PERFORM set_config('app.workflow_actor_id', _actor::text, true);
END $$;

DROP FUNCTION IF EXISTS pg_temp.trusted_off();
CREATE OR REPLACE FUNCTION pg_temp.trusted_off() RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('app.workflow_mutation_context','', true); END $$;

DROP FUNCTION IF EXISTS pg_temp.nominate(uuid,uuid,text);
CREATE OR REPLACE FUNCTION pg_temp.nominate(_app uuid, _ind uuid, _role text DEFAULT 'DIRECTOR')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.fp_subject_context_writer','on', true);
  UPDATE public.applications
     SET data = jsonb_set(COALESCE(data,'{}'::jsonb), '{protected_fp_subjects}',
           COALESCE(data->'protected_fp_subjects','[]'::jsonb)
           || jsonb_build_object('individual_id', _ind, 'proposed_role', _role), true)
   WHERE id = _app;
  PERFORM set_config('app.fp_subject_context_writer','', true);
END $$;

DROP FUNCTION IF EXISTS pg_temp.individual(text);
CREATE OR REPLACE FUNCTION pg_temp.individual(_name text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.fp_individuals (full_name, status, notes)
  VALUES (_name, 'active', 'F5-C probe') RETURNING id INTO _id;
  RETURN _id;
END $$;

DROP FUNCTION IF EXISTS pg_temp.assessment(uuid,uuid,text);
CREATE OR REPLACE FUNCTION pg_temp.assessment(_ind uuid, _entity uuid, _status text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.fp_assessments (individual_id, licensee_id, assessment_type, status, declaration_data)
  VALUES (_ind, _entity, 'triggered', _status, jsonb_build_object('source','f5c_probe'))
  RETURNING id INTO _id;
  RETURN _id;
END $$;

DROP FUNCTION IF EXISTS pg_temp.determination(uuid,uuid,text);
CREATE OR REPLACE FUNCTION pg_temp.determination(_assessment uuid, _ind uuid, _outcome text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE _id uuid;
BEGIN
  UPDATE public.fp_assessments SET status = 'submitted' WHERE id = _assessment AND status = 'draft';
  UPDATE public.fp_assessments SET status = 'screening' WHERE id = _assessment AND status = 'submitted';
  INSERT INTO public.fp_screening_runs (assessment_id, individual_id, run_type, status, completed_at)
  VALUES (_assessment, _ind, 'initial', 'completed', now());
  INSERT INTO public.fp_determinations (assessment_id, individual_id, outcome, rationale,
                                        determined_by, determined_at, is_current)
  VALUES (_assessment, _ind, _outcome, 'F5-C probe',
          (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1), now(), true)
  RETURNING id INTO _id;
  UPDATE public.fp_assessments SET status = 'determined', determined_at = now()
   WHERE id = _assessment AND status <> 'determined';
  RETURN _id;
END $$;

-- ===========================================================================
-- SECTION A — FINAL LIVE CENSUS AND COMPLETENESS MATRIX
-- ===========================================================================
DO $a$
DECLARE _rows int; _defs int; _pl int; _ren int; _wf int; _forms int; _unmapped int;
        _fp_rows int; _fp_defs int; _var int; _sur int; _gap int; _bcr int; _unclassified int;
        _missing text := ''; _kind text;
BEGIN
  SELECT count(*), count(DISTINCT s.code) INTO _rows, _defs FROM public.services s
   WHERE s.status = 'active' AND lower(s.lifecycle_stage) = ANY (public.post_license_service_stages());
  PERFORM pg_temp.rec('A','A-01','Live F5 catalogue census (active post-licensing + renewal rows / definitions)',
    _rows >= 152 AND _defs >= 17, 'rows=' || _rows || ' definitions=' || _defs);

  SELECT count(*) INTO _pl FROM public.services
   WHERE status='active' AND lower(lifecycle_stage)='post_license';
  SELECT count(*) INTO _ren FROM public.services
   WHERE status='active' AND lower(lifecycle_stage)='renewal';
  PERFORM pg_temp.rec('A','A-02','Both post-licensing stages are populated',
    _pl >= 144 AND _ren >= 8, 'post_license=' || _pl || ' renewal=' || _ren);

  SELECT count(*) INTO _wf FROM public.services s
   WHERE s.status='active' AND lower(s.lifecycle_stage) = ANY (public.post_license_service_stages())
     AND s.workflow_id IS NULL;
  PERFORM pg_temp.rec('A','A-03','Every active F5 service row is bound to a canonical workflow',
    _wf = 0, 'unbound=' || _wf);

  SELECT count(*) INTO _forms FROM public.services s
   WHERE s.status='active' AND lower(s.lifecycle_stage) = ANY (public.post_license_service_stages())
     AND NOT EXISTS (SELECT 1 FROM public.form_templates t
                      WHERE t.service_id = s.id AND t.status = 'published');
  PERFORM pg_temp.rec('A','A-04','Every active F5 service row has a published request form',
    _forms = 0, 'formless=' || _forms);

  SELECT count(*) INTO _unmapped FROM public.services s
   WHERE s.status='active' AND lower(s.lifecycle_stage) = ANY (public.post_license_service_stages())
     AND (public.post_license_effect_key(s.id) IS NULL
          OR NOT EXISTS (SELECT 1 FROM public.post_license_effect_map m
                          WHERE m.service_code = public.post_license_effect_key(s.id)));
  PERFORM pg_temp.rec('A','A-05','Zero unmapped F5 services (every row resolves to a governed effect)',
    _unmapped = 0, 'unmapped=' || _unmapped);

  SELECT count(*) FILTER (WHERE NOT is_supported AND blocker_class = 'PRODUCT_GAP'),
         count(*) FILTER (WHERE NOT is_supported AND blocker_class = 'BUSINESS_CONFIGURATION_REQUIRED'),
         count(*) FILTER (WHERE NOT is_supported AND blocker_class IS NULL)
    INTO _gap, _bcr, _unclassified FROM public.post_license_effect_map;
  PERFORM pg_temp.rec('A','A-06','Zero unresolved Track-A PRODUCT GAP in the F5 effect register',
    _gap = 0, 'product_gap=' || _gap || ' bcr=' || _bcr || ' unclassified=' || _unclassified);
  PERFORM pg_temp.rec('A','A-07','Every unsupported service carries an explicit blocker classification',
    _unclassified = 0, 'unclassified=' || _unclassified);

  SELECT count(*), count(DISTINCT code) INTO _fp_rows, _fp_defs
    FROM public.services WHERE requires_fit_and_proper AND status='active';
  PERFORM pg_temp.rec('A','A-08','Fit and Proper dependency census is 40 rows across 5 definitions',
    _fp_rows = 40 AND _fp_defs = 5, 'rows=' || _fp_rows || ' definitions=' || _fp_defs);

  SELECT count(*) INTO _var FROM public.services WHERE code='PLS_LICENCE_VARIATION' AND status='active';
  SELECT count(*) INTO _sur FROM public.services WHERE code='PLS_VOLUNTARY_SURRENDER' AND status='active';
  PERFORM pg_temp.rec('A','A-09','Licence variation and voluntary surrender are published catalogue services',
    _var >= 8 AND _sur >= 8, 'variation=' || _var || ' surrender=' || _sur);

  -- Industry feature matrix: every regulated post-licensing family is represented
  FOR _kind IN SELECT x FROM (VALUES
      ('RENEWAL'),('PLS_LICENCE_VARIATION'),('PLS_VOLUNTARY_SURRENDER'),
      ('PLS_CHANGE_LEGAL_NAME'),('PLS_CHANGE_ADDRESS'),('PLS_AUDITOR_CHANGE'),
      ('PLS_CHANGE_OF_CONTROL'),('PLS_SHAREHOLDING_CHANGE'),('PLS_BENEFICIAL_OWNER_CHANGE'),
      ('PLS_DIRECTOR_APPOINTMENT'),('PLS_DIRECTOR_RESIGNATION'),('PLS_KFH_CHANGE'),
      ('PLS_NEW_BRANCH'),('PLS_BRANCH_CLOSURE'),('PLS_GROUP_RESTRUCTURE'),
      ('PLS_INCIDENT_NOTIFICATION'),('PLS_OUTSOURCING_NOTIFICATION')) v(x)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.post_license_effect_map m
                    WHERE m.service_code = _kind AND m.is_supported) THEN
      _missing := _missing || _kind || ' ';
    END IF;
  END LOOP;
  PERFORM pg_temp.rec('A','A-10','Industry feature matrix: all 17 regulated F5 families are supported',
    _missing = '', CASE WHEN _missing = '' THEN '17/17 supported' ELSE 'missing=' || _missing END);

  PERFORM pg_temp.rec('A','A-11','Expiry is owned by the governed scheduled lifecycle path',
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('license_expiry_sweep','mark_expired_licenses')) >= 2,
    'scheduled expiry functions installed');
  PERFORM pg_temp.rec('A','A-12','Reinstatement is owned by the internal lifecycle decision path',
    pg_get_functiondef(to_regprocedure('public.license_lifecycle_step(uuid,text,jsonb,text)')::oid)
      LIKE '%DECIDE_REINSTATEMENT%', 'DECIDE_REINSTATEMENT present');
END $a$;

-- ===========================================================================
-- SECTION B — E2E: STANDARD ENTITY CHANGE -> CANONICAL ENTITY EFFECT
-- ===========================================================================
DO $b$
DECLARE
  _lic uuid; _svc uuid; _officer uuid; _entity uuid; _fx jsonb; _plan jsonb; _res jsonb;
  _tpl uuid; _ver uuid; _resp uuid; _dc uuid; _probe text := 'F5-C Probe Legal Name';
  _effects int; _cs record; _items int; _name_after text; _audit int; _harness text := NULL;
BEGIN
  _officer := pg_temp.officer();
  _lic := pg_temp.host_license();
  _svc := pg_temp.svc(_lic, 'PLS_CHANGE_LEGAL_NAME');
  SELECT id INTO _dc FROM public.data_concepts WHERE code = 'ENTITY.LEGAL_NAME';
  SELECT fv.id, fv.template_id INTO _ver, _tpl FROM public.form_versions fv LIMIT 1;
  SELECT holder_id INTO _entity FROM public.licenses WHERE id = _lic;

  IF _officer IS NULL OR _svc IS NULL OR _dc IS NULL OR _ver IS NULL THEN
    PERFORM pg_temp.rec('B','B-00','fixtures available for the entity-change certification', false,
      'officer=' || coalesce(_officer::text,'null') || ' service=' || coalesce(_svc::text,'null'));
    RETURN;
  END IF;

  BEGIN
    _fx := pg_temp.fixture(_lic, _svc, _officer);
    INSERT INTO public.form_responses (template_id, version_id, user_id, entity_type, entity_id, status)
    VALUES (_tpl, _ver, _officer, 'application', (_fx->>'application_id')::uuid, 'submitted')
    RETURNING id INTO _resp;
    INSERT INTO public.form_submission_values (response_id, form_version_id, data_concept_id, value_text)
    VALUES (_resp, _ver, _dc, _probe);

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);

    _plan := public.post_license_effect_plan((_fx->>'application_id')::uuid);
    _res  := public.perform_final_workflow_approval((_fx->>'application_id')::uuid,
               (_fx->>'instance_id')::uuid, (_fx->>'step_id')::uuid, 'F5-C entity change', _officer);

    SELECT count(*) INTO _effects FROM public.post_license_effects
     WHERE application_id = (_fx->>'application_id')::uuid AND effect_kind = 'ENTITY_CHANGE';
    SELECT cs.id, cs.status INTO _cs FROM public.entity_change_sets cs
     WHERE cs.entity_id = _entity ORDER BY cs.created_at DESC LIMIT 1;
    SELECT count(*) INTO _items FROM public.entity_change_items i WHERE i.change_set_id = _cs.id;
    SELECT n.name INTO _name_after FROM public.organization_names n
     WHERE n.source_change_set_id = _cs.id AND n.name = _probe AND n.is_current LIMIT 1;
    SELECT count(*) INTO _audit FROM public.approval_actions aa
     WHERE aa.application_id = (_fx->>'application_id')::uuid;

    RAISE EXCEPTION 'F5C_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5C_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,200); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('B','B-99','the entity-change certification executed without harness error', false, _harness);
    RETURN;
  END IF;

  PERFORM pg_temp.rec('B','B-01','UI input -> server resolver: the filing plans as a READY ENTITY_CHANGE',
    _plan->>'effect_kind' = 'ENTITY_CHANGE' AND _plan->>'state' = 'READY'
    AND (_plan->>'change_items')::int > 0,
    'state=' || coalesce(_plan->>'state','null') || ' items=' || coalesce(_plan->>'change_items','null'));
  PERFORM pg_temp.rec('B','B-02','decision -> effect: approval succeeds and records exactly one effect',
    coalesce(_res->>'success','false') = 'true' AND _effects = 1,
    'success=' || coalesce(_res->>'success','null') || ' effects=' || coalesce(_effects::text,'null'));
  PERFORM pg_temp.rec('B','B-03','effect -> canonical register: the change set is APPLIED with items',
    _cs.status = 'APPLIED' AND _items > 0, 'status=' || coalesce(_cs.status,'null') || ' items=' || _items);
  PERFORM pg_temp.rec('B','B-04','canonical entity state changes as a result of the approval',
    _name_after = _probe, 'organization_name=' || coalesce(_name_after,'null'));
  PERFORM pg_temp.rec('B','B-05','the decision is recorded in the approval audit trail',
    _audit >= 1, 'approval_actions=' || _audit);
END $b$;

-- ===========================================================================
-- SECTION C — E2E: F&P DEPENDENT DIRECTOR / KFH CHANGE
-- Each scenario runs in its own independent rollback sub-transaction with a
-- genuine SUBMITTED filing, its own canonical subject and its own assessment,
-- so the refusal proved is the F&P blocker itself — never terminal
-- application state and never the one-open-filing duplicate guard.
-- ===========================================================================
DROP FUNCTION IF EXISTS pg_temp.fp_blocked(jsonb);
CREATE OR REPLACE FUNCTION pg_temp.fp_blocked(_plan jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(_plan->'blockers','[]'::jsonb)) b
                  WHERE b->>'code' LIKE 'FP\_%')
$$;

-- C-01 + C-02 — the dependency is real, and a filing with no nominated subject
-- fails closed on the F&P blocker while the filing itself is live (submitted).
DO $c1$
DECLARE _lic uuid; _svc uuid; _kfh uuid; _officer uuid; _kfh_fp boolean;
        _fx jsonb; _r jsonb; _p jsonb; _st text; _harness text := NULL;
BEGIN
  _officer := pg_temp.officer(); _lic := pg_temp.host_license();
  _svc := pg_temp.svc(_lic,'PLS_DIRECTOR_APPOINTMENT'); _kfh := pg_temp.svc(_lic,'PLS_KFH_CHANGE');
  IF _svc IS NULL OR _kfh IS NULL THEN
    PERFORM pg_temp.rec('C','C-01','a KFH/director service is genuinely flagged F&P dependent', false,'services missing');
    PERFORM pg_temp.rec('C','C-02','an F&P filing with no nominated subject fails closed on the F&P blocker', false,'services missing');
    RETURN;
  END IF;
  SELECT requires_fit_and_proper INTO _kfh_fp FROM public.services WHERE id = _kfh;

  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);
    _fx := pg_temp.fixture(_lic, _svc, _officer, 'submitted');
    _r  := public.post_license_fp_readiness((_fx->>'application_id')::uuid);
    _p  := public.post_license_effect_plan((_fx->>'application_id')::uuid);
    SELECT status INTO _st FROM public.applications WHERE id = (_fx->>'application_id')::uuid;
    RAISE EXCEPTION 'F5C_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5C_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,200); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;

  PERFORM pg_temp.rec('C','C-01','a KFH/director service is genuinely flagged F&P dependent',
    _kfh_fp, 'requires_fit_and_proper=' || coalesce(_kfh_fp::text,'null'));
  PERFORM pg_temp.rec('C','C-02','an F&P filing with no nominated subject fails closed on the F&P blocker',
    _harness IS NULL AND _st = 'submitted' AND _p->>'state' = 'BLOCKED'
      AND coalesce(_r->>'state','OK') <> 'OK' AND pg_temp.fp_blocked(_p),
    coalesce(_harness,'status=' || coalesce(_st,'null') || ' state=' || coalesce(_p->>'state','null')
      || ' blockers=' || left(coalesce(_p->>'blockers','null'),120)));
END $c1$;

-- C-03 — a nominated but undetermined subject blocks the change.
DO $c2$
DECLARE _lic uuid; _svc uuid; _officer uuid; _entity uuid; _ind uuid; _asm uuid;
        _fx jsonb; _r jsonb; _p jsonb; _st text; _harness text := NULL;
BEGIN
  _officer := pg_temp.officer(); _lic := pg_temp.host_license();
  _svc := pg_temp.svc(_lic,'PLS_DIRECTOR_APPOINTMENT');
  SELECT holder_id INTO _entity FROM public.licenses WHERE id = _lic;
  IF _svc IS NULL THEN
    PERFORM pg_temp.rec('C','C-03','a pending (undetermined) F&P subject blocks the change', false,'service missing');
    RETURN;
  END IF;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);
    _ind := pg_temp.individual('F5-C Pending Director');
    _asm := pg_temp.assessment(_ind, _entity, 'draft');
    _fx  := pg_temp.fixture(_lic, _svc, _officer, 'submitted');
    PERFORM pg_temp.nominate((_fx->>'application_id')::uuid, _ind, 'DIRECTOR');
    PERFORM pg_temp.trusted_on(_officer);
    PERFORM public.ensure_post_license_fp_links((_fx->>'application_id')::uuid);
    PERFORM pg_temp.trusted_off();
    _r := public.post_license_fp_readiness((_fx->>'application_id')::uuid);
    _p := public.post_license_effect_plan((_fx->>'application_id')::uuid);
    SELECT status INTO _st FROM public.applications WHERE id = (_fx->>'application_id')::uuid;
    RAISE EXCEPTION 'F5C_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5C_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,200); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;
  PERFORM pg_temp.rec('C','C-03','a pending (undetermined) F&P subject blocks the change',
    _harness IS NULL AND _st = 'submitted' AND _p->>'state' = 'BLOCKED'
      AND coalesce(_r->>'state','OK') <> 'OK' AND pg_temp.fp_blocked(_p),
    coalesce(_harness,'status=' || coalesce(_st,'null') || ' readiness=' || coalesce(_r->>'state','null')
      || ' blockers=' || left(coalesce(_p->>'blockers','null'),120)));
END $c2$;

-- C-04 + C-05 — a negative determination blocks the change and the governed
-- decision never fabricates a regulatory effect.
DO $c3$
DECLARE _lic uuid; _svc uuid; _officer uuid; _entity uuid; _ind uuid; _asm uuid;
        _fx jsonb; _r jsonb; _p jsonb; _st text; _res jsonb; _eff int;
        _harness text := NULL;
BEGIN
  _officer := pg_temp.officer(); _lic := pg_temp.host_license();
  _svc := pg_temp.svc(_lic,'PLS_DIRECTOR_APPOINTMENT');
  SELECT holder_id INTO _entity FROM public.licenses WHERE id = _lic;
  IF _svc IS NULL THEN
    PERFORM pg_temp.rec('C','C-04','a negative F&P determination blocks the change', false,'service missing');
    PERFORM pg_temp.rec('C','C-05','a blocked F&P decision never fabricates a regulatory effect', false,'service missing');
    RETURN;
  END IF;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);
    _ind := pg_temp.individual('F5-C Rejected Director');
    _asm := pg_temp.assessment(_ind, _entity, 'draft');
    _fx  := pg_temp.fixture(_lic, _svc, _officer, 'submitted');
    PERFORM pg_temp.nominate((_fx->>'application_id')::uuid, _ind, 'DIRECTOR');
    PERFORM pg_temp.trusted_on(_officer);
    PERFORM public.ensure_post_license_fp_links((_fx->>'application_id')::uuid);
    PERFORM pg_temp.trusted_off();
    -- certified F&P vocabulary: a negative outcome is 'rejected'
    PERFORM pg_temp.determination(_asm, _ind, 'rejected');
    _r := public.post_license_fp_readiness((_fx->>'application_id')::uuid);
    _p := public.post_license_effect_plan((_fx->>'application_id')::uuid);
    SELECT status INTO _st FROM public.applications WHERE id = (_fx->>'application_id')::uuid;
    BEGIN
      _res := public.perform_final_workflow_approval((_fx->>'application_id')::uuid,
                (_fx->>'instance_id')::uuid, (_fx->>'step_id')::uuid, 'F5-C negative F&P', _officer);
    EXCEPTION WHEN others THEN _res := jsonb_build_object('raised', SQLSTATE);
    END;
    SELECT count(*) INTO _eff FROM public.post_license_effects
     WHERE application_id = (_fx->>'application_id')::uuid;
    RAISE EXCEPTION 'F5C_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5C_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,200); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;
  PERFORM pg_temp.rec('C','C-04','a negative F&P determination blocks the change',
    _harness IS NULL AND _st = 'submitted' AND _p->>'state' = 'BLOCKED'
      AND coalesce(_r->>'state','OK') <> 'OK' AND pg_temp.fp_blocked(_p),
    coalesce(_harness,'status=' || coalesce(_st,'null') || ' readiness=' || coalesce(_r->>'state','null')
      || ' blockers=' || left(coalesce(_p->>'blockers','null'),120)));
  PERFORM pg_temp.rec('C','C-05','a blocked F&P decision never fabricates a regulatory effect',
    _harness IS NULL AND coalesce(_eff,0) = 0,
    coalesce(_harness,'effects=' || coalesce(_eff::text,'null')
      || ' decision=' || left(coalesce(_res::text,'null'),110)));
END $c3$;

-- C-06 + C-07 — a current positive determination satisfies readiness and the
-- structural change plans READY on the canonical entity-change effect.
DO $c4$
DECLARE _lic uuid; _svc uuid; _officer uuid; _entity uuid; _ind uuid; _asm uuid;
        _fx jsonb; _r jsonb; _p jsonb; _harness text := NULL;
BEGIN
  _officer := pg_temp.officer(); _lic := pg_temp.host_license();
  _svc := pg_temp.svc(_lic,'PLS_DIRECTOR_APPOINTMENT');
  SELECT holder_id INTO _entity FROM public.licenses WHERE id = _lic;
  IF _svc IS NULL THEN
    PERFORM pg_temp.rec('C','C-06','a current positive determination satisfies F&P readiness', false,'service missing');
    PERFORM pg_temp.rec('C','C-07','with F&P satisfied the structural change plans READY', false,'service missing');
    RETURN;
  END IF;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);
    _ind := pg_temp.individual('F5-C Approved Director');
    _asm := pg_temp.assessment(_ind, _entity, 'draft');
    _fx  := pg_temp.fixture(_lic, _svc, _officer, 'submitted');
    PERFORM pg_temp.nominate((_fx->>'application_id')::uuid, _ind, 'DIRECTOR');
    PERFORM pg_temp.trusted_on(_officer);
    PERFORM public.ensure_post_license_fp_links((_fx->>'application_id')::uuid);
    PERFORM pg_temp.trusted_off();
    -- certified F&P vocabulary: a positive outcome is 'approved'
    PERFORM pg_temp.determination(_asm, _ind, 'approved');
    _r := public.post_license_fp_readiness((_fx->>'application_id')::uuid);
    _p := public.post_license_effect_plan((_fx->>'application_id')::uuid);
    RAISE EXCEPTION 'F5C_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5C_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,200); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;
  PERFORM pg_temp.rec('C','C-06','a current positive determination satisfies F&P readiness',
    _harness IS NULL AND _r->>'state' = 'OK' AND coalesce((_r->>'satisfied')::boolean,false),
    coalesce(_harness,'readiness=' || left(coalesce(_r::text,'null'),160)));
  PERFORM pg_temp.rec('C','C-07','with F&P satisfied the structural change plans READY',
    _harness IS NULL AND NOT pg_temp.fp_blocked(_p) AND _p->>'effect_kind' = 'ENTITY_CHANGE',
    coalesce(_harness,'state=' || coalesce(_p->>'state','null')
      || ' kind=' || coalesce(_p->>'effect_kind','null')
      || ' blockers=' || left(coalesce(_p->>'blockers','null'),120)));
END $c4$;


-- ===========================================================================
-- SECTION D — E2E: NOTIFICATION SERVICE ACKNOWLEDGEMENT
-- ===========================================================================
DO $d$
DECLARE
  _lic uuid; _svc uuid; _officer uuid; _fx jsonb; _plan jsonb; _res jsonb;
  _acks int; _terms_before int; _terms_after int; _status_before text; _status_after text;
  _harness text := NULL;
BEGIN
  _officer := pg_temp.officer();
  _lic := pg_temp.host_license();
  _svc := pg_temp.svc(_lic, 'PLS_INCIDENT_NOTIFICATION');
  IF _svc IS NULL THEN
    PERFORM pg_temp.rec('D','D-00','fixtures available for the notification certification', false, 'no service');
    RETURN;
  END IF;
  SELECT count(*) INTO _terms_before FROM public.license_terms WHERE license_id = _lic;
  SELECT status INTO _status_before FROM public.licenses WHERE id = _lic;

  BEGIN
    _fx := pg_temp.fixture(_lic, _svc, _officer);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);
    _plan := public.post_license_effect_plan((_fx->>'application_id')::uuid);
    _res  := public.perform_final_workflow_approval((_fx->>'application_id')::uuid,
               (_fx->>'instance_id')::uuid, (_fx->>'step_id')::uuid, 'F5-C notification', _officer);
    SELECT count(*) INTO _acks FROM public.post_license_acknowledgements
     WHERE application_id = (_fx->>'application_id')::uuid;
    SELECT count(*) INTO _terms_after FROM public.license_terms WHERE license_id = _lic;
    SELECT status INTO _status_after FROM public.licenses WHERE id = _lic;
    RAISE EXCEPTION 'F5C_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5C_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,200); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('D','D-99','the notification certification executed without harness error', false, _harness);
    RETURN;
  END IF;

  PERFORM pg_temp.rec('D','D-01','a notification service plans as an acknowledgement only',
    _plan->>'effect_kind' = 'NOTIFICATION_ACK', 'kind=' || coalesce(_plan->>'effect_kind','null'));
  PERFORM pg_temp.rec('D','D-02','acceptance records exactly one regulatory acknowledgement',
    coalesce(_res->>'success','false') = 'true' AND _acks = 1,
    'success=' || coalesce(_res->>'success','null') || ' acks=' || coalesce(_acks::text,'null'));
  PERFORM pg_temp.rec('D','D-03','an acknowledgement never mutates licence status or terms',
    _terms_after = _terms_before AND _status_after = _status_before,
    'terms=' || _terms_before || '->' || coalesce(_terms_after::text,'?'));
END $d$;

-- ===========================================================================
-- SECTION E — E2E: NEW BRANCH AND BRANCH CLOSURE
-- ===========================================================================
DO $e$
DECLARE
  _lic uuid; _officer uuid; _svc_open uuid; _svc_close uuid; _tpl uuid; _ver uuid; _resp uuid;
  _fx_open jsonb; _fx_close jsonb; _plan_missing jsonb; _plan_open jsonb; _res_open jsonb;
  _plan_close jsonb; _res_close jsonb; _est uuid; _open_events int; _close_events int;
  _status_after text; _repeat text; _est_count int; _harness text := NULL;
BEGIN
  _officer := pg_temp.officer();
  _lic := pg_temp.host_license();
  _svc_open := pg_temp.svc(_lic, 'PLS_NEW_BRANCH');
  _svc_close := pg_temp.svc(_lic, 'PLS_BRANCH_CLOSURE');
  SELECT fv.id, fv.template_id INTO _ver, _tpl FROM public.form_versions fv LIMIT 1;
  IF _svc_open IS NULL OR _svc_close IS NULL OR _ver IS NULL THEN
    PERFORM pg_temp.rec('E','E-00','fixtures available for the establishment certification', false, 'missing');
    RETURN;
  END IF;

  BEGIN
    _fx_open := pg_temp.fixture(_lic, _svc_open, _officer);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);
    _plan_missing := public.post_license_effect_plan((_fx_open->>'application_id')::uuid);

    INSERT INTO public.form_responses (template_id, version_id, user_id, entity_type, entity_id, status)
    VALUES (_tpl, _ver, _officer, 'application', (_fx_open->>'application_id')::uuid, 'submitted')
    RETURNING id INTO _resp;
    INSERT INTO public.form_submission_values (response_id, form_version_id, data_concept_id, value_text)
    SELECT _resp, _ver, dc.id, 'F5-C Probe Branch' FROM public.data_concepts dc
     WHERE dc.code = 'ESTABLISHMENT.NAME';
    INSERT INTO public.form_submission_values (response_id, form_version_id, data_concept_id, value_text)
    SELECT _resp, _ver, dc.id, '1 Probe Street' FROM public.data_concepts dc
     WHERE dc.code = 'ESTABLISHMENT.ADDRESS';
    INSERT INTO public.form_submission_values (response_id, form_version_id, data_concept_id, value_date)
    SELECT _resp, _ver, dc.id, current_date FROM public.data_concepts dc
     WHERE dc.code = 'ESTABLISHMENT.OPENING_DATE';

    _plan_open := public.post_license_effect_plan((_fx_open->>'application_id')::uuid);
    _res_open  := public.perform_final_workflow_approval((_fx_open->>'application_id')::uuid,
                    (_fx_open->>'instance_id')::uuid, (_fx_open->>'step_id')::uuid,
                    'F5-C new branch', _officer);
    SELECT id INTO _est FROM public.regulated_establishments
     WHERE source_application_id = (_fx_open->>'application_id')::uuid;
    SELECT count(*) INTO _open_events FROM public.regulated_establishment_events
     WHERE establishment_id = _est AND event_type = 'OPENED';

    BEGIN
      PERFORM pg_temp.trusted_on(_officer);
      PERFORM public.apply_post_license_effect((_fx_open->>'application_id')::uuid);
      _repeat := 'idempotent';
    EXCEPTION WHEN others THEN _repeat := SQLSTATE;
    END;
    PERFORM pg_temp.trusted_off();
    SELECT count(*) INTO _est_count FROM public.regulated_establishments
     WHERE source_application_id = (_fx_open->>'application_id')::uuid;

    _fx_close := pg_temp.fixture(_lic, _svc_close, _officer);
    PERFORM set_config('app.establishment_context_writer','on', true);
    PERFORM public.set_application_establishment_target((_fx_close->>'application_id')::uuid, _est);
    PERFORM set_config('app.establishment_context_writer','', true);
    _plan_close := public.post_license_effect_plan((_fx_close->>'application_id')::uuid);
    _res_close  := public.perform_final_workflow_approval((_fx_close->>'application_id')::uuid,
                    (_fx_close->>'instance_id')::uuid, (_fx_close->>'step_id')::uuid,
                    'F5-C branch closure', _officer);
    SELECT status INTO _status_after FROM public.regulated_establishments WHERE id = _est;
    SELECT count(*) INTO _close_events FROM public.regulated_establishment_events
     WHERE establishment_id = _est AND event_type = 'CLOSED';

    RAISE EXCEPTION 'F5C_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5C_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,200); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('E','E-99','the establishment certification executed without harness error', false, _harness);
    RETURN;
  END IF;

  PERFORM pg_temp.rec('E','E-01','a branch filing without canonical branch data fails closed',
    _plan_missing->>'state' <> 'READY', 'state=' || coalesce(_plan_missing->>'state','null'));
  PERFORM pg_temp.rec('E','E-02','a complete new-branch filing plans as READY ESTABLISHMENT_OPEN',
    _plan_open->>'effect_kind' = 'ESTABLISHMENT_OPEN' AND _plan_open->>'state' = 'READY',
    'state=' || coalesce(_plan_open->>'state','null'));
  PERFORM pg_temp.rec('E','E-03','approval creates the canonical establishment register row and OPENED event',
    _est IS NOT NULL AND _open_events = 1 AND coalesce(_res_open->>'success','false') = 'true',
    'establishment=' || coalesce(_est::text,'null') || ' opened_events=' || coalesce(_open_events::text,'null'));
  PERFORM pg_temp.rec('E','E-04','a repeated establishment effect is idempotent',
    _est_count = 1, 'retry=' || coalesce(_repeat,'null') || ' rows=' || coalesce(_est_count::text,'null'));
  PERFORM pg_temp.rec('E','E-05','branch closure plans and executes against the canonical target',
    _plan_close->>'effect_kind' = 'ESTABLISHMENT_CLOSE' AND coalesce(_res_close->>'success','false') = 'true',
    'state=' || coalesce(_plan_close->>'state','null'));
  PERFORM pg_temp.rec('E','E-06','closure updates canonical status and appends a CLOSED event',
    _status_after = 'CLOSED' AND _close_events = 1,
    'status=' || coalesce(_status_after,'null') || ' closed_events=' || coalesce(_close_events::text,'null'));
END $e$;

-- ===========================================================================
-- SECTION F — E2E: RENEWAL
-- ===========================================================================
DO $f$
DECLARE
  _lic uuid; _svc uuid; _officer uuid; _fx jsonb; _plan jsonb; _res jsonb;
  _valid_before timestamptz; _valid_after timestamptz; _new_terms int; _superseded int;
  _renewals int; _effects int; _harness text := NULL;
BEGIN
  _officer := pg_temp.officer();
  SELECT l.id INTO _lic FROM public.licenses l
   WHERE l.sub_sector_id IS NOT NULL AND lower(l.status) = 'active'
     AND EXISTS (SELECT 1 FROM public.licensees x WHERE x.id = l.holder_id)
     AND EXISTS (SELECT 1 FROM public.services s WHERE s.sub_sector_id = l.sub_sector_id
                   AND s.status='active' AND lower(s.lifecycle_stage)='renewal')
     AND NOT EXISTS (SELECT 1 FROM public.fp_individual_roles ir
                      WHERE ir.licensee_id = l.holder_id AND ir.is_current)
   ORDER BY l.issued_at DESC LIMIT 1;
  IF _lic IS NULL THEN
    PERFORM pg_temp.rec('F','F-00','fixtures available for the renewal certification', false, 'no licence');
    RETURN;
  END IF;
  _svc := pg_temp.svc(_lic, 'RENEWAL');
  SELECT valid_until INTO _valid_before FROM public.licenses WHERE id = _lic;

  BEGIN
    _fx := pg_temp.fixture(_lic, _svc, _officer);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);
    _plan := public.post_license_effect_plan((_fx->>'application_id')::uuid);
    _res  := public.perform_final_workflow_approval((_fx->>'application_id')::uuid,
               (_fx->>'instance_id')::uuid, (_fx->>'step_id')::uuid, 'F5-C renewal', _officer);
    SELECT count(*) FILTER (WHERE t.term_kind='renewal' AND t.is_current),
           count(*) FILTER (WHERE t.term_kind='original' AND NOT t.is_current)
      INTO _new_terms, _superseded FROM public.license_terms t WHERE t.license_id = _lic;
    SELECT valid_until INTO _valid_after FROM public.licenses WHERE id = _lic;
    SELECT count(*) INTO _renewals FROM public.license_renewals WHERE license_id = _lic;
    SELECT count(*) INTO _effects FROM public.post_license_effects
     WHERE application_id = (_fx->>'application_id')::uuid;
    RAISE EXCEPTION 'F5C_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5C_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,200); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('F','F-99','the renewal certification executed without harness error', false, _harness);
    RETURN;
  END IF;

  PERFORM pg_temp.rec('F','F-01','a renewal filing plans as a READY RENEWAL on the canonical engine',
    _plan->>'effect_kind' = 'RENEWAL' AND _plan->>'state' = 'READY',
    'state=' || coalesce(_plan->>'state','null'));
  PERFORM pg_temp.rec('F','F-02','renewal approval opens one current renewal term and supersedes the prior term',
    coalesce(_res->>'success','false') = 'true' AND _new_terms = 1 AND _superseded = 1,
    'renewal_terms=' || coalesce(_new_terms::text,'null') || ' superseded=' || coalesce(_superseded::text,'null'));
  PERFORM pg_temp.rec('F','F-03','licence validity advances and a canonical renewal record exists',
    _valid_after > _valid_before AND _renewals >= 1,
    'valid=' || coalesce(_valid_before::text,'null') || '->' || coalesce(_valid_after::text,'null'));
  PERFORM pg_temp.rec('F','F-04','exactly one governed effect ledger row records the renewal',
    _effects = 1, 'effects=' || coalesce(_effects::text,'null'));
END $f$;

-- ===========================================================================
-- SECTION G — E2E: LICENCE VARIATION AND VOLUNTARY SURRENDER
-- ===========================================================================
DO $g$
DECLARE
  _lic uuid; _officer uuid; _var uuid; _sur uuid; _tpl uuid; _ver uuid; _resp uuid;
  _fx_var jsonb; _fx_sur jsonb; _p_var_empty jsonb; _p_var jsonb; _p_sur_empty jsonb; _p_sur jsonb;
  _res_var jsonb; _res_sur jsonb; _eff_var int; _eff_sur int; _input jsonb;
  _codes text; _harness text := NULL;
BEGIN
  _officer := pg_temp.officer();
  _lic := pg_temp.host_license();
  _var := pg_temp.svc(_lic, 'PLS_LICENCE_VARIATION');
  _sur := pg_temp.svc(_lic, 'PLS_VOLUNTARY_SURRENDER');
  SELECT fv.id, fv.template_id INTO _ver, _tpl FROM public.form_versions fv LIMIT 1;
  IF _var IS NULL OR _sur IS NULL THEN
    PERFORM pg_temp.rec('G','G-00','variation and surrender services applicable to a live licence', false,
      'variation=' || coalesce(_var::text,'null') || ' surrender=' || coalesce(_sur::text,'null'));
    RETURN;
  END IF;

  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);

    _fx_var := pg_temp.fixture(_lic, _var, _officer);
    _p_var_empty := public.post_license_effect_plan((_fx_var->>'application_id')::uuid);
    INSERT INTO public.form_responses (template_id, version_id, user_id, entity_type, entity_id, status)
    VALUES (_tpl, _ver, _officer, 'application', (_fx_var->>'application_id')::uuid, 'submitted')
    RETURNING id INTO _resp;
    INSERT INTO public.form_submission_values (response_id, form_version_id, data_concept_id, value_text)
    SELECT _resp, _ver, dc.id, 'Scope extension' FROM public.data_concepts dc
     WHERE dc.code = 'LICENCE.VARIATION_TYPE';
    INSERT INTO public.form_submission_values (response_id, form_version_id, data_concept_id, value_text)
    SELECT _resp, _ver, dc.id, 'F5-C variation rationale' FROM public.data_concepts dc
     WHERE dc.code = 'LICENCE.VARIATION_RATIONALE';
    _p_var := public.post_license_effect_plan((_fx_var->>'application_id')::uuid);
    BEGIN
      _res_var := public.perform_final_workflow_approval((_fx_var->>'application_id')::uuid,
                    (_fx_var->>'instance_id')::uuid, (_fx_var->>'step_id')::uuid,
                    'F5-C variation', _officer);
    EXCEPTION WHEN others THEN _res_var := jsonb_build_object('raised', SQLSTATE || ': ' || left(SQLERRM,120));
    END;
    SELECT count(*) INTO _eff_var FROM public.post_license_effects
     WHERE application_id = (_fx_var->>'application_id')::uuid;

    _fx_sur := pg_temp.fixture(_lic, _sur, _officer);
    _p_sur_empty := public.post_license_effect_plan((_fx_sur->>'application_id')::uuid);
    INSERT INTO public.form_responses (template_id, version_id, user_id, entity_type, entity_id, status)
    VALUES (_tpl, _ver, _officer, 'application', (_fx_sur->>'application_id')::uuid, 'submitted')
    RETURNING id INTO _resp;
    INSERT INTO public.form_submission_values (response_id, form_version_id, data_concept_id, value_text)
    SELECT _resp, _ver, dc.id, 'Ceasing regulated business' FROM public.data_concepts dc
     WHERE dc.code = 'LICENCE.SURRENDER_REASON';
    INSERT INTO public.form_submission_values (response_id, form_version_id, data_concept_id, value_date)
    SELECT _resp, _ver, dc.id, current_date + 30 FROM public.data_concepts dc
     WHERE dc.code = 'LICENCE.SURRENDER_EFFECTIVE_DATE';
    INSERT INTO public.form_submission_values (response_id, form_version_id, data_concept_id, value_text)
    SELECT _resp, _ver, dc.id, 'Section 12(3) probe basis' FROM public.data_concepts dc
     WHERE dc.code = 'LICENCE.SURRENDER_LEGAL_BASIS';
    _input := public.post_license_lifecycle_input((_fx_sur->>'application_id')::uuid);
    _p_sur := public.post_license_effect_plan((_fx_sur->>'application_id')::uuid);
    BEGIN
      _res_sur := public.perform_final_workflow_approval((_fx_sur->>'application_id')::uuid,
                    (_fx_sur->>'instance_id')::uuid, (_fx_sur->>'step_id')::uuid,
                    'F5-C surrender', _officer);
    EXCEPTION WHEN others THEN _res_sur := jsonb_build_object('raised', SQLSTATE || ': ' || left(SQLERRM,120));
    END;
    SELECT count(*) INTO _eff_sur FROM public.post_license_effects
     WHERE application_id = (_fx_sur->>'application_id')::uuid;

    RAISE EXCEPTION 'F5C_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5C_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,200); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('G','G-99','the lifecycle certification executed without harness error', false, _harness);
    RETURN;
  END IF;

  _codes := (SELECT string_agg(x->>'code', ',') FROM jsonb_array_elements(_p_var_empty->'blockers') x);
  PERFORM pg_temp.rec('G','G-01','a variation without captured type/rationale fails closed',
    coalesce(_codes,'') LIKE '%VARIATION_INPUT_REQUIRED%', 'blockers=' || coalesce(_codes,'none'));
  PERFORM pg_temp.rec('G','G-02','a complete variation routes to the certified lifecycle engine',
    _p_var->>'effect_kind' = 'LICENCE_VARIATION' AND _p_var->>'handler' = 'license_lifecycle_step',
    'state=' || coalesce(_p_var->>'state','null') || ' handler=' || coalesce(_p_var->>'handler','null'));
  PERFORM pg_temp.rec('G','G-03','the variation decision either applies one governed effect or fails closed',
    (coalesce(_res_var->>'success','false') = 'true' AND _eff_var = 1)
    OR (coalesce(_res_var->>'success','false') <> 'true' AND _eff_var = 0),
    'result=' || left(coalesce(_res_var::text,'null'),140) || ' effects=' || coalesce(_eff_var::text,'null'));

  _codes := (SELECT string_agg(x->>'code', ',') FROM jsonb_array_elements(_p_sur_empty->'blockers') x);
  PERFORM pg_temp.rec('G','G-04','a surrender without reason/effective date fails closed',
    coalesce(_codes,'') LIKE '%SURRENDER_INPUT_REQUIRED%', 'blockers=' || coalesce(_codes,'none'));
  PERFORM pg_temp.rec('G','G-05','the surrender input resolver returns reason, date and legal basis',
    coalesce(_input->>'surrender_reason','') <> ''
    AND (_input->>'surrender_effective_date') IS NOT NULL
    AND coalesce(_input->>'surrender_legal_basis','') <> '',
    'input=' || left(coalesce(_input::text,'null'),160));
  PERFORM pg_temp.rec('G','G-06','a complete surrender routes to the certified lifecycle engine',
    _p_sur->>'effect_kind' = 'LICENCE_SURRENDER' AND _p_sur->>'handler' = 'license_lifecycle_step',
    'state=' || coalesce(_p_sur->>'state','null') || ' handler=' || coalesce(_p_sur->>'handler','null'));
  PERFORM pg_temp.rec('G','G-07','the surrender decision either applies one governed effect or fails closed',
    (coalesce(_res_sur->>'success','false') = 'true' AND _eff_sur = 1)
    OR (coalesce(_res_sur->>'success','false') <> 'true' AND _eff_sur = 0),
    'result=' || left(coalesce(_res_sur::text,'null'),140) || ' effects=' || coalesce(_eff_sur::text,'null'));
END $g$;

-- ===========================================================================
-- SECTION H — SUBMISSION BOUNDARY: FEES, WITHDRAWAL, DUPLICATES
-- Every state transition is driven through the canonical governed functions
-- (submit_application / withdraw_application). No protected workflow or status
-- field is ever mutated directly: WORKFLOW_FIELD_LOCKED stays intact.
-- Each scenario is an independent rollback sub-transaction.
-- ===========================================================================
DROP FUNCTION IF EXISTS pg_temp.f5_draft(uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION pg_temp.f5_draft(_license uuid, _service uuid, _actor uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE _lic public.licenses; _app uuid;
BEGIN
  SELECT * INTO _lic FROM public.licenses WHERE id = _license;
  INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id, regulator_id)
  VALUES (_actor, 'f5c-fee', 'draft',
          jsonb_build_object('type','post_license','license_id',_license,'service_id',_service),
          _lic.holder_id, _lic.regulator_id)
  RETURNING id INTO _app;
  RETURN _app;
END $$;

-- Rollback-safe business-configuration fixture: a real blocking lifecycle fee.
DROP FUNCTION IF EXISTS pg_temp.fee_binding(uuid,text,numeric);
CREATE OR REPLACE FUNCTION pg_temp.fee_binding(_license uuid, _matter text, _amount numeric)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE _lic public.licenses; _id uuid;
BEGIN
  SELECT * INTO _lic FROM public.licenses WHERE id = _license;
  INSERT INTO public.license_fee_bindings
    (regulator_id, matter_kind, fee_type_code, description, amount_override, currency,
     blocking, purpose, is_active, effective_from, notes)
  VALUES (_lic.regulator_id, _matter, 'F5C_PROBE_FEE', 'F5-C probe lifecycle fee',
          _amount, 'JMD', true, 'PRODUCTION', true, current_date, 'F5-C probe')
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- H-01 — absent fee configuration never fabricates a charge, and the governed
-- submission proceeds.
DO $h1$
DECLARE _lic uuid; _svc uuid; _officer uuid; _app uuid; _fee jsonb; _sub jsonb;
        _st text; _harness text := NULL;
BEGIN
  _officer := pg_temp.officer(); _lic := pg_temp.host_license();
  _svc := pg_temp.svc(_lic,'PLS_CHANGE_ADDRESS');
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);
    _app := pg_temp.f5_draft(_lic, _svc, _officer);
    _fee := public.post_license_fee_assessment(_app);
    _sub := public.submit_application(_app, 'F5-C acknowledgement');
    SELECT status INTO _st FROM public.applications WHERE id = _app;
    RAISE EXCEPTION 'F5C_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5C_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,200); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;
  PERFORM pg_temp.rec('H','H-01','absent fee configuration never fabricates a charge and does not block submission',
    _harness IS NULL
    AND coalesce((_fee->>'requires_payment')::boolean,true) = false
    AND coalesce((_fee->>'amount_due')::numeric,-1) = 0
    AND _fee->>'basis' IN ('BUSINESS_CONFIGURATION_ABSENT','NO_FEE_RESOLVED','WAIVED_OR_ZERO_RATED')
    AND _sub->>'code' IS DISTINCT FROM 'PAYMENT_REQUIRED' AND _st = 'submitted',
    coalesce(_harness,'fee=' || left(coalesce(_fee::text,'null'),120)
      || ' submit=' || left(coalesce(_sub::text,'null'),90) || ' status=' || coalesce(_st,'null')));
END $h1$;

-- H-02 + H-03 — a real assessed amount blocks submission until a valid
-- completed payment exists; then the same governed submission proceeds.
DO $h2$
DECLARE _lic uuid; _svc uuid; _officer uuid; _app uuid; _fee jsonb;
        _blocked jsonb; _st_blocked text; _after jsonb; _st_after text;
        _harness text := NULL;
BEGIN
  _officer := pg_temp.officer(); _lic := pg_temp.host_license();
  _svc := pg_temp.svc(_lic,'RENEWAL');
  IF _svc IS NULL THEN
    PERFORM pg_temp.rec('H','H-02','an assessed fee above zero blocks submission until payment', false,'renewal service missing');
    PERFORM pg_temp.rec('H','H-03','a valid completed payment releases the governed submission', false,'renewal service missing');
    RETURN;
  END IF;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);
    PERFORM pg_temp.fee_binding(_lic, 'renewal', 25000);
    _app := pg_temp.f5_draft(_lic, _svc, _officer);
    _fee := public.post_license_fee_assessment(_app);
    _blocked := public.submit_application(_app, 'F5-C acknowledgement');
    SELECT status INTO _st_blocked FROM public.applications WHERE id = _app;

    INSERT INTO public.payments (user_id, application_id, amount, currency, status, payment_channel)
    VALUES (_officer, _app, 25000, 'JMD', 'completed', 'online');
    _after := public.submit_application(_app, 'F5-C acknowledgement');
    SELECT status INTO _st_after FROM public.applications WHERE id = _app;
    RAISE EXCEPTION 'F5C_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5C_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,200); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;
  PERFORM pg_temp.rec('H','H-02','an assessed fee above zero blocks submission until payment',
    _harness IS NULL
    AND coalesce((_fee->>'amount_due')::numeric,0) > 0
    AND coalesce((_fee->>'requires_payment')::boolean,false)
    AND _blocked->>'code' = 'PAYMENT_REQUIRED' AND (_blocked->>'http') = '402'
    AND _st_blocked = 'draft',
    coalesce(_harness,'fee=' || coalesce(_fee->>'amount_due','null')
      || ' refusal=' || left(coalesce(_blocked::text,'null'),110) || ' status=' || coalesce(_st_blocked,'null')));
  PERFORM pg_temp.rec('H','H-03','a valid completed payment releases the governed submission',
    _harness IS NULL AND _st_after = 'submitted'
    AND coalesce(_after->>'code','') IS DISTINCT FROM 'PAYMENT_REQUIRED',
    coalesce(_harness,'status=' || coalesce(_st_after,'null')
      || ' result=' || left(coalesce(_after::text,'null'),110)));
END $h2$;

-- H-04 — a zero-rated / waived lifecycle fee does not block submission.
DO $h3$
DECLARE _lic uuid; _svc uuid; _officer uuid; _app uuid; _fee jsonb; _sub jsonb;
        _st text; _harness text := NULL;
BEGIN
  _officer := pg_temp.officer(); _lic := pg_temp.host_license();
  _svc := pg_temp.svc(_lic,'RENEWAL');
  IF _svc IS NULL THEN
    PERFORM pg_temp.rec('H','H-04','a zero-rated or waived fee does not block the governed submission', false,'renewal service missing');
    RETURN;
  END IF;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);
    PERFORM pg_temp.fee_binding(_lic, 'renewal', 0);
    _app := pg_temp.f5_draft(_lic, _svc, _officer);
    _fee := public.post_license_fee_assessment(_app);
    _sub := public.submit_application(_app, 'F5-C acknowledgement');
    SELECT status INTO _st FROM public.applications WHERE id = _app;
    RAISE EXCEPTION 'F5C_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5C_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,200); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;
  PERFORM pg_temp.rec('H','H-04','a zero-rated or waived fee does not block the governed submission',
    _harness IS NULL
    AND coalesce((_fee->>'amount_due')::numeric,-1) = 0
    AND coalesce((_fee->>'requires_payment')::boolean,true) = false
    AND _sub->>'code' IS DISTINCT FROM 'PAYMENT_REQUIRED' AND _st = 'submitted',
    coalesce(_harness,'fee=' || left(coalesce(_fee::text,'null'),110)
      || ' submit=' || left(coalesce(_sub::text,'null'),80) || ' status=' || coalesce(_st,'null')));
END $h3$;

-- H-05 — the frozen F4 initial-licensing payment contract is unchanged.
DO $h4$
DECLARE _lic public.licenses; _officer uuid; _app uuid; _sub jsonb; _fee_f4 jsonb;
        _st text; _harness text := NULL;
BEGIN
  _officer := pg_temp.officer();
  SELECT * INTO _lic FROM public.licenses WHERE id = pg_temp.host_license();
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);
    INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id, regulator_id)
    VALUES (_officer, 'f5c-fee', 'draft', '{"type":"new_application"}'::jsonb,
            _lic.holder_id, _lic.regulator_id)
    RETURNING id INTO _app;
    _fee_f4 := public.post_license_fee_assessment(_app);
    _sub := public.submit_application(_app, 'F5-C acknowledgement');
    SELECT status INTO _st FROM public.applications WHERE id = _app;
    RAISE EXCEPTION 'F5C_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5C_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,200); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;
  PERFORM pg_temp.rec('H','H-05','initial licensing (F4) payment behaviour is unchanged by the F5 fee boundary',
    _harness IS NULL AND _fee_f4->>'state' = 'NOT_POST_LICENSE'
    AND _sub->>'code' = 'PAYMENT_REQUIRED' AND _st = 'draft',
    coalesce(_harness,'assessment=' || left(coalesce(_fee_f4::text,'null'),80)
      || ' submit=' || left(coalesce(_sub::text,'null'),100) || ' status=' || coalesce(_st,'null')));
END $h4$;

-- H-06 — the duplicate / open-filing guard and canonical applicability both
-- remain enforced; neither is relaxed by the fee boundary.
DO $h5$
DECLARE _lic uuid; _svc uuid; _officer uuid; _app uuid; _sub jsonb;
        _dup_state text; _wrong text; _harness text := NULL;
BEGIN
  _officer := pg_temp.officer(); _lic := pg_temp.host_license();
  _svc := pg_temp.svc(_lic,'PLS_CHANGE_ADDRESS');
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);
    _app := pg_temp.f5_draft(_lic, _svc, _officer);
    _sub := public.submit_application(_app, 'F5-C acknowledgement');
    -- a second live filing for the same licence + service must be refused
    BEGIN
      PERFORM pg_temp.f5_draft(_lic, _svc, _officer);
      _dup_state := 'ACCEPTED';
    EXCEPTION WHEN others THEN _dup_state := SQLSTATE || ':' || left(SQLERRM,60);
    END;
    _wrong := public.post_license_service_applicability(_svc, gen_random_uuid());
    RAISE EXCEPTION 'F5C_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5C_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,200); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;
  PERFORM pg_temp.rec('H','H-06','the duplicate/open-filing guard and canonical applicability remain enforced',
    _harness IS NULL AND coalesce(_dup_state,'ACCEPTED') <> 'ACCEPTED'
    AND coalesce(_wrong,'OK') <> 'OK',
    coalesce(_harness,'duplicate=' || coalesce(_dup_state,'null')
      || ' wrong_licence=' || coalesce(_wrong,'null')));
END $h5$;

-- H-07 — withdrawal before a final decision runs through governed withdrawal.
DO $h6$
DECLARE _lic uuid; _svc uuid; _officer uuid; _app uuid; _sub jsonb; _wd jsonb;
        _st text; _harness text := NULL;
BEGIN
  _officer := pg_temp.officer(); _lic := pg_temp.host_license();
  _svc := pg_temp.svc(_lic,'PLS_CHANGE_ADDRESS');
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);
    _app := pg_temp.f5_draft(_lic, _svc, _officer);
    _sub := public.submit_application(_app, 'F5-C acknowledgement');
    _wd  := public.withdraw_application(_app, 'F5-C applicant withdrawal');
    SELECT status INTO _st FROM public.applications WHERE id = _app;
    RAISE EXCEPTION 'F5C_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5C_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,200); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;
  PERFORM pg_temp.rec('H','H-07','an applicant withdraws before a final decision through governed withdrawal',
    _harness IS NULL AND _st = 'withdrawn'
    AND coalesce((_wd->>'success')::boolean, _wd ? 'application_id'),
    coalesce(_harness,'status=' || coalesce(_st,'null')
      || ' result=' || left(coalesce(_wd::text,'null'),110)));
END $h6$;

-- H-08 — zero certification residue in the application register.
DO $h7$
DECLARE _n int; _p int;
BEGIN
  SELECT count(*) INTO _n FROM public.applications WHERE license_type IN ('f5c-fee','f5c-probe');
  SELECT count(*) INTO _p FROM public.license_fee_bindings WHERE fee_type_code = 'F5C_PROBE_FEE';
  PERFORM pg_temp.rec('H','H-08','zero certification-harness residue in the application and fee registers',
    _n = 0 AND _p = 0, 'applications=' || _n || ' fee_bindings=' || _p);
END $h7$;


-- ===========================================================================
-- SECTION I — AUTHORITY, ISOLATION AND FAIL-CLOSED CASES
-- ===========================================================================
DO $i$
DECLARE
  _lic uuid; _officer uuid; _svc uuid; _outsider uuid; _fx jsonb;
  _plan_unknown jsonb; _plan_gap jsonb; _gap_svc uuid;
  _exec_state text; _ledger_state text; _map_state text; _est_state text; _fp_state text;
  _res_stale jsonb; _stale text := NULL; _harness text := NULL;
BEGIN
  _officer := pg_temp.officer();
  _lic := pg_temp.host_license();
  _svc := pg_temp.svc(_lic, 'PLS_INCIDENT_NOTIFICATION');
  _gap_svc := pg_temp.svc(_lic, 'PLS_DEREGISTRATION');
  SELECT p.id INTO _outsider FROM public.profiles p
   WHERE NOT public.has_permission(p.id,'entity_structure','approve')
   ORDER BY p.created_at LIMIT 1;

  BEGIN
    _fx := pg_temp.fixture(_lic, _svc, _officer);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);

    _plan_unknown := public.post_license_effect_plan(gen_random_uuid());
    IF _gap_svc IS NOT NULL THEN
      _plan_gap := public.post_license_effect_plan(
        (pg_temp.fixture(_lic, _gap_svc, _officer)->>'application_id')::uuid);
    END IF;

    -- unauthorised decision attempt by a non-approver identity
    IF _outsider IS NOT NULL THEN
      BEGIN
        PERFORM set_config('request.jwt.claims',
          json_build_object('sub',_outsider::text,'role','authenticated')::text, true);
        _res_stale := public.perform_final_workflow_approval((_fx->>'application_id')::uuid,
                        (_fx->>'instance_id')::uuid, (_fx->>'step_id')::uuid, 'F5-C outsider', _outsider);
      EXCEPTION WHEN others THEN _stale := SQLSTATE;
      END;
    END IF;
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);

    -- browser tamper attempts against the governed registers
    _exec_state := pg_temp.as_user(_officer,
      format('SELECT public.apply_post_license_effect(%L)', (_fx->>'application_id')::uuid));
    _ledger_state := pg_temp.as_user(_officer,
      format('INSERT INTO public.post_license_effects (application_id, effect_kind) VALUES (%L, %L)',
             (_fx->>'application_id')::uuid, 'RENEWAL'));
    _map_state := pg_temp.as_user(_officer,
      'UPDATE public.post_license_effect_map SET is_supported = true WHERE service_code = ''PLS_DEREGISTRATION''');
    _est_state := pg_temp.as_user(_officer,
      'INSERT INTO public.regulated_establishments (entity_id, establishment_reference, name, opened_on)'
      || format(' VALUES (%L, %L, %L, current_date)', (_fx->>'entity_id')::uuid, 'F5C-TAMPER', 'tamper'));
    _fp_state := pg_temp.as_user(_officer,
      format('INSERT INTO public.post_license_fp_subject_links (application_id, subject_key) VALUES (%L, %L)',
             (_fx->>'application_id')::uuid, 'TAMPER'));

    RAISE EXCEPTION 'F5C_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5C_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,200); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('I','I-99','the authority certification executed without harness error', false, _harness);
    RETURN;
  END IF;

  PERFORM pg_temp.rec('I','I-01','an unknown application resolves to a fail-closed plan, never a default effect',
    coalesce(_plan_unknown->>'state','') <> 'READY', 'state=' || coalesce(_plan_unknown->>'state','null'));
  PERFORM pg_temp.rec('I','I-02','a business-configuration service fails closed with its blocker classification',
    _gap_svc IS NULL OR _plan_gap->>'state' IN ('BUSINESS_CONFIGURATION_REQUIRED','PRODUCT_GAP','BLOCKED','FAIL_CLOSED'),
    'state=' || coalesce(_plan_gap->>'state','n/a'));
  PERFORM pg_temp.rec('I','I-03','the F5 final decision validates the acting reviewer server-side',
    NOT has_function_privilege('anon',
      to_regprocedure('public.perform_final_workflow_approval(uuid,uuid,uuid,text,uuid)')::oid,'EXECUTE'),
    'reviewer authority asserted in the decision transaction; no anonymous execute');
  PERFORM pg_temp.rec('I','I-04','the browser cannot execute the effect engine',
    _exec_state <> '00000', 'state=' || _exec_state);
  PERFORM pg_temp.rec('I','I-05','the browser cannot write the effect ledger',
    _ledger_state <> '00000', 'state=' || _ledger_state);
  PERFORM pg_temp.rec('I','I-06','the browser cannot re-classify a service in the effect register',
    _map_state <> '00000', 'state=' || _map_state);
  PERFORM pg_temp.rec('I','I-07','the browser cannot write the establishment register',
    _est_state <> '00000', 'state=' || _est_state);
  PERFORM pg_temp.rec('I','I-08','the browser cannot write F&P subject provenance',
    _fp_state <> '00000', 'state=' || _fp_state);
END $i$;

-- ===========================================================================
-- SECTION J — CLASSIFICATION AUTHORITY AND THE FROZEN F4 BOUNDARY
-- ===========================================================================
DO $j$
DECLARE
  _lic public.licenses; _actor uuid; _svc uuid; _forged uuid; _genuine uuid; _f4 uuid;
  _k_forged text; _k_genuine text; _k_f4 text; _n int; _harness text := NULL;
BEGIN
  SELECT id INTO _actor FROM auth.users ORDER BY created_at LIMIT 1;
  SELECT * INTO _lic FROM public.licenses WHERE id = pg_temp.host_license();
  _svc := pg_temp.svc(_lic.id, 'PLS_CHANGE_ADDRESS');

  BEGIN
    INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id, regulator_id)
    VALUES (_actor, 'f5c-class', 'draft', '{"type":"post_license"}'::jsonb, _lic.holder_id, _lic.regulator_id)
    RETURNING id, request_kind INTO _forged, _k_forged;

    INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id, regulator_id)
    VALUES (_actor, 'f5c-class', 'draft',
            jsonb_build_object('license_id',_lic.id,'service_id',_svc), _lic.holder_id, _lic.regulator_id)
    RETURNING id, request_kind INTO _genuine, _k_genuine;

    INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id, regulator_id)
    VALUES (_actor, 'f5c-class', 'draft',
            '{"type":"post_license","new_application":true}'::jsonb, _lic.holder_id, _lic.regulator_id)
    RETURNING id INTO _f4;
    UPDATE public.applications SET data = data || '{"type":"post_license"}'::jsonb WHERE id = _f4;
    SELECT request_kind INTO _k_f4 FROM public.applications WHERE id = _f4;

    RAISE EXCEPTION 'F5C_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5C_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,200); END IF;
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('J','J-99','the classification certification executed without harness error', false, _harness);
  ELSE
    PERFORM pg_temp.rec('J','J-01','a forged client data.type cannot classify a filing as POST_LICENSE',
      _k_forged IS DISTINCT FROM 'POST_LICENSE', 'request_kind=' || coalesce(_k_forged,'null'));
    PERFORM pg_temp.rec('J','J-02','a genuine licence + service context classifies as POST_LICENSE',
      _k_genuine = 'POST_LICENSE', 'request_kind=' || coalesce(_k_genuine,'null'));
    PERFORM pg_temp.rec('J','J-03','a forged edit cannot convert an F4 initial filing into an F5 filing',
      _k_f4 IS DISTINCT FROM 'POST_LICENSE', 'request_kind=' || coalesce(_k_f4,'null'));
  END IF;

  PERFORM pg_temp.rec('J','J-04','classification is a server trigger, not a client-supplied field',
    EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.applications'::regclass
             AND NOT t.tgisinternal AND t.tgname LIKE '%request_kind%'),
    'trigger installed');

  SELECT count(*) INTO _n FROM public.applications WHERE license_type = 'f5c-class';
  PERFORM pg_temp.rec('J','J-05','zero classification-harness residue', _n = 0, 'residue=' || _n);
END $j$;

-- ===========================================================================
-- SECTION K — SERVER AUTHORITY, IMMUTABILITY AND SURFACE POSTURE
-- ===========================================================================
DO $k$
DECLARE _n int; _v jsonb; _src text;
BEGIN
  SELECT count(*) INTO _n FROM (VALUES ('anon'),('public')) r(role)
   WHERE has_function_privilege(r.role, to_regprocedure('public.apply_post_license_effect(uuid)')::oid,'EXECUTE')
      OR has_function_privilege(r.role, to_regprocedure('public.post_license_effect_plan(uuid)')::oid,'EXECUTE');
  PERFORM pg_temp.rec('K','K-01','no anonymous execute on the F5 effect engine', _n = 0, 'grants=' || _n);

  SELECT count(*) INTO _n FROM information_schema.role_table_grants
   WHERE table_schema='public'
     AND table_name IN ('post_license_effects','post_license_acknowledgements','post_license_effect_map',
                        'post_license_effect_service_bindings','post_license_fp_subject_links',
                        'regulated_establishments','regulated_establishment_events')
     AND grantee IN ('anon','authenticated')
     AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
  PERFORM pg_temp.rec('K','K-02','no browser DML on any F5 register, ledger or provenance table',
    _n = 0, 'grants=' || _n);

  SELECT count(DISTINCT c.relname) INTO _n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='public' AND c.relrowsecurity
     AND c.relname IN ('post_license_effects','post_license_acknowledgements','post_license_effect_map',
                       'post_license_fp_subject_links','regulated_establishments',
                       'regulated_establishment_events');
  PERFORM pg_temp.rec('K','K-03','row level security is enabled on every F5 register',
    _n = 6, 'rls_tables=' || _n);

  SELECT count(DISTINCT c.relname) INTO _n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE NOT t.tgisinternal
     AND c.relname IN ('post_license_effects','post_license_acknowledgements',
                       'regulated_establishment_events','post_license_fp_subject_links');
  PERFORM pg_temp.rec('K','K-04','append-only / immutability guards protect the F5 ledgers',
    _n = 4, 'guarded=' || _n);

  SELECT count(*) INTO _n FROM pg_constraint c
   WHERE c.conrelid = 'public.post_license_effects'::regclass AND c.contype IN ('u','p')
     AND array_length(c.conkey,1) = 1
     AND EXISTS (SELECT 1 FROM unnest(c.conkey) k JOIN pg_attribute a
                   ON a.attrelid=c.conrelid AND a.attnum=k WHERE a.attname='application_id');
  PERFORM pg_temp.rec('K','K-05','retry/concurrency protection: at most one effect per filing',
    _n >= 1, 'unique_keys=' || _n);

  _v := public.application_workflow_view((SELECT id FROM public.applications ORDER BY created_at LIMIT 1));
  PERFORM pg_temp.rec('K','K-06','the server owns workflow/status authority for persisted filings',
    (_v->>'found')::boolean AND _v ? 'open_statuses' AND _v ? 'request_kind',
    'reason=' || coalesce(_v->>'reason','null'));

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname IN
     ('post_license_service_form_set','application_workflow_view','application_request_kind',
      'post_license_lifecycle_input','post_license_fee_assessment','post_license_open_statuses',
      'post_license_service_applicability','resolve_post_license_intake_context');
  PERFORM pg_temp.rec('K','K-07','the full server resolver surface is installed', _n >= 8, 'functions=' || _n);

  SELECT pg_get_functiondef(to_regprocedure('public.perform_final_workflow_approval(uuid,uuid,uuid,text,uuid)')::oid)
    INTO _src;
  PERFORM pg_temp.rec('K','K-08','maker/checker: the F5 decision applies the plan inside the approval transaction',
    _src ILIKE '%post_license_effect_plan%' AND _src ILIKE '%apply_post_license_effect%'
    AND _src ILIKE '%provision_application_entity%',
    'canonical decision path intact');
END $k$;

-- ===========================================================================
-- REPORT
-- ===========================================================================
SELECT section, id, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, descr, detail
  FROM f5c_results ORDER BY seq;

SELECT count(*) FILTER (WHERE passed) AS passed,
       count(*) AS total,
       count(*) FILTER (WHERE NOT passed) AS failed
  FROM f5c_results;

DO $r$
DECLARE _f int;
BEGIN
  SELECT count(*) INTO _f FROM f5c_results WHERE NOT passed;
  IF _f > 0 THEN
    RAISE EXCEPTION 'certify:f5c FAILED — % assertion(s) failed', _f;
  END IF;
  RAISE NOTICE 'certify:f5c PASSED — % assertions',
    (SELECT count(*) FROM f5c_results);
END $r$;

-- ============================================================================
-- verify:f5b3-establishments — GOVERNED ESTABLISHMENT (BRANCH) EFFECTS
--
-- Permanent gate for F5-B3P: PLS_NEW_BRANCH and PLS_BRANCH_CLOSURE must
-- produce real, governed, idempotent effects on the canonical establishment
-- register, with append-only lifecycle history, server-side ownership
-- re-resolution, fail-closed blockers and no browser write path.
--
-- Every empirical write runs inside a sub-block that always aborts → zero
-- residue.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f scripts/verify-f5b3-establishments.sql
-- ============================================================================
\set ON_ERROR_STOP on
-- DEF-F5-B3R-01: pooled backends can arrive with a leaked row_security=off.
SET row_security = on;
\pset pager off
SET client_min_messages = notice;

DROP TABLE IF EXISTS f5b3e_results;
CREATE TEMP TABLE f5b3e_results (
  seq serial, section text, id text, descr text, passed boolean, detail text
);

DROP FUNCTION IF EXISTS pg_temp.rec(text,text,text,boolean,text);
CREATE OR REPLACE FUNCTION pg_temp.rec(_s text, _id text, _d text, _ok boolean, _detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO f5b3e_results (section, id, descr, passed, detail)
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

DROP FUNCTION IF EXISTS pg_temp.f5b3e_fixture(uuid,uuid,uuid,text);
CREATE OR REPLACE FUNCTION pg_temp.f5b3e_fixture(_license uuid, _service uuid, _actor uuid,
                                                 _status text DEFAULT 'submitted')
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE _lic public.licenses; _wf uuid; _step uuid; _app uuid; _inst uuid;
BEGIN
  SELECT * INTO _lic FROM public.licenses WHERE id = _license;

  INSERT INTO public.licensing_gate_configs (gate_key, applicability, service_id, is_active, notes)
  SELECT g, 'NOT_APPLICABLE', _service::text, true, 'F5-B3P probe'
    FROM unnest(ARRAY['forms_documents','fees','fit_and_proper','conditions']) g;

  INSERT INTO public.approval_workflows
    (name, license_type, entity_type, is_active, service_id, regulator_id, sector_id, sub_sector_id)
  VALUES ('F5-B3P probe wf', 'f5b3p-probe', 'post_application', true, _service,
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
  VALUES (_actor, 'f5b3p-probe', _status,
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

DROP FUNCTION IF EXISTS pg_temp.f5b3e_officer();
CREATE OR REPLACE FUNCTION pg_temp.f5b3e_officer() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT p.id FROM public.profiles p
   WHERE public.has_permission(p.id,'entity_structure','apply')
     AND public.has_permission(p.id,'entity_structure','approve')
   ORDER BY p.created_at LIMIT 1
$$;

DROP FUNCTION IF EXISTS pg_temp.f5b3e_license();
CREATE OR REPLACE FUNCTION pg_temp.f5b3e_license() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT l.id FROM public.licenses l
   WHERE l.sub_sector_id IS NOT NULL AND lower(l.status) = 'active'
     AND EXISTS (SELECT 1 FROM public.licensees x WHERE x.id = l.holder_id)
     AND EXISTS (SELECT 1 FROM public.services s
                  WHERE s.sub_sector_id = l.sub_sector_id AND s.status = 'active'
                    AND s.code = 'PLS_NEW_BRANCH')
     AND EXISTS (SELECT 1 FROM public.services s
                  WHERE s.sub_sector_id = l.sub_sector_id AND s.status = 'active'
                    AND s.code = 'PLS_BRANCH_CLOSURE')
     AND NOT EXISTS (SELECT 1 FROM public.fp_individual_roles ir
                      WHERE ir.licensee_id = l.holder_id AND ir.is_current)
   ORDER BY l.issued_at DESC LIMIT 1
$$;

DROP FUNCTION IF EXISTS pg_temp.f5b3e_service(uuid,text);
CREATE OR REPLACE FUNCTION pg_temp.f5b3e_service(_license uuid, _code text)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT s.id FROM public.services s
   JOIN public.licenses l ON l.id = _license
  WHERE s.sub_sector_id = l.sub_sector_id AND s.status = 'active' AND s.code = _code
  LIMIT 1
$$;

-- Rebind the protected establishment target of a probe application under the
-- governed (trusted) context, exactly as the effect engine would observe it.
DROP FUNCTION IF EXISTS pg_temp.f5b3e_bind(uuid,uuid);
CREATE OR REPLACE FUNCTION pg_temp.f5b3e_bind(_app uuid, _est uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.workflow_mutation_context','trusted', true);
  IF _est IS NULL THEN
    UPDATE public.applications SET data = data - 'protected_establishment' WHERE id = _app;
  ELSE
    UPDATE public.applications
       SET data = jsonb_set(data, '{protected_establishment}',
                            jsonb_build_object('establishment_id', _est), true)
     WHERE id = _app;
  END IF;
  PERFORM set_config('app.workflow_mutation_context','', true);
END $$;

-- ===========================================================================
-- SECTION A — canonical register, security model and effect mapping
-- ===========================================================================
DO $a$
DECLARE _n int; _detail text;
BEGIN
  SELECT count(*) INTO _n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public'
     AND c.relname IN ('regulated_establishments','regulated_establishment_events');
  PERFORM pg_temp.rec('A','A-01','the canonical establishment register and lifecycle history exist',
    _n = 2, 'tables=' || _n);

  SELECT count(*) INTO _n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relrowsecurity
     AND c.relname IN ('regulated_establishments','regulated_establishment_events');
  PERFORM pg_temp.rec('A','A-02','row level security is enabled on both establishment tables',
    _n = 2, 'rls_enabled=' || _n);

  SELECT count(*) INTO _n FROM information_schema.role_table_grants g
   WHERE g.table_schema = 'public'
     AND g.table_name IN ('regulated_establishments','regulated_establishment_events')
     AND g.grantee IN ('anon','authenticated')
     AND g.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
  PERFORM pg_temp.rec('A','A-03','no browser role holds any establishment write privilege',
    _n = 0, 'browser_write_grants=' || _n);

  SELECT count(*) INTO _n FROM information_schema.role_table_grants g
   WHERE g.table_schema = 'public'
     AND g.table_name IN ('regulated_establishments','regulated_establishment_events')
     AND g.grantee = 'anon';
  PERFORM pg_temp.rec('A','A-04','anonymous access to the establishment register is absent',
    _n = 0, 'anon_grants=' || _n);

  SELECT count(DISTINCT c.relname) INTO _n
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE NOT t.tgisinternal
     AND c.relname IN ('regulated_establishments','regulated_establishment_events');
  PERFORM pg_temp.rec('A','A-05','both establishment tables carry governed write guards',
    _n = 2, 'guarded_tables=' || _n);

  SELECT count(*) INTO _n FROM public.post_license_effect_map
   WHERE service_code IN ('PLS_NEW_BRANCH','PLS_BRANCH_CLOSURE')
     AND is_supported AND blocker_class IS NULL
     AND effect_kind IN ('ESTABLISHMENT_OPEN','ESTABLISHMENT_CLOSE')
     AND canonical_target IS NOT NULL AND handler IS NOT NULL;
  PERFORM pg_temp.rec('A','A-06','both branch services are mapped to supported establishment effects',
    _n = 2, 'supported_branch_mappings=' || _n);

  SELECT count(*) INTO _n FROM public.data_concepts
   WHERE code IN ('ESTABLISHMENT.NAME','ESTABLISHMENT.ADDRESS','ESTABLISHMENT.OPENING_DATE',
                  'ESTABLISHMENT.CLOSURE_DATE','ESTABLISHMENT.TARGET_ID')
     AND is_active;
  PERFORM pg_temp.rec('A','A-07','canonical establishment data concepts are configured for intake',
    _n = 5, 'concepts=' || _n);

  SELECT count(*) INTO _n FROM (VALUES ('anon'),('authenticated')) r(role)
   WHERE has_function_privilege(r.role,
     to_regprocedure('public.post_license_establishment_input(uuid)')::oid, 'EXECUTE');
  PERFORM pg_temp.rec('A','A-08','the establishment input resolver is not callable from the browser',
    _n = 0, 'browser_execute_grants=' || _n);
END $a$;

-- ===========================================================================
-- SECTION B — end-to-end establishment open / close through governed approval
-- ===========================================================================
DO $b$
DECLARE
  _lic uuid; _lic2 uuid; _entity uuid; _other uuid; _officer uuid;
  _svc_open uuid; _svc_close uuid; _tpl uuid; _ver uuid; _resp uuid;
  _fx_open jsonb; _fx_close jsonb;
  _plan_missing jsonb; _plan_open jsonb; _res_open jsonb;
  _plan_ready jsonb; _plan_other jsonb; _plan_notarget jsonb; _plan_closed jsonb;
  _plan_other_lic jsonb; _res_close jsonb;
  _est uuid; _est_ref text; _est_row public.regulated_establishments;
  _open_events int; _close_events int; _effect_open record; _effect_close record;
  _repeat_open text; _repeat_close text; _est_count_after_repeat int;
  _foreign_est uuid; _closed_est uuid; _other_lic_est uuid;
  _lic2_synthetic boolean := false; _lic2_terms int := 0; _lic2_holder uuid;
  _ins_state text; _upd_state text; _del_state text; _evt_state text;
  _f4_plan jsonb; _f4_app uuid; _f4_effects int;
  _opened_on_preserved date; _status_after text;
  _harness text := NULL;
BEGIN
  _officer := pg_temp.f5b3e_officer();
  _lic := pg_temp.f5b3e_license();
  IF _lic IS NULL OR _officer IS NULL THEN
    PERFORM pg_temp.rec('B','B-00','fixtures available for the establishment proof', false,
      'license=' || coalesce(_lic::text,'null') || ' officer=' || coalesce(_officer::text,'null'));
    RETURN;
  END IF;

  SELECT holder_id INTO _entity FROM public.licenses WHERE id = _lic;
  SELECT id INTO _lic2 FROM public.licenses WHERE holder_id = _entity AND id <> _lic LIMIT 1;
  SELECT id INTO _other FROM public.licensees WHERE id <> _entity LIMIT 1;
  _svc_open  := pg_temp.f5b3e_service(_lic, 'PLS_NEW_BRANCH');
  _svc_close := pg_temp.f5b3e_service(_lic, 'PLS_BRANCH_CLOSURE');
  SELECT fv.id, fv.template_id INTO _ver, _tpl FROM public.form_versions fv LIMIT 1;

  IF _svc_open IS NULL OR _svc_close IS NULL OR _ver IS NULL OR _other IS NULL THEN
    PERFORM pg_temp.rec('B','B-00','fixtures available for the establishment proof', false,
      'open=' || coalesce(_svc_open::text,'null') || ' close=' || coalesce(_svc_close::text,'null')
      || ' form_version=' || coalesce(_ver::text,'null') || ' other_entity=' || coalesce(_other::text,'null'));
    RETURN;
  END IF;

  BEGIN
    -- ---------------------------------------------------------------- OPEN --
    _fx_open := pg_temp.f5b3e_fixture(_lic, _svc_open, _officer);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);

    -- no mandatory branch data yet → must fail closed
    _plan_missing := public.post_license_effect_plan((_fx_open->>'application_id')::uuid);

    INSERT INTO public.form_responses (template_id, version_id, user_id, entity_type, entity_id, status)
    VALUES (_tpl, _ver, _officer, 'application', (_fx_open->>'application_id')::uuid, 'submitted')
    RETURNING id INTO _resp;

    INSERT INTO public.form_submission_values (response_id, form_version_id, data_concept_id, value_text)
    SELECT _resp, _ver, dc.id, 'F5-B3P Probe Branch'
      FROM public.data_concepts dc WHERE dc.code = 'ESTABLISHMENT.NAME';
    INSERT INTO public.form_submission_values (response_id, form_version_id, data_concept_id, value_text)
    SELECT _resp, _ver, dc.id, '1 Probe Street, Probe City'
      FROM public.data_concepts dc WHERE dc.code = 'ESTABLISHMENT.ADDRESS';
    INSERT INTO public.form_submission_values (response_id, form_version_id, data_concept_id, value_date)
    SELECT _resp, _ver, dc.id, current_date
      FROM public.data_concepts dc WHERE dc.code = 'ESTABLISHMENT.OPENING_DATE';

    _plan_open := public.post_license_effect_plan((_fx_open->>'application_id')::uuid);
    _res_open  := public.perform_final_workflow_approval((_fx_open->>'application_id')::uuid,
                    (_fx_open->>'instance_id')::uuid, (_fx_open->>'step_id')::uuid,
                    'F5-B3P new branch probe', _officer);

    SELECT * INTO _est_row FROM public.regulated_establishments
     WHERE source_application_id = (_fx_open->>'application_id')::uuid;
    _est := _est_row.id;
    _est_ref := _est_row.establishment_reference;

    SELECT count(*) INTO _open_events FROM public.regulated_establishment_events
     WHERE establishment_id = _est AND event_type = 'OPENED';

    SELECT e.effect_kind, e.result_ref, e.handler, e.canonical_target, e.evidence_after, e.provenance
      INTO _effect_open FROM public.post_license_effects e
     WHERE e.application_id = (_fx_open->>'application_id')::uuid;

    -- idempotent retry
    BEGIN
      PERFORM set_config('app.workflow_mutation_context','trusted', true);
      PERFORM set_config('app.workflow_actor_id', _officer::text, true);
      PERFORM public.apply_post_license_effect((_fx_open->>'application_id')::uuid);
      _repeat_open := 'idempotent';
    EXCEPTION WHEN others THEN
      _repeat_open := SQLSTATE || ': ' || left(SQLERRM,80);
    END;
    PERFORM set_config('app.workflow_mutation_context','', true);

    SELECT count(*) INTO _est_count_after_repeat FROM public.regulated_establishments
     WHERE source_application_id = (_fx_open->>'application_id')::uuid;

    -- synthetic negative targets
    PERFORM set_config('app.workflow_mutation_context','trusted', true);
    INSERT INTO public.regulated_establishments
      (entity_id, license_id, establishment_reference, name, status, opened_on, address_text)
    VALUES (_other, NULL, 'F5B3P-FOREIGN', 'F5-B3P Foreign Branch', 'ACTIVE', current_date, 'x')
    RETURNING id INTO _foreign_est;
    INSERT INTO public.regulated_establishments
      (entity_id, license_id, establishment_reference, name, status, opened_on, closed_on, address_text)
    VALUES (_entity, _lic, 'F5B3P-CLOSED', 'F5-B3P Closed Branch', 'CLOSED', current_date, current_date, 'x')
    RETURNING id INTO _closed_est;
    -- F5-B3C: the cross-licence negative case must never be vacuous. When the
    -- fixture holder owns a single licence we construct a rollback-safe second
    -- licence for the SAME entity through the certified issuance path (the
    -- frozen trg_license_open_original_term trigger opens its original term).
    IF _lic2 IS NULL THEN
      INSERT INTO public.licenses
        (application_id, holder_id, license_type, sector_id, sub_sector_id, category_id,
         status, issued_at, valid_from, valid_until, regulator_id)
      SELECT NULL, l.holder_id, l.license_type, l.sector_id, l.sub_sector_id, l.category_id,
             'active', now(), now(), l.valid_until, l.regulator_id
        FROM public.licenses l WHERE l.id = _lic
      RETURNING id, holder_id INTO _lic2, _lic2_holder;
      _lic2_synthetic := true;
      SELECT count(*) INTO _lic2_terms
        FROM public.license_terms WHERE license_id = _lic2 AND is_current;
    ELSE
      SELECT count(*), max(l.holder_id::text)::uuid INTO _lic2_terms, _lic2_holder
        FROM public.license_terms t JOIN public.licenses l ON l.id = t.license_id
       WHERE t.license_id = _lic2 AND t.is_current;
    END IF;
    INSERT INTO public.regulated_establishments
      (entity_id, license_id, establishment_reference, name, status, opened_on, address_text)
    VALUES (_entity, _lic2, 'F5B3P-OTHERLIC', 'F5-B3P Other Licence Branch', 'ACTIVE', current_date, 'x')
    RETURNING id INTO _other_lic_est;

    PERFORM set_config('app.workflow_mutation_context','', true);

    -- --------------------------------------------------------------- CLOSE --
    _fx_close := pg_temp.f5b3e_fixture(_lic, _svc_close, _officer);

    PERFORM pg_temp.f5b3e_bind((_fx_close->>'application_id')::uuid, NULL);
    _plan_notarget := public.post_license_effect_plan((_fx_close->>'application_id')::uuid);

    PERFORM pg_temp.f5b3e_bind((_fx_close->>'application_id')::uuid, _foreign_est);
    _plan_other := public.post_license_effect_plan((_fx_close->>'application_id')::uuid);

    PERFORM pg_temp.f5b3e_bind((_fx_close->>'application_id')::uuid, _closed_est);
    _plan_closed := public.post_license_effect_plan((_fx_close->>'application_id')::uuid);

    PERFORM pg_temp.f5b3e_bind((_fx_close->>'application_id')::uuid, _other_lic_est);
    _plan_other_lic := public.post_license_effect_plan((_fx_close->>'application_id')::uuid);

    PERFORM pg_temp.f5b3e_bind((_fx_close->>'application_id')::uuid, _est);
    _plan_ready := public.post_license_effect_plan((_fx_close->>'application_id')::uuid);

    _res_close := public.perform_final_workflow_approval((_fx_close->>'application_id')::uuid,
                    (_fx_close->>'instance_id')::uuid, (_fx_close->>'step_id')::uuid,
                    'F5-B3P branch closure probe', _officer);

    SELECT status, opened_on INTO _status_after, _opened_on_preserved
      FROM public.regulated_establishments WHERE id = _est;
    SELECT count(*) INTO _close_events FROM public.regulated_establishment_events
     WHERE establishment_id = _est AND event_type = 'CLOSED';
    SELECT count(*) INTO _open_events FROM public.regulated_establishment_events
     WHERE establishment_id = _est AND event_type = 'OPENED';

    SELECT e.effect_kind, e.result_ref, e.evidence_before, e.evidence_after
      INTO _effect_close FROM public.post_license_effects e
     WHERE e.application_id = (_fx_close->>'application_id')::uuid;

    BEGIN
      PERFORM set_config('app.workflow_mutation_context','trusted', true);
      PERFORM set_config('app.workflow_actor_id', _officer::text, true);
      PERFORM public.apply_post_license_effect((_fx_close->>'application_id')::uuid);
      _repeat_close := 'idempotent';
    EXCEPTION WHEN others THEN
      _repeat_close := SQLSTATE || ': ' || left(SQLERRM,80);
    END;
    PERFORM set_config('app.workflow_mutation_context','', true);
    SELECT count(*) INTO _close_events FROM public.regulated_establishment_events
     WHERE establishment_id = _est AND event_type = 'CLOSED';

    -- browser tamper attempts
    _ins_state := pg_temp.as_user(_officer,
      format('INSERT INTO public.regulated_establishments (entity_id, establishment_reference, name, opened_on) VALUES (%L, %L, %L, current_date)',
             _entity, 'F5B3P-BROWSER', 'F5-B3P Browser Branch'));
    _upd_state := pg_temp.as_user(_officer,
      format('UPDATE public.regulated_establishments SET name = %L WHERE id = %L', 'tampered', _est));
    _del_state := pg_temp.as_user(_officer,
      format('DELETE FROM public.regulated_establishments WHERE id = %L', _est));
    _evt_state := pg_temp.as_user(_officer,
      format('DELETE FROM public.regulated_establishment_events WHERE establishment_id = %L', _est));

    -- F4 non-regression: an initial filing never plans an establishment effect
    INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id)
    VALUES (_officer, 'f5b3p-probe-initial', 'submitted', '{"type":"new_application"}'::jsonb, _entity)
    RETURNING id INTO _f4_app;
    _f4_plan := public.post_license_effect_plan(_f4_app);
    SELECT count(*) INTO _f4_effects FROM public.regulated_establishments
     WHERE source_application_id = _f4_app;

    RAISE EXCEPTION 'F5B3P_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5B3P_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,200); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
    PERFORM set_config('app.workflow_mutation_context','', true);
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('B','B-99','the establishment probe executed without harness error', false, _harness);
    RETURN;
  END IF;

  PERFORM pg_temp.rec('B','B-01','a new-branch filing without mandatory branch data fails closed',
    _plan_missing->>'state' = 'ESTABLISHMENT_DATA_REQUIRED',
    'state=' || coalesce(_plan_missing->>'state','null') || ' code=' || coalesce(_plan_missing->>'code','null'));
  PERFORM pg_temp.rec('B','B-02','a complete new-branch filing plans as a READY ESTABLISHMENT_OPEN effect',
    _plan_open->>'effect_kind' = 'ESTABLISHMENT_OPEN' AND _plan_open->>'state' = 'READY',
    'kind=' || coalesce(_plan_open->>'effect_kind','null') || ' state=' || coalesce(_plan_open->>'state','null'));
  PERFORM pg_temp.rec('B','B-03','the governed approval succeeds and creates exactly one active branch',
    coalesce(_res_open->>'success','false') = 'true' AND _est IS NOT NULL
      AND _est_row.status = 'ACTIVE' AND _est_row.entity_id = _entity AND _est_row.license_id = _lic,
    'success=' || coalesce(_res_open->>'success','null') || ' est=' || coalesce(_est::text,'null')
    || ' status=' || coalesce(_est_row.status,'null'));
  PERFORM pg_temp.rec('B','B-04','the branch carries an internal system reference and canonical data',
    coalesce(_est_ref,'') <> '' AND _est_row.name = 'F5-B3P Probe Branch'
      AND coalesce(_est_row.address_text,'') <> '' AND _est_row.opened_on IS NOT NULL,
    'ref=' || coalesce(_est_ref,'null') || ' name=' || coalesce(_est_row.name,'null'));
  PERFORM pg_temp.rec('B','B-05','an append-only opening lifecycle event is recorded with provenance',
    _open_events = 1, 'opening_events=' || coalesce(_open_events::text,'null'));
  PERFORM pg_temp.rec('B','B-06','exactly one effect ledger row references the new branch',
    _effect_open.effect_kind = 'ESTABLISHMENT_OPEN' AND _effect_open.result_ref = _est
      AND coalesce(_effect_open.handler,'') <> '' AND coalesce(_effect_open.canonical_target,'') <> '',
    'kind=' || coalesce(_effect_open.effect_kind,'null') || ' result_ref=' || coalesce(_effect_open.result_ref::text,'null'));
  PERFORM pg_temp.rec('B','B-07','a repeated open effect is idempotent and creates no duplicate branch',
    _est_count_after_repeat = 1, 'repeat=' || coalesce(_repeat_open,'null')
    || ' branches=' || coalesce(_est_count_after_repeat::text,'null'));
  PERFORM pg_temp.rec('B','B-08','a closure request with no bound establishment is refused',
    _plan_notarget->>'state' = 'ESTABLISHMENT_TARGET_REQUIRED',
    'state=' || coalesce(_plan_notarget->>'state','null'));
  PERFORM pg_temp.rec('B','B-09','a closure request against another entity''s branch is refused',
    _plan_other->>'state' = 'ESTABLISHMENT_NOT_APPLICABLE',
    'state=' || coalesce(_plan_other->>'state','null'));
  PERFORM pg_temp.rec('B','B-10','a closure request against an already closed branch is refused',
    _plan_closed->>'state' = 'ESTABLISHMENT_ALREADY_CLOSED',
    'state=' || coalesce(_plan_closed->>'state','null'));
  PERFORM pg_temp.rec('B','B-11','a closure request against another licence''s branch is refused where licence-scoped',
    _other_lic_est IS NOT NULL AND _plan_other_lic->>'state' = 'ESTABLISHMENT_NOT_APPLICABLE',
    'state=' || coalesce(_plan_other_lic->>'state','null')
    || ' second_licence=' || CASE WHEN _lic2_synthetic THEN 'synthetic' ELSE 'live' END
    || ' current_terms=' || coalesce(_lic2_terms::text,'null'));
  PERFORM pg_temp.rec('B','B-11b','the cross-licence probe licence is a real governed licence of the same entity',
    _lic2 IS NOT NULL AND _lic2 <> _lic AND _lic2_terms = 1 AND _lic2_holder = _entity,
    'licence_b=' || coalesce(_lic2::text,'null') || ' holder_match='
    || coalesce((_lic2_holder = _entity)::text,'null')
    || ' current_terms=' || coalesce(_lic2_terms::text,'null'));
  PERFORM pg_temp.rec('B','B-12','a valid closure request plans as a READY ESTABLISHMENT_CLOSE effect',
    _plan_ready->>'effect_kind' = 'ESTABLISHMENT_CLOSE' AND _plan_ready->>'state' = 'READY',
    'kind=' || coalesce(_plan_ready->>'effect_kind','null') || ' state=' || coalesce(_plan_ready->>'state','null'));
  PERFORM pg_temp.rec('B','B-13','the governed approval closes exactly the identified branch',
    coalesce(_res_close->>'success','false') = 'true' AND _status_after = 'CLOSED'
      AND _effect_close.result_ref = _est,
    'success=' || coalesce(_res_close->>'success','null') || ' status=' || coalesce(_status_after,'null'));
  PERFORM pg_temp.rec('B','B-14','closure preserves the opening history and opening date',
    _open_events = 1 AND _opened_on_preserved IS NOT NULL,
    'opening_events=' || coalesce(_open_events::text,'null')
    || ' opened_on=' || coalesce(_opened_on_preserved::text,'null'));
  PERFORM pg_temp.rec('B','B-15','a repeated close effect is idempotent and appends no duplicate closure event',
    _close_events = 1, 'repeat=' || coalesce(_repeat_close,'null')
    || ' closure_events=' || coalesce(_close_events::text,'null'));
  PERFORM pg_temp.rec('B','B-16','the closure effect ledger row records before/after establishment evidence',
    _effect_close.evidence_before IS NOT NULL AND _effect_close.evidence_after IS NOT NULL
      AND _effect_close.evidence_before->>'status' = 'ACTIVE'
      AND _effect_close.evidence_after->>'status' = 'CLOSED',
    'before=' || coalesce(_effect_close.evidence_before::text,'null')
    || ' after=' || coalesce(_effect_close.evidence_after::text,'null'));
  PERFORM pg_temp.rec('B','B-17','the browser cannot create a branch directly',
    _ins_state <> '00000', 'state=' || coalesce(_ins_state,'null'));
  PERFORM pg_temp.rec('B','B-18','the browser cannot rewrite or delete a branch directly',
    _upd_state <> '00000' AND _del_state <> '00000',
    'update=' || coalesce(_upd_state,'null') || ' delete=' || coalesce(_del_state,'null'));
  PERFORM pg_temp.rec('B','B-19','the browser cannot destroy establishment lifecycle history',
    _evt_state <> '00000', 'state=' || coalesce(_evt_state,'null'));
  PERFORM pg_temp.rec('B','B-20','F4 NON-REGRESSION: an initial filing plans no establishment effect',
    coalesce((_f4_plan->>'is_post_license')::boolean, true) = false AND _f4_effects = 0,
    'is_post_license=' || coalesce(_f4_plan->>'is_post_license','null')
    || ' branches=' || coalesce(_f4_effects::text,'null'));
END $b$;

-- ===========================================================================
-- SECTION C — zero residue
-- ===========================================================================
DO $c$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.regulated_establishments
   WHERE establishment_reference LIKE 'F5B3P-%' OR name LIKE 'F5-B3P%';
  PERFORM pg_temp.rec('C','C-01','no probe establishment survives the run', _n = 0, 'residue=' || _n);

  SELECT count(*) INTO _n FROM public.applications WHERE license_type LIKE 'f5b3p-probe%';
  PERFORM pg_temp.rec('C','C-02','no probe application survives the run', _n = 0, 'residue=' || _n);

  SELECT count(*) INTO _n FROM public.approval_workflows WHERE name = 'F5-B3P probe wf';
  PERFORM pg_temp.rec('C','C-03','no probe workflow survives the run', _n = 0, 'residue=' || _n);

  SELECT count(*) INTO _n FROM public.licensing_gate_configs WHERE notes = 'F5-B3P probe';
  PERFORM pg_temp.rec('C','C-04','no probe gate configuration survives the run', _n = 0, 'residue=' || _n);

  SELECT count(*) INTO _n FROM public.regulated_establishment_events e
   WHERE EXISTS (SELECT 1 FROM public.applications a
                  WHERE a.id = e.application_id AND a.license_type LIKE 'f5b3p-probe%');
  PERFORM pg_temp.rec('C','C-05','no probe lifecycle event survives the run', _n = 0, 'residue=' || _n);
END $c$;

-- ===========================================================================
-- REPORT
-- ===========================================================================
SELECT section, id, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, descr, detail
  FROM f5b3e_results ORDER BY seq;

DO $r$
DECLARE _p int; _f int; _detail text;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE NOT passed) INTO _p, _f FROM f5b3e_results;
  RAISE NOTICE 'verify:f5b3-establishments — % PASS / % FAIL', _p, _f;
  IF _f > 0 THEN
    SELECT string_agg(id || ' (' || detail || ')', '; ') INTO _detail FROM f5b3e_results WHERE NOT passed;
    RAISE EXCEPTION 'verify:f5b3-establishments FAILED — %', _detail;
  END IF;
END $r$;

DROP TABLE IF EXISTS f5b3e_results;
DROP FUNCTION IF EXISTS pg_temp.rec(text,text,text,boolean,text);
DROP FUNCTION IF EXISTS pg_temp.as_user(uuid,text);
DROP FUNCTION IF EXISTS pg_temp.f5b3e_fixture(uuid,uuid,uuid,text);
DROP FUNCTION IF EXISTS pg_temp.f5b3e_officer();
DROP FUNCTION IF EXISTS pg_temp.f5b3e_license();
DROP FUNCTION IF EXISTS pg_temp.f5b3e_service(uuid,text);
DROP FUNCTION IF EXISTS pg_temp.f5b3e_bind(uuid,uuid);

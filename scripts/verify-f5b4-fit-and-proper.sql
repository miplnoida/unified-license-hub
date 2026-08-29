-- ============================================================================
-- verify:f5b4 — REAL FIT & PROPER LINKAGE FOR POST-LICENSING SERVICES
--
-- Permanent gate for F5-B4 (GAP-F5-04). Proves that a post-licensing filing on
-- an F&P-required service:
--   * resolves a canonical, server-authoritative subject set (never free text,
--     never the applicant, never "all existing officers");
--   * cannot be submitted without that subject set;
--   * receives explicit application_fp_links created only by governed server
--     operations, idempotently, with immutable provenance;
--   * is only READY when EVERY required subject holds a valid current positive
--     determination;
--   * applies its structural effect to exactly the assessed individual.
--
-- Every empirical write runs inside a sub-block that always aborts → zero
-- residue.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f scripts/verify-f5b4-fit-and-proper.sql
-- ============================================================================
\set ON_ERROR_STOP on
-- DEF-F5-B3R-01: pooled backends can arrive with a leaked row_security=off.
SET row_security = on;
\pset pager off
SET client_min_messages = notice;

DROP TABLE IF EXISTS f5b4_results;
CREATE TEMP TABLE f5b4_results (
  seq serial, section text, id text, descr text, passed boolean, detail text
);

DROP FUNCTION IF EXISTS pg_temp.rec(text,text,text,boolean,text);
CREATE OR REPLACE FUNCTION pg_temp.rec(_s text, _id text, _d text, _ok boolean, _detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO f5b4_results (section, id, descr, passed, detail)
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
    _state := SQLSTATE || ': ' || left(SQLERRM, 140);
  END;
  RESET ROLE;
  RETURN _state;
END $$;

-- Governed-context helpers -------------------------------------------------
DROP FUNCTION IF EXISTS pg_temp.trusted_on(uuid);
CREATE OR REPLACE FUNCTION pg_temp.trusted_on(_actor uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.workflow_mutation_context','trusted', true);
  PERFORM set_config('app.workflow_actor_id', _actor::text, true);
END $$;

DROP FUNCTION IF EXISTS pg_temp.trusted_off();
CREATE OR REPLACE FUNCTION pg_temp.trusted_off() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.workflow_mutation_context','', true);
END $$;

-- Nominate a canonical subject through the protected application context,
-- exactly as the governed nomination operation stores it.
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

DROP FUNCTION IF EXISTS pg_temp.f5b4_app(uuid,uuid,uuid,text);
CREATE OR REPLACE FUNCTION pg_temp.f5b4_app(_license uuid, _service uuid, _actor uuid,
                                            _status text DEFAULT 'submitted')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE _lic public.licenses; _app uuid;
BEGIN
  SELECT * INTO _lic FROM public.licenses WHERE id = _license;
  INSERT INTO public.applications
    (applicant_id, license_type, status, data, entity_id, regulator_id, submitted_at)
  VALUES (_actor, 'f5b4-probe', _status,
          jsonb_build_object('type','post_license','license_id',_license,'service_id',_service,
                             'licensee_id',_lic.holder_id,'sector_id',_lic.sector_id,
                             'sub_sector_id',_lic.sub_sector_id),
          _lic.holder_id, _lic.regulator_id, now())
  RETURNING id INTO _app;
  RETURN _app;
END $$;

DROP FUNCTION IF EXISTS pg_temp.f5b4_individual(text);
CREATE OR REPLACE FUNCTION pg_temp.f5b4_individual(_name text) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.fp_individuals (full_name, status, notes)
  VALUES (_name, 'active', 'F5-B4 probe') RETURNING id INTO _id;
  RETURN _id;
END $$;

DROP FUNCTION IF EXISTS pg_temp.f5b4_assessment(uuid,uuid,text);
CREATE OR REPLACE FUNCTION pg_temp.f5b4_assessment(_ind uuid, _entity uuid, _status text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.fp_assessments (individual_id, licensee_id, assessment_type, status,
                                     declaration_data)
  VALUES (_ind, _entity, 'triggered', _status, jsonb_build_object('source','f5b4_probe'))
  RETURNING id INTO _id;
  RETURN _id;
END $$;

DROP FUNCTION IF EXISTS pg_temp.f5b4_determination(uuid,uuid,text,boolean,date,date);
CREATE OR REPLACE FUNCTION pg_temp.f5b4_determination(_assessment uuid, _ind uuid, _outcome text,
                                                      _current boolean DEFAULT true,
                                                      _from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.fp_determinations (assessment_id, individual_id, outcome, rationale,
                                        determined_by, determined_at, is_current,
                                        effective_from, effective_to)
  VALUES (_assessment, _ind, _outcome, 'F5-B4 probe',
          (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1), now(), _current, _from, _to)
  RETURNING id INTO _id;
  UPDATE public.fp_assessments SET status = 'determined', determined_at = now()
   WHERE id = _assessment;
  RETURN _id;
END $$;

-- ===========================================================================
-- SECTION A — contract census, wiring and privilege model (no writes)
-- ===========================================================================
DO $a$
DECLARE _n int; _defs int; _src text; _sa text; _plan text; _ex text; _guard text;
BEGIN
  SELECT count(*), count(DISTINCT code) INTO _n, _defs
    FROM public.services WHERE requires_fit_and_proper AND status = 'active';
  PERFORM pg_temp.rec('A','A-01','the live F&P service census is 40 rows across 5 canonical definitions',
    _n = 40 AND _defs = 5, 'rows=' || _n || ' definitions=' || _defs);

  PERFORM pg_temp.rec('A','A-02','the graded F&P readiness resolver exists',
    to_regprocedure('public.post_license_fp_readiness(uuid)') IS NOT NULL, 'installed');

  PERFORM pg_temp.rec('A','A-03','the subject to effect alignment invariant exists',
    to_regprocedure('public.assert_post_license_fp_effect_alignment(uuid)') IS NOT NULL, 'installed');

  _sa := pg_get_functiondef('public.submit_application(uuid,text)'::regprocedure);
  PERFORM pg_temp.rec('A','A-04','the canonical submission path orchestrates F&P linkage',
    position('ensure_post_license_fp_links' in _sa) > 0
      AND position('FP_SUBJECT_REQUIRED' in _sa) > 0,
    'wired');

  _plan := pg_get_functiondef('public.post_license_effect_plan(uuid)'::regprocedure);
  PERFORM pg_temp.rec('A','A-05','the effect planner emits graded F&P blocker codes',
    position('FP_SUBJECT_REQUIRED' in _plan) > 0
      AND position('FP_SUBJECT_NOT_CANONICAL' in _plan) > 0
      AND position('FP_LINK_REQUIRED' in _plan) > 0
      AND position('FP_DETERMINATION_REQUIRED' in _plan) > 0,
    'graded');

  _ex := pg_get_functiondef('public.apply_post_license_effect(uuid)'::regprocedure);
  PERFORM pg_temp.rec('A','A-06','the effect executor asserts subject alignment before applying',
    position('assert_post_license_fp_effect_alignment' in _ex) > 0
      AND position('assert_post_license_fp_effect_alignment' in _ex)
          < position('IF v_kind = ''RENEWAL''' in _ex),
    'asserted before handlers');

  _guard := pg_get_functiondef('public.post_license_fp_subject_link_guard()'::regprocedure);
  PERFORM pg_temp.rec('A','A-07','subject provenance rejects deletion and general rewriting',
    position('IMMUTABLE_RECORD' in _guard) > 0
      AND position('only a one-time NULL to value link stamp is permitted' in _guard) > 0,
    'append-only with a single link stamp');

  SELECT count(*) INTO _n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'application_fp_links' AND grantee = 'anon';
  PERFORM pg_temp.rec('A','A-08','anonymous visitors hold no grant at all on the F&P link table',
    _n = 0, 'anon_grants=' || _n);

  SELECT count(*) INTO _n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'application_fp_links'
     AND grantee = 'authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE');
  PERFORM pg_temp.rec('A','A-09','signed-in browser users hold no direct DML on the F&P link table',
    _n = 0, 'browser_dml_grants=' || _n);

  SELECT count(*) INTO _n FROM unnest(ARRAY['anon','authenticated']) r
   WHERE has_function_privilege(r, to_regprocedure('public.ensure_post_license_fp_links(uuid)')::oid, 'EXECUTE')
      OR has_function_privilege(r, to_regprocedure('public.post_license_fp_subjects(uuid)')::oid, 'EXECUTE');
  PERFORM pg_temp.rec('A','A-10','the linkage and subject resolvers are not callable from the browser',
    _n = 0, 'browser_execute_grants=' || _n);

  SELECT count(*) INTO _n FROM pg_trigger t
   WHERE t.tgrelid = 'public.post_license_fp_subject_links'::regclass AND NOT t.tgisinternal;
  PERFORM pg_temp.rec('A','A-11','the subject provenance table is trigger-guarded',
    _n >= 1, 'triggers=' || _n);

  PERFORM pg_temp.rec('A','A-12','row level security protects the subject provenance table',
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.post_license_fp_subject_links'::regclass),
    'rls enabled');
END $a$;

-- ===========================================================================
-- SECTION B — empirical linkage, determination and alignment proof
-- ===========================================================================
DO $b$
DECLARE
  _lic uuid; _entity uuid; _other_entity uuid; _officer uuid; _outsider uuid;
  _svc_fp uuid; _svc_plain uuid; _tpl uuid; _ver uuid; _resp uuid;
  _p1 uuid; _p2 uuid; _p3 uuid; _p4 uuid;
  _a_plain uuid; _a_nosub uuid; _a_text uuid; _a_main uuid; _a_two uuid;
  _a_nolink uuid; _a_reuse uuid; _a_inflight uuid; _a_other uuid; _a_align uuid;
  _a_f4 uuid;
  _r_plain jsonb; _r_nosub jsonb; _r_text jsonb; _r_nodet jsonb; _r_neg jsonb;
  _r_exp jsonb; _r_ok jsonb; _r_two_partial jsonb; _r_two_ok jsonb; _r_nolink jsonb;
  _r_wrongsub jsonb; _r_f4 jsonb;
  _e_plain jsonb; _e_nosub jsonb; _e_main jsonb; _e_retry jsonb; _e_reuse jsonb;
  _e_inflight jsonb; _e_other jsonb;
  _plan_nosub jsonb; _plan_nolink jsonb; _plan_nodet jsonb;
  _plain_links int; _plain_prov int; _links int; _prov int; _assess int; _links2 int; _prov2 int; _assess2 int;
  _assess_p3 int; _assess_p4_entity int;
  _align_mismatch text; _align_ok text;
  _forge text; _forge_prov text; _prov_upd text; _prov_del text;
  _frozen text; _nonfp_nom text;
  _ov_reg jsonb; _ov_entity jsonb;
  _submit jsonb; _status_after text;
  _f4_links int;
  _det_p1 uuid; _asm_p1 uuid; _asm_p2 uuid; _asm_p3 uuid; _asm_p4 uuid;
  _harness text := NULL;
BEGIN
  SELECT p.id INTO _officer FROM public.profiles p
   WHERE public.has_permission(p.id,'application_management','edit')
     AND public.has_permission(p.id,'application_management','view')
   ORDER BY p.created_at LIMIT 1;

  SELECT p.id INTO _outsider FROM public.profiles p
   WHERE NOT public.is_fp_staff(p.id)
     AND NOT public.has_permission(p.id,'application_management','view')
   ORDER BY p.created_at LIMIT 1;

  SELECT l.id INTO _lic
    FROM public.licenses l
   WHERE lower(l.status) = 'active' AND l.sub_sector_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.licensees x WHERE x.id = l.holder_id)
     AND EXISTS (SELECT 1 FROM public.services s
                  WHERE s.sub_sector_id = l.sub_sector_id AND s.status = 'active'
                    AND s.code = 'PLS_DIRECTOR_APPOINTMENT')
     AND EXISTS (SELECT 1 FROM public.services s
                  WHERE s.sub_sector_id = l.sub_sector_id AND s.status = 'active'
                    AND NOT COALESCE(s.requires_fit_and_proper,false))
   ORDER BY l.issued_at DESC LIMIT 1;

  IF _lic IS NULL OR _officer IS NULL OR _outsider IS NULL THEN
    PERFORM pg_temp.rec('B','B-00','fixtures available for the F&P linkage proof', false,
      'license=' || coalesce(_lic::text,'null') || ' officer=' || coalesce(_officer::text,'null')
      || ' outsider=' || coalesce(_outsider::text,'null'));
    RETURN;
  END IF;

  SELECT holder_id INTO _entity FROM public.licenses WHERE id = _lic;
  SELECT id INTO _other_entity FROM public.licensees WHERE id <> _entity LIMIT 1;
  SELECT s.id INTO _svc_fp FROM public.services s JOIN public.licenses l ON l.id = _lic
   WHERE s.sub_sector_id = l.sub_sector_id AND s.status='active' AND s.code = 'PLS_DIRECTOR_APPOINTMENT'
   LIMIT 1;
  SELECT s.id INTO _svc_plain FROM public.services s JOIN public.licenses l ON l.id = _lic
   WHERE s.sub_sector_id = l.sub_sector_id AND s.status='active'
     AND NOT COALESCE(s.requires_fit_and_proper,false)
     AND public.post_license_service_applicability(s.id, _lic) = 'OK'
   LIMIT 1;
  SELECT fv.id, fv.template_id INTO _ver, _tpl FROM public.form_versions fv LIMIT 1;

  IF _svc_fp IS NULL OR _svc_plain IS NULL OR _ver IS NULL OR _other_entity IS NULL THEN
    PERFORM pg_temp.rec('B','B-00','fixtures available for the F&P linkage proof', false,
      'fp_service=' || coalesce(_svc_fp::text,'null') || ' plain_service=' || coalesce(_svc_plain::text,'null')
      || ' form_version=' || coalesce(_ver::text,'null')
      || ' other_entity=' || coalesce(_other_entity::text,'null'));
    RETURN;
  END IF;

  BEGIN
    _p1 := pg_temp.f5b4_individual('F5-B4 Probe Subject One');
    _p2 := pg_temp.f5b4_individual('F5-B4 Probe Subject Two');
    _p3 := pg_temp.f5b4_individual('F5-B4 Probe Subject Three');
    _p4 := pg_temp.f5b4_individual('F5-B4 Probe Subject Four');

    ----------------------------------------------------------------- non-F&P
    _a_plain := pg_temp.f5b4_app(_lic, _svc_plain, _officer);
    _r_plain := public.post_license_fp_readiness(_a_plain);
    PERFORM pg_temp.trusted_on(_officer);
    _e_plain := public.ensure_post_license_fp_links(_a_plain);
    PERFORM pg_temp.trusted_off();
    SELECT count(*) INTO _plain_links FROM public.application_fp_links WHERE application_id = _a_plain;
    SELECT count(*) INTO _plain_prov  FROM public.post_license_fp_subject_links WHERE application_id = _a_plain;

    -------------------------------------------------------- no subject at all
    _a_nosub := pg_temp.f5b4_app(_lic, _svc_fp, _officer);
    _r_nosub := public.post_license_fp_readiness(_a_nosub);
    PERFORM pg_temp.trusted_on(_officer);
    _e_nosub := public.ensure_post_license_fp_links(_a_nosub);
    PERFORM pg_temp.trusted_off();
    _plan_nosub := public.post_license_effect_plan(_a_nosub);

    -- end-to-end submission refusal on the canonical path
    _a_f4 := pg_temp.f5b4_app(_lic, _svc_fp, _officer, 'draft');
    INSERT INTO public.payments (application_id, amount, status, payment_method)
    VALUES (_a_f4, 1, 'completed', 'probe');
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);
    UPDATE public.applications SET applicant_id = _officer WHERE id = _a_f4;
    _submit := public.submit_application(_a_f4, NULL);
    SELECT status INTO _status_after FROM public.applications WHERE id = _a_f4;

    ------------------------------------------------ free text person name only
    _a_text := pg_temp.f5b4_app(_lic, _svc_fp, _officer);
    INSERT INTO public.form_responses (template_id, version_id, user_id, entity_type, entity_id, status)
    VALUES (_tpl, _ver, _officer, 'application', _a_text, 'submitted') RETURNING id INTO _resp;
    INSERT INTO public.form_submission_values (response_id, form_version_id, data_concept_id, value_text)
    SELECT _resp, _ver, dc.id, 'Jane Uncanonical Doe'
      FROM public.data_concepts dc WHERE dc.code = 'PERSON.FULL_NAME';
    _r_text := public.post_license_fp_readiness(_a_text);

    --------------------------------------------------- one canonical subject
    _a_main := pg_temp.f5b4_app(_lic, _svc_fp, _officer);
    PERFORM pg_temp.nominate(_a_main, _p1, 'DIRECTOR');
    PERFORM pg_temp.trusted_on(_officer);
    _e_main := public.ensure_post_license_fp_links(_a_main);
    PERFORM pg_temp.trusted_off();
    SELECT count(*) INTO _links FROM public.application_fp_links WHERE application_id = _a_main;
    SELECT count(*) INTO _prov  FROM public.post_license_fp_subject_links WHERE application_id = _a_main;
    SELECT count(*) INTO _assess FROM public.fp_assessments
     WHERE individual_id = _p1 AND licensee_id = _entity;
    SELECT l.assessment_id INTO _asm_p1 FROM public.application_fp_links l
     WHERE l.application_id = _a_main LIMIT 1;

    -- idempotent retry
    PERFORM pg_temp.trusted_on(_officer);
    _e_retry := public.ensure_post_license_fp_links(_a_main);
    PERFORM pg_temp.trusted_off();
    SELECT count(*) INTO _links2 FROM public.application_fp_links WHERE application_id = _a_main;
    SELECT count(*) INTO _prov2  FROM public.post_license_fp_subject_links WHERE application_id = _a_main;
    SELECT count(*) INTO _assess2 FROM public.fp_assessments
     WHERE individual_id = _p1 AND licensee_id = _entity;

    _r_nodet := public.post_license_fp_readiness(_a_main);
    _plan_nodet := public.post_license_effect_plan(_a_main);

    -- negative determination
    PERFORM pg_temp.f5b4_determination(_asm_p1, _p1, 'rejected', true);
    _r_neg := public.post_license_fp_readiness(_a_main);

    -- expired / non-current positive
    UPDATE public.fp_determinations SET is_current = false WHERE assessment_id = _asm_p1;
    PERFORM pg_temp.f5b4_determination(_asm_p1, _p1, 'approved', true,
                                       current_date - 400, current_date - 10);
    _r_exp := public.post_license_fp_readiness(_a_main);

    -- exact valid current positive
    UPDATE public.fp_determinations SET is_current = false WHERE assessment_id = _asm_p1;
    _det_p1 := pg_temp.f5b4_determination(_asm_p1, _p1, 'approved', true,
                                          current_date - 10, current_date + 365);
    _r_ok := public.post_license_fp_readiness(_a_main);

    --------------------------------------------- explicit link is mandatory
    -- P1 now holds a current positive determination at this entity, but a new
    -- filing that has not been linked must NOT inherit it.
    _a_nolink := pg_temp.f5b4_app(_lic, _svc_fp, _officer);
    PERFORM pg_temp.nominate(_a_nolink, _p1, 'DIRECTOR');
    _r_nolink := public.post_license_fp_readiness(_a_nolink);
    _plan_nolink := public.post_license_effect_plan(_a_nolink);

    -- an unrelated positive officer's link cannot satisfy a different subject
    _a_reuse := pg_temp.f5b4_app(_lic, _svc_fp, _officer);
    PERFORM pg_temp.nominate(_a_reuse, _p2, 'DIRECTOR');
    INSERT INTO public.application_fp_links (application_id, assessment_id, is_required, linked_by)
    VALUES (_a_reuse, _asm_p1, true, _officer);
    _r_wrongsub := public.post_license_fp_readiness(_a_reuse);
    DELETE FROM public.application_fp_links WHERE application_id = _a_reuse;

    ------------------------------------------------------------ reuse rules
    -- same subject, same entity, current positive → reuse, no new assessment
    PERFORM pg_temp.trusted_on(_officer);
    _e_reuse := public.ensure_post_license_fp_links(_a_nolink);
    PERFORM pg_temp.trusted_off();

    -- same subject, same entity, in-flight assessment → reuse
    _asm_p3 := pg_temp.f5b4_assessment(_p3, _entity, 'screening');
    _a_inflight := pg_temp.f5b4_app(_lic, _svc_fp, _officer);
    PERFORM pg_temp.nominate(_a_inflight, _p3, 'DIRECTOR');
    PERFORM pg_temp.trusted_on(_officer);
    _e_inflight := public.ensure_post_license_fp_links(_a_inflight);
    PERFORM pg_temp.trusted_off();
    SELECT count(*) INTO _assess_p3 FROM public.fp_assessments WHERE individual_id = _p3;

    -- another entity's positive assessment is NOT reusable here
    _asm_p4 := pg_temp.f5b4_assessment(_p4, _other_entity, 'determined');
    PERFORM pg_temp.f5b4_determination(_asm_p4, _p4, 'approved', true, current_date - 5, current_date + 300);
    _a_other := pg_temp.f5b4_app(_lic, _svc_fp, _officer);
    PERFORM pg_temp.nominate(_a_other, _p4, 'DIRECTOR');
    PERFORM pg_temp.trusted_on(_officer);
    _e_other := public.ensure_post_license_fp_links(_a_other);
    PERFORM pg_temp.trusted_off();
    SELECT count(*) INTO _assess_p4_entity FROM public.fp_assessments
     WHERE individual_id = _p4 AND licensee_id = _entity;

    ------------------------------------------------------ multi-subject case
    _a_two := pg_temp.f5b4_app(_lic, _svc_fp, _officer);
    PERFORM pg_temp.nominate(_a_two, _p1, 'DIRECTOR');
    PERFORM pg_temp.nominate(_a_two, _p2, 'DIRECTOR');
    PERFORM pg_temp.trusted_on(_officer);
    PERFORM public.ensure_post_license_fp_links(_a_two);
    PERFORM pg_temp.trusted_off();
    _r_two_partial := public.post_license_fp_readiness(_a_two);
    SELECT l.assessment_id INTO _asm_p2
      FROM public.application_fp_links l JOIN public.fp_assessments a ON a.id = l.assessment_id
     WHERE l.application_id = _a_two AND a.individual_id = _p2;
    PERFORM pg_temp.f5b4_determination(_asm_p2, _p2, 'approved', true,
                                       current_date - 5, current_date + 300);
    _r_two_ok := public.post_license_fp_readiness(_a_two);

    ------------------------------------------------------------- alignment
    -- Person A assessed, Person B structurally appointed → refused
    _a_align := _a_main;
    INSERT INTO public.form_responses (template_id, version_id, user_id, entity_type, entity_id, status)
    VALUES (_tpl, _ver, _officer, 'application', _a_align, 'submitted') RETURNING id INTO _resp;
    INSERT INTO public.form_submission_values (response_id, form_version_id, data_concept_id, value_json)
    SELECT _resp, _ver, dc.id,
           jsonb_build_object('fp_individual_id', _p2, 'role_type_key','DIRECTOR')
      FROM public.data_concepts dc WHERE dc.code = 'GOVERNANCE.ROLE';
    BEGIN
      PERFORM public.assert_post_license_fp_effect_alignment(_a_align);
      _align_mismatch := 'ALLOWED';
    EXCEPTION WHEN others THEN
      _align_mismatch := SQLERRM;
    END;

    -- the aligned individual passes
    UPDATE public.form_submission_values
       SET value_json = jsonb_build_object('fp_individual_id', _p1, 'role_type_key','DIRECTOR')
     WHERE response_id = _resp;
    BEGIN
      PERFORM public.assert_post_license_fp_effect_alignment(_a_align);
      _align_ok := 'ALIGNED';
    EXCEPTION WHEN others THEN
      _align_ok := SQLSTATE || ': ' || left(SQLERRM,120);
    END;

    --------------------------------------------------------------- tampering
    _forge := pg_temp.as_user(_officer, format(
      'INSERT INTO public.application_fp_links (application_id, assessment_id, is_required) VALUES (%L,%L,true)',
      _a_nosub, _asm_p1));
    _forge_prov := pg_temp.as_user(_officer, format(
      'INSERT INTO public.post_license_fp_subject_links (application_id, assessment_id, individual_id, subject_key) VALUES (%L,%L,%L,%L)',
      _a_nosub, _asm_p1, _p1, 'PROTECTED:' || _p1::text));

    BEGIN
      PERFORM pg_temp.trusted_on(_officer);
      UPDATE public.post_license_fp_subject_links SET subject_key = 'TAMPERED'
       WHERE application_id = _a_main;
      _prov_upd := 'ALLOWED';
    EXCEPTION WHEN others THEN
      _prov_upd := SQLERRM;
    END;
    PERFORM pg_temp.trusted_off();

    BEGIN
      PERFORM pg_temp.trusted_on(_officer);
      DELETE FROM public.post_license_fp_subject_links WHERE application_id = _a_main;
      _prov_del := 'ALLOWED';
    EXCEPTION WHEN others THEN
      _prov_del := SQLERRM;
    END;
    PERFORM pg_temp.trusted_off();

    -------------------------------------------------- nomination authority
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);
    BEGIN
      PERFORM public.set_application_fp_subject(_a_main, _p3, 'DIRECTOR');
      _frozen := 'ALLOWED';
    EXCEPTION WHEN others THEN
      _frozen := SQLERRM;
    END;
    BEGIN
      PERFORM public.set_application_fp_subject(_a_plain, _p3, 'DIRECTOR');
      _nonfp_nom := 'ALLOWED';
    EXCEPTION WHEN others THEN
      _nonfp_nom := SQLERRM;
    END;

    ----------------------------------------------------------- overview RPC
    _ov_reg := public.post_license_fp_overview(_a_main);
    UPDATE public.applications SET applicant_id = _outsider WHERE id = _a_main;
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_outsider::text,'role','authenticated')::text, true);
    _ov_entity := public.post_license_fp_overview(_a_main);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',_officer::text,'role','authenticated')::text, true);

    ------------------------------------------------------- F4 non-regression
    INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id)
    VALUES (_officer, 'f5b4-probe-initial', 'submitted', '{"type":"new_application"}'::jsonb, _entity)
    RETURNING id INTO _a_f4;
    _r_f4 := public.post_license_fp_readiness(_a_f4);
    SELECT count(*) INTO _f4_links FROM public.application_fp_links WHERE application_id = _a_f4;

    RAISE EXCEPTION 'F5B4_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5B4_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM, 240); END IF;
    PERFORM set_config('request.jwt.claims','{}', true);
    PERFORM set_config('app.workflow_mutation_context','', true);
    PERFORM set_config('app.fp_subject_context_writer','', true);
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('B','B-99','the F&P linkage probe executed without harness error', false, _harness);
    RETURN;
  END IF;

  PERFORM pg_temp.rec('B','B-01','a non F&P post-licensing service creates no assessment, link or provenance',
    COALESCE((_r_plain->>'fp_required')::boolean, true) = false
      AND COALESCE((_e_plain->>'fp_required')::boolean, true) = false
      AND _plain_links = 0 AND _plain_prov = 0,
    'readiness=' || coalesce(_r_plain->>'state','null')
      || ' links=' || _plain_links || ' provenance=' || _plain_prov);

  PERFORM pg_temp.rec('B','B-02','an F&P filing with no canonical subject fails closed at resolution',
    _r_nosub->>'state' = 'FP_SUBJECT_REQUIRED'
      AND COALESCE((_e_nosub->>'success')::boolean, true) = false,
    'readiness=' || coalesce(_r_nosub->>'state','null')
      || ' linkage=' || coalesce(_e_nosub->>'code','null'));

  PERFORM pg_temp.rec('B','B-03','the effect planner blocks that filing with the subject code',
    _plan_nosub->>'code' = 'FP_SUBJECT_REQUIRED' AND _plan_nosub->>'state' = 'BLOCKED',
    'state=' || coalesce(_plan_nosub->>'state','null') || ' code=' || coalesce(_plan_nosub->>'code','null'));

  PERFORM pg_temp.rec('B','B-04','the canonical submission path refuses the filing and it stays unsubmitted',
    _submit->>'code' = 'FP_SUBJECT_REQUIRED' AND _status_after = 'draft',
    'code=' || coalesce(_submit->>'code','null') || ' status=' || coalesce(_status_after,'null'));

  PERFORM pg_temp.rec('B','B-05','a free-text person name alone is not a canonical subject',
    _r_text->>'state' = 'FP_SUBJECT_NOT_CANONICAL',
    'state=' || coalesce(_r_text->>'state','null'));

  PERFORM pg_temp.rec('B','B-06','one canonical subject produces exactly one required link with provenance',
    _links = 1 AND _prov = 1 AND _assess = 1
      AND (_e_main->>'created')::int = 1,
    'links=' || _links || ' provenance=' || _prov || ' assessments=' || _assess);

  PERFORM pg_temp.rec('B','B-07','retrying linkage creates no duplicate assessment, link or provenance',
    _links2 = 1 AND _prov2 = 1 AND _assess2 = 1
      AND (_e_retry->>'created')::int = 0,
    'links=' || _links2 || ' provenance=' || _prov2 || ' assessments=' || _assess2);

  PERFORM pg_temp.rec('B','B-08','a linked subject without any determination is not ready',
    _r_nodet->>'state' = 'FP_DETERMINATION_REQUIRED' AND (_r_nodet->>'satisfied')::boolean = false,
    'state=' || coalesce(_r_nodet->>'state','null'));

  PERFORM pg_temp.rec('B','B-09','the planner blocks that filing on the determination code',
    _plan_nodet->>'code' = 'FP_DETERMINATION_REQUIRED',
    'code=' || coalesce(_plan_nodet->>'code','null'));

  PERFORM pg_temp.rec('B','B-10','a negative determination never satisfies the filing',
    (_r_neg->>'satisfied')::boolean = false AND _r_neg->>'state' = 'FP_DETERMINATION_REQUIRED',
    'state=' || coalesce(_r_neg->>'state','null'));

  PERFORM pg_temp.rec('B','B-11','an expired positive determination never satisfies the filing',
    (_r_exp->>'satisfied')::boolean = false,
    'state=' || coalesce(_r_exp->>'state','null'));

  PERFORM pg_temp.rec('B','B-12','an exact current positive determination satisfies the filing',
    (_r_ok->>'satisfied')::boolean = true AND _r_ok->>'state' = 'OK'
      AND (_r_ok->>'positive_count')::int = 1,
    'state=' || coalesce(_r_ok->>'state','null') || ' positive=' || coalesce(_r_ok->>'positive_count','null'));

  PERFORM pg_temp.rec('B','B-13','an entity-wide positive determination cannot satisfy an unlinked filing',
    _r_nolink->>'state' = 'FP_LINK_REQUIRED' AND _plan_nolink->>'code' = 'FP_LINK_REQUIRED',
    'readiness=' || coalesce(_r_nolink->>'state','null') || ' plan=' || coalesce(_plan_nolink->>'code','null'));

  PERFORM pg_temp.rec('B','B-14','another individual''s positive link cannot satisfy a different subject',
    _r_wrongsub->>'state' = 'FP_LINK_REQUIRED',
    'state=' || coalesce(_r_wrongsub->>'state','null'));

  PERFORM pg_temp.rec('B','B-15','a same-subject same-entity current positive assessment is legitimately reused',
    _e_reuse->>'state' = 'OK' AND (_e_reuse->>'created')::int = 0 AND (_e_reuse->>'reused')::int = 1
      AND _e_reuse->'details'->0->>'reuse_basis' = 'REUSED_CURRENT_POSITIVE_DETERMINATION',
    'created=' || coalesce(_e_reuse->>'created','null') || ' reused=' || coalesce(_e_reuse->>'reused','null'));

  PERFORM pg_temp.rec('B','B-16','a same-subject same-entity in-flight assessment is legitimately reused',
    (_e_inflight->>'reused')::int = 1 AND _assess_p3 = 1
      AND _e_inflight->'details'->0->>'reuse_basis' = 'REUSED_IN_FLIGHT_ASSESSMENT',
    'reused=' || coalesce(_e_inflight->>'reused','null') || ' assessments=' || _assess_p3);

  PERFORM pg_temp.rec('B','B-17','another entity''s positive assessment is never reused for this filing',
    (_e_other->>'created')::int = 1 AND _assess_p4_entity = 1,
    'created=' || coalesce(_e_other->>'created','null') || ' entity_assessments=' || _assess_p4_entity);

  PERFORM pg_temp.rec('B','B-18','two required subjects with only one positive determination stay blocked',
    (_r_two_partial->>'satisfied')::boolean = false
      AND (_r_two_partial->>'subject_count')::int = 2
      AND (_r_two_partial->>'positive_count')::int = 1,
    'subjects=' || coalesce(_r_two_partial->>'subject_count','null')
      || ' positive=' || coalesce(_r_two_partial->>'positive_count','null'));

  PERFORM pg_temp.rec('B','B-19','two required subjects both positive make the filing ready',
    (_r_two_ok->>'satisfied')::boolean = true AND (_r_two_ok->>'positive_count')::int = 2,
    'positive=' || coalesce(_r_two_ok->>'positive_count','null'));

  PERFORM pg_temp.rec('B','B-20','assessing person A while structurally appointing person B is refused',
    _align_mismatch <> 'ALLOWED'
      AND (_align_mismatch LIKE '%FP_EFFECT%' OR _align_mismatch LIKE '%ALIGNMENT%'),
    'result=' || left(coalesce(_align_mismatch,'null'), 90));

  PERFORM pg_temp.rec('B','B-21','the aligned assessed individual passes the effect alignment invariant',
    _align_ok = 'ALIGNED', 'result=' || coalesce(_align_ok,'null'));

  PERFORM pg_temp.rec('B','B-22','a browser user cannot manufacture a required F&P link',
    _forge <> '00000', 'state=' || coalesce(_forge,'null'));

  PERFORM pg_temp.rec('B','B-23','a browser user cannot manufacture subject provenance',
    _forge_prov <> '00000', 'state=' || coalesce(_forge_prov,'null'));

  PERFORM pg_temp.rec('B','B-24','subject provenance cannot be rewritten, even in a trusted context',
    _prov_upd <> 'ALLOWED' AND _prov_upd LIKE '%IMMUTABLE_RECORD%', 'result=' || left(coalesce(_prov_upd,'null'),90));

  PERFORM pg_temp.rec('B','B-25','subject provenance cannot be deleted',
    _prov_del <> 'ALLOWED' AND _prov_del LIKE '%IMMUTABLE_RECORD%', 'result=' || left(coalesce(_prov_del,'null'),90));

  PERFORM pg_temp.rec('B','B-26','the frozen post-submission subject set cannot be altered',
    _frozen <> 'ALLOWED' AND _frozen LIKE '%FP_SUBJECTS_FROZEN%', 'result=' || left(coalesce(_frozen,'null'),90));

  PERFORM pg_temp.rec('B','B-27','a non F&P service rejects subject nomination outright',
    _nonfp_nom <> 'ALLOWED' AND _nonfp_nom LIKE '%FP_NOT_REQUIRED%', 'result=' || left(coalesce(_nonfp_nom,'null'),90));

  PERFORM pg_temp.rec('B','B-28','authorised regulator staff see full linkage detail',
    _ov_reg->>'audience' = 'regulator' AND jsonb_array_length(_ov_reg->'links') >= 1,
    'audience=' || coalesce(_ov_reg->>'audience','null'));

  PERFORM pg_temp.rec('B','B-29','an entity user sees only the safe fit-and-proper state',
    _ov_entity->>'audience' = 'entity' AND _ov_entity->'links' IS NULL
      AND _ov_entity->>'safe_status' IS NOT NULL,
    'audience=' || coalesce(_ov_entity->>'audience','null')
      || ' safe=' || coalesce(_ov_entity->>'safe_status','null'));

  PERFORM pg_temp.rec('B','B-30','initial (F4) licensing is untouched by the F5 F&P contract',
    COALESCE((_r_f4->>'fp_required')::boolean, true) = false AND _f4_links = 0,
    'state=' || coalesce(_r_f4->>'state','null') || ' links=' || _f4_links);
END $b$;

-- ===========================================================================
-- SECTION C — zero residue
-- ===========================================================================
DO $c$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.applications WHERE license_type LIKE 'f5b4-probe%';
  PERFORM pg_temp.rec('C','C-01','no probe application survives the run', _n = 0, 'residue=' || _n);

  SELECT count(*) INTO _n FROM public.fp_individuals WHERE full_name LIKE 'F5-B4 Probe%';
  PERFORM pg_temp.rec('C','C-02','no probe individual survives the run', _n = 0, 'residue=' || _n);

  SELECT count(*) INTO _n FROM public.fp_assessments
   WHERE declaration_data->>'source' = 'f5b4_probe';
  PERFORM pg_temp.rec('C','C-03','no probe assessment survives the run', _n = 0, 'residue=' || _n);

  SELECT count(*) INTO _n FROM public.post_license_fp_subject_links sl
   WHERE NOT EXISTS (SELECT 1 FROM public.applications a WHERE a.id = sl.application_id);
  PERFORM pg_temp.rec('C','C-04','no orphaned subject provenance survives the run', _n = 0, 'residue=' || _n);

  SELECT count(*) INTO _n FROM public.application_fp_links l
   WHERE NOT EXISTS (SELECT 1 FROM public.applications a WHERE a.id = l.application_id);
  PERFORM pg_temp.rec('C','C-05','no orphaned F&P link survives the run', _n = 0, 'residue=' || _n);
END $c$;

-- ===========================================================================
-- REPORT
-- ===========================================================================
SELECT section, id, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, descr, detail
  FROM f5b4_results ORDER BY seq;

DO $r$
DECLARE _p int; _f int; _detail text;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE NOT passed) INTO _p, _f FROM f5b4_results;
  RAISE NOTICE 'verify:f5b4 — % PASS / % FAIL', _p, _f;
  IF _f > 0 THEN
    SELECT string_agg(id || ' (' || detail || ')', '; ') INTO _detail FROM f5b4_results WHERE NOT passed;
    RAISE EXCEPTION 'verify:f5b4 FAILED — %', _detail;
  END IF;
END $r$;

DROP TABLE IF EXISTS f5b4_results;
DROP FUNCTION IF EXISTS pg_temp.rec(text,text,text,boolean,text);
DROP FUNCTION IF EXISTS pg_temp.as_user(uuid,text);
DROP FUNCTION IF EXISTS pg_temp.trusted_on(uuid);
DROP FUNCTION IF EXISTS pg_temp.trusted_off();
DROP FUNCTION IF EXISTS pg_temp.nominate(uuid,uuid,text);
DROP FUNCTION IF EXISTS pg_temp.f5b4_app(uuid,uuid,uuid,text);
DROP FUNCTION IF EXISTS pg_temp.f5b4_individual(text);
DROP FUNCTION IF EXISTS pg_temp.f5b4_assessment(uuid,uuid,text);
DROP FUNCTION IF EXISTS pg_temp.f5b4_determination(uuid,uuid,text,boolean,date,date);

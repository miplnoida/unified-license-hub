-- ============================================================================
-- verify:f5b5x — CONSOLIDATED FINAL F5 REMEDIATION GATE
--
-- Proves, empirically and with zero residue:
--   A. Licence variation / voluntary surrender catalogue is genuinely
--      configured (services, effect map + bindings, forms, canonical concepts).
--   B. applications.request_kind is server-authoritative and cannot be forged
--      from client JSON (data.type), while F4 stays INITIAL.
--   C. The governed lifecycle journeys block on missing canonical input and
--      progress on complete input, using the certified lifecycle engine.
--   D. The fee-aware submission boundary requires payment only for a real
--      assessed amount, and never fabricates a charge.
--   E. Server resolver authority + browser privilege posture.
--
-- All empirical writes run in sub-blocks that always abort → zero residue.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f scripts/verify-f5b5x.sql
-- ============================================================================
\set ON_ERROR_STOP on
SET row_security = on;
\pset pager off
SET client_min_messages = notice;

DROP TABLE IF EXISTS f5b5x_results;
CREATE TEMP TABLE f5b5x_results (
  seq serial, section text, id text, descr text, passed boolean, detail text
);

DROP FUNCTION IF EXISTS pg_temp.rec(text,text,text,boolean,text);
CREATE OR REPLACE FUNCTION pg_temp.rec(_s text, _id text, _d text, _ok boolean, _detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO f5b5x_results (section, id, descr, passed, detail)
  VALUES (_s, _id, _d, _ok, _detail);
END $$;

-- ===========================================================================
-- SECTION A — CATALOGUE / CONFIGURATION
-- ===========================================================================
DO $a$
DECLARE n int; d text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint
   WHERE conname = 'post_license_effect_map_effect_kind_check';
  PERFORM pg_temp.rec('A','A-01','Effect register accepts LICENCE_VARIATION and LICENCE_SURRENDER',
    d LIKE '%LICENCE_VARIATION%' AND d LIKE '%LICENCE_SURRENDER%', d);
  PERFORM pg_temp.rec('A','A-02','Pre-existing effect kinds preserved',
    d LIKE '%RENEWAL%' AND d LIKE '%ENTITY_CHANGE%' AND d LIKE '%NOTIFICATION_ACK%'
    AND d LIKE '%ESTABLISHMENT_OPEN%' AND d LIKE '%ESTABLISHMENT_CLOSE%' AND d LIKE '%UNSUPPORTED%', d);

  SELECT count(*) INTO n FROM public.services
   WHERE code = 'PLS_LICENCE_VARIATION' AND status = 'active' AND lifecycle_stage = 'post_license';
  PERFORM pg_temp.rec('A','A-03','Licence variation service published for every PLS sector/sub-sector',
    n >= 8, 'rows=' || n);

  SELECT count(*) INTO n FROM public.services
   WHERE code = 'PLS_VOLUNTARY_SURRENDER' AND status = 'active' AND lifecycle_stage = 'post_license';
  PERFORM pg_temp.rec('A','A-04','Voluntary surrender service published for every PLS sector/sub-sector',
    n >= 8, 'rows=' || n);

  SELECT count(*) INTO n FROM public.services
   WHERE code IN ('PLS_LICENCE_VARIATION','PLS_VOLUNTARY_SURRENDER') AND workflow_id IS NOT NULL;
  PERFORM pg_temp.rec('A','A-05','Lifecycle services bound to an existing canonical workflow',
    n >= 16, 'bound=' || n);

  SELECT count(*) INTO n FROM public.services
   WHERE code IN ('PLS_LICENCE_VARIATION','PLS_VOLUNTARY_SURRENDER')
     AND (fee_reference IS NOT NULL OR sla_days IS NOT NULL);
  PERFORM pg_temp.rec('A','A-06','No fabricated fee or SLA policy on new lifecycle services',
    n = 0, 'invented_policy_rows=' || n);

  SELECT count(*) INTO n FROM public.post_license_effect_map
   WHERE service_code = 'PLS_LICENCE_VARIATION' AND effect_kind = 'LICENCE_VARIATION'
     AND is_supported AND handler = 'license_lifecycle_step';
  PERFORM pg_temp.rec('A','A-07','Variation mapped to the certified lifecycle engine', n = 1, 'rows=' || n);

  SELECT count(*) INTO n FROM public.post_license_effect_map
   WHERE service_code = 'PLS_VOLUNTARY_SURRENDER' AND effect_kind = 'LICENCE_SURRENDER'
     AND is_supported AND handler = 'license_lifecycle_step';
  PERFORM pg_temp.rec('A','A-08','Surrender mapped to the certified lifecycle engine', n = 1, 'rows=' || n);

  SELECT count(*) INTO n FROM public.post_license_effect_service_bindings b
   WHERE b.service_code IN ('PLS_LICENCE_VARIATION','PLS_VOLUNTARY_SURRENDER')
     AND btrim(COALESCE(b.rationale,'')) <> '';
  PERFORM pg_temp.rec('A','A-09','Every lifecycle service row carries a provenance rationale',
    n >= 16, 'bindings=' || n);

  SELECT count(*) INTO n FROM public.data_concepts
   WHERE code IN ('LICENCE.VARIATION_TYPE','LICENCE.VARIATION_RATIONALE','LICENCE.VARIATION_ITEMS',
                  'LICENCE.SURRENDER_REASON','LICENCE.SURRENDER_EFFECTIVE_DATE','LICENCE.SURRENDER_LEGAL_BASIS')
     AND is_active;
  PERFORM pg_temp.rec('A','A-10','Six canonical LICENCE.* lifecycle concepts exist', n = 6, 'concepts=' || n);

  SELECT count(*) INTO n FROM public.form_templates t
    JOIN public.services s ON s.id = t.service_id
   WHERE s.code IN ('PLS_LICENCE_VARIATION','PLS_VOLUNTARY_SURRENDER') AND t.status = 'published';
  PERFORM pg_temp.rec('A','A-11','Published request form for every lifecycle service row',
    n >= 16, 'templates=' || n);

  SELECT count(*) INTO n FROM public.form_fields ff
    JOIN public.form_field_definitions fd ON fd.id = ff.form_field_definition_id
    JOIN public.data_concepts dc ON dc.id = fd.data_concept_id
   WHERE dc.code LIKE 'LICENCE.%';
  PERFORM pg_temp.rec('A','A-12','Lifecycle form fields bound to canonical concepts (not free JSON)',
    n >= 48, 'bound_fields=' || n);
END $a$;

-- ===========================================================================
-- SECTION B — SERVER-AUTHORITATIVE CLASSIFICATION (rollback-safe)
-- ===========================================================================
DO $b$
DECLARE
  _harness text;
  _entity uuid; _svc uuid; _lic uuid; _actor uuid;
  _k_forged text; _k_initial text; _k_genuine text; _k_licence text;
  _k_after_forge text; _k_preserved text; _k_bogus text;
  _src text;
BEGIN
  SELECT id INTO _actor FROM auth.users ORDER BY created_at LIMIT 1;
  SELECT s.id INTO _svc FROM public.services s WHERE s.code = 'PLS_LICENCE_VARIATION' LIMIT 1;
  SELECT l.id, l.holder_id INTO _lic, _entity FROM public.licenses l
   WHERE l.status = 'active' ORDER BY l.created_at LIMIT 1;

  BEGIN
    -- forged client hint only
    INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id)
    VALUES (_actor, 'f5b5x-probe', 'draft', '{"type":"post_license"}'::jsonb, _entity)
    RETURNING request_kind INTO _k_forged;

    -- genuine initial licensing filing
    INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id)
    VALUES (_actor, 'f5b5x-probe', 'draft', '{"type":"new_application"}'::jsonb, _entity)
    RETURNING request_kind INTO _k_initial;

    -- genuine post-licensing service context
    INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id)
    VALUES (_actor, 'f5b5x-probe', 'draft',
            jsonb_build_object('service_id', _svc), _entity)
    RETURNING request_kind INTO _k_genuine;

    -- genuine bound licence context
    INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id)
    VALUES (_actor, 'f5b5x-probe', 'draft',
            jsonb_build_object('license_id', _lic), _entity)
    RETURNING request_kind INTO _k_licence;

    -- non-existent licence / service ids must not classify
    INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id)
    VALUES (_actor, 'f5b5x-probe', 'draft',
            jsonb_build_object('license_id', gen_random_uuid(), 'service_id', gen_random_uuid(),
                               'type','post_license'), _entity)
    RETURNING request_kind INTO _k_bogus;

    -- tamper an existing F4 row with a forged hint
    UPDATE public.applications
       SET data = data || '{"type":"post_license"}'::jsonb
     WHERE license_type = 'f5b5x-probe' AND data->>'type' = 'new_application'
    RETURNING request_kind INTO _k_after_forge;

    -- an already-classified post-licensing row keeps its classification
    UPDATE public.applications
       SET data = jsonb_build_object('type','new_application')
     WHERE license_type = 'f5b5x-probe' AND request_kind = 'POST_LICENSE'
       AND data ? 'service_id'
    RETURNING request_kind INTO _k_preserved;

    RAISE EXCEPTION 'F5B5X_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5B5X_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,200); END IF;
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('B','B-99','Classification harness executed', false, _harness);
  ELSE
    PERFORM pg_temp.rec('B','B-01','Forged data.type cannot classify an application as post-licensing',
      _k_forged = 'INITIAL', 'request_kind=' || COALESCE(_k_forged,'null'));
    PERFORM pg_temp.rec('B','B-02','Initial licensing (F4) filing stays INITIAL',
      _k_initial = 'INITIAL', 'request_kind=' || COALESCE(_k_initial,'null'));
    PERFORM pg_temp.rec('B','B-03','Applicable post-licensing service classifies as POST_LICENSE',
      _k_genuine = 'POST_LICENSE', 'request_kind=' || COALESCE(_k_genuine,'null'));
    PERFORM pg_temp.rec('B','B-04','Genuine bound licence classifies as POST_LICENSE',
      _k_licence = 'POST_LICENSE', 'request_kind=' || COALESCE(_k_licence,'null'));
    PERFORM pg_temp.rec('B','B-05','Non-existent licence/service ids do not classify',
      _k_bogus = 'INITIAL', 'request_kind=' || COALESCE(_k_bogus,'null'));
    PERFORM pg_temp.rec('B','B-06','Forging data.type on an existing F4 row cannot promote it',
      _k_after_forge = 'INITIAL', 'request_kind=' || COALESCE(_k_after_forge,'null'));
    PERFORM pg_temp.rec('B','B-07','An established post-licensing classification is never downgraded',
      _k_preserved = 'POST_LICENSE', 'request_kind=' || COALESCE(_k_preserved,'null'));
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO _src FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='derive_application_request_kind';
  PERFORM pg_temp.rec('B','B-08','Classification source no longer trusts the client data.type hint',
    _src NOT LIKE '%''post_license''%' OR _src NOT LIKE '%->>''type''%', 'source inspected');

  SELECT count(*)::text INTO _src FROM public.applications WHERE request_kind IS NULL;
  PERFORM pg_temp.rec('B','B-09','Every application row carries a server classification',
    _src = '0', 'unclassified=' || _src);

  SELECT count(*)::text INTO _src FROM public.applications WHERE license_type = 'f5b5x-probe';
  PERFORM pg_temp.rec('B','B-10','Zero classification-harness residue', _src = '0', 'residue=' || _src);
END $b$;

-- ===========================================================================
-- SECTION C — GOVERNED LIFECYCLE JOURNEYS (rollback-safe)
-- ===========================================================================
DO $c$
DECLARE
  _harness text;
  _entity uuid; _actor uuid; _lic public.licenses;
  _var_svc uuid; _sur_svc uuid;
  _app uuid; _tpl uuid; _ver uuid; _resp uuid;
  _p_var_empty jsonb; _p_var_full jsonb; _p_sur_empty jsonb; _p_sur_full jsonb;
  _p_matter jsonb; _p_inactive jsonb; _input jsonb;
  _codes text;
BEGIN
  SELECT id INTO _actor FROM auth.users ORDER BY created_at LIMIT 1;
  SELECT * INTO _lic FROM public.licenses WHERE status = 'active' ORDER BY created_at LIMIT 1;
  SELECT s.id INTO _var_svc FROM public.services s
   WHERE s.code = 'PLS_LICENCE_VARIATION'
     AND (s.sub_sector_id = _lic.sub_sector_id OR s.sector_id = _lic.sector_id)
   ORDER BY (s.sub_sector_id = _lic.sub_sector_id) DESC LIMIT 1;
  SELECT s.id INTO _sur_svc FROM public.services s
   WHERE s.code = 'PLS_VOLUNTARY_SURRENDER'
     AND (s.sub_sector_id = _lic.sub_sector_id OR s.sector_id = _lic.sector_id)
   ORDER BY (s.sub_sector_id = _lic.sub_sector_id) DESC LIMIT 1;

  PERFORM pg_temp.rec('C','C-01','A variation service is applicable to a real active licence',
    _var_svc IS NOT NULL, 'license=' || COALESCE(_lic.id::text,'null'));
  PERFORM pg_temp.rec('C','C-02','A surrender service is applicable to a real active licence',
    _sur_svc IS NOT NULL, 'license=' || COALESCE(_lic.id::text,'null'));

  BEGIN
    -- variation, no captured input
    INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id, regulator_id, submitted_at)
    VALUES (_actor, 'f5b5x-lifecycle', 'submitted',
            jsonb_build_object('license_id',_lic.id,'service_id',_var_svc,
                               'sector_id',_lic.sector_id,'sub_sector_id',_lic.sub_sector_id),
            _lic.holder_id, _lic.regulator_id, now())
    RETURNING id INTO _app;
    _p_var_empty := public.post_license_effect_plan(_app);

    SELECT t.id, v.id INTO _tpl, _ver FROM public.form_templates t
      JOIN public.form_versions v ON v.template_id = t.id AND v.status = 'published'
     WHERE t.service_id = _var_svc LIMIT 1;
    INSERT INTO public.form_responses (template_id, version_id, user_id, entity_type, entity_id, status)
    VALUES (_tpl, _ver, _actor, 'application', _app, 'submitted') RETURNING id INTO _resp;
    INSERT INTO public.form_submission_values (response_id, form_version_id, data_concept_id, value_text)
    SELECT _resp, _ver, dc.id, 'Scope extension'
      FROM public.data_concepts dc WHERE dc.code = 'LICENCE.VARIATION_TYPE';
    INSERT INTO public.form_submission_values (response_id, form_version_id, data_concept_id, value_text)
    SELECT _resp, _ver, dc.id, 'F5-B5X probe rationale'
      FROM public.data_concepts dc WHERE dc.code = 'LICENCE.VARIATION_RATIONALE';
    _p_var_full := public.post_license_effect_plan(_app);

    -- surrender, no captured input
    INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id, regulator_id, submitted_at)
    VALUES (_actor, 'f5b5x-lifecycle', 'submitted',
            jsonb_build_object('license_id',_lic.id,'service_id',_sur_svc,
                               'sector_id',_lic.sector_id,'sub_sector_id',_lic.sub_sector_id),
            _lic.holder_id, _lic.regulator_id, now())
    RETURNING id INTO _app;
    _p_sur_empty := public.post_license_effect_plan(_app);

    SELECT t.id, v.id INTO _tpl, _ver FROM public.form_templates t
      JOIN public.form_versions v ON v.template_id = t.id AND v.status = 'published'
     WHERE t.service_id = _sur_svc LIMIT 1;
    INSERT INTO public.form_responses (template_id, version_id, user_id, entity_type, entity_id, status)
    VALUES (_tpl, _ver, _actor, 'application', _app, 'submitted') RETURNING id INTO _resp;
    INSERT INTO public.form_submission_values (response_id, form_version_id, data_concept_id, value_text)
    SELECT _resp, _ver, dc.id, 'Ceasing regulated business'
      FROM public.data_concepts dc WHERE dc.code = 'LICENCE.SURRENDER_REASON';
    INSERT INTO public.form_submission_values (response_id, form_version_id, data_concept_id, value_date)
    SELECT _resp, _ver, dc.id, current_date + 30
      FROM public.data_concepts dc WHERE dc.code = 'LICENCE.SURRENDER_EFFECTIVE_DATE';
    _p_sur_empty := COALESCE(_p_sur_empty, '{}'::jsonb);
    _input := public.post_license_lifecycle_input(_app);
    _p_sur_full := public.post_license_effect_plan(_app);

    INSERT INTO public.form_submission_values (response_id, form_version_id, data_concept_id, value_text)
    SELECT _resp, _ver, dc.id, 'Section 12(3) probe basis'
      FROM public.data_concepts dc WHERE dc.code = 'LICENCE.SURRENDER_LEGAL_BASIS';
    _input := public.post_license_lifecycle_input(_app);
    _p_matter := public.post_license_effect_plan(_app);

    -- open lifecycle matter must block
    INSERT INTO public.license_lifecycle_matters (license_id, matter_kind, status, opened_by)
    VALUES (_lic.id, 'variation', 'open', _actor);
    _p_var_empty := jsonb_set(_p_var_empty, '{probe_open_matter}',
                              public.post_license_effect_plan(_app)->'code');

    -- non-active licence must block
    UPDATE public.licenses SET status = 'suspended' WHERE id = _lic.id;
    _p_inactive := public.post_license_effect_plan(_app);

    RAISE EXCEPTION 'F5B5X_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5B5X_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,300); END IF;
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('C','C-99','Lifecycle harness executed', false, _harness);
  ELSE
    _codes := (SELECT string_agg(x->>'code', ',') FROM jsonb_array_elements(_p_var_empty->'blockers') x);
    PERFORM pg_temp.rec('C','C-03','Variation without captured type/rationale is blocked',
      COALESCE(_codes,'') LIKE '%VARIATION_INPUT_REQUIRED%', 'blockers=' || COALESCE(_codes,'none'));

    _codes := (SELECT string_agg(x->>'code', ',') FROM jsonb_array_elements(_p_var_full->'blockers') x);
    PERFORM pg_temp.rec('C','C-04','Captured variation input clears the input blocker',
      COALESCE(_codes,'') NOT LIKE '%VARIATION_INPUT_REQUIRED%', 'blockers=' || COALESCE(_codes,'none'));
    PERFORM pg_temp.rec('C','C-05','Variation plan routes to the certified lifecycle engine',
      _p_var_full->>'handler' = 'license_lifecycle_step'
      AND _p_var_full->>'effect_kind' = 'LICENCE_VARIATION',
      'handler=' || COALESCE(_p_var_full->>'handler','null'));

    _codes := (SELECT string_agg(x->>'code', ',') FROM jsonb_array_elements(_p_sur_empty->'blockers') x);
    PERFORM pg_temp.rec('C','C-06','Surrender without reason/effective date is blocked',
      COALESCE(_codes,'') LIKE '%SURRENDER_INPUT_REQUIRED%', 'blockers=' || COALESCE(_codes,'none'));

    _codes := (SELECT string_agg(x->>'code', ',') FROM jsonb_array_elements(_p_sur_full->'blockers') x);
    PERFORM pg_temp.rec('C','C-07','Surrender missing a required legal basis is blocked',
      COALESCE(_codes,'') LIKE '%SURRENDER_LEGAL_BASIS_REQUIRED%'
      AND COALESCE(_codes,'') NOT LIKE '%SURRENDER_INPUT_REQUIRED%',
      'blockers=' || COALESCE(_codes,'none'));

    _codes := (SELECT string_agg(x->>'code', ',') FROM jsonb_array_elements(_p_matter->'blockers') x);
    PERFORM pg_temp.rec('C','C-08','Complete surrender input clears all lifecycle input blockers',
      COALESCE(_codes,'') NOT LIKE '%SURRENDER_INPUT_REQUIRED%'
      AND COALESCE(_codes,'') NOT LIKE '%SURRENDER_LEGAL_BASIS_REQUIRED%',
      'blockers=' || COALESCE(_codes,'none'));
    PERFORM pg_temp.rec('C','C-09','Surrender plan routes to the certified lifecycle engine',
      _p_matter->>'handler' = 'license_lifecycle_step'
      AND _p_matter->>'effect_kind' = 'LICENCE_SURRENDER',
      'handler=' || COALESCE(_p_matter->>'handler','null'));
    PERFORM pg_temp.rec('C','C-10','Lifecycle input resolver returns reason, date and legal basis',
      COALESCE(_input->>'surrender_reason','') <> ''
      AND (_input->>'surrender_effective_date') IS NOT NULL
      AND COALESCE(_input->>'surrender_legal_basis','') <> '',
      'input=' || COALESCE(_input::text,'null'));
    PERFORM pg_temp.rec('C','C-11','An already-open lifecycle matter blocks a new lifecycle decision',
      COALESCE(_p_var_empty->>'probe_open_matter','') = 'LICENCE_MATTER_IN_PROGRESS'
      OR COALESCE(_p_var_empty->'probe_open_matter'->>0,'') = 'LICENCE_MATTER_IN_PROGRESS'
      OR (_p_var_empty->>'probe_open_matter') LIKE '%LICENCE_MATTER_IN_PROGRESS%',
      'code=' || COALESCE(_p_var_empty->>'probe_open_matter','null'));
    _codes := (SELECT string_agg(x->>'code', ',') FROM jsonb_array_elements(_p_inactive->'blockers') x);
    PERFORM pg_temp.rec('C','C-12','A licence that is not active cannot be varied or surrendered',
      COALESCE(_codes,'') LIKE '%LICENCE_NOT_ACTIVE%', 'blockers=' || COALESCE(_codes,'none'));
  END IF;

  SELECT count(*)::text INTO _codes FROM public.applications WHERE license_type = 'f5b5x-lifecycle';
  PERFORM pg_temp.rec('C','C-13','Zero lifecycle-harness residue', _codes = '0', 'residue=' || _codes);
  SELECT count(*)::text INTO _codes FROM public.licenses WHERE status = 'suspended' AND id = _lic.id;
  PERFORM pg_temp.rec('C','C-14','Probe licence status restored by rollback', _codes = '0', 'suspended=' || _codes);
END $c$;

-- ===========================================================================
-- SECTION D — FEE-AWARE SUBMISSION BOUNDARY (rollback-safe)
-- ===========================================================================
DO $d$
DECLARE
  _harness text; _actor uuid; _lic public.licenses; _svc uuid; _app uuid;
  _fee_none jsonb; _fee_zero jsonb; _fee_paid jsonb; _f4 jsonb;
  _n text;
BEGIN
  SELECT id INTO _actor FROM auth.users ORDER BY created_at LIMIT 1;
  SELECT * INTO _lic FROM public.licenses WHERE status = 'active' ORDER BY created_at LIMIT 1;
  SELECT s.id INTO _svc FROM public.services s WHERE s.code = 'PLS_VOLUNTARY_SURRENDER' LIMIT 1;

  BEGIN
    INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id, regulator_id)
    VALUES (_actor, 'f5b5x-fee', 'draft',
            jsonb_build_object('license_id',_lic.id,'service_id',_svc), _lic.holder_id, _lic.regulator_id)
    RETURNING id INTO _app;
    _fee_zero := public.post_license_fee_assessment(_app);

    INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id)
    VALUES (_actor, 'f5b5x-fee', 'draft', '{"type":"new_application"}'::jsonb, _lic.holder_id)
    RETURNING id INTO _app;
    _f4 := public.post_license_fee_assessment(_app);

    INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id)
    VALUES (_actor, 'f5b5x-fee', 'draft', jsonb_build_object('service_id',_svc), _lic.holder_id)
    RETURNING id INTO _app;
    _fee_none := public.post_license_fee_assessment(_app);

    RAISE EXCEPTION 'F5B5X_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5B5X_ROLLBACK' THEN _harness := SQLSTATE || ': ' || left(SQLERRM,300); END IF;
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('D','D-99','Fee harness executed', false, _harness);
  ELSE
    PERFORM pg_temp.rec('D','D-01','Payment required only when a real amount is assessed',
      (COALESCE((_fee_zero->>'amount_due')::numeric,0) > 0) = COALESCE((_fee_zero->>'requires_payment')::boolean,false),
      'assessment=' || COALESCE(_fee_zero::text,'null'));
    PERFORM pg_temp.rec('D','D-02','Zero-rated or waived assessment does not demand payment',
      COALESCE((_fee_zero->>'amount_due')::numeric,0) > 0
      OR COALESCE((_fee_zero->>'requires_payment')::boolean,true) = false,
      'basis=' || COALESCE(_fee_zero->>'basis','null'));
    PERFORM pg_temp.rec('D','D-03','Absent fee configuration is explicit, never invented pricing',
      COALESCE((_fee_none->>'amount_due')::numeric,0) = 0
      AND COALESCE((_fee_none->>'requires_payment')::boolean,true) = false
      AND COALESCE(_fee_none->>'basis','') IN ('BUSINESS_CONFIGURATION_ABSENT','NO_LICENCE_CONTEXT','NO_FEE_RESOLVED'),
      'assessment=' || COALESCE(_fee_none::text,'null'));
    PERFORM pg_temp.rec('D','D-04','Initial licensing (F4) fee behaviour unchanged by the F5 boundary',
      _f4->>'state' = 'NOT_POST_LICENSE' AND COALESCE((_f4->>'requires_payment')::boolean,false),
      'assessment=' || COALESCE(_f4::text,'null'));
  END IF;

  SELECT count(*)::text INTO _n FROM public.applications WHERE license_type = 'f5b5x-fee';
  PERFORM pg_temp.rec('D','D-05','Zero fee-harness residue', _n = '0', 'residue=' || _n);
END $d$;

-- ===========================================================================
-- SECTION E — SERVER RESOLVER AUTHORITY + PRIVILEGE POSTURE
-- ===========================================================================
DO $e$
DECLARE n int; v jsonb; src text;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.proname IN
     ('post_license_service_form_set','application_workflow_view','application_request_kind',
      'post_license_lifecycle_input','post_license_fee_assessment','post_license_open_statuses');
  PERFORM pg_temp.rec('E','E-01','All six server resolvers exist', n >= 6, 'functions=' || n);

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public'
     AND p.proname IN ('post_license_service_form_set','application_workflow_view',
                       'post_license_lifecycle_input','post_license_fee_assessment')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('public', p.oid, 'EXECUTE'));
  PERFORM pg_temp.rec('E','E-02','No anonymous EXECUTE on F5 server resolvers', n = 0, 'anon_exec=' || n);

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.proname = 'post_license_service_form_set'
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  PERFORM pg_temp.rec('E','E-03','Signed-in users may call the governed form resolver', n = 1, 'grants=' || n);

  SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.proname='post_license_service_form_set';
  PERFORM pg_temp.rec('E','E-04','Form resolver passes the resolved regulator (argument order repaired)',
    src LIKE '%v_ctx.regulator_id, v_ctx.sector_id, v_ctx.sub_sector_id, v_ctx.category_id%', 'source inspected');

  SELECT count(*) INTO n FROM public.applications WHERE request_kind = 'POST_LICENSE';
  v := public.application_workflow_view((SELECT id FROM public.applications ORDER BY created_at LIMIT 1));
  PERFORM pg_temp.rec('E','E-05','Server workflow view returns canonical decision + open statuses',
    (v->>'found')::boolean AND v ? 'reason' AND v ? 'open_statuses' AND v ? 'request_kind',
    'reason=' || COALESCE(v->>'reason','null'));

  SELECT count(*) INTO n FROM public.post_license_effect_map WHERE is_supported IS FALSE
     AND blocker_class = 'PRODUCT_GAP';
  PERFORM pg_temp.rec('E','E-06','No remaining PRODUCT_GAP effect mapping', n = 0, 'product_gaps=' || n);

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename='post_license_effect_service_bindings';
  PERFORM pg_temp.rec('E','E-07','Effect-binding provenance is RLS protected', n >= 1, 'policies=' || n);

  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='post_license_effect_service_bindings'
     AND grantee IN ('anon','authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE');
  PERFORM pg_temp.rec('E','E-08','No browser DML on effect-binding provenance', n = 0, 'grants=' || n);

  -- reinstatement / expiry ownership (GAP-F5-05 classification)
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.proname IN ('license_expiry_sweep','mark_expired_licenses');
  PERFORM pg_temp.rec('E','E-09','Expiry is owned by the governed scheduled lifecycle path',
    n >= 2, 'functions=' || n);

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.proname = 'license_lifecycle_step'
     AND pg_get_functiondef(p.oid) LIKE '%DECIDE_REINSTATEMENT%';
  PERFORM pg_temp.rec('E','E-10','Reinstatement is owned by the internal lifecycle/appeal decision path',
    n = 1, 'functions=' || n);
END $e$;

-- ===========================================================================
-- REPORT
-- ===========================================================================
SELECT section, id, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, descr, detail
  FROM f5b5x_results ORDER BY seq;

SELECT count(*) FILTER (WHERE passed) AS passed,
       count(*) AS total,
       count(*) FILTER (WHERE NOT passed) AS failed
  FROM f5b5x_results;

DO $r$
DECLARE _f int;
BEGIN
  SELECT count(*) INTO _f FROM f5b5x_results WHERE NOT passed;
  IF _f > 0 THEN
    RAISE EXCEPTION 'verify:f5b5x FAILED — % assertion(s) failed', _f;
  END IF;
  RAISE NOTICE 'verify:f5b5x PASSED — % / % assertions',
    (SELECT count(*) FROM f5b5x_results), (SELECT count(*) FROM f5b5x_results);
END $r$;

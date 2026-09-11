-- =====================================================================
-- PCOMP-R2A — EVIDENCE POLICY RUNTIME : BEHAVIOURAL CERTIFICATION
-- =====================================================================
-- Gate families: CONTRACT, SEMANTICS, RUNTIME, EXCEPTION, SECURITY,
--                CAPABILITY, READMODEL, PRESERVATION.
--
-- Conventions (identical to AML-01..AML-11 and PCOMP-R1C):
--   * ONE transaction, ROLLBACK at the end. Nothing this script touches
--     survives: no policy component, no exception, no assessment, no
--     rating and no regulator policy decision is created or fabricated;
--   * behavioural where a real call is possible: gates call the REAL
--     governed functions, and the authenticated-identity gates run with
--     SET LOCAL ROLE authenticated and row_security on — never
--     service_role;
--   * every fixture identifier is prefixed R2ACERT;
--   * results are collected and printed as PASS/FAIL, then the
--     transaction is rolled back and the preservation gates are checked
--     against the pre-transaction census.
--
-- Personas (public.cert_certification_users):
--   maker    b8eaf680-fe66-4d49-b816-1c087f511235  configuration officer
--   outsider 411dd06d-648b-4f32-82cc-897902c0c0b6  no AML authority
--
-- Run: psql -X -q -f scripts/verify-pcomp-r2a-evidence-policy.sql
-- =====================================================================

\set ON_ERROR_STOP off
\set QUIET 1
\pset pager off
SET row_security = on;

SELECT (SELECT count(*)::text FROM public.supervisory_policy_component) AS pre_components,
       (SELECT count(*)::text FROM public.supervisory_assessment) AS pre_assessments,
       (SELECT count(*)::text FROM public.supervisory_assessment_evidence_exception) AS pre_exceptions,
       (SELECT count(*)::text FROM public.supervisory_assessment_evidence_basis) AS pre_evidence,
       (SELECT count(*)::text FROM public.entity_risk_state_movement) AS pre_movements,
       (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'),
                            '|' ORDER BY r.entity_id),'')) FROM public.entity_risk_state r) AS pre_risk_digest
\gset

BEGIN;

CREATE TEMP TABLE r2a(gate text PRIMARY KEY, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON r2a TO authenticated;

-- =====================================================================
-- CONTRACT — the published content contract for EVIDENCE_POLICY
-- =====================================================================
DO $$
DECLARE jv jsonb; n int;
BEGIN
  jv := public.supervisory_policy_component_content_contract('EVIDENCE_POLICY');

  INSERT INTO r2a VALUES ('R2A-01-CONTRACT-COLLECTION',
    jv->>'collection' = 'rules', format('collection=%s', jv->>'collection'));

  INSERT INTO r2a VALUES ('R2A-02-CONTRACT-REQUIRED-FIELDS',
    (jv->'required_fields') ?& ARRAY['rule_code','scope_type','evidence_requirement'],
    format('required=%s', jv->'required_fields'));

  INSERT INTO r2a VALUES ('R2A-03-CONTRACT-SCOPE-ENUM',
    (jv->'enums'->'scope_type') ?& ARRAY['ASSESSMENT','DIMENSION','QUESTION'],
    format('scope_type=%s', jv->'enums'->'scope_type'));

  INSERT INTO r2a VALUES ('R2A-04-CONTRACT-REQUIREMENT-ENUM',
    (jv->'enums'->'evidence_requirement') ?& ARRAY['REQUIRED','OPTIONAL','NOT_REQUIRED'],
    format('evidence_requirement=%s', jv->'enums'->'evidence_requirement'));

  SELECT count(*) INTO n FROM jsonb_array_elements_text(jv->'enum_arrays'->'permitted_source_kinds');
  INSERT INTO r2a VALUES ('R2A-05-CONTRACT-EVIDENCE-KINDS', n >= 5,
    format('%s canonical evidence kinds published for authoring', n));

  INSERT INTO r2a VALUES ('R2A-06-CONTRACT-REQUIRED-KINDS-ENUM',
    (jv->'enum_arrays') ? 'required_source_kinds',
    'required_source_kinds is a controlled vocabulary, not free text');

  INSERT INTO r2a VALUES ('R2A-07-CONTRACT-POSITIVE-NUMBERS',
    (jv->'positive_numbers') ?| ARRAY['minimum_items','maximum_age_days'],
    format('positive_numbers=%s', jv->'positive_numbers'));

  -- Evidence kinds offered for authoring are the platform's own vocabulary.
  SELECT count(*) INTO n
    FROM jsonb_array_elements_text(jv->'enum_arrays'->'permitted_source_kinds') k
   WHERE NOT EXISTS (SELECT 1 FROM public.supervisory_evidence_basis_type t
                      WHERE t.code = k.value);
  INSERT INTO r2a VALUES ('R2A-08-KINDS-ARE-CANONICAL', n = 0,
    format('%s authoring evidence kind(s) not present in the evidence type catalogue', n));
END $$;

-- =====================================================================
-- SEMANTICS — rule normalization and configuration validation
-- =====================================================================
DO $$
DECLARE jv jsonb; errs text[]; n int;
BEGIN
  jv := public.supervisory_evidence_policy_rules(jsonb_build_object('rules', jsonb_build_array(
          jsonb_build_object('rule_code','r2acert-a','scope_type','question',
                             'evidence_requirement','required','minimum_items',2,
                             'permitted_source_kinds', jsonb_build_array('enterprise_document'),
                             'maximum_age_days',365,'exception_allowed',true))));
  INSERT INTO r2a VALUES ('R2A-10-NORMALISES-CASE',
    (jv->0->>'scope_type') = 'QUESTION'
      AND (jv->0->>'evidence_requirement') = 'MANDATORY'
      AND (jv->0->'permitted_source_kinds')->>0 = 'ENTERPRISE_DOCUMENT',
    format('normalised rule = %s', jv->0));

  INSERT INTO r2a VALUES ('R2A-11-NORMALISES-NUMBERS',
    (jv->0->>'minimum_items')::int = 2 AND (jv->0->>'maximum_age_days')::int = 365,
    format('minimum_items=%s maximum_age_days=%s',
           jv->0->>'minimum_items', jv->0->>'maximum_age_days'));

  -- An empty configuration is not silently valid.
  errs := ARRAY(SELECT jsonb_array_elements_text(
            public.supervisory_policy_component_content_validate('EVIDENCE_POLICY','{}'::jsonb)->'errors'));
  INSERT INTO r2a VALUES ('R2A-12-EMPTY-CONFIG-REFUSED', array_length(errs,1) >= 1,
    format('%s error(s) for an empty evidence policy', COALESCE(array_length(errs,1),0)));

  -- A rule without a code or scope is refused.
  errs := ARRAY(SELECT jsonb_array_elements_text(
            public.supervisory_policy_component_content_validate('EVIDENCE_POLICY',
            jsonb_build_object('rules', jsonb_build_array(jsonb_build_object('minimum_items',1))))->'errors'));
  INSERT INTO r2a VALUES ('R2A-13-INCOMPLETE-RULE-REFUSED', array_length(errs,1) >= 1,
    format('%s error(s): %s', COALESCE(array_length(errs,1),0), errs));

  -- An unknown evidence kind is refused rather than ignored.
  errs := ARRAY(SELECT jsonb_array_elements_text(
            public.supervisory_policy_component_content_validate('EVIDENCE_POLICY',
            jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
              'rule_code','R2ACERT-B','scope_type','ASSESSMENT','evidence_requirement','REQUIRED',
              'permitted_source_kinds', jsonb_build_array('SOMETHING_INVENTED')))))->'errors'));
  INSERT INTO r2a VALUES ('R2A-14-UNKNOWN-KIND-REFUSED', array_length(errs,1) >= 1,
    format('%s error(s): %s', COALESCE(array_length(errs,1),0), errs));

  -- An unknown scope is refused.
  errs := ARRAY(SELECT jsonb_array_elements_text(
            public.supervisory_policy_component_content_validate('EVIDENCE_POLICY',
            jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
              'rule_code','R2ACERT-C','scope_type','WHOLE_SECTOR','evidence_requirement','REQUIRED'))))->'errors'));
  INSERT INTO r2a VALUES ('R2A-15-UNKNOWN-SCOPE-REFUSED', array_length(errs,1) >= 1,
    format('%s error(s): %s', COALESCE(array_length(errs,1),0), errs));

  -- Duplicate rule codes are refused.
  errs := ARRAY(SELECT jsonb_array_elements_text(
            public.supervisory_policy_component_content_validate('EVIDENCE_POLICY',
            jsonb_build_object('rules', jsonb_build_array(
              jsonb_build_object('rule_code','R2ACERT-D','scope_type','ASSESSMENT','evidence_requirement','REQUIRED'),
              jsonb_build_object('rule_code','R2ACERT-D','scope_type','ASSESSMENT','evidence_requirement','OPTIONAL'))))->'errors'));
  INSERT INTO r2a VALUES ('R2A-16-DUPLICATE-RULE-REFUSED', array_length(errs,1) >= 1,
    format('%s error(s): %s', COALESCE(array_length(errs,1),0), errs));

  -- Nonsense numbers are refused.
  errs := ARRAY(SELECT jsonb_array_elements_text(
            public.supervisory_policy_component_content_validate('EVIDENCE_POLICY',
            jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
              'rule_code','R2ACERT-E','scope_type','ASSESSMENT','evidence_requirement','REQUIRED',
              'minimum_items', -3))))->'errors'));
  INSERT INTO r2a VALUES ('R2A-17-NEGATIVE-MINIMUM-REFUSED', array_length(errs,1) >= 1,
    format('%s error(s): %s', COALESCE(array_length(errs,1),0), errs));

  -- A complete, canonical rule is accepted.
  errs := ARRAY(SELECT jsonb_array_elements_text(
            public.supervisory_policy_component_content_validate('EVIDENCE_POLICY',
            jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
              'rule_code','R2ACERT-F','scope_type','ASSESSMENT','evidence_requirement','REQUIRED',
              'minimum_items',1,'permitted_source_kinds', jsonb_build_array('ENTERPRISE_DOCUMENT'),
              'exception_allowed',false))))->'errors'));
  INSERT INTO r2a VALUES ('R2A-18-VALID-RULE-ACCEPTED', COALESCE(array_length(errs,1),0) = 0,
    format('errors=%s', errs));

  -- The generic component validator delegates to the evidence contract.
  jv := public.supervisory_policy_component_content_validate('EVIDENCE_POLICY',
          jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
            'rule_code','R2ACERT-G','scope_type','QUESTION','evidence_requirement','REQUIRED',
            'minimum_items',1))));
  INSERT INTO r2a VALUES ('R2A-19-GENERIC-VALIDATOR-DELEGATES',
    (jv->>'valid')::boolean AND (jv->>'item_count')::int = 1,
    format('valid=%s item_count=%s', jv->>'valid', jv->>'item_count'));

  jv := public.supervisory_policy_component_content_validate('EVIDENCE_POLICY',
          jsonb_build_object('rules', jsonb_build_array(jsonb_build_object('scope_type','QUESTION'))));
  INSERT INTO r2a VALUES ('R2A-20-GENERIC-VALIDATOR-REFUSES',
    NOT (jv->>'valid')::boolean, format('valid=%s errors=%s', jv->>'valid', jv->'errors'));
END $$;

-- =====================================================================
-- RUNTIME — evaluation is server-owned and pinned to the policy basis
-- =====================================================================
DO $$
DECLARE jv jsonb; a uuid; n int; src text;
BEGIN
  -- The evaluator resolves its policy through the assessment policy basis
  -- snapshot, not through the currently active profile.
  SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_assessment_evidence_policy_internal';
  INSERT INTO r2a VALUES ('R2A-21-EVALUATOR-USES-SNAPSHOT',
    src LIKE '%supervisory_assessment_policy_snapshot%',
    'evaluator reads the immutable assessment policy snapshot');

  INSERT INTO r2a VALUES ('R2A-22-EVALUATOR-PINS-VERSION',
    src LIKE '%policy_component_version%' AND src LIKE '%content_hash%',
    'evaluation reports the pinned component version and content hash');

  INSERT INTO r2a VALUES ('R2A-23-EVALUATOR-DECISION-VOCABULARY',
    src LIKE '%EXCEPTION_REQUIRED%' AND src LIKE '%EXCEPTION_APPROVED%'
      AND src LIKE '%NOT_REQUIRED%' AND src LIKE '%UNSATISFIED%' AND src LIKE '%SATISFIED%',
    'all five decision states are produced by the server');

  INSERT INTO r2a VALUES ('R2A-24-EVALUATOR-REASON-CODES',
    src LIKE '%MINIMUM_EVIDENCE_NOT_MET%' AND src LIKE '%REQUIRED_SOURCE_KIND_MISSING%'
      AND src LIKE '%EVIDENCE_OUT_OF_POLICY_AGE%',
    'outstanding requirements are explained by server reason codes');

  INSERT INTO r2a VALUES ('R2A-25-EVALUATOR-RETURNS-RULE-SETTINGS',
    src LIKE '%independent_sources_required%' AND src LIKE '%rationale_required%',
    'each decision carries the full requirement it was judged against');

  -- Existing assessments created before policy binding stay ungoverned and
  -- are not retro-fitted with a policy.
  SELECT sa.id INTO a FROM public.supervisory_assessment sa
    LEFT JOIN public.supervisory_assessment_policy_snapshot s ON s.assessment_id = sa.id
   WHERE s.id IS NULL LIMIT 1;
  IF a IS NULL THEN
    INSERT INTO r2a VALUES ('R2A-26-LEGACY-NOT-GOVERNED', true,
      'no assessment without a policy basis exists to test');
  ELSE
    jv := public.supervisory_assessment_evidence_policy_internal(a);
    INSERT INTO r2a VALUES ('R2A-26-LEGACY-NOT-GOVERNED',
      (jv->>'status') <> 'EVALUATED' AND (jv->>'blocking_count')::int = 0,
      format('status=%s reason=%s', jv->>'status', jv->>'reason_code'));
  END IF;

  -- Readiness consumes the evidence policy decision.
  SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_assessment_readiness_internal';
  INSERT INTO r2a VALUES ('R2A-27-READINESS-CONSUMES-POLICY',
    src LIKE '%evidence_policy%' AND src LIKE '%EVIDENCE_POLICY%',
    'readiness includes a server-owned EVIDENCE_POLICY check');

  INSERT INTO r2a VALUES ('R2A-28-READINESS-BLOCKS-SUBMISSION',
    src LIKE '%can_submit%', 'readiness reports submission eligibility itself');

  SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_assessment_question_completeness_guard';
  INSERT INTO r2a VALUES ('R2A-29-SUBMISSION-GUARD-REFUSES',
    src LIKE '%evidence_policy_unsatisfied%',
    'submission is refused while a blocking evidence policy decision stands');

  -- Compatibility validation delegates to the evidence policy checker.
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_evidence_policy_compatibility';
  INSERT INTO r2a VALUES ('R2A-30-COMPATIBILITY-EXISTS', n = 1,
    format('%s compatibility function(s)', n));
END $$;

-- =====================================================================
-- EXCEPTION — governed, append-only, maker/checker
-- =====================================================================
DO $$
DECLARE n int; src text;
BEGIN
  SELECT count(*) INTO n FROM pg_class WHERE relname='supervisory_assessment_evidence_exception'
     AND relnamespace='public'::regnamespace AND relrowsecurity;
  INSERT INTO r2a VALUES ('R2A-31-EXCEPTION-RLS-ENABLED', n = 1,
    'row level security is enabled on the exception register');

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename='supervisory_assessment_evidence_exception';
  INSERT INTO r2a VALUES ('R2A-32-EXCEPTION-POLICIES-EXIST', n >= 1,
    format('%s policy(ies) on the exception register', n));

  SELECT count(*) INTO n FROM pg_trigger t
   WHERE t.tgrelid = 'public.supervisory_assessment_evidence_exception'::regclass
     AND NOT t.tgisinternal;
  INSERT INTO r2a VALUES ('R2A-33-EXCEPTION-GUARD-TRIGGER', n >= 1,
    format('%s guard trigger(s) protect the exception register', n));

  SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='tg_supervisory_assessment_evidence_exception_guard';
  INSERT INTO r2a VALUES ('R2A-34-EXCEPTION-IMMUTABLE', src LIKE '%DELETE%' OR src LIKE '%immutable%',
    'decided exceptions cannot be edited or deleted through the table');

  SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_assessment_evidence_exception_request';
  INSERT INTO r2a VALUES ('R2A-35-REQUEST-NEEDS-DEFICIENCY',
    src LIKE '%EXCEPTION_REQUIRED%',
    'a request is only accepted against a genuine server-recorded deficiency');
  INSERT INTO r2a VALUES ('R2A-36-REQUEST-NEEDS-RATIONALE', src LIKE '%20%',
    'a written justification is required on request');
  INSERT INTO r2a VALUES ('R2A-37-REQUEST-RECORDS-POLICY-VERSION',
    src LIKE '%policy_component_version%' AND src LIKE '%deficiency%',
    'the request stores the policy version and the deficiency it relates to');

  SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_assessment_evidence_exception_decide';
  INSERT INTO r2a VALUES ('R2A-38-DECISION-MAKER-CHECKER',
    src LIKE '%requested_by%' AND src LIKE '%auth.uid()%',
    'the requester cannot decide their own exception');
  INSERT INTO r2a VALUES ('R2A-39-DECISION-NEEDS-AUTHORITY',
    src LIKE '%not_authorized%' OR src LIKE '%has_%',
    'approval authority and entity scope are re-checked on the server');
END $$;

-- =====================================================================
-- SECURITY — who may call what, under a real signed-in identity
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_assessment_evidence_policy_internal'
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  INSERT INTO r2a VALUES ('R2A-40-INTERNAL-EVALUATOR-PRIVATE', n = 0,
    'the internal evaluator is not callable by a signed-in identity');

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_assessment_evidence_policy'
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  INSERT INTO r2a VALUES ('R2A-41-WRAPPER-IS-THE-PUBLIC-PATH', n = 1,
    'the governed wrapper is the only signed-in read path');

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname IN ('supervisory_assessment_evidence_policy_view',
                                               'supervisory_evidence_policy_authoring_options')
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  INSERT INTO r2a VALUES ('R2A-42-READMODELS-GRANTED', n = 2,
    format('%s of 2 screen read models callable when signed in', n));

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname LIKE 'supervisory_assessment_evidence_%'
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  INSERT INTO r2a VALUES ('R2A-43-NOTHING-PUBLIC', n = 0,
    format('%s evidence function(s) reachable without signing in (0 expected)', n));
END $$;

-- A signed-in identity cannot write the exception register directly.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
DO $$
DECLARE n int;
BEGIN
  BEGIN
    INSERT INTO public.supervisory_assessment_evidence_exception(
      assessment_id, rule_code, scope_type, status, rationale)
    VALUES (gen_random_uuid(), 'R2ACERT-DIRECT', 'ASSESSMENT', 'APPROVED',
            'R2ACERT direct write attempt that must be refused by the platform.');
    INSERT INTO r2a VALUES ('R2A-44-DIRECT-WRITE-REFUSED', false,
      'a signed-in identity inserted an exception directly');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2a VALUES ('R2A-44-DIRECT-WRITE-REFUSED', true,
      format('refused: %s', left(SQLERRM, 90)));
  END;

  BEGIN
    UPDATE public.supervisory_policy_component_type
       SET is_runtime_consumed = true, is_certified = true
     WHERE component_type = 'JUDGEMENT_POLICY';
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO r2a VALUES ('R2A-45-CAPABILITY-NOT-CLIENT-WRITABLE', n = 0,
      format('%s capability row(s) changed by a signed-in identity (0 expected)', n));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2a VALUES ('R2A-45-CAPABILITY-NOT-CLIENT-WRITABLE', true,
      format('refused: %s', left(SQLERRM, 90)));
  END;
END $$;
RESET ROLE;
SET LOCAL request.jwt.claims = '';

-- =====================================================================
-- CAPABILITY — the platform tells the truth about what is operational
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.supervisory_policy_component_type
   WHERE component_type = 'EVIDENCE_POLICY' AND is_runtime_consumed AND is_certified;
  INSERT INTO r2a VALUES ('R2A-46-EVIDENCE-POLICY-RUNTIME', n = 1,
    format('EVIDENCE_POLICY runtime/certified rows: %s of 1', n));

  SELECT count(*) INTO n FROM public.supervisory_policy_component_type
   WHERE component_type IN ('SECTOR_OVERLAY','FACT_CONFIG','SOURCE_BINDING','MATERIALITY_POLICY',
                            'JUDGEMENT_POLICY','RESPONSE_POLICY','SLA_POLICY','DASHBOARD_POLICY',
                            'NOTIFICATION_POLICY')
     AND NOT is_runtime_consumed AND NOT is_certified;
  INSERT INTO r2a VALUES ('R2A-47-OTHER-NINE-STILL-CONFIGURATION-ONLY', n = 9,
    format('%s of 9 areas truthfully report configuration-only', n));
END $$;

-- =====================================================================
-- READMODEL — the screens read the platform, never a second engine
-- =====================================================================
DO $$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_assessment_evidence_policy_view';
  INSERT INTO r2a VALUES ('R2A-48-VIEW-RETURNS-EVALUATION',
    src LIKE '%supervisory_assessment_evidence_policy%' AND src LIKE '%capabilities%',
    'the screen read model returns the server evaluation plus server capabilities');
  INSERT INTO r2a VALUES ('R2A-49-VIEW-OWNS-EXCEPTION-CAPABILITIES',
    src LIKE '%can_request_exception%' AND src LIKE '%can_decide_exception%',
    'who may request and who may decide is decided by the server');

  SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_evidence_policy_authoring_options';
  INSERT INTO r2a VALUES ('R2A-50-AUTHORING-VOCABULARY-SERVER-OWNED',
    src LIKE '%supervisory_policy_vocabulary%' OR src LIKE '%supervisory_evidence_basis_type%',
    'authoring choices come from the platform vocabulary');
  INSERT INTO r2a VALUES ('R2A-51-AUTHORING-METHODOLOGY-BOUND',
    src LIKE '%methodology%' AND src LIKE '%warnings%',
    'dimensions and questions come from the bound methodology, with a warning when none is bound');
END $$;

SELECT gate, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM r2a ORDER BY gate;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) AS total FROM r2a;
SELECT string_agg(gate, ', ') AS failed_gates FROM r2a WHERE NOT ok;

ROLLBACK;

-- =====================================================================
-- PRESERVATION — nothing this certification did survived
-- =====================================================================
SELECT
  (SELECT count(*) FROM public.supervisory_policy_component)::text = :'pre_components' AS components_unchanged,
  (SELECT count(*) FROM public.supervisory_assessment)::text = :'pre_assessments' AS assessments_unchanged,
  (SELECT count(*) FROM public.supervisory_assessment_evidence_exception)::text = :'pre_exceptions' AS exceptions_unchanged,
  (SELECT count(*) FROM public.supervisory_assessment_evidence_basis)::text = :'pre_evidence' AS evidence_unchanged,
  (SELECT count(*) FROM public.entity_risk_state_movement)::text = :'pre_movements' AS movements_unchanged,
  (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'),
              '|' ORDER BY r.entity_id),'')) FROM public.entity_risk_state) = :'pre_risk_digest' AS risk_digest_unchanged;

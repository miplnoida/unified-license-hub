-- =============================================================================
-- SUPERVISORY POLICY COMPONENT GOVERNANCE VERIFIER
--
-- Behavioural gates PCOMP-01 … PCOMP-18 for the versioned policy component
-- family (sector overlay, fact configuration, source bindings, evidence,
-- materiality, judgement/override, supervisory response, SLA, dashboard,
-- notification). Everything runs inside ONE transaction that is ROLLED BACK,
-- so the verifier never changes state.
--
-- Identities (real demonstration personas, real permissions):
--   maker   b8eaf680-fe66-4d49-b816-1c087f511235  AML/CFT Methodology Configuration Officer
--   checker 0b522724-adcb-48bf-b21d-175339479616  Head of AML/CFT
--   outsider: a signed-in identity with no AML supervision authority
--
-- Run: psql "$SUPABASE_DB_URL" -X -q -f scripts/verify-supervisory-policy-components.sql
-- =============================================================================

\set ON_ERROR_STOP off
\pset pager off
SET row_security = on;

BEGIN;
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE pcomp_result(gate text, ok boolean, detail text) ON COMMIT DROP;

DO $$
DECLARE
  maker    text := '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
  checker  text := '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}';
  outsider text := json_build_object('sub', gen_random_uuid(), 'role','authenticated')::text;
  reg uuid; sla uuid; resp uuid; nxt uuid; n int; v jsonb; st text; ok boolean; profile uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', maker, true);

  -- The owning regulator of regulator-authored content. The active AML-CFT-RBA
  -- methodology is platform-wide (no regulator_id), so the fixture resolves the
  -- real active regulator instead. Ownership validation is NOT weakened: the
  -- component is still created as regulator-owned content naming its regulator.
  SELECT regulator_id INTO reg FROM public.supervisory_methodology
   WHERE code = 'AML-CFT-RBA' AND version = '1.0' AND status = 'ACTIVE';
  IF reg IS NULL THEN
    SELECT r.id INTO reg FROM public.regulators r
     WHERE lower(r.status) = 'active' ORDER BY r.created_at LIMIT 1;
  END IF;
  IF reg IS NULL THEN
    RAISE EXCEPTION 'fixture_unavailable: no active regulator exists to own regulator-authored policy content';
  END IF;


  -- PCOMP-01 — every previously unimplemented policy area is now available
  SELECT count(*) INTO n FROM public.supervisory_policy_component_type
   WHERE component_type IN ('SECTOR_OVERLAY','FACT_CONFIG','SOURCE_BINDING','EVIDENCE_POLICY',
                            'MATERIALITY_POLICY','JUDGEMENT_POLICY','RESPONSE_POLICY','SLA_POLICY',
                            'DASHBOARD_POLICY','NOTIFICATION_POLICY')
     AND is_available AND component_table = 'supervisory_policy_component';
  INSERT INTO pcomp_result VALUES ('PCOMP-01', n = 10, format('%s of 10 policy areas available', n));

  -- PCOMP-02 — every available area publishes a content contract
  SELECT count(*) INTO n FROM public.supervisory_policy_component_type t
   WHERE t.is_available
     AND t.component_table = 'supervisory_policy_component'
     AND public.supervisory_policy_component_content_contract(t.component_type) IS NULL;
  INSERT INTO pcomp_result VALUES ('PCOMP-02', n = 0, format('%s area(s) without a contract', n));

  -- PCOMP-03 — an unauthorised signed-in identity cannot create a component
  PERFORM set_config('request.jwt.claims', outsider, true);
  BEGIN
    PERFORM public.supervisory_policy_component_create(jsonb_build_object(
      'component_type','SLA_POLICY','domain_code','AML_CFT','regulator_id', reg,
      'code','PCOMP-OUTSIDER','component_version','1.0','name','unauthorised'));
    INSERT INTO pcomp_result VALUES ('PCOMP-03', false, 'the create was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pcomp_result VALUES ('PCOMP-03', true, left(SQLERRM,90));
  END;

  -- PCOMP-04 — the configuration officer can create a draft
  PERFORM set_config('request.jwt.claims', maker, true);
  v := public.supervisory_policy_component_create(jsonb_build_object(
        'component_type','SLA_POLICY','domain_code','AML_CFT','regulator_id', reg,
        'code','PCOMP-SLA','component_version','1.0','name','Verifier SLA policy',
        'content', '{}'::jsonb));
  sla := (v->>'component_id')::uuid;
  INSERT INTO pcomp_result VALUES ('PCOMP-04', sla IS NOT NULL AND (v->>'status') = 'DRAFT',
    format('draft created with status %s', v->>'status'));

  -- PCOMP-05 — an empty configuration is not valid
  v := public.supervisory_policy_component_validate(sla);
  INSERT INTO pcomp_result VALUES ('PCOMP-05', NOT (v->>'valid')::boolean,
    format('valid=%s errors=%s', v->>'valid', v->'errors'));

  -- PCOMP-06 — an empty configuration cannot be submitted
  BEGIN
    PERFORM public.supervisory_policy_component_lifecycle(sla, 'SUBMITTED',
      'Attempting to submit an empty configuration for verification.');
    INSERT INTO pcomp_result VALUES ('PCOMP-06', false, 'the submission was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pcomp_result VALUES ('PCOMP-06', true, left(SQLERRM,90));
  END;

  -- PCOMP-07 — a malformed entry (non-positive days) is refused by the contract
  PERFORM public.supervisory_policy_component_save(sla, jsonb_build_object(
    'content', jsonb_build_object('stages', jsonb_build_array(
      jsonb_build_object('stage','ASSESSMENT_REVIEW','days', 0)))));
  v := public.supervisory_policy_component_validate(sla);
  INSERT INTO pcomp_result VALUES ('PCOMP-07', NOT (v->>'valid')::boolean,
    format('errors=%s', v->'errors'));

  -- PCOMP-08 — a well-formed configuration validates
  PERFORM public.supervisory_policy_component_save(sla, jsonb_build_object(
    'content', jsonb_build_object('stages', jsonb_build_array(
      jsonb_build_object('stage','ASSESSMENT_REVIEW','days', 10),
      jsonb_build_object('stage','RATING_APPROVAL','days', 5)))));
  v := public.supervisory_policy_component_validate(sla);
  INSERT INTO pcomp_result VALUES ('PCOMP-08', (v->>'valid')::boolean,
    format('%s entries accepted', v->>'item_count'));

  -- PCOMP-09 — submission requires a rationale of at least ten characters
  BEGIN
    PERFORM public.supervisory_policy_component_lifecycle(sla, 'SUBMITTED', 'ok');
    INSERT INTO pcomp_result VALUES ('PCOMP-09', false, 'a one-word rationale was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pcomp_result VALUES ('PCOMP-09', true, left(SQLERRM,90));
  END;

  -- PCOMP-10 — the officer submits the validated configuration
  v := public.supervisory_policy_component_lifecycle(sla, 'SUBMITTED',
        'Service levels agreed by the supervisory owner for verification.');
  SELECT status INTO st FROM public.supervisory_policy_component WHERE id = sla;
  INSERT INTO pcomp_result VALUES ('PCOMP-10', st = 'SUBMITTED', format('status %s', st));

  -- PCOMP-11 — the submitter cannot approve their own submission
  BEGIN
    PERFORM public.supervisory_policy_component_lifecycle(sla, 'APPROVED',
      'Self-approval attempt for verification purposes.');
    INSERT INTO pcomp_result VALUES ('PCOMP-11', false, 'self-approval was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pcomp_result VALUES ('PCOMP-11', true, left(SQLERRM,90));
  END;

  -- PCOMP-12 — a submitted configuration cannot be edited
  BEGIN
    PERFORM public.supervisory_policy_component_save(sla, jsonb_build_object(
      'content', jsonb_build_object('stages', jsonb_build_array(
        jsonb_build_object('stage','TAMPERED','days', 99)))));
    INSERT INTO pcomp_result VALUES ('PCOMP-12', false, 'the edit was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pcomp_result VALUES ('PCOMP-12', true, left(SQLERRM,90));
  END;

  -- PCOMP-13 — the second officer approves and activates
  PERFORM set_config('request.jwt.claims', checker, true);
  PERFORM public.supervisory_policy_component_lifecycle(sla, 'APPROVED',
    'Independent approval of the service level configuration.');
  PERFORM public.supervisory_policy_component_lifecycle(sla, 'ACTIVE',
    'Activating the approved service level configuration.');
  SELECT status INTO st FROM public.supervisory_policy_component WHERE id = sla;
  SELECT (approved_by IS NOT NULL AND approved_by IS DISTINCT FROM submitted_by) INTO ok
    FROM public.supervisory_policy_component WHERE id = sla;
  INSERT INTO pcomp_result VALUES ('PCOMP-13', st = 'ACTIVE' AND COALESCE(ok,false),
    format('status %s, independent approver %s', st, ok));

  -- PCOMP-14 — an approved version is immutable to a direct table write
  BEGIN
    UPDATE public.supervisory_policy_component
       SET content = jsonb_build_object('stages','[]'::jsonb) WHERE id = sla;
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO pcomp_result VALUES ('PCOMP-14', n = 0,
      format('%s row(s) changed by a direct write (0 expected)', n));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pcomp_result VALUES ('PCOMP-14', true, left(SQLERRM,90));
  END;
  SELECT jsonb_array_length(content->'stages') INTO n
    FROM public.supervisory_policy_component WHERE id = sla;
  INSERT INTO pcomp_result VALUES ('PCOMP-14B', n = 2,
    format('approved content still holds %s entries', n));

  -- PCOMP-15 — history is append-only
  BEGIN
    DELETE FROM public.supervisory_policy_component_event WHERE component_id = sla;
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO pcomp_result VALUES ('PCOMP-15', n = 0,
      format('%s history row(s) deleted (0 expected)', n));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pcomp_result VALUES ('PCOMP-15', true, left(SQLERRM,90));
  END;
  SELECT count(*) INTO n FROM public.supervisory_policy_component_event WHERE component_id = sla;
  INSERT INTO pcomp_result VALUES ('PCOMP-15B', n >= 4,
    format('%s history event(s) retained', n));

  -- PCOMP-16 — a new version copies the entries and supersedes on activation
  PERFORM set_config('request.jwt.claims', maker, true);
  v := public.supervisory_policy_component_new_version(sla, '1.1',
        'Superseding version created for verification purposes.');
  nxt := (v->>'component_id')::uuid;
  SELECT jsonb_array_length(content->'stages') INTO n
    FROM public.supervisory_policy_component WHERE id = nxt;
  INSERT INTO pcomp_result VALUES ('PCOMP-16', n = 2, format('%s entries carried into the new draft', n));

  PERFORM public.supervisory_policy_component_lifecycle(nxt, 'SUBMITTED',
    'Submitting the revised service level configuration.');
  PERFORM set_config('request.jwt.claims', checker, true);
  PERFORM public.supervisory_policy_component_lifecycle(nxt, 'APPROVED',
    'Independent approval of the revised service levels.');
  v := public.supervisory_policy_component_lifecycle(nxt, 'ACTIVE',
    'Activating the revised service levels.');
  SELECT status INTO st FROM public.supervisory_policy_component WHERE id = sla;
  INSERT INTO pcomp_result VALUES ('PCOMP-17', st = 'SUPERSEDED',
    format('previous version is now %s, superseded count %s', st, v->>'superseded_versions'));

  -- PCOMP-18 — an approved component is bindable to a policy profile and is
  -- resolvable by the profile readiness engine
  SELECT id INTO profile FROM public.supervisory_policy_profile
   WHERE domain_code = 'AML_CFT' AND status IN ('DRAFT','REVIEW')
   ORDER BY created_at LIMIT 1;
  IF profile IS NULL THEN
    INSERT INTO pcomp_result VALUES ('PCOMP-18', false, 'no editable AML policy profile exists to bind against');
  ELSE
    v := public.supervisory_policy_profile_component_candidates(profile, 'SLA_POLICY');
    INSERT INTO pcomp_result VALUES ('PCOMP-18',
      (v->>'is_available')::boolean AND jsonb_array_length(v->'candidates') >= 1,
      format('%s bindable version(s) offered', jsonb_array_length(v->'candidates')));
  END IF;

  -- PCOMP-19 — the probe resolves the component for the profile kernel
  v := public.supervisory_policy_component_probe('SLA_POLICY', nxt);
  INSERT INTO pcomp_result VALUES ('PCOMP-19',
    (v->>'component_status') = 'ACTIVE' AND (v->>'component_table') = 'supervisory_policy_component',
    format('%s %s (%s)', v->>'component_code', v->>'component_version', v->>'component_status'));

  -- PCOMP-20 — a richer area (supervisory response) enforces its own contract
  PERFORM set_config('request.jwt.claims', maker, true);
  v := public.supervisory_policy_component_create(jsonb_build_object(
        'component_type','RESPONSE_POLICY','domain_code','AML_CFT','regulator_id', reg,
        'code','PCOMP-RESP','component_version','1.0','name','Verifier response policy',
        'content', jsonb_build_object('responses', jsonb_build_array(
          jsonb_build_object('risk_band','HIGH','actions','[]'::jsonb)))));
  resp := (v->>'component_id')::uuid;
  v := public.supervisory_policy_component_validate(resp);
  INSERT INTO pcomp_result VALUES ('PCOMP-20', NOT (v->>'valid')::boolean,
    format('empty action list refused: %s', v->'errors'));

  PERFORM set_config('request.jwt.claims','',true);
END $$;

SELECT gate, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM pcomp_result ORDER BY gate;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed, count(*) AS total
  FROM pcomp_result;

ROLLBACK;

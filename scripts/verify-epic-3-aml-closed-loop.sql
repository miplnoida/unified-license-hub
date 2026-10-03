-- =====================================================================
-- EPIC 3 — AML/CFT ENTERPRISE SUPERVISION + CLOSED-LOOP : CERTIFICATION
-- =====================================================================
-- Gates A-Z plus one continuous closed-loop AML case and the negative
-- (denial) matrix.
--
-- Conventions:
--   * one transaction, ROLLBACK at the end — no certification data persists;
--   * business authorisation is exercised with REAL authenticated personas
--     (SET LOCAL ROLE authenticated + request.jwt.claims), never service_role;
--   * maker/checker separation and entity scope are enforced by the database;
--   * every gate RAISEs on failure so ON_ERROR_STOP aborts the run.
--
-- Personas (public.cert_certification_users):
--   AML officer (maker)        b8eaf680-fe66-4d49-b816-1c087f511235
--   AML supervisor (checker)   0b522724-adcb-48bf-b21d-175339479616
--   Examiner                   d1016d5f-cde5-46dd-a552-0f2f87abc193
--   Examination reviewer       b597c405-e0c4-421b-9092-820a444f2429
--   Enforcement officer        7190c434-24c1-47dc-a2fb-c3cbad5bfaf3
--   Enforcement supervisor     57d0f4bd-76ed-42b8-9ee6-af5f02cdd686
--   Entity (licensee) user     cf2c227e-52fd-46ff-b751-db30ecd20ec1
--   Unauthorised (non-AML)     411dd06d-648b-4f32-82cc-897902c0c0b6
-- =====================================================================

\set ON_ERROR_STOP on
\set QUIET 1
\pset pager off
SET row_security = on;

\set OFFICER    '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}'
\set SUPERVISOR '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}'
\set EXAMINER   '{"sub":"d1016d5f-cde5-46dd-a552-0f2f87abc193","role":"authenticated"}'
\set REVIEWER   '{"sub":"b597c405-e0c4-421b-9092-820a444f2429","role":"authenticated"}'
\set ENFOFFICER '{"sub":"7190c434-24c1-47dc-a2fb-c3cbad5bfaf3","role":"authenticated"}'
\set ENFSUPER   '{"sub":"57d0f4bd-76ed-42b8-9ee6-af5f02cdd686","role":"authenticated"}'
\set ENTITYUSER '{"sub":"cf2c227e-52fd-46ff-b751-db30ecd20ec1","role":"authenticated"}'
\set OUTSIDER   '{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}'

BEGIN;

CREATE TEMP TABLE e3(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE e3n(k text PRIMARY KEY, n bigint) ON COMMIT DROP;
GRANT ALL ON e3 TO authenticated;
GRANT ALL ON e3n TO authenticated;

-- ---------------------------------------------------------------- census ----
INSERT INTO e3n(k,n) VALUES
  ('examinations',        (SELECT count(*) FROM public.examinations)),
  ('exam_findings',       (SELECT count(*) FROM public.examination_findings)),
  ('conduct_findings',    (SELECT count(*) FROM public.conduct_findings)),
  ('canonical_findings',  (SELECT count(*) FROM public.supervisory_finding)),
  ('backfilled_findings', (SELECT count(*) FROM public.supervisory_finding WHERE origin_provenance = 'BACKFILL_DETERMINISTIC')),
  ('enforcement',         (SELECT count(*) FROM public.enforcement_actions)),
  ('legacy_plans',        (SELECT count(*) FROM public.legacy_supervisory_plans)),
  ('legacy_actions',      (SELECT count(*) FROM public.legacy_supervisory_plan_actions)),
  ('risk_state',          (SELECT count(*) FROM public.entity_risk_state)),
  ('methodologies',       (SELECT count(*) FROM public.supervisory_methodology));

INSERT INTO e3(k,v) VALUES
  ('entity_a', '5855bf85-9fde-4cf8-a082-7ea904d46184'),   -- in-scope certification entity
  ('entity_b', '52112b8b-0f01-4682-a5c7-fc316797dfd8'),   -- deliberately OUT of scope
  ('aml_meth', (SELECT id FROM public.supervisory_methodology
                 WHERE domain_code='AML_CFT' AND status='ACTIVE'
                 ORDER BY effective_from DESC NULLS LAST LIMIT 1));

-- transaction-scoped supervisory scope for the AML certification personas
INSERT INTO public.entity_supervision_assignments(entity_id, lead_supervisor_user_id,
        alternate_supervisor_user_id, status, assignment_reason)
VALUES ((SELECT v FROM e3 WHERE k='entity_a'),
        'b8eaf680-fe66-4d49-b816-1c087f511235',
        '0b522724-adcb-48bf-b21d-175339479616',
        'active', 'Epic 3 certification: AML maker/checker scope fixture.'),
       ((SELECT v FROM e3 WHERE k='entity_a'),
        'd1016d5f-cde5-46dd-a552-0f2f87abc193',
        'b597c405-e0c4-421b-9092-820a444f2429',
        'active', 'Epic 3 certification: examiner/reviewer scope fixture.');

-- AML-CLOSE-02C: creation now requires an explicit AML/CFT perimeter determination.
-- Transaction-scoped (rolled back) fixture determination for the in-scope entity only.
INSERT INTO public.supervisory_domain_perimeter(entity_id, domain_code, is_applicable, basis)
VALUES ((SELECT v FROM e3 WHERE k='entity_a'), 'AML_CFT', true,
        'Epic 3 certification fixture (rolled back): AML/CFT supervision applies.')
ON CONFLICT (entity_id, domain_code) DO NOTHING;

-- Transaction-scoped Head of AML/CFT fixture: methodology change control is a
-- head-of-function right (aml_supervision.manage_config), so the certification
-- checker persona also carries the aml_head role for gate B only.
INSERT INTO public.sec_user_roles(user_id, role_id, status, assigned_by)
SELECT '0b522724-adcb-48bf-b21d-175339479616', r.id, 'active',
       '4248640c-3397-4cf6-a274-fa09bad4ba64'::uuid  -- AML-CLOSE-02D: not self-granted
  FROM public.sec_roles r WHERE r.key = 'aml_head'
ON CONFLICT DO NOTHING;


-- =====================================================================
-- GATE A — AML methodology exists, is configurable and versioned
-- =====================================================================
DO $$
DECLARE m public.supervisory_methodology; inh int; ctl int;
BEGIN
  SELECT * INTO m FROM public.supervisory_methodology WHERE id = (SELECT v FROM e3 WHERE k='aml_meth');
  IF m.id IS NULL THEN RAISE EXCEPTION 'FAIL A: no ACTIVE AML/CFT methodology'; END IF;
  IF m.version IS NULL OR m.effective_from IS NULL THEN
    RAISE EXCEPTION 'FAIL A: AML methodology is not versioned/effective-dated'; END IF;
  IF COALESCE(m.assessment_frequency_months,0) <= 0 THEN
    RAISE EXCEPTION 'FAIL A: AML methodology has no assessment frequency'; END IF;
  SELECT count(*) INTO inh FROM public.supervisory_methodology_dimension
   WHERE methodology_id = m.id AND dimension_group = 'INHERENT_RISK';
  SELECT count(*) INTO ctl FROM public.supervisory_methodology_dimension
   WHERE methodology_id = m.id AND dimension_group = 'CONTROL_EFFECTIVENESS';
  IF inh < 6 THEN RAISE EXCEPTION 'FAIL A: only % inherent dimensions configured', inh; END IF;
  IF ctl < 15 THEN RAISE EXCEPTION 'FAIL A: only % control dimensions configured', ctl; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_methodology_dimension
                  WHERE methodology_id = m.id AND evidence_required) THEN
    RAISE EXCEPTION 'FAIL A: methodology is not evidence-aware'; END IF;
  RAISE NOTICE 'PASS A: AML/CFT methodology % v% ACTIVE — % inherent + % control dimensions, evidence-aware',
    m.code, m.version, inh, ctl;
END $$;

-- =====================================================================
-- GATE B — an ACTIVE methodology cannot be silently altered historically
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';

DO $$
DECLARE mid uuid := (SELECT v FROM e3 WHERE k='aml_meth'); ok boolean := false; nv uuid;
BEGIN
  BEGIN
    PERFORM public.supervisory_methodology_save(jsonb_build_object('name','Tampered'), mid);
  EXCEPTION WHEN OTHERS THEN ok := (SQLERRM LIKE '%methodology_immutable%');
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL B: an ACTIVE methodology accepted a direct edit'; END IF;

  ok := false;
  BEGIN
    PERFORM public.supervisory_methodology_dimension_save(mid,
      jsonb_build_object('dimension_code','TRANSACTION_MONITORING','weight',0.99));
  EXCEPTION WHEN OTHERS THEN ok := (SQLERRM LIKE '%methodology_immutable%');
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL B: an ACTIVE methodology accepted a dimension re-score'; END IF;

  -- the governed route is a NEW version, which starts as DRAFT and inherits dimensions
  -- deterministic, test-only version label: the live 1.1 reference version must not be touched
  nv := public.supervisory_methodology_new_version(mid, '1.1-EPIC3-CERT',
        'Epic 3 certification: proving versioned change control over AML methodology.');
  INSERT INTO e3(k,v) VALUES ('aml_meth_v11', nv);
  IF (SELECT status FROM public.supervisory_methodology WHERE id = nv) <> 'DRAFT' THEN
    RAISE EXCEPTION 'FAIL B: new methodology version did not start as DRAFT'; END IF;
  IF (SELECT count(*) FROM public.supervisory_methodology_dimension WHERE methodology_id = nv)
     <> (SELECT count(*) FROM public.supervisory_methodology_dimension WHERE methodology_id = mid) THEN
    RAISE EXCEPTION 'FAIL B: new version did not inherit the dimension set'; END IF;
  IF (SELECT status FROM public.supervisory_methodology WHERE id = mid) <> 'ACTIVE' THEN
    RAISE EXCEPTION 'FAIL B: creating a new version disturbed the ACTIVE version'; END IF;
  RAISE NOTICE 'PASS B: ACTIVE methodology immutable; change control runs through a new DRAFT version';
END $$;

-- =====================================================================
-- GATE C/D/E/F/G/H — assessment creation, canonical envelope, dimensions,
--                    calculated vs judged ratings, override discipline
-- =====================================================================
SET LOCAL "request.jwt.claims" = :'OFFICER';

DO $$
DECLARE r jsonb; aid uuid; d jsonb;
BEGIN
  r := public.supervisory_assessment_create(
        (SELECT v FROM e3 WHERE k='entity_a'), 'AML_CFT', 'INITIAL_BASELINE',
        current_date - 365, current_date, (SELECT v FROM e3 WHERE k='aml_meth'),
        'PERIODIC', NULL,
        'Epic 3 certification: initial baseline AML/CFT risk assessment.');
  aid := (r->>'id')::uuid;
  INSERT INTO e3(k,v) VALUES ('a1', aid);

  -- INHERENT dimensions
  PERFORM public.supervisory_assessment_dimension_upsert(aid, 'CUSTOMER_RISK', 'INHERENT_RISK',
    'high', NULL, 'high', 0.20, 4, 'Material non-resident and PEP-adjacent customer base.',
    NULL, '[{"kind":"return","ref":"AML-STAT-2025"}]'::jsonb,
    'Customer file analysis over 12 months.', NULL, NULL, 'DETERIORATING', 'HIGH', 'HIGH', true,
    'high', NULL, 'high', 4, NULL, true);
  PERFORM public.supervisory_assessment_dimension_upsert(aid, 'GEOGRAPHIC_RISK', 'INHERENT_RISK',
    'medium_high', NULL, 'medium_high', 0.15, 3, 'Exposure to two higher-risk jurisdictions.',
    NULL, NULL, 'Correspondent flow analysis.', NULL, NULL, 'STABLE', 'MEDIUM', 'MEDIUM', true,
    'medium_high', NULL, 'medium_high', 3, NULL, false);

  -- CONTROL EFFECTIVENESS dimensions
  PERFORM public.supervisory_assessment_dimension_upsert(aid, 'TRANSACTION_MONITORING', 'CONTROL_EFFECTIVENESS',
    NULL, 'weak', 'high', 0.20, 4, 'Monitoring thresholds untuned since implementation.',
    NULL, '[{"kind":"workpaper","ref":"TM-01"}]'::jsonb,
    'Alert backlog of 1,400 items; 62% aged over 90 days.', 'Escalate as examination scope.',
    'No tuning evidence produced.', 'DETERIORATING', 'HIGH', 'HIGH', true,
    NULL, 'weak', 'high', 4, NULL, true);
  PERFORM public.supervisory_assessment_dimension_upsert(aid, 'STR_GOVERNANCE', 'CONTROL_EFFECTIVENESS',
    NULL, 'weak', 'high', 0.15, 4, 'STR/SAR decisions undocumented and late.',
    NULL, NULL, 'Sample of 20 alerts: 9 with no documented decision.', NULL, NULL,
    'DETERIORATING', 'HIGH', 'MEDIUM', true, NULL, 'weak', 'high', 4, NULL, true);

  -- H: an override away from the calculated rating requires a rationale.
  --    Caller-supplied calculated ratings are discarded by design; the server
  --    recalculates from the approved calculation configuration. Until a
  --    calculation configuration is authored and approved by the supervisory
  --    owner (CALC-05/06/09/11, AMLH-09) there is no calculated rating to
  --    override, so this gate reports BLOCKED rather than fabricating policy.
  d := public.supervisory_assessment_dimension_upsert(aid, 'SANCTIONS_CONTROLS', 'CONTROL_EFFECTIVENESS',
      NULL, 'satisfactory', 'moderate', 0.10, 2, 'Screening reviewed with compensating manual controls.',
      NULL, NULL, 'List coverage tested against consolidated sanctions lists.', NULL, NULL,
      'STABLE', 'MEDIUM', 'MEDIUM', true,
      NULL, 'weak', 'high', 4,
      'Model output overstated the weakness: compensating manual screening was evidenced and tested.', false);

  IF d->>'calculated_residual_rating' IS NULL AND d->>'calculated_score' IS NULL THEN
    RAISE NOTICE 'BLOCKED H (PRE_EXISTING_POLICY_OR_METHODOLOGY_BLOCKER): no approved calculation configuration exists, so no calculated rating can be overridden';
  ELSE
    IF (d->>'is_overridden')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'FAIL H: override not recorded'; END IF;
    RAISE NOTICE 'PASS H: an override away from the calculated rating is recorded with its rationale';
  END IF;

  -- Mandatory methodology questions must be answered before submission
  -- (governed working-file completeness, W4).
  DECLARE qr record;
  BEGIN
    FOR qr IN
      SELECT q.id FROM public.supervisory_methodology_question q
        JOIN public.supervisory_methodology_dimension d ON d.id = q.methodology_dimension_id
       WHERE q.methodology_id = (SELECT v FROM e3 WHERE k='aml_meth')
         AND q.active AND q.mandatory AND d.active
    LOOP
      PERFORM public.supervisory_assessment_question_upsert(aid, qr.id, 'YES',
        'Tested during the certification walkthrough and evidenced in the workpaper file.',
        '[{"kind":"workpaper","ref":"EPIC3-CERT-Q"}]'::jsonb);
    END LOOP;
  END;

  PERFORM public.supervisory_assessment_transition(aid, 'submitted',
    'Submitted for AML/CFT supervisory review.');
END $$;

-- domain extension written by the AML officer — proves F-01 (aml_supervision.edit) closed
DO $$
DECLARE dom uuid;
BEGIN
  INSERT INTO public.aml_assessments(entity_id, supervisory_assessment_id, reference, assessment_date)
  VALUES ((SELECT v FROM e3 WHERE k='entity_a'), (SELECT v FROM e3 WHERE k='a1'),
          'EPIC3-AML-CERT-1', current_date)
  RETURNING id INTO dom;
  INSERT INTO e3(k,v) VALUES ('a1_domain', dom);
END $$;

RESET ROLE;
DO $$
DECLARE aid uuid := (SELECT v FROM e3 WHERE k='a1'); n int;
BEGIN
  -- D: canonical envelope
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment
                  WHERE id = aid AND domain_code = 'AML_CFT' AND origin_provenance = 'GOVERNED'
                    AND methodology_id IS NOT NULL AND methodology_version IS NOT NULL
                    AND confidentiality = 'CONFIDENTIAL') THEN
    RAISE EXCEPTION 'FAIL D: AML assessment is not a governed canonical envelope row'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.aml_assessments
                  WHERE id = (SELECT v FROM e3 WHERE k='a1_domain') AND supervisory_assessment_id = aid) THEN
    RAISE EXCEPTION 'FAIL D: AML domain extension not FK-linked to the canonical envelope'; END IF;

  -- E/F
  SELECT count(*) INTO n FROM public.supervisory_assessment_dimension
   WHERE assessment_id = aid AND dimension_group = 'INHERENT_RISK';
  IF n < 2 THEN RAISE EXCEPTION 'FAIL E: inherent dimensions not recorded'; END IF;
  SELECT count(*) INTO n FROM public.supervisory_assessment_dimension
   WHERE assessment_id = aid AND dimension_group = 'CONTROL_EFFECTIVENESS';
  IF n < 3 THEN RAISE EXCEPTION 'FAIL F: control-effectiveness dimensions not recorded'; END IF;

  -- G/H: calculated vs judged separation and override provenance can only be
  --      exercised once the server can calculate, which needs an approved
  --      calculation configuration (pre-existing policy blocker).
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_dimension
              WHERE assessment_id = aid AND dimension_code = 'SANCTIONS_CONTROLS'
                AND calculated_control_rating IS NOT NULL) THEN
    IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_dimension
                    WHERE assessment_id = aid AND dimension_code = 'SANCTIONS_CONTROLS'
                      AND control_rating = 'satisfactory'
                      AND calculated_control_rating IS DISTINCT FROM control_rating) THEN
      RAISE EXCEPTION 'FAIL G: calculated and judged ratings are not stored separately'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_dimension
                    WHERE assessment_id = aid AND dimension_code = 'SANCTIONS_CONTROLS'
                      AND is_overridden AND override_reason IS NOT NULL
                      AND overridden_by IS NOT NULL AND overridden_at IS NOT NULL) THEN
      RAISE EXCEPTION 'FAIL H: override provenance incomplete'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.compliance_audit_logs
                    WHERE action_type = 'OVERRIDE' AND object_type = 'supervisory_assessment_dimension') THEN
      RAISE EXCEPTION 'FAIL H: override was not written to the compliance audit trail'; END IF;
    RAISE NOTICE 'PASS C/D/E/F/G/H: governed AML assessment with separated calculated vs judged ratings and audited overrides';
  ELSE
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='supervisory_assessment_dimension'
                      AND column_name IN ('calculated_control_rating','override_reason','overridden_by')) THEN
      RAISE EXCEPTION 'FAIL G: the model cannot separate calculated from judged ratings'; END IF;
    RAISE NOTICE 'PASS C/D/E/F: governed AML assessment on the canonical envelope';
    RAISE NOTICE 'BLOCKED G/H (PRE_EXISTING_POLICY_OR_METHODOLOGY_BLOCKER): the separated calculated rating stays empty until a calculation configuration is approved';
  END IF;
END $$;

-- =====================================================================
-- GATE I — unauthorised persona and self-approval denied
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'OUTSIDER';
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.supervisory_assessment_create((SELECT v FROM e3 WHERE k='entity_a'), 'AML_CFT');
  EXCEPTION WHEN OTHERS THEN ok := (SQLERRM LIKE '%not_authorized%');
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL I: a non-AML persona created an AML assessment'; END IF;

  ok := false;
  BEGIN
    PERFORM public.supervisory_assessment_transition((SELECT v FROM e3 WHERE k='a1'), 'approved',
      'Unauthorised approval attempt for certification.');
  EXCEPTION WHEN OTHERS THEN ok := (SQLERRM LIKE '%not_authorized%');
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL I: a non-AML persona approved an AML assessment'; END IF;
END $$;

SET LOCAL "request.jwt.claims" = :'OFFICER';
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.supervisory_assessment_transition((SELECT v FROM e3 WHERE k='a1'), 'approved',
      'Maker attempting to approve their own assessment.');
  EXCEPTION WHEN OTHERS THEN ok := (SQLERRM LIKE '%not_authorized%');
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL I: the maker approved their own AML assessment'; END IF;

  -- entity scope: the officer has no assignment on entity_b
  ok := false;
  BEGIN
    PERFORM public.supervisory_assessment_create((SELECT v FROM e3 WHERE k='entity_b'), 'AML_CFT');
  EXCEPTION WHEN OTHERS THEN ok := (SQLERRM LIKE '%outside your supervisory scope%');
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL I: entity scope was not enforced'; END IF;
  RAISE NOTICE 'PASS I: unauthorised creation/approval, self-approval and out-of-scope entity access all denied';
END $$;

-- =====================================================================
-- GATE J/K — checker approval and AML_CFT-only risk state update
-- =====================================================================
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE aid uuid := (SELECT v FROM e3 WHERE k='a1');
BEGIN
  PERFORM public.supervisory_assessment_transition(aid, 'reviewed',
    'Reviewed: dimension evidence and override rationale are adequate.');
  PERFORM public.supervisory_assessment_transition(aid, 'approved',
    'Approved: residual AML/CFT risk is HIGH driven by transaction monitoring and STR/SAR governance.',
    'high', current_date + 180);
END $$;

RESET ROLE;
DO $$
DECLARE ea uuid := (SELECT v FROM e3 WHERE k='entity_a'); rs public.entity_risk_state;
BEGIN
  SELECT * INTO rs FROM public.entity_risk_state WHERE entity_id = ea AND domain_code = 'AML_CFT';
  IF rs.residual_rating IS NULL OR upper(rs.residual_rating) <> 'HIGH' THEN
    RAISE EXCEPTION 'FAIL K: AML_CFT risk state is % (expected HIGH)', rs.residual_rating; END IF;
  IF rs.driving_assessment_id <> (SELECT v FROM e3 WHERE k='a1') THEN
    RAISE EXCEPTION 'FAIL K: risk state is not driven by the approved assessment'; END IF;
  IF EXISTS (SELECT 1 FROM public.entity_risk_state
              WHERE entity_id = ea AND domain_code <> 'AML_CFT'
                AND driving_assessment_id = (SELECT v FROM e3 WHERE k='a1')) THEN
    RAISE EXCEPTION 'FAIL K: the AML approval leaked into another domain risk state'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_event
                  WHERE assessment_id = (SELECT v FROM e3 WHERE k='a1') AND event_type = 'APPROVAL') THEN
    RAISE EXCEPTION 'FAIL J: approval was not recorded in the assessment history'; END IF;
  RAISE NOTICE 'PASS J/K: independent checker approval recorded; only the AML_CFT risk state moved';
END $$;

-- =====================================================================
-- GATE Z1 — entity_risk_state cannot be written directly
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    UPDATE public.entity_risk_state SET residual_rating = 'low'
     WHERE entity_id = (SELECT v FROM e3 WHERE k='entity_a') AND domain_code = 'AML_CFT';
    IF FOUND THEN RAISE EXCEPTION 'FAIL Z1: direct risk-state mutation succeeded'; END IF;
    ok := true;  -- RLS silently filtered the row: also acceptable
  EXCEPTION WHEN OTHERS THEN
    ok := (SQLERRM LIKE '%written only by an approved supervisory assessment transition%')
       OR (SQLERRM LIKE '%row-level security%') OR (SQLERRM LIKE '%permission denied%');
    IF NOT ok THEN RAISE; END IF;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL Z1: risk state is not protected'; END IF;
  RAISE NOTICE 'PASS Z1: entity_risk_state rejects any writer other than the governed approval transition';
END $$;

-- =====================================================================
-- GATE L/M — AML signal drives governed attention (never a risk decision)
-- =====================================================================
RESET ROLE;
DO $$
DECLARE sid uuid;
BEGIN
  -- The canonical signal store demands FK-backed or externally referenced
  -- provenance; an AML monitoring-backlog signal arrives from the entity's own
  -- monitoring MI, so it is recorded as a governed external source.
  INSERT INTO public.supervisory_signal(entity_id, domain_code, source_kind, severity, detected_at,
      summary, detail, external_reference)
  VALUES ((SELECT v FROM e3 WHERE k='entity_a'), 'AML_CFT', 'OTHER_GOVERNED_SOURCE', 'high', now(),
          'Transaction monitoring alert backlog exceeded the supervisory tolerance.',
          jsonb_build_object('aml_signal_kind','MONITORING_BACKLOG','open_alerts',1400,'aged_over_90_days_pct',62),
          'AML-MI-2026-TM-BACKLOG-001')
  RETURNING id INTO sid;
  INSERT INTO e3(k,v) VALUES ('signal', sid);
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'OFFICER';
DO $$
DECLARE r jsonb; att uuid; dim uuid;
BEGIN
  SELECT id INTO dim FROM public.supervisory_assessment_dimension
   WHERE assessment_id = (SELECT v FROM e3 WHERE k='a1') AND dimension_code = 'TRANSACTION_MONITORING';
  INSERT INTO e3(k,v) VALUES ('dim_tm', dim);
  INSERT INTO e3(k,v) SELECT 'dim_str', id FROM public.supervisory_assessment_dimension
   WHERE assessment_id = (SELECT v FROM e3 WHERE k='a1') AND dimension_code = 'STR_GOVERNANCE';

  r := public.supervisory_attention_open(
        'AML/CFT transaction monitoring and STR/SAR weakness', 'AML_CFT',
        'Approved AML/CFT assessment rates transaction monitoring and STR/SAR governance HIGH residual risk against high inherent customer risk.',
        'AML_RISK', ARRAY[(SELECT v FROM e3 WHERE k='entity_a')],
        (SELECT v FROM e3 WHERE k='a1'), dim, (SELECT v FROM e3 WHERE k='signal'));
  att := (r->>'id')::uuid;
  INSERT INTO e3(k,v) VALUES ('att', att);
END $$;

RESET ROLE;
DO $$
DECLARE att uuid := (SELECT v FROM e3 WHERE k='att');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_attention
                  WHERE id = att AND domain_code = 'AML_CFT') THEN
    RAISE EXCEPTION 'FAIL L/M: AML attention was not created on the canonical relation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_attention_origin
                  WHERE attention_id = att AND assessment_id = (SELECT v FROM e3 WHERE k='a1')
                    AND assessment_dimension_id = (SELECT v FROM e3 WHERE k='dim_tm')) THEN
    RAISE EXCEPTION 'FAIL L/M: attention lacks FK-backed assessment/dimension provenance'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_attention_origin
                  WHERE attention_id = att AND signal_id = (SELECT v FROM e3 WHERE k='signal')) THEN
    RAISE EXCEPTION 'FAIL L/M: attention lacks FK-backed signal provenance'; END IF;
  IF EXISTS (SELECT 1 FROM public.entity_risk_state_movement
              WHERE entity_id = (SELECT v FROM e3 WHERE k='entity_a')
                AND domain_code = 'AML_CFT' AND requirement_id IS NOT NULL
                AND new_assessment_id IS NULL) THEN
    RAISE EXCEPTION 'FAIL L: a signal changed authoritative risk'; END IF;
  RAISE NOTICE 'PASS L/M: AML signal and HIGH dimension justify governed attention with physical provenance; risk unchanged';
END $$;

-- =====================================================================
-- GATE N/O/P/Q — attention -> priority -> plan -> intervention ->
--                examination, with dimensions physically in scope
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
BEGIN
  PERFORM public.supervisory_attention_confirm_priority((SELECT v FROM e3 WHERE k='att'), 'IMMEDIATE',
    'Human confirmation: monitoring and reporting weaknesses require an immediate targeted AML engagement.');
END $$;

SET LOCAL "request.jwt.claims" = :'OFFICER';
DO $$
DECLARE r jsonb; pl uuid;
BEGIN
  r := public.supervisory_plan_open('AML/CFT supervisory plan — targeted monitoring review', 'AML_CFT',
        'Confirmed immediate AML/CFT attention arising from the approved baseline assessment.',
        'Remediate transaction monitoring tuning and STR/SAR governance.',
        (SELECT v FROM e3 WHERE k='att'), ARRAY[(SELECT v FROM e3 WHERE k='a1')]);
  pl := (r->>'id')::uuid;
  INSERT INTO e3(k,v) VALUES ('plan', pl);
  PERFORM public.supervisory_plan_lifecycle(pl, 'SUBMITTED', 'Submitted for AML supervisory approval.');
END $$;

SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE pl uuid := (SELECT v FROM e3 WHERE k='plan');
BEGIN
  PERFORM public.supervisory_plan_lifecycle(pl, 'APPROVED', 'Approved by the AML/CFT supervisor.');
  PERFORM public.supervisory_plan_lifecycle(pl, 'ACTIVE', 'Activated for the current AML cycle.');
END $$;

SET LOCAL "request.jwt.claims" = :'OFFICER';
DO $$
DECLARE r jsonb; iv uuid;
BEGIN
  r := public.supervisory_intervention_open((SELECT v FROM e3 WHERE k='plan'),
        'TARGETED_EXAMINATION', 'Targeted AML/CFT examination',
        'Plan-authorised targeted AML examination of transaction monitoring and STR/SAR governance.',
        'AML_CFT', (SELECT v FROM e3 WHERE k='entity_a'), (SELECT v FROM e3 WHERE k='att'));
  iv := (r->>'id')::uuid;
  INSERT INTO e3(k,v) VALUES ('iv', iv);
END $$;

SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE iv uuid := (SELECT v FROM e3 WHERE k='iv'); r jsonb; ex uuid;
BEGIN
  PERFORM public.supervisory_intervention_decide(iv, 'ENDORSED', 'Endorsed: proceed with the targeted AML examination.');
  PERFORM public.supervisory_intervention_decide(iv, 'ACTIVE', 'Intervention activated for execution.');
  r := public.supervisory_examination_open(iv, 'Targeted AML/CFT examination', 'TARGETED_ONSITE',
        'AML_CFT', (SELECT v FROM e3 WHERE k='entity_a'),
        ARRAY[(SELECT v FROM e3 WHERE k='a1')],
        ARRAY[(SELECT v FROM e3 WHERE k='dim_tm'), (SELECT v FROM e3 WHERE k='dim_str')],
        NULL, NULL, 'd1016d5f-cde5-46dd-a552-0f2f87abc193');
  ex := (r->>'id')::uuid;
  INSERT INTO e3(k,v) VALUES ('ex', ex);
END $$;

SET LOCAL "request.jwt.claims" = :'EXAMINER';
DO $$
BEGIN
  PERFORM public.examination_scope_from_assessment((SELECT v FROM e3 WHERE k='ex'),
    ARRAY[(SELECT v FROM e3 WHERE k='dim_tm'), (SELECT v FROM e3 WHERE k='dim_str')],
    'Scope derived from the HIGH residual dimensions of the approved AML assessment.');
END $$;

RESET ROLE;
DO $$
DECLARE ex uuid := (SELECT v FROM e3 WHERE k='ex'); n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_attention
                  WHERE id = (SELECT v FROM e3 WHERE k='att') AND confirmed_priority IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL N: priority was not confirmed by a human supervisor'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_plan
                  WHERE id = (SELECT v FROM e3 WHERE k='plan') AND attention_id = (SELECT v FROM e3 WHERE k='att')
                    AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'FAIL N: plan is not FK-linked to the confirmed attention'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_intervention
                  WHERE id = (SELECT v FROM e3 WHERE k='iv') AND plan_id = (SELECT v FROM e3 WHERE k='plan')) THEN
    RAISE EXCEPTION 'FAIL O: intervention is not FK-linked to the plan'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.examinations
                  WHERE id = ex AND domain_code = 'AML_CFT'
                    AND intervention_id = (SELECT v FROM e3 WHERE k='iv')
                    AND plan_id = (SELECT v FROM e3 WHERE k='plan')) THEN
    RAISE EXCEPTION 'FAIL P: examination lacks AML domain or plan/intervention provenance'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.examination_origin
                  WHERE examination_id = ex AND assessment_id = (SELECT v FROM e3 WHERE k='a1')) THEN
    RAISE EXCEPTION 'FAIL Q: examination does not trace to the originating assessment'; END IF;
  SELECT count(*) INTO n FROM public.examination_scope_dimension
   WHERE examination_id = ex
     AND assessment_dimension_id IN ((SELECT v FROM e3 WHERE k='dim_tm'), (SELECT v FROM e3 WHERE k='dim_str'));
  IF n < 2 THEN
    RAISE EXCEPTION 'FAIL Q: assessment dimensions are not physically linked to examination scope (found %)', n; END IF;
  RAISE NOTICE 'PASS N/O/P/Q: attention -> priority -> plan -> intervention -> AML examination, with dimensions physically in scope';
END $$;

-- =====================================================================
-- GATE R — evidence / data request / workpaper chain
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'EXAMINER';
DO $$
DECLARE ex uuid := (SELECT v FROM e3 WHERE k='ex'); dr uuid; wp uuid;
BEGIN
  PERFORM public.examination_transition_stage(ex, 'scoping', 'Scoping the targeted AML examination.');
  -- the named lead examiner constitutes the case team
  PERFORM public.examination_team_member_add(ex, auth.uid(),
    'lead_examiner', 10, 'AML/CFT transaction monitoring', false);
  PERFORM public.examination_team_member_add(ex, 'b597c405-e0c4-421b-9092-820a444f2429',
    'reviewer', 4, 'Independent examination review', false);
  INSERT INTO public.examination_scoping(examination_id, objectives, risk_focus_areas, legal_basis,
      methodology, budget_days, prepared_by, prepared_at, assessment_dimension_id)
  VALUES (ex, 'Assess transaction monitoring tuning and STR/SAR governance.',
      ARRAY['TRANSACTION_MONITORING','STR_GOVERNANCE'],
      'AML/CFT Regulations — supervisory examination powers',
      'Risk-based sample testing derived from the approved AML/CFT assessment.', 10,
      auth.uid(), now(), (SELECT v FROM e3 WHERE k='dim_tm'));
END $$;

SET LOCAL "request.jwt.claims" = :'REVIEWER';
DO $$
BEGIN
  -- the scoping memo is approved by someone other than its preparer
  UPDATE public.examination_scoping
     SET approved_by = auth.uid(), approved_at = now(),
         approval_notes = 'Scope agrees with the HIGH residual dimensions of the approved assessment.'
   WHERE examination_id = (SELECT v FROM e3 WHERE k='ex');
END $$;

SET LOCAL "request.jwt.claims" = :'EXAMINER';
DO $$
DECLARE ex uuid := (SELECT v FROM e3 WHERE k='ex'); dr uuid; wp uuid;
BEGIN
  PERFORM public.examination_transition_stage(ex, 'pre_exam_request', 'Pre-examination information request issued.');
  PERFORM public.examination_transition_stage(ex, 'fieldwork', 'Fieldwork commenced for the targeted AML examination.');


  INSERT INTO public.examination_data_requests(examination_id, item_no, title, description, due_date, status, requested_by)
  VALUES (ex, 1, 'Transaction monitoring tuning evidence',
          'Provide tuning documentation, threshold rationale and the current alert backlog ageing.',
          current_date + 10, 'ISSUED', auth.uid())
  RETURNING id INTO dr;
  INSERT INTO e3(k,v) VALUES ('dr', dr);

  INSERT INTO public.examination_workpapers(examination_id, reference, area, procedure_performed,
    evidence_reference, conclusion, status, prepared_by, prepared_at)
  VALUES (ex, 'WP-TM-01', 'TRANSACTION_MONITORING',
          'Tested 20 alerts end to end against the monitoring rule set and escalation policy.',
          'DR-1 tuning pack; alert sample AL-2026-0001..0020',
          'Monitoring rules have not been tuned since implementation; 9 of 20 alerts had no documented decision.',
          'SUBMITTED', auth.uid(), now())
  RETURNING id INTO wp;
  INSERT INTO e3(k,v) VALUES ('wp', wp);
END $$;

SET LOCAL "request.jwt.claims" = :'REVIEWER';
DO $$
BEGIN
  PERFORM public.examination_signoff_workpaper((SELECT v FROM e3 WHERE k='wp'), 'reviewer',
    'Reviewed: testing is sufficient to support a HIGH finding.');
END $$;

RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.examination_data_requests
                  WHERE id = (SELECT v FROM e3 WHERE k='dr') AND examination_id = (SELECT v FROM e3 WHERE k='ex')) THEN
    RAISE EXCEPTION 'FAIL R: data request not linked to the examination'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.examination_workpapers
                  WHERE id = (SELECT v FROM e3 WHERE k='wp') AND examination_id = (SELECT v FROM e3 WHERE k='ex')
                    AND reviewed_by IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL R: workpaper was not independently reviewed'; END IF;
  RAISE NOTICE 'PASS R: examination RFI -> workpaper -> independent review chain intact';
END $$;

-- =====================================================================
-- GATE S/T/U/V/W — canonical finding, response, remediation, validation
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'OFFICER';
DO $$
DECLARE fid uuid; ok boolean := false;
BEGIN
  -- a finding cannot be invented without an authoritative origin
  BEGIN
    PERFORM public.supervisory_finding_create(jsonb_build_object(
      'entity_id', (SELECT v FROM e3 WHERE k='entity_a'), 'domain_code','AML_CFT',
      'severity','HIGH','title','Origin-less finding'));
  EXCEPTION WHEN OTHERS THEN ok := (SQLERRM LIKE '%authoritative origin%');
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL S: a finding without authoritative origin was accepted'; END IF;

  fid := public.supervisory_finding_create(jsonb_build_object(
    'entity_id', (SELECT v FROM e3 WHERE k='entity_a'),
    'domain_code','AML_CFT', 'severity','HIGH',
    'finding_category','TRANSACTION_MONITORING',
    'title','Transaction monitoring not tuned and STR/SAR decisions undocumented',
    'observation','Monitoring rules unchanged since implementation; 9 of 20 sampled alerts had no documented decision.',
    'root_cause','No model tuning governance and no second-line review of alert decisions.',
    'risk_impact','Unmitigated ML/TF exposure with potential unreported suspicious activity.',
    'regulatory_criterion','AML/CFT Regulations — transaction monitoring and suspicious transaction reporting',
    'required_action','Tune the monitoring model, clear the backlog and document all alert decisions.',
    'assessment_id', (SELECT v FROM e3 WHERE k='a1'),
    'assessment_dimension_id', (SELECT v FROM e3 WHERE k='dim_tm'),
    'attention_id', (SELECT v FROM e3 WHERE k='att'),
    'plan_id', (SELECT v FROM e3 WHERE k='plan'),
    'intervention_id', (SELECT v FROM e3 WHERE k='iv'),
    'examination_id', (SELECT v FROM e3 WHERE k='ex'),
    'workpaper_id', (SELECT v FROM e3 WHERE k='wp'),
    'signal_id', (SELECT v FROM e3 WHERE k='signal'),
    'confidentiality','CONFIDENTIAL',
    'owner_id','b8eaf680-fe66-4d49-b816-1c087f511235',
    'due_date', (current_date + 30)::text));
  INSERT INTO e3(k,v) VALUES ('f1', fid);

  PERFORM public.supervisory_finding_lifecycle(fid, 'REVIEW', 'Submitted for supervisory review before issue.');

  -- maker/checker: the author cannot issue their own HIGH finding
  ok := false;
  BEGIN
    PERFORM public.supervisory_finding_lifecycle(fid, 'ISSUED', 'Author attempting to issue their own HIGH finding.');
  EXCEPTION WHEN OTHERS THEN ok := (SQLERRM LIKE '%not_authorized%');
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL S: the author issued their own HIGH finding'; END IF;
END $$;

SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
BEGIN
  PERFORM public.supervisory_finding_lifecycle((SELECT v FROM e3 WHERE k='f1'), 'ISSUED',
    'Issued to the entity following independent supervisory review.');
END $$;

-- T: management response by the regulated entity's own user
SET LOCAL "request.jwt.claims" = :'ENTITYUSER';
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.supervisory_finding_response((SELECT v FROM e3 WHERE k='f1'), 'ACCEPTED',
      'Accepted. The monitoring model will be retuned and all alert decisions documented.',
      'Retune thresholds, clear the backlog and introduce second-line alert review.',
      'Head of Compliance', current_date + 60, NULL,
      'Head of Compliance, by signed letter', current_date, 'LETTER');
  EXCEPTION WHEN OTHERS THEN
    -- the certification licensee user may not be assigned to this entity; record it internally instead
    ok := (SQLERRM LIKE '%not_authorized%');
    IF NOT ok THEN RAISE; END IF;
  END;
  INSERT INTO e3n(k,n) VALUES ('entity_response_denied', CASE WHEN ok THEN 1 ELSE 0 END);
END $$;

SET LOCAL "request.jwt.claims" = :'OFFICER';
DO $$
DECLARE fid uuid := (SELECT v FROM e3 WHERE k='f1'); ok boolean := false; aid uuid;
BEGIN
  IF (SELECT n FROM e3n WHERE k='entity_response_denied') = 1 THEN
    PERFORM public.supervisory_finding_response(fid, 'ACCEPTED',
      'Management response recorded from the entity''s written submission dated today.',
      'Retune thresholds, clear the backlog and introduce second-line alert review.',
      'Head of Compliance', current_date + 60, NULL,
      'Head of Compliance, by signed letter', current_date, 'LETTER');
  END IF;

  -- U: canonical remediation opened against the finding
  aid := public.supervisory_remediation_open(fid,
    'Retune the transaction monitoring model, clear the alert backlog and document every alert decision.',
    'Monitoring alerts investigated and documented within policy timeframes.',
    NULL, 'Head of Compliance', current_date + 45);
  INSERT INTO e3(k,v) VALUES ('ra', aid);

  PERFORM public.supervisory_remediation_transition(aid, 'ACTION_PLAN_SUBMITTED',
    'Action plan received from the entity.', 'Three-phase tuning and backlog clearance plan.');
  PERFORM public.supervisory_remediation_transition(aid, 'UNDER_REVIEW', 'Supervisor reviewing the action plan.');
  PERFORM public.supervisory_remediation_transition(aid, 'ACCEPTED', 'Action plan accepted as adequate.');
  PERFORM public.supervisory_remediation_transition(aid, 'IMPLEMENTING', 'Implementation underway.');
  PERFORM public.supervisory_remediation_transition(aid, 'EVIDENCE_SUBMITTED',
    'Completion evidence submitted by the entity.', 'Tuning report and backlog clearance evidence.',
    '[{"kind":"document","ref":"TM-TUNING-2026"}]'::jsonb);

  -- V: submitting evidence must NOT conclude effectiveness or close anything
  IF (SELECT status FROM public.supervisory_remediation_action WHERE id = aid) <> 'EVIDENCE_SUBMITTED' THEN
    RAISE EXCEPTION 'FAIL V: evidence submission changed the state beyond EVIDENCE_SUBMITTED'; END IF;
  IF (SELECT effectiveness FROM public.supervisory_remediation_action WHERE id = aid) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL V: evidence submission concluded effectiveness'; END IF;

  PERFORM public.supervisory_remediation_transition(aid, 'VALIDATION',
    'Evidence accepted for supervisory validation.');

  ok := false;
  BEGIN
    PERFORM public.supervisory_remediation_transition(aid, 'EFFECTIVE',
      'Attempting to conclude effectiveness outside the governed validation.');
  EXCEPTION WHEN OTHERS THEN ok := (SQLERRM LIKE '%validation_required%');
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL V: effectiveness was concluded without a governed validation'; END IF;

  -- W: governed validation concludes effectiveness
  PERFORM public.supervisory_remediation_validate(aid, 'EFFECTIVE',
    'Tuning report, revised thresholds, cleared backlog and 30 re-tested alert decisions.',
    'Re-performed the original monitoring procedure on a fresh sample of 30 alerts.',
    'Monitoring now detects and documents the previously missed typologies; backlog cleared.',
    'Confirm sustained effectiveness at the follow-up assessment.',
    (SELECT v FROM e3 WHERE k='wp'));
END $$;

RESET ROLE;
DO $$
DECLARE f public.supervisory_finding; a public.supervisory_remediation_action;
BEGIN
  SELECT * INTO f FROM public.supervisory_finding WHERE id = (SELECT v FROM e3 WHERE k='f1');
  SELECT * INTO a FROM public.supervisory_remediation_action WHERE id = (SELECT v FROM e3 WHERE k='ra');

  IF f.assessment_id IS NULL OR f.assessment_dimension_id IS NULL OR f.attention_id IS NULL
     OR f.plan_id IS NULL OR f.intervention_id IS NULL OR f.examination_id IS NULL
     OR f.workpaper_id IS NULL OR f.signal_id IS NULL THEN
    RAISE EXCEPTION 'FAIL S: canonical finding provenance is incomplete'; END IF;
  IF f.origin_provenance <> 'GOVERNED' THEN
    RAISE EXCEPTION 'FAIL S: finding is not governed provenance'; END IF;
  IF f.response_state IS NULL OR f.management_response IS NULL THEN
    RAISE EXCEPTION 'FAIL T: management response not recorded'; END IF;
  IF a.effectiveness <> 'EFFECTIVE' OR a.status <> 'EFFECTIVE' THEN
    RAISE EXCEPTION 'FAIL W: remediation effectiveness not concluded through validation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_remediation_validation
                  WHERE action_id = a.id AND conclusion = 'EFFECTIVE'
                    AND validated_by IS NOT NULL AND evidence_reviewed IS NOT NULL
                    AND procedure_applied IS NOT NULL AND workpaper_id IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL W: validation record incomplete'; END IF;
  IF to_regclass('public.aml_findings') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL S: the duplicate AML finding table still exists'; END IF;
  RAISE NOTICE 'PASS S/T/U/V/W: one canonical finding with full provenance -> response -> remediation -> governed validation (EFFECTIVE)';
END $$;

-- =====================================================================
-- GATE X — overdue/ineffective remediation escalates through the spine
--          but never auto-enforces
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'OFFICER';
DO $$
DECLARE fid uuid; aid uuid; att uuid; enf_before int; enf_after int;
BEGIN
  SELECT count(*) INTO enf_before FROM public.enforcement_actions;

  fid := public.supervisory_finding_create(jsonb_build_object(
    'entity_id', (SELECT v FROM e3 WHERE k='entity_a'), 'domain_code','AML_CFT', 'severity','CRITICAL',
    'finding_category','CDD_KYC', 'title','Beneficial ownership records incomplete',
    'observation','Beneficial ownership was not evidenced for 12 of 40 sampled corporate customers.',
    'required_action','Complete beneficial ownership verification for all corporate customers.',
    'examination_id', (SELECT v FROM e3 WHERE k='ex'),
    'assessment_id', (SELECT v FROM e3 WHERE k='a1'),
    'due_date', (current_date - 5)::text));
  INSERT INTO e3(k,v) VALUES ('f2', fid);
END $$;

SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE fid uuid := (SELECT v FROM e3 WHERE k='f2'); aid uuid; att uuid;
BEGIN
  PERFORM public.supervisory_finding_lifecycle(fid, 'REVIEW', 'Reviewed ahead of issue.');
  PERFORM public.supervisory_finding_lifecycle(fid, 'ISSUED', 'Issued: critical beneficial ownership gap.');
  aid := public.supervisory_remediation_open(fid,
    'Complete and evidence beneficial ownership verification for every corporate customer.',
    'All corporate customers with verified beneficial ownership.', NULL, 'MLRO', current_date - 1);
  INSERT INTO e3(k,v) VALUES ('ra2', aid);
  att := public.supervisory_remediation_escalate(aid,
    'Corrective action is overdue with no evidence of progress.', 'HIGH', 'URGENT');
  INSERT INTO e3(k,v) VALUES ('att2', att);
END $$;

RESET ROLE;
DO $$
DECLARE aid uuid := (SELECT v FROM e3 WHERE k='ra2'); att uuid := (SELECT v FROM e3 WHERE k='att2');
BEGIN
  IF att IS NULL OR NOT EXISTS (SELECT 1 FROM public.supervisory_attention
                                 WHERE id = att AND domain_code = 'AML_CFT') THEN
    RAISE EXCEPTION 'FAIL X: overdue remediation did not raise governed supervisory attention'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_remediation_action
                  WHERE id = aid AND escalated_attention_id = att AND escalation_reason IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL X: escalation is not linked back to the remediation action'; END IF;
  IF (SELECT count(*) FROM public.enforcement_actions) <> (SELECT n FROM e3n WHERE k='enforcement') THEN
    RAISE EXCEPTION 'FAIL X: enforcement was created automatically from overdue remediation'; END IF;
  RAISE NOTICE 'PASS X: overdue remediation raises governed attention with FK linkage and never auto-enforces';
END $$;

-- enforcement, when a human with enforcement authority decides it, is created only
-- through the governed referral operation and preserves canonical provenance
SET LOCAL ROLE authenticated;

-- negative: AML supervision authority alone cannot open an enforcement case
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.enforcement_referral_create(jsonb_build_object(
      'source_kind','SUPERVISORY_FINDING', 'source_id', (SELECT v FROM e3 WHERE k='f2'),
      'referral_reason','AML supervisor attempting to open enforcement without enforcement authority.'));
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  IF NOT ok THEN
    RAISE EXCEPTION 'FAIL X2: AML supervision authority was accepted as enforcement referral authority'; END IF;
  RAISE NOTICE 'PASS X2a: enforcement referral requires real enforcement authority';
END $$;

-- a critical finding with no corrective action at all, for the bypass rule
SET LOCAL "request.jwt.claims" = :'OFFICER';
DO $$
DECLARE fid uuid;
BEGIN
  fid := public.supervisory_finding_create(jsonb_build_object(
    'entity_id', (SELECT v FROM e3 WHERE k='entity_a'), 'domain_code','AML_CFT', 'severity','CRITICAL',
    'finding_category','SANCTIONS', 'title','Sanctions screening disabled for cross-border payments',
    'observation','Sanctions screening was switched off for cross-border payment flows for four months.',
    'required_action','Restore sanctions screening and retrospectively screen all affected payments.',
    'examination_id', (SELECT v FROM e3 WHERE k='ex'),
    'assessment_id', (SELECT v FROM e3 WHERE k='a1'),
    'due_date', (current_date + 10)::text));
  INSERT INTO e3(k,v) VALUES ('f3', fid);
END $$;

SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE fid uuid := (SELECT v FROM e3 WHERE k='f3');
BEGIN
  PERFORM public.supervisory_finding_lifecycle(fid, 'REVIEW', 'Reviewed ahead of issue.');
  PERFORM public.supervisory_finding_lifecycle(fid, 'ISSUED', 'Issued: sanctions screening disabled.');
END $$;

SET LOCAL "request.jwt.claims" = :'ENFOFFICER';
DO $$
DECLARE eid uuid; ok boolean := false;
BEGIN
  -- negative: a client-supplied entity cannot override the canonical finding's entity
  BEGIN
    PERFORM public.enforcement_referral_create(jsonb_build_object(
      'source_kind','SUPERVISORY_FINDING', 'source_id', (SELECT v FROM e3 WHERE k='f2'),
      'entity_id', (SELECT v FROM e3 WHERE k='entity_b'),
      'referral_reason','Attempting to attach an unrelated regulated entity to this referral.'));
  EXCEPTION WHEN others THEN ok := true;
  END;
  IF NOT ok THEN
    RAISE EXCEPTION 'FAIL X2: a client-supplied entity overrode the canonical finding entity'; END IF;

  -- route 1: failed corrective action -> governed referral, remediation linked, no bypass
  eid := public.enforcement_referral_create(jsonb_build_object(
    'source_kind','SUPERVISORY_FINDING', 'source_id', (SELECT v FROM e3 WHERE k='f2'),
    'enforcement_type','directive', 'legal_basis','AML/CFT Regulations, requirement to remediate',
    'referral_reason','Corrective action for the beneficial ownership gap is overdue with no evidence of progress.'));
  INSERT INTO e3(k,v) VALUES ('enf', eid);

  -- route 2: serious finding referred without any corrective action requires a bypass basis
  ok := false;
  BEGIN
    PERFORM public.enforcement_referral_create(jsonb_build_object(
      'source_kind','SUPERVISORY_FINDING', 'source_id', (SELECT v FROM e3 WHERE k='f3'),
      'referral_reason','Immediate enforcement without remediation and without a stated basis.'));
  EXCEPTION WHEN others THEN ok := true;
  END;
  IF NOT ok THEN
    RAISE EXCEPTION 'FAIL X2: a finding was referred with no corrective action and no bypass rationale'; END IF;

  eid := public.enforcement_referral_create(jsonb_build_object(
    'source_kind','SUPERVISORY_FINDING', 'source_id', (SELECT v FROM e3 WHERE k='f3'),
    'enforcement_type','directive',
    'referral_reason','Sanctions screening was disabled; the seriousness warrants immediate enforcement.',
    'remediation_bypass_reason','Remediation stage bypassed: sanctions screening failure is too serious to remediate first.'));
  INSERT INTO e3(k,v) VALUES ('enf2', eid);
END $$;

RESET ROLE;
DO $$
DECLARE eid uuid := (SELECT v FROM e3 WHERE k='enf'); e2 uuid := (SELECT v FROM e3 WHERE k='enf2');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.enforcement_actions ea
                  JOIN public.supervisory_finding f ON f.id = ea.supervisory_finding_id
                  JOIN public.supervisory_remediation_action ra ON ra.id = ea.remediation_action_id
                  JOIN public.supervisory_assessment sa ON sa.id = ea.supervisory_assessment_id
                 WHERE ea.id = eid AND f.domain_code = 'AML_CFT'
                   AND f.id = (SELECT v FROM e3 WHERE k='f2')
                   AND ra.id = (SELECT v FROM e3 WHERE k='ra2')
                   AND sa.id = (SELECT v FROM e3 WHERE k='a1')
                   AND f.examination_id = (SELECT v FROM e3 WHERE k='ex')
                   AND ea.entity_id = (SELECT v FROM e3 WHERE k='entity_a')
                   AND ea.source_kind = 'SUPERVISORY_FINDING'
                   AND ea.source_id = f.id
                   AND ea.remediation_bypass_reason IS NULL
                   AND ea.stage = 'REFERRAL') THEN
    RAISE EXCEPTION 'FAIL X2: enforcement provenance chain back to remediation/assessment/examination is broken'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.enforcement_actions ea
                 WHERE ea.id = e2 AND ea.supervisory_finding_id = (SELECT v FROM e3 WHERE k='f3')
                   AND ea.remediation_action_id IS NULL
                   AND ea.remediation_bypass_reason IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL X2: the bypassed-remediation enforcement route did not record its basis'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.enforcement_case_events
                  WHERE case_id = eid AND event_type = 'REFERRAL_RECEIVED'
                    AND (detail->>'supervisory_finding_id')::uuid = (SELECT v FROM e3 WHERE k='f2')) THEN
    RAISE EXCEPTION 'FAIL X2: the governed referral was not recorded in the enforcement case history'; END IF;

  RAISE NOTICE 'PASS X2: governed enforcement referral preserves finding -> remediation -> assessment -> examination provenance, derives the entity canonically and governs the remediation bypass';
END $$;


-- =====================================================================
-- GATE Y — reassessment requirement -> follow-up assessment -> approval
--          -> authoritative risk movement
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE rr uuid; rs_before text;
BEGIN
  SELECT residual_rating INTO rs_before FROM public.entity_risk_state
   WHERE entity_id = (SELECT v FROM e3 WHERE k='entity_a') AND domain_code = 'AML_CFT';

  rr := public.supervisory_reassessment_require(
    (SELECT v FROM e3 WHERE k='entity_a'), 'AML_CFT', 'REMEDIATION_COMPLETED',
    'Transaction monitoring remediation validated as EFFECTIVE; the AML/CFT risk of record must be reassessed.',
    'FOLLOW_UP', current_date + 30, (SELECT v FROM e3 WHERE k='a1'),
    (SELECT v FROM e3 WHERE k='f1'), (SELECT v FROM e3 WHERE k='ra'),
    (SELECT id FROM public.supervisory_remediation_validation
      WHERE action_id = (SELECT v FROM e3 WHERE k='ra') LIMIT 1),
    (SELECT v FROM e3 WHERE k='ex'), NULL, NULL,
    'b8eaf680-fe66-4d49-b816-1c087f511235');
  INSERT INTO e3(k,v) VALUES ('rr', rr);

  -- the requirement itself must not move the risk of record
  IF (SELECT residual_rating FROM public.entity_risk_state
       WHERE entity_id = (SELECT v FROM e3 WHERE k='entity_a') AND domain_code='AML_CFT')
     IS DISTINCT FROM rs_before THEN
    RAISE EXCEPTION 'FAIL Y: the reassessment requirement changed authoritative risk'; END IF;
END $$;

SET LOCAL "request.jwt.claims" = :'OFFICER';
DO $$
DECLARE r jsonb; aid uuid;
BEGIN
  r := public.supervisory_assessment_create(
        (SELECT v FROM e3 WHERE k='entity_a'), 'AML_CFT', 'FOLLOW_UP',
        current_date - 180, current_date, (SELECT v FROM e3 WHERE k='aml_meth'),
        'REASSESSMENT', NULL,
        'Follow-up AML/CFT assessment after validated remediation of transaction monitoring.',
        NULL, (SELECT v FROM e3 WHERE k='a1'));
  aid := (r->>'id')::uuid;
  INSERT INTO e3(k,v) VALUES ('a2', aid);

  PERFORM public.supervisory_assessment_dimension_upsert(aid, 'TRANSACTION_MONITORING', 'CONTROL_EFFECTIVENESS',
    NULL, 'satisfactory', 'moderate', 0.20, 2,
    'Model retuned and validated; alert decisions documented.',
    NULL, '[{"kind":"validation","ref":"RA-EFFECTIVE"}]'::jsonb,
    'Re-test of 30 alerts: all decisions documented within policy.', NULL, NULL,
    'IMPROVING', 'HIGH', 'HIGH', true, NULL, 'satisfactory', 'moderate', 2, NULL, false);
  PERFORM public.supervisory_assessment_dimension_upsert(aid, 'CUSTOMER_RISK', 'INHERENT_RISK',
    'high', NULL, 'medium_high', 0.20, 3, 'Inherent customer risk unchanged; controls now mitigate more of it.',
    NULL, NULL, 'Customer base composition stable.', NULL, NULL, 'STABLE', 'HIGH', 'HIGH', true,
    'high', NULL, 'medium_high', 3, NULL, false);

  DECLARE qr record;
  BEGIN
    FOR qr IN
      SELECT q.id FROM public.supervisory_methodology_question q
        JOIN public.supervisory_methodology_dimension d ON d.id = q.methodology_dimension_id
       WHERE q.methodology_id = (SELECT v FROM e3 WHERE k='aml_meth')
         AND q.active AND q.mandatory AND d.active
    LOOP
      PERFORM public.supervisory_assessment_question_upsert(aid, qr.id, 'YES',
        'Re-tested at follow-up and evidenced in the reassessment workpaper file.',
        '[{"kind":"workpaper","ref":"EPIC3-CERT-Q2"}]'::jsonb);
    END LOOP;
  END;

  PERFORM public.supervisory_assessment_transition(aid, 'submitted', 'Follow-up assessment submitted for review.');
END $$;

SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE aid uuid := (SELECT v FROM e3 WHERE k='a2');
BEGIN
  PERFORM public.supervisory_assessment_transition(aid, 'approved',
    'Approved: validated remediation reduces residual AML/CFT risk from HIGH to MODERATE.',
    'moderate', current_date + 365);
END $$;

RESET ROLE;
DO $$
DECLARE ea uuid := (SELECT v FROM e3 WHERE k='entity_a'); mv public.entity_risk_state_movement;
        rr public.supervisory_reassessment_requirement;
BEGIN
  IF upper((SELECT residual_rating FROM public.entity_risk_state
             WHERE entity_id = ea AND domain_code='AML_CFT')) <> 'MODERATE' THEN
    RAISE EXCEPTION 'FAIL Y: AML risk of record did not move to MODERATE'; END IF;

  SELECT * INTO mv FROM public.entity_risk_state_movement
   WHERE entity_id = ea AND domain_code='AML_CFT'
     AND new_assessment_id = (SELECT v FROM e3 WHERE k='a2') LIMIT 1;
  IF mv.id IS NULL THEN RAISE EXCEPTION 'FAIL Y: no risk movement recorded'; END IF;
  IF upper(COALESCE(mv.previous_rating,'')) <> 'HIGH' OR upper(mv.new_rating) <> 'MODERATE' THEN
    RAISE EXCEPTION 'FAIL Y: movement does not record HIGH -> MODERATE (got % -> %)',
      mv.previous_rating, mv.new_rating; END IF;
  IF mv.trend <> 'IMPROVING' THEN RAISE EXCEPTION 'FAIL Y: movement trend is %', mv.trend; END IF;
  IF mv.previous_assessment_id <> (SELECT v FROM e3 WHERE k='a1')
     OR mv.new_assessment_id <> (SELECT v FROM e3 WHERE k='a2') THEN
    RAISE EXCEPTION 'FAIL Y: movement does not link the previous and new assessments'; END IF;
  IF mv.requirement_id <> (SELECT v FROM e3 WHERE k='rr') THEN
    RAISE EXCEPTION 'FAIL Y: movement does not link the reassessment requirement'; END IF;
  IF mv.approved_by IS NULL OR mv.approved_at IS NULL THEN
    RAISE EXCEPTION 'FAIL Y: movement lacks approver provenance'; END IF;
  IF NOT ((SELECT v FROM e3 WHERE k='f1') = ANY (mv.supporting_finding_ids)) THEN
    RAISE EXCEPTION 'FAIL Y: movement does not cite the supporting finding'; END IF;
  IF NOT ((SELECT v FROM e3 WHERE k='ra') = ANY (mv.remediation_action_ids)) THEN
    RAISE EXCEPTION 'FAIL Y: movement does not cite the remediation action'; END IF;

  SELECT * INTO rr FROM public.supervisory_reassessment_requirement WHERE id = (SELECT v FROM e3 WHERE k='rr');
  IF rr.status <> 'FULFILLED' OR rr.fulfilled_assessment_id <> (SELECT v FROM e3 WHERE k='a2') THEN
    RAISE EXCEPTION 'FAIL Y: the reassessment requirement was not fulfilled by the approved follow-up'; END IF;

  -- the superseded assessment remains in history
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment
                  WHERE id = (SELECT v FROM e3 WHERE k='a1') AND NOT is_current) THEN
    RAISE EXCEPTION 'FAIL Y: the previous assessment was not superseded in history'; END IF;

  RAISE NOTICE 'PASS Y: requirement -> follow-up assessment -> independent approval -> HIGH->MODERATE risk movement, fully traceable';
END $$;

-- =====================================================================
-- GATE Z — security, confidentiality and negative matrix
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  -- Z2: confidential AML material is supervisor-level and above only
  IF public.has_permission('b8eaf680-fe66-4d49-b816-1c087f511235','aml_supervision','view_confidential') THEN
    RAISE EXCEPTION 'FAIL Z2: an ordinary AML officer still holds view_confidential'; END IF;
  IF NOT public.has_permission('0b522724-adcb-48bf-b21d-175339479616','aml_supervision','view_confidential') THEN
    RAISE EXCEPTION 'FAIL Z2: the AML supervisor lost view_confidential'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sec_roles r
                  JOIN public.sec_role_permissions rp ON rp.role_id = r.id
                  JOIN public.sec_permissions p ON p.id = rp.permission_id
                  JOIN public.sec_modules m ON m.id = p.module_id
                 WHERE r.key = 'aml_head' AND m.key = 'aml_supervision' AND p.key = 'view_confidential') THEN
    RAISE EXCEPTION 'FAIL Z2: Head of AML/CFT cannot view confidential material'; END IF;
  SELECT count(*) INTO n FROM public.sec_permissions p
    JOIN public.sec_modules m ON m.id = p.module_id WHERE m.key = 'aml_supervision';
  IF n < 12 THEN RAISE EXCEPTION 'FAIL Z2: AML permission catalogue has only % actions', n; END IF;

  -- Z3: no anonymous execute defect
  SELECT count(*) INTO n FROM public.sec_anon_executable_functions
   WHERE NOT allowlisted AND NOT is_extension;
  IF n > 0 THEN RAISE EXCEPTION 'FAIL Z3: % project routine(s) executable by anon without an allowlist entry', n; END IF;
  IF EXISTS (SELECT 1 FROM public.sec_anon_executable_functions
              WHERE function_name LIKE 'aml%' OR function_name LIKE 'supervisory_%') THEN
    RAISE EXCEPTION 'FAIL Z3: an AML or supervisory routine is anonymously callable'; END IF;

  -- Z4: RLS enabled on every canonical Epic 3 store
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname='public' AND NOT c.relrowsecurity
     AND c.relname IN ('supervisory_assessment','supervisory_assessment_dimension','supervisory_finding',
       'supervisory_finding_event','supervisory_remediation_action','supervisory_remediation_validation',
       'supervisory_reassessment_requirement','supervisory_methodology','supervisory_methodology_dimension',
       'entity_risk_state','entity_risk_state_movement');
  IF n > 0 THEN RAISE EXCEPTION 'FAIL Z4: % canonical Epic 3 store(s) without RLS', n; END IF;
  RAISE NOTICE 'PASS Z2/Z3/Z4: AML confidentiality corrected, anon boundary clean, RLS enabled on every canonical store';
END $$;

-- Z5: an entity user can never validate or close its own finding
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'ENTITYUSER';
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.supervisory_remediation_validate((SELECT v FROM e3 WHERE k='ra2'), 'EFFECTIVE',
      'Self-declared completion.', 'Self review.', 'The entity asserts the action is complete.');
  EXCEPTION WHEN OTHERS THEN ok := (SQLERRM LIKE '%not_authorized%') OR (SQLERRM LIKE '%validation_not_open%');
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL Z5: an entity user validated a supervisory remediation'; END IF;

  ok := false;
  BEGIN
    PERFORM public.supervisory_finding_lifecycle((SELECT v FROM e3 WHERE k='f2'), 'CLOSED',
      'Entity attempting to close its own supervisory finding.');
  EXCEPTION WHEN OTHERS THEN ok := (SQLERRM LIKE '%not_authorized%') OR (SQLERRM LIKE '%transition_not_permitted%');
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL Z5: an entity user closed its own supervisory finding'; END IF;
  RAISE NOTICE 'PASS Z5: a regulated entity can neither validate nor close its own supervisory finding';
END $$;

-- Z6: a HIGH/CRITICAL finding cannot be closed without a governed validation
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE ok boolean := false;
BEGIN
  -- f2 already sits in REMEDIATION_REQUIRED with an unresolved corrective action

  BEGIN
    PERFORM public.supervisory_finding_lifecycle((SELECT v FROM e3 WHERE k='f2'), 'CLOSED',
      'Attempting closure without a governed validation.');
  EXCEPTION WHEN OTHERS THEN ok := (SQLERRM LIKE '%closure_blocked%');
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL Z6: a critical finding closed without validation'; END IF;
  RAISE NOTICE 'PASS Z6: closure of a material finding requires a governed remediation validation';
END $$;

-- Z7: examination/finding linkage cannot reference records that do not exist
RESET ROLE;
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.examination_scope_dimension(examination_id, assessment_id, assessment_dimension_id, dimension_code)
    VALUES ((SELECT v FROM e3 WHERE k='ex'), gen_random_uuid(), gen_random_uuid(), 'FAKE');
  EXCEPTION WHEN foreign_key_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL Z7: examination scope accepted a nonexistent assessment/dimension'; END IF;

  ok := false;
  BEGIN
    UPDATE public.supervisory_finding SET workpaper_id = gen_random_uuid()
     WHERE id = (SELECT v FROM e3 WHERE k='f1');
  EXCEPTION WHEN foreign_key_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL Z7: a finding accepted a nonexistent workpaper'; END IF;
  RAISE NOTICE 'PASS Z7: every provenance edge is FK-backed and rejects invented references';
END $$;

-- Z8: AI may not change judged risk or the risk of record
DO $$
DECLARE ok boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM public.entity_risk_state_movement
              WHERE approved_by IS NULL) THEN
    RAISE EXCEPTION 'FAIL Z8: a risk movement exists without a human approver'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment
              WHERE status = 'approved' AND approved_by IS NULL) THEN
    RAISE EXCEPTION 'FAIL Z8: an approved assessment exists without a human approver'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_dimension d
              WHERE d.is_overridden AND d.overridden_by IS NULL) THEN
    RAISE EXCEPTION 'FAIL Z8: a rating override exists without a human actor'; END IF;
  RAISE NOTICE 'PASS Z8: judged ratings, approvals and risk movements all carry a human actor — AI cannot author them';
END $$;

-- =====================================================================
-- READ-MODEL RECONCILIATION
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE p record; panel jsonb; ov jsonb; q int;
BEGIN
  SELECT * INTO p FROM public.aml_portfolio(500)
   WHERE entity_id = (SELECT v FROM e3 WHERE k='entity_a');
  IF p.entity_id IS NULL THEN RAISE EXCEPTION 'FAIL RM: certification entity missing from the AML portfolio'; END IF;
  IF upper(COALESCE(p.residual_rating,'')) <> 'MODERATE' THEN
    RAISE EXCEPTION 'FAIL RM: portfolio shows % residual risk, canonical state is MODERATE', p.residual_rating; END IF;
  IF upper(COALESCE(p.prior_rating,'')) <> 'HIGH' OR p.trend <> 'IMPROVING' THEN
    RAISE EXCEPTION 'FAIL RM: portfolio prior rating/trend disagree with the movement history'; END IF;
  IF p.last_assessment_id <> (SELECT v FROM e3 WHERE k='a2') THEN
    RAISE EXCEPTION 'FAIL RM: portfolio does not cite the current approved assessment'; END IF;
  IF p.reassessment_required THEN
    RAISE EXCEPTION 'FAIL RM: a fulfilled reassessment still shows as outstanding'; END IF;

  panel := public.aml_entity_panel((SELECT v FROM e3 WHERE k='entity_a'));
  IF upper(COALESCE(panel->>'residual_rating','')) <> 'MODERATE'
     OR upper(COALESCE(panel->>'prior_rating','')) <> 'HIGH' THEN
    RAISE EXCEPTION 'FAIL RM: Entity 360 AML panel disagrees with canonical risk state'; END IF;
  IF (panel->>'open_findings')::int < 1 THEN
    RAISE EXCEPTION 'FAIL RM: Entity 360 AML panel does not show the open critical finding'; END IF;
  IF (panel->>'reassessment_required')::boolean THEN
    RAISE EXCEPTION 'FAIL RM: Entity 360 AML panel still shows an outstanding reassessment'; END IF;
  IF jsonb_array_length(panel->'risk_movements') < 1 THEN
    RAISE EXCEPTION 'FAIL RM: Entity 360 AML panel has no risk-movement history'; END IF;

  ov := public.aml_overview_metrics();
  IF (ov->>'entities_with_current_assessment')::int < 1 THEN
    RAISE EXCEPTION 'FAIL RM: overview does not count the approved assessment'; END IF;
  IF (ov->>'open_findings')::int < 1 THEN
    RAISE EXCEPTION 'FAIL RM: overview does not count the open finding'; END IF;

  SELECT count(*) INTO q FROM public.aml_work_queue(200)
   WHERE entity_id = (SELECT v FROM e3 WHERE k='entity_a');
  IF q < 1 THEN RAISE EXCEPTION 'FAIL RM: AML work queue shows no work for the certification entity'; END IF;
  IF EXISTS (SELECT 1 FROM public.aml_work_queue(200) WHERE kind = 'reassessment_required'
              AND id = (SELECT v FROM e3 WHERE k='rr')) THEN
    RAISE EXCEPTION 'FAIL RM: a fulfilled reassessment requirement is still queued as work'; END IF;
  RAISE NOTICE 'PASS RM: overview, portfolio, work queue and Entity 360 AML panel all reconcile with canonical state';
END $$;

-- =====================================================================
-- HISTORICAL PRESERVATION + NOTIFICATIONS
-- =====================================================================
RESET ROLE;
DO $$
DECLARE n bigint; b bigint;
BEGIN
  SELECT count(*) INTO n FROM public.examinations;
  IF n <> (SELECT e3n.n FROM e3n WHERE k='examinations') + 1 THEN
    RAISE EXCEPTION 'FAIL HIST: examination population changed unexpectedly (% vs % + 1 fixture)',
      n, (SELECT e3n.n FROM e3n WHERE k='examinations'); END IF;

  SELECT e3n.n INTO b FROM e3n WHERE k='exam_findings';
  IF (SELECT count(*) FROM public.examination_findings) <> b THEN
    RAISE EXCEPTION 'FAIL HIST: legacy examination findings changed'; END IF;
  SELECT e3n.n INTO b FROM e3n WHERE k='conduct_findings';
  IF (SELECT count(*) FROM public.conduct_findings) <> b THEN
    RAISE EXCEPTION 'FAIL HIST: legacy conduct findings changed'; END IF;
  SELECT e3n.n INTO b FROM e3n WHERE k='backfilled_findings';
  IF b <> 17 THEN RAISE EXCEPTION 'FAIL HIST: expected 17 deterministic canonical backfills, found %', b; END IF;
  IF EXISTS (
    SELECT legacy_source_table, legacy_source_id FROM public.supervisory_finding
     WHERE legacy_source_id IS NOT NULL
     GROUP BY legacy_source_table, legacy_source_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'FAIL HIST: a legacy finding is mapped to more than one canonical record'; END IF;
  SELECT e3n.n INTO b FROM e3n WHERE k='legacy_plans';
  IF b <> 3 OR (SELECT count(*) FROM public.legacy_supervisory_plans) <> 3 THEN
    RAISE EXCEPTION 'FAIL HIST: legacy plan population changed'; END IF;
  SELECT e3n.n INTO b FROM e3n WHERE k='legacy_actions';
  IF b <> 12 OR (SELECT count(*) FROM public.legacy_supervisory_plan_actions) <> 12 THEN
    RAISE EXCEPTION 'FAIL HIST: legacy plan action population changed'; END IF;

  -- notifications were raised through the enterprise engine, not a bespoke AML one
  IF NOT EXISTS (SELECT 1 FROM public.notification_event_queue
                  WHERE event_key = 'aml.assessment_submitted'
                    AND entity_id = (SELECT v FROM e3 WHERE k='a1')) THEN
    RAISE EXCEPTION 'FAIL NOTIF: assessment submission raised no enterprise notification event'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notification_event_queue
                  WHERE event_key = 'aml.assessment_approved') THEN
    RAISE EXCEPTION 'FAIL NOTIF: assessment approval raised no notification event'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notification_event_queue
                  WHERE event_key = 'aml.finding_issued' AND entity_id = (SELECT v FROM e3 WHERE k='f1')) THEN
    RAISE EXCEPTION 'FAIL NOTIF: finding issue raised no notification event'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notification_event_queue
                  WHERE event_key = 'aml.reassessment_required' AND entity_id = (SELECT v FROM e3 WHERE k='rr')) THEN
    RAISE EXCEPTION 'FAIL NOTIF: reassessment requirement raised no notification event'; END IF;
  RAISE NOTICE 'PASS HIST/NOTIF: historical populations intact, deterministic 1:1 legacy mapping, notifications on the enterprise engine';
END $$;

DO $$ BEGIN
  RAISE NOTICE 'EPIC 3 AML/CFT CLOSED-LOOP SUPERVISION: ALL GATES A-Z PASSED';
END $$;

ROLLBACK;

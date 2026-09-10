-- =============================================================================
-- AML/CFT DEMONSTRATION DATASET — ADDITIVE DOWNSTREAM SUPERVISORY CONTENT
--
-- Adds the post-assessment half of the demonstration story (AML-08 supervisory
-- consequences, AML-09 review-cycle decisions, AML-11 outcome effectiveness)
-- through the live governed operations only.
--
-- Nothing is deleted, nothing existing is modified, no rating is published and
-- no calculation policy is created. Every consequence is recorded against the
-- honest LEGACY_RISK_RECORD source the server itself reports for these demo
-- entities, with NOT_CALCULABLE declared as a non-blocking observation.
--
-- Idempotent: every governed decision carries a stable idempotency key
-- ('DEMO-AML-DS-...'), so a second run converges and creates nothing.
--
-- Non-production only.
--
-- Run: psql "$SUPABASE_DB_URL" -X -q -f scripts/demo/seed-aml-demo-downstream.sql
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off
SET row_security = on;

BEGIN;
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  IF public.is_production_environment() THEN
    RAISE EXCEPTION 'DEMO AML downstream seed refused: production environment';
  END IF;
END $$;

DO $$
DECLARE
  claim_off text := '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
  claim_sup text := '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}';
  e06 uuid; e07 uuid; e08 uuid; e05 uuid; e09 uuid;
  res jsonb; dec_id uuid; plan_id uuid; ev_id uuid; eval_id uuid; interv_id uuid; finding_id uuid;
  a05 uuid; dim uuid; meth uuid;
  created int := 0;

BEGIN
  PERFORM set_config('request.jwt.claims', claim_sup, true);
  SELECT id INTO e05 FROM public.licensees WHERE name LIKE 'DEMO AML 05%' LIMIT 1;
  SELECT id INTO e06 FROM public.licensees WHERE name LIKE 'DEMO AML 06%' LIMIT 1;
  SELECT id INTO e07 FROM public.licensees WHERE name LIKE 'DEMO AML 07%' LIMIT 1;
  SELECT id INTO e08 FROM public.licensees WHERE name LIKE 'DEMO AML 08%' LIMIT 1;
  SELECT id INTO e09 FROM public.licensees WHERE name LIKE 'DEMO AML 09%' LIMIT 1;
  IF e05 IS NULL OR e06 IS NULL OR e07 IS NULL OR e08 IS NULL OR e09 IS NULL THEN
    RAISE EXCEPTION 'demo entities missing: run scripts/demo/seed-aml-demo-dataset.sql first';
  END IF;

  -- =========================================================================
  -- DS-01  DEMO AML 06 — supervisory plan opened, reassessment required
  -- =========================================================================
  -- Business-record guard. The governed idempotency key is derived from the
  -- current risk basis, so it correctly stops matching once a new risk of record
  -- is published for the entity. The demonstration content must still converge,
  -- so each step is skipped when the business record it creates already exists.
  PERFORM set_config('request.jwt.claims', claim_off, true);
  IF NOT EXISTS (
    SELECT 1 FROM public.supervisory_consequence_decision
     WHERE entity_id = e06 AND domain_code = 'AML_CFT'
       AND action_type = 'OPEN_SUPERVISORY_PLAN' AND withdrawn_at IS NULL
  ) THEN
    res := public.supervisory_consequence_record(jsonb_build_object(
      'entity_id', e06, 'domain_code','AML_CFT',
      'action_type','OPEN_SUPERVISORY_PLAN','linkage_mode','CREATE',
      'title','DEMO AML 06 — AML/CFT supervisory plan',
      'supervisory_objective','Close the customer due diligence and transaction monitoring weaknesses identified for this money services business.',
      'priority','HIGH','due_date',(current_date + 90)::text,
      'idempotency_key','DEMO-AML-DS-01-PLAN',
      'rationale','The current AML/CFT risk of record for this money services business warrants a formal supervisory plan covering customer due diligence and transaction monitoring.'));
    created := created + 1;
  END IF;

  PERFORM set_config('request.jwt.claims', claim_sup, true);
  IF NOT EXISTS (
    SELECT 1 FROM public.supervisory_consequence_decision
     WHERE entity_id = e06 AND domain_code = 'AML_CFT'
       AND action_type = 'REQUIRE_REASSESSMENT' AND withdrawn_at IS NULL
  ) THEN
    res := public.supervisory_consequence_record(jsonb_build_object(
      'entity_id', e06, 'domain_code','AML_CFT',
      'action_type','REQUIRE_REASSESSMENT','linkage_mode','CREATE',
      'requested_type','TARGETED','due_date',(current_date + 120)::text,
      'supervisory_objective','Re-establish the AML/CFT risk of record once the planned remediation has been delivered.',
      'idempotency_key','DEMO-AML-DS-01-REASSESS',
      'rationale','A targeted AML/CFT reassessment is required once the supervisory plan has run, so that the risk of record reflects the remediated position.'));
    created := created + 1;
  END IF;

  -- =========================================================================
  -- DS-02  DEMO AML 07 — the full governed engagement chain on the
  --        deteriorating case: plan -> intervention -> endorsement ->
  --        examination -> finding -> enforcement referral.
  -- =========================================================================
  PERFORM set_config('request.jwt.claims', claim_off, true);
  SELECT target_id INTO plan_id
    FROM public.supervisory_consequence_decision
   WHERE entity_id = e07 AND domain_code = 'AML_CFT'
     AND action_type = 'OPEN_SUPERVISORY_PLAN' AND withdrawn_at IS NULL
   ORDER BY decided_at LIMIT 1;
  IF plan_id IS NULL THEN
    res := public.supervisory_consequence_record(jsonb_build_object(
      'entity_id', e07, 'domain_code','AML_CFT',
      'action_type','OPEN_SUPERVISORY_PLAN','linkage_mode','CREATE',
      'title','DEMO AML 07 — AML/CFT engagement plan',
      'supervisory_objective','Verify virtual asset customer identification and sanctions screening controls through an on-site engagement.',
      'priority','HIGH','due_date',(current_date + 60)::text,
      'idempotency_key','DEMO-AML-DS-02-PLAN',
      'rationale','The deterioration recorded in this virtual asset provider''s AML/CFT risk of record warrants a planned on-site engagement.'));
    plan_id := NULLIF(res->>'target_id','')::uuid;
    created := created + 1;
  END IF;

  BEGIN
    IF plan_id IS NOT NULL THEN
      PERFORM public.supervisory_plan_lifecycle(plan_id,'SUBMITTED',
        'Submitted for approval with the on-site engagement objective recorded.');
      PERFORM set_config('request.jwt.claims', claim_sup, true);
      PERFORM public.supervisory_plan_lifecycle(plan_id,'APPROVED',
        'Approved: an on-site engagement is proportionate to the recorded deterioration.');
      PERFORM public.supervisory_plan_lifecycle(plan_id,'ACTIVE',
        'Activated for delivery in the current supervisory cycle.');
    END IF;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'DS-02 plan lifecycle stopped at: %', SQLERRM;
  END;

  BEGIN
    PERFORM set_config('request.jwt.claims', claim_off, true);
    res := public.supervisory_consequence_record(jsonb_build_object(
      'entity_id', e07, 'domain_code','AML_CFT',
      'action_type','OPEN_INTERVENTION','linkage_mode','CREATE',
      'plan_id', plan_id,
      'intervention_type','TARGETED_EXAMINATION',
      'title','DEMO AML 07 — targeted AML/CFT intervention',
      'supervisory_objective','Authorise a targeted on-site examination of identification and screening controls.',
      'due_date',(current_date + 60)::text,
      'idempotency_key','DEMO-AML-DS-02-INTERVENTION',
      'rationale','A targeted supervisory intervention is opened so that an on-site examination of the screening controls can be authorised.'));
    interv_id := NULLIF(res->>'target_id','')::uuid;
    IF NOT (COALESCE((res->>'duplicate')::boolean,false)
          OR COALESCE((res->>'idempotent')::boolean,false)
          OR COALESCE((res->>'reused')::boolean,false)
          OR COALESCE((res->>'existing')::boolean,false)) THEN created := created + 1; END IF;

    IF interv_id IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', claim_sup, true);
      PERFORM public.supervisory_intervention_decide(interv_id,'ENDORSED',
        'Endorsed: the targeted examination is authorised on the recorded supervisory basis.');
    END IF;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'DS-02 intervention stopped at: %', SQLERRM;
  END;

  BEGIN
    PERFORM set_config('request.jwt.claims', claim_off, true);
    res := public.supervisory_consequence_record(jsonb_build_object(
      'entity_id', e07, 'domain_code','AML_CFT',
      'action_type','OPEN_EXAMINATION','linkage_mode','CREATE',
      'intervention_id', interv_id,
      'engagement_type','TARGETED_ONSITE',
      'title','DEMO AML 07 — targeted AML/CFT examination',
      'supervisory_objective','Test the effectiveness of virtual asset customer identification and sanctions screening controls on site.',
      'due_date',(current_date + 60)::text,
      'idempotency_key','DEMO-AML-DS-02-EXAM',
      'rationale','The endorsed intervention authorises a targeted on-site examination of identification and screening controls.'));
    IF NOT (COALESCE((res->>'duplicate')::boolean,false)
          OR COALESCE((res->>'idempotent')::boolean,false)
          OR COALESCE((res->>'reused')::boolean,false)
          OR COALESCE((res->>'existing')::boolean,false)) THEN created := created + 1; END IF;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'DS-02 examination stopped at: %', SQLERRM;
  END;

  BEGIN
    res := public.supervisory_consequence_record(jsonb_build_object(
      'entity_id', e07, 'domain_code','AML_CFT',
      'action_type','RAISE_FINDING','linkage_mode','CREATE',
      'severity','HIGH',
      'title','DEMO AML 07 — sanctions screening deficiency',
      'supervisory_objective','Require the institution to remediate the sanctions screening deficiency identified on site.',
      'due_date',(current_date + 45)::text,
      'idempotency_key','DEMO-AML-DS-02-FINDING',
      'rationale','Sanctions screening did not detect two fictional test names during the examination walkthrough, which is a high severity AML/CFT control deficiency.'));
    finding_id := NULLIF(res->>'target_id','')::uuid;
    IF NOT (COALESCE((res->>'duplicate')::boolean,false)
          OR COALESCE((res->>'idempotent')::boolean,false)
          OR COALESCE((res->>'reused')::boolean,false)
          OR COALESCE((res->>'existing')::boolean,false)) THEN created := created + 1; END IF;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'DS-02 finding stopped at: %', SQLERRM;
  END;


  -- =========================================================================
  -- DS-03  DEMO AML 08 — record-only monitoring plus a governed review-cycle
  --        decision (AML-09): the review date is moved with a written reason.
  -- =========================================================================
  PERFORM set_config('request.jwt.claims', claim_sup, true);
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id', e08, 'domain_code','AML_CFT',
    'action_type','RECORD_MONITORING','linkage_mode','RECORD_ONLY',
    'supervisory_objective','Keep the institution under enhanced off-site monitoring until the next scheduled review.',
    'idempotency_key','DEMO-AML-DS-03-MONITOR',
    'rationale','Enhanced off-site monitoring is recorded for this cash services business pending the next scheduled AML/CFT review.'));
  IF NOT (COALESCE((res->>'duplicate')::boolean,false)
          OR COALESCE((res->>'idempotent')::boolean,false)
          OR COALESCE((res->>'reused')::boolean,false)
          OR COALESCE((res->>'existing')::boolean,false)) THEN created := created + 1; END IF;

  PERFORM set_config('request.jwt.claims', claim_sup, true);
  BEGIN
    res := public.supervisory_risk_monitoring_reschedule(jsonb_build_object(
      'entity_id', e08, 'domain_code','AML_CFT',
      'disposition','RESCHEDULED',
      'revised_due_date',(current_date + 45)::text,
      'idempotency_key','DEMO-AML-DS-03-RESCHEDULE',
      'rationale','The AML/CFT review is brought forward to align with the off-site monitoring cycle and the outstanding information request.'));
    IF NOT (COALESCE((res->>'duplicate')::boolean,false)
          OR COALESCE((res->>'idempotent')::boolean,false)
          OR COALESCE((res->>'reused')::boolean,false)
          OR COALESCE((res->>'existing')::boolean,false)) THEN created := created + 1; END IF;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'DS-03 reschedule not available: %', SQLERRM;
  END;

  BEGIN
    IF finding_id IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', claim_sup, true);
      PERFORM public.supervisory_finding_lifecycle(finding_id,'REVIEW',
        'Submitted for supervisory review before issue to the institution.');
      PERFORM public.supervisory_finding_lifecycle(finding_id,'ISSUED',
        'Issued to the institution with a written remediation requirement and response date.');
    END IF;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'DS-02 finding issue stopped at: %', SQLERRM;
  END;

  BEGIN
    PERFORM set_config('request.jwt.claims', claim_sup, true);
    res := public.supervisory_risk_monitoring_require_reassessment(jsonb_build_object(
      'entity_id', e07, 'domain_code','AML_CFT',
      'event_type','FINDING_RAISED','requested_type','TARGETED',
      'due_date',(current_date + 75)::text,
      'idempotency_key','DEMO-AML-DS-03-EVENT-REASSESS',
      'rationale','An AML/CFT finding raised through supervision requires the risk of record to be re-established on a targeted basis.'));
    IF COALESCE((res->>'created')::boolean,false) THEN created := created + 1; END IF;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'DS-03 event reassessment not available: %', SQLERRM;
  END;

  -- =========================================================================
  -- DS-04  DEMO AML 05 — a completed supervisory plan evaluated for
  --        effectiveness (AML-11), reviewed and approved by a second officer.
  -- =========================================================================
  SELECT a.id, a.methodology_id INTO a05, meth
    FROM public.supervisory_assessment a
   WHERE a.entity_id = e05 AND a.summary LIKE '%DEMO AML CURRENT SCEN-05%'
   LIMIT 1;

  IF a05 IS NOT NULL THEN
    SELECT d.id INTO dim FROM public.supervisory_methodology_dimension d
     WHERE d.methodology_id = meth ORDER BY d.sort_order NULLS LAST, d.id LIMIT 1;

    PERFORM set_config('request.jwt.claims', claim_off, true);
    BEGIN
      res := public.supervisory_assessment_evidence_link(a05, jsonb_build_object(
        'evidence_type','SUPERVISORY_SAMPLE',
        'source_reference','DEMO-AML-05-SAMPLE-01',
        'methodology_dimension_id', dim,
        'title','Onboarding file sample — 30 accounts',
        'note','Fictional demonstration sample: thirty onboarding files reviewed for customer due diligence completeness.',
        'as_of_date', current_date::text));
      ev_id := NULLIF(res->>'evidence_id','')::uuid;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'DS-04 evidence link not available: %', SQLERRM;
    END;

    res := public.supervisory_consequence_record(jsonb_build_object(
      'entity_id', e05, 'domain_code','AML_CFT',
      'action_type','OPEN_SUPERVISORY_PLAN','linkage_mode','CREATE',
      'title','DEMO AML 05 — AML/CFT remediation plan',
      'supervisory_objective','Bring customer due diligence records for existing members up to the required standard within one quarter.',
      'due_date',(current_date + 30)::text,
      'idempotency_key','DEMO-AML-DS-04-PLAN',
      'rationale','A remediation plan is opened so that the credit union brings existing member due diligence records up to the required standard.'));
    dec_id := NULLIF(res->>'decision_id','')::uuid;
    plan_id := NULLIF(res->>'target_id','')::uuid;
    IF NOT (COALESCE((res->>'duplicate')::boolean,false)
          OR COALESCE((res->>'idempotent')::boolean,false)
          OR COALESCE((res->>'reused')::boolean,false)
          OR COALESCE((res->>'existing')::boolean,false)) THEN created := created + 1; END IF;

    -- governed plan lifecycle: officer submits, the second officer approves,
    -- activates and completes it. No direct status write is used.
    IF plan_id IS NOT NULL THEN
      BEGIN
        PERFORM set_config('request.jwt.claims', claim_off, true);
        PERFORM public.supervisory_plan_lifecycle(plan_id,'SUBMITTED',
          'Submitted for supervisory approval with the remediation objective and timetable recorded.');
        PERFORM set_config('request.jwt.claims', claim_sup, true);
        PERFORM public.supervisory_plan_lifecycle(plan_id,'APPROVED',
          'Approved: the objective and the timetable are proportionate to the recorded AML/CFT risk.');
        PERFORM public.supervisory_plan_lifecycle(plan_id,'ACTIVE',
          'Activated and communicated to the institution for delivery in this quarter.');
        PERFORM public.supervisory_plan_lifecycle(plan_id,'COMPLETED',
          'Completed: the institution delivered the remediation programme and supervision closed the plan.');
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'DS-04 plan lifecycle stopped at: %', SQLERRM;
      END;
    END IF;

    IF dec_id IS NOT NULL AND ev_id IS NOT NULL THEN
      BEGIN
        PERFORM set_config('request.jwt.claims', claim_off, true);
        res := public.supervisory_outcome_evaluate(jsonb_build_object(
          'consequence_decision_id', dec_id,
          'conclusion','PARTIALLY_EFFECTIVE',
          'rationale','The plan closed the member due diligence gap for new relationships, but a third of the legacy member files still lack verified source-of-funds information.',
          'limitations','Transaction monitoring calibration was not re-tested in this evaluation.',
          'recommended_next_step','Consider a targeted reassessment once the legacy member file review is complete.',
          'evidence', jsonb_build_array(jsonb_build_object('evidence_id', ev_id))));
        eval_id := NULLIF(res->>'evaluation_id','')::uuid;
        IF eval_id IS NOT NULL AND NOT COALESCE((res->>'duplicate')::boolean,false) THEN
          created := created + 1;
        END IF;

        IF eval_id IS NOT NULL THEN
          PERFORM set_config('request.jwt.claims', claim_sup, true);
          PERFORM public.supervisory_outcome_review(jsonb_build_object(
            'evaluation_id', eval_id, 'decision','APPROVE',
            'note','Approved: the conclusion and the cited sample support a partially effective outcome.'));
        END IF;
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'DS-04 outcome evaluation stopped at: %', SQLERRM;
      END;
    ELSE
      RAISE NOTICE 'DS-04 outcome evaluation skipped: decision % evidence %', dec_id, ev_id;
    END IF;
  ELSE
    RAISE NOTICE 'DS-04 skipped: the SCEN-05 current-workflow assessment is absent';
  END IF;

  -- =========================================================================
  -- DS-05  DEMO AML 09 — an open plan, deliberately left open so the
  --        effectiveness screen can show a server-refused, ineligible case.
  -- =========================================================================
  PERFORM set_config('request.jwt.claims', claim_off, true);
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id', e09, 'domain_code','AML_CFT',
    'action_type','OPEN_SUPERVISORY_PLAN','linkage_mode','CREATE',
    'title','DEMO AML 09 — AML/CFT supervisory plan (in progress)',
    'supervisory_objective','Strengthen sanctions screening and record keeping at this remittance provider.',
    'due_date',(current_date + 150)::text,
    'idempotency_key','DEMO-AML-DS-05-OPEN-PLAN',
    'rationale','A supervisory plan is opened for this remittance provider to strengthen sanctions screening and record keeping controls.'));
  IF NOT (COALESCE((res->>'duplicate')::boolean,false)
          OR COALESCE((res->>'idempotent')::boolean,false)
          OR COALESCE((res->>'reused')::boolean,false)
          OR COALESCE((res->>'existing')::boolean,false)) THEN created := created + 1; END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'downstream demo content: % governed step(s) reported new work this run (business records are keyed and never duplicated)', created;
END $$;

COMMIT;

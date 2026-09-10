-- =============================================================================
-- DEMO DATA INTEGRITY VERIFIER — AML/CFT DEMONSTRATION DATASET
--
-- Behavioural, read-only proof that every demonstration record is valid under
-- the same relational, lifecycle, provenance, security and audit rules as
-- genuine application data. Nothing here inspects script text: every gate
-- queries the live database.
--
-- Gates: INTEGRITY-01 … INTEGRITY-18.
--
-- Run:  psql -X -q -v ON_ERROR_STOP=1 -f scripts/demo/verify-aml-demo.sql
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off

BEGIN;   -- read-only; ends in ROLLBACK

DO $$
DECLARE
  fails text[] := ARRAY[]::text[];
  n     bigint;
  m     bigint;
  ents  uuid[];
  metrics jsonb;

BEGIN
  SELECT coalesce(array_agg(id),'{}') INTO ents
    FROM public.licensees WHERE name LIKE 'DEMO AML %';

  IF array_length(ents,1) IS NULL THEN
    RAISE EXCEPTION 'INTEGRITY-00 FAIL: no DEMO AML dataset present';
  END IF;
  RAISE NOTICE 'INTEGRITY-00 PASS demo entities present: %', array_length(ents,1);

  -- 01 canonical identity: every demo entity is a real party of the right kind
  SELECT count(*) INTO n
    FROM public.licensees l
    LEFT JOIN public.parties p ON p.id = l.party_id
   WHERE l.id = ANY(ents)
     AND (p.id IS NULL OR p.party_kind <> 'ORGANIZATION');
  IF n > 0 THEN fails := fails || format('INTEGRITY-01 demo entity without ORGANIZATION party: %s', n);
  ELSE RAISE NOTICE 'INTEGRITY-01 PASS every demo entity has a canonical organisation party'; END IF;

  -- 02 organisation profile exists for every demo party
  SELECT count(*) INTO n
    FROM public.licensees l
   WHERE l.id = ANY(ents)
     AND NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.party_id = l.party_id);
  IF n > 0 THEN fails := fails || format('INTEGRITY-02 demo party without organizations row: %s', n);
  ELSE RAISE NOTICE 'INTEGRITY-02 PASS every demo party has an organisation record'; END IF;

  -- 03 licence foundation: supervised demo entities are real licence holders
  SELECT count(*) INTO n
    FROM public.licensees l
   WHERE l.id = ANY(ents)
     AND l.id <> 'aa220000-0000-4000-8000-000000000021'
     AND NOT EXISTS (
       SELECT 1 FROM public.entity_licenses el
        WHERE el.entity_id = l.id AND el.is_primary
          AND el.effective_to IS NULL);
  IF n > 0 THEN fails := fails || format('INTEGRITY-03 supervised demo entity without current primary licence: %s', n);
  ELSE RAISE NOTICE 'INTEGRITY-03 PASS every supervised demo entity holds a current primary licence'; END IF;

  -- 04 negative control: the out-of-perimeter holding company holds no licence
  SELECT count(*) INTO n
    FROM public.entity_licenses
   WHERE entity_id = 'aa220000-0000-4000-8000-000000000021'
     AND (effective_to IS NULL OR effective_to > now());
  IF n > 0 THEN fails := fails || 'INTEGRITY-04 out-of-perimeter demo entity presented as a licence holder';
  ELSE RAISE NOTICE 'INTEGRITY-04 PASS out-of-perimeter demo entity holds no licence'; END IF;

  -- 05 licence coherence: holder, status, term and validity window
  SELECT count(*) INTO n
    FROM public.entity_licenses el
    JOIN public.licenses li ON li.id = el.license_id
   WHERE el.entity_id = ANY(ents)
     AND (li.holder_id <> el.entity_id
       OR li.status <> 'active'
       OR li.valid_from > now()
       OR (li.valid_until IS NOT NULL AND li.valid_until <= now())
       OR li.issued_at > now()
       OR li.valid_from < li.issued_at
       OR el.effective_from < li.valid_from);
  IF n > 0 THEN fails := fails || format('INTEGRITY-05 incoherent demo licence record: %s', n);
  ELSE RAISE NOTICE 'INTEGRITY-05 PASS demo licences are coherent (holder, status, validity, attachment date)'; END IF;

  -- 06 exactly one current licence term per demo licence (trigger-owned)
  SELECT count(*) INTO n
    FROM public.licenses li
   WHERE li.id IN (SELECT license_id FROM public.entity_licenses WHERE entity_id = ANY(ents))
     AND (SELECT count(*) FROM public.license_terms t
           WHERE t.license_id = li.id AND t.is_current) <> 1;
  IF n > 0 THEN fails := fails || format('INTEGRITY-06 demo licence without exactly one current term: %s', n);
  ELSE RAISE NOTICE 'INTEGRITY-06 PASS every demo licence has exactly one current term'; END IF;

  -- 07 sector consistency between entity and licence
  SELECT count(*) INTO n
    FROM public.entity_licenses el
    JOIN public.licenses li ON li.id = el.license_id
    JOIN public.licensees l ON l.id = el.entity_id
   WHERE el.entity_id = ANY(ents)
     AND li.sector_id IS DISTINCT FROM l.sector_id;
  IF n > 0 THEN fails := fails || format('INTEGRITY-07 demo licence sector differs from entity sector: %s', n);
  ELSE RAISE NOTICE 'INTEGRITY-07 PASS demo licence sector matches the entity sector'; END IF;

  -- 08 supervision ownership: every demo entity has an active assignment
  SELECT count(*) INTO n
    FROM public.licensees l
   WHERE l.id = ANY(ents)
     AND NOT EXISTS (SELECT 1 FROM public.entity_supervision_assignments a
                      WHERE a.entity_id = l.id AND a.status = 'active');
  IF n > 0 THEN fails := fails || format('INTEGRITY-08 demo entity without an active supervision assignment: %s', n);
  ELSE RAISE NOTICE 'INTEGRITY-08 PASS every demo entity has an active supervision assignment'; END IF;

  -- 09 perimeter determination exists and is governed (determined_by present)
  SELECT count(*) INTO n
    FROM public.licensees l
   WHERE l.id = ANY(ents)
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_domain_perimeter p
                      WHERE p.entity_id = l.id AND p.domain_code = 'AML_CFT'
                        AND p.determined_by IS NOT NULL);
  IF n > 0 THEN fails := fails || format('INTEGRITY-09 demo entity without a governed AML/CFT perimeter determination: %s', n);
  ELSE RAISE NOTICE 'INTEGRITY-09 PASS every demo entity carries a governed perimeter determination'; END IF;

  -- 10 no orphans across every governed demo record class
  n := 0;
  SELECT n
       + (SELECT count(*) FROM public.supervisory_assessment x WHERE x.entity_id = ANY(ents)
           AND NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = x.entity_id))
       + (SELECT count(*) FROM public.entity_risk_state x WHERE x.entity_id = ANY(ents)
           AND (x.driving_assessment_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment a WHERE a.id = x.driving_assessment_id)))
       + (SELECT count(*) FROM public.entity_risk_state_movement x WHERE x.entity_id = ANY(ents)
           AND (x.new_assessment_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment a WHERE a.id = x.new_assessment_id)))
       + (SELECT count(*) FROM public.supervisory_consequence_decision x WHERE x.entity_id = ANY(ents)
           AND (x.assessment_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment a WHERE a.id = x.assessment_id)))
       + (SELECT count(*) FROM public.supervisory_risk_monitoring_decision x WHERE x.entity_id = ANY(ents)
           AND (x.assessment_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment a WHERE a.id = x.assessment_id)))
       + (SELECT count(*) FROM public.supervisory_outcome_evaluation x WHERE x.entity_id = ANY(ents)
           AND (x.consequence_decision_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.supervisory_consequence_decision c WHERE c.id = x.consequence_decision_id)))
       + (SELECT count(*) FROM public.supervisory_finding x WHERE x.entity_id = ANY(ents)
           AND NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = x.entity_id))
       + (SELECT count(*) FROM public.examinations x WHERE x.entity_id = ANY(ents)
           AND NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = x.entity_id))
    INTO n;
  IF n > 0 THEN fails := fails || format('INTEGRITY-10 orphaned demo governed record references: %s', n);
  ELSE RAISE NOTICE 'INTEGRITY-10 PASS no orphaned references in demo governed records'; END IF;

  -- 11 assessment lifecycle chronology
  SELECT count(*) INTO n
    FROM public.supervisory_assessment a
   WHERE a.entity_id = ANY(ents)
     AND (a.submitted_at < a.created_at
       OR (a.approved_at IS NOT NULL AND a.submitted_at IS NOT NULL AND a.approved_at < a.submitted_at)
       OR (a.risk_published_at IS NOT NULL AND a.approved_at IS NOT NULL AND a.risk_published_at < a.approved_at)
       OR a.created_at > now()
       OR (a.period_end IS NOT NULL AND a.period_start IS NOT NULL AND a.period_end < a.period_start));
  IF n > 0 THEN fails := fails || format('INTEGRITY-11 assessment chronology violation: %s', n);
  ELSE RAISE NOTICE 'INTEGRITY-11 PASS assessment create/submit/approve/publish chronology is coherent'; END IF;

  -- 12 maker-checker: approval never decided by the submitter
  SELECT count(*) INTO n
    FROM public.supervisory_assessment_approval_decision d
    JOIN public.supervisory_assessment_review_round r ON r.id = d.review_round_id
    JOIN public.supervisory_assessment a ON a.id = d.assessment_id
   WHERE a.entity_id = ANY(ents)
     AND d.decided_by = r.submitted_by;
  IF n > 0 THEN fails := fails || format('INTEGRITY-12 maker-checker violation on demo approvals: %s', n);
  ELSE RAISE NOTICE 'INTEGRITY-12 PASS every demo approval was decided by someone other than the submitter'; END IF;

  -- 13 risk of record provenance: driven by an approved, published assessment
  SELECT count(*) INTO n
    FROM public.entity_risk_state s
    LEFT JOIN public.supervisory_assessment a ON a.id = s.driving_assessment_id
   WHERE s.entity_id = ANY(ents)
     AND (a.id IS NULL
       OR a.approved_at IS NULL
       OR a.residual_rating IS NULL
       OR upper(coalesce(s.residual_rating,'')) <> upper(coalesce(a.residual_rating,''))
       OR s.effective_from < a.approved_at);
  IF n > 0 THEN fails := fails || format('INTEGRITY-13 risk of record without approved published provenance: %s', n);
  ELSE RAISE NOTICE 'INTEGRITY-13 PASS every demo risk of record derives from its approved assessment'; END IF;

  -- 14a publication lineage: every publication carries its risk movement
  SELECT count(*) INTO n
    FROM public.supervisory_assessment_risk_publication p
   WHERE p.entity_id = ANY(ents)
     AND (p.movement_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.entity_risk_state_movement mv
                       WHERE mv.id = p.movement_id AND mv.entity_id = p.entity_id));
  IF n > 0 THEN fails := fails || format('INTEGRITY-14A publication without matching risk movement: %s', n);
  ELSE RAISE NOTICE 'INTEGRITY-14A PASS every demo publication carries its risk movement lineage'; END IF;

  -- 14b AML-07 publication provenance: a live risk of record must be backed by a
  -- recorded approval decision and publication ledger entry, exactly as a
  -- genuine record produced by the current governed path is.
  SELECT count(*) INTO n
    FROM public.entity_risk_state s
   WHERE s.entity_id = ANY(ents)
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_risk_publication p
                      WHERE p.assessment_id = s.driving_assessment_id);
  IF n > 0 THEN fails := fails || format('INTEGRITY-14B risk of record without an AML-07 publication decision: %s', n);
  ELSE RAISE NOTICE 'INTEGRITY-14B PASS every demo risk of record has an AML-07 publication decision'; END IF;

  -- 15 question-plan / response coherence
  SELECT count(*) INTO n
    FROM public.supervisory_assessment_question_response r
    JOIN public.supervisory_assessment a ON a.id = r.assessment_id
   WHERE a.entity_id = ANY(ents)
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_question_plan q
                      WHERE q.assessment_id = r.assessment_id
                        AND q.question_id = r.methodology_question_id);
  IF n > 0 THEN fails := fails || format('INTEGRITY-15 demo response outside the assessment question plan: %s', n);
  ELSE RAISE NOTICE 'INTEGRITY-15 PASS every demo response belongs to its assessment question plan'; END IF;

  -- 16 audit trail exists for the demo governed operations
  SELECT count(*) INTO n
    FROM public.compliance_audit_logs
   WHERE object_id::text = ANY (SELECT id::text FROM public.supervisory_assessment WHERE entity_id = ANY(ents));
  IF n = 0 THEN fails := fails || 'INTEGRITY-16 no audit entries recorded for demo assessments';
  ELSE RAISE NOTICE 'INTEGRITY-16 PASS audit entries exist for demo assessments: %', n; END IF;

  -- 17 derived read model reconciles with the canonical tables
  metrics := public.aml_overview_metrics();
  SELECT count(*) INTO m
    FROM public.supervisory_domain_perimeter
   WHERE domain_code = 'AML_CFT' AND NOT is_applicable;
  IF (metrics->>'entities_outside_perimeter')::bigint <> m THEN
    fails := fails || format('INTEGRITY-17 overview metric entities_outside_perimeter %s <> canonical %s',
      metrics->>'entities_outside_perimeter', m);
  ELSE RAISE NOTICE 'INTEGRITY-17 PASS derived AML overview metrics reconcile with canonical tables'; END IF;

  -- 18 no live AML/CFT calculation policy was created or activated by the demo
  SELECT count(*) INTO n FROM public.supervisory_calculation_config;
  IF n > 0 THEN fails := fails || format('INTEGRITY-18 live calculation policy present: %s', n);
  ELSE RAISE NOTICE 'INTEGRITY-18 PASS no live AML/CFT calculation policy exists'; END IF;

  -- ---------------------------------------------------------------------------
  -- CURRENT-workflow additive scenarios
  -- (scripts/demo/seed-aml-demo-current-workflow.sql)
  -- ---------------------------------------------------------------------------

  -- CURRENT-01 the additive scenarios exist and belong to demo entities only
  SELECT count(*) INTO n FROM public.supervisory_assessment
   WHERE summary LIKE 'DEMO AML CURRENT%' AND NOT (entity_id = ANY(ents));
  IF n > 0 THEN fails := fails || format('CURRENT-01 additive scenario on a non-demo entity: %s', n);
  ELSE RAISE NOTICE 'CURRENT-01 PASS every additive scenario belongs to a demo entity'; END IF;

  -- CURRENT-02 every additive assessment carries a server-materialised question plan
  SELECT count(*) INTO n FROM public.supervisory_assessment a
   WHERE a.summary LIKE 'DEMO AML CURRENT%'
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_question_plan p
                      WHERE p.assessment_id = a.id);
  IF n > 0 THEN fails := fails || format('CURRENT-02 additive assessment without a question plan: %s', n);
  ELSE RAISE NOTICE 'CURRENT-02 PASS every additive assessment carries a governed question plan'; END IF;

  -- CURRENT-03 every additive response sits inside its own plan and in scope
  SELECT count(*) INTO n
    FROM public.supervisory_assessment_question_response r
    JOIN public.supervisory_assessment a ON a.id = r.assessment_id
   WHERE a.summary LIKE 'DEMO AML CURRENT%'
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_question_plan p
                      WHERE p.assessment_id = r.assessment_id
                        AND p.question_id = r.methodology_question_id
                        AND p.plan_state LIKE 'INCLUDED%');
  IF n > 0 THEN fails := fails || format('CURRENT-03 additive response outside the in-scope plan: %s', n);
  ELSE RAISE NOTICE 'CURRENT-03 PASS every additive response is in scope in its question plan'; END IF;

  -- CURRENT-04 review history: submitted / returned / resubmitted rounds exist
  SELECT count(DISTINCT a.id) INTO n
    FROM public.supervisory_assessment a
    JOIN public.supervisory_assessment_review_round rr ON rr.assessment_id = a.id
   WHERE a.summary LIKE 'DEMO AML CURRENT%';
  IF n = 0 THEN fails := fails || 'CURRENT-04 no additive assessment carries governed review history';
  ELSE RAISE NOTICE 'CURRENT-04 PASS additive assessments carry governed review rounds: %', n; END IF;

  SELECT count(*) INTO m FROM public.supervisory_assessment
   WHERE summary LIKE 'DEMO AML CURRENT%' AND status = 'returned_for_revision';
  IF m = 0 THEN fails := fails || 'CURRENT-04b no returned-for-revision additive scenario present';
  ELSE RAISE NOTICE 'CURRENT-04b PASS a returned-for-revision scenario is present: %', m; END IF;

  -- CURRENT-05 maker/checker separation on every recorded review outcome
  SELECT count(*) INTO n
    FROM public.supervisory_assessment_review_round rr
    JOIN public.supervisory_assessment a ON a.id = rr.assessment_id
   WHERE a.summary LIKE 'DEMO AML CURRENT%'
     AND rr.outcome_by IS NOT NULL AND rr.outcome_by = rr.submitted_by;
  IF n > 0 THEN fails := fails || format('CURRENT-05 self-reviewed additive review round: %s', n);
  ELSE RAISE NOTICE 'CURRENT-05 PASS no additive review round was decided by its own submitter'; END IF;

  -- CURRENT-06 the additive wave published no risk of record
  -- (approval and publication remain blocked: no live calculation policy, and the
  --  rating override operation refuses without a calculation run)
  SELECT count(*) INTO n
    FROM public.supervisory_assessment_risk_publication pub
    JOIN public.supervisory_assessment a ON a.id = pub.assessment_id
   WHERE a.summary LIKE 'DEMO AML CURRENT%';
  IF n > 0 THEN fails := fails || format('CURRENT-06 additive scenario published a risk of record without a calculation basis: %s', n);
  ELSE RAISE NOTICE 'CURRENT-06 PASS the additive wave published no risk of record (policy blocked)'; END IF;

  IF array_length(fails,1) > 0 THEN
    RAISE EXCEPTION E'DEMO AML DATA INTEGRITY FAILED:\n  %', array_to_string(fails, E'\n  ');
  END IF;
  RAISE NOTICE 'DEMO AML DATA INTEGRITY PASSED (INTEGRITY-00 … INTEGRITY-18, CURRENT-01 … CURRENT-06)';
END $$;

ROLLBACK;

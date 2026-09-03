-- =============================================================================
-- AML/CFT DEMONSTRATION / QA DATASET — VERIFICATION
--
-- Asserts that the 24 seeded cases are in the states the demonstration script
-- claims, that every record is governed provenance, and that the AML read
-- models the screens use reconcile with the underlying records.
--
-- Read-only: runs inside a transaction that is rolled back.
--
-- Run: psql "$SUPABASE_DB_URL" -X -q -f scripts/verify-aml-demo-dataset.sql
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET 1
\pset pager off
SET row_security = on;

\set OFF '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}'

BEGIN;

CREATE TEMP TABLE dset AS
SELECT l.id AS entity_id, l.name,
       (substring(l.name from 'DEMO AML ([0-9]+)'))::int AS case_no
  FROM public.licensees l WHERE l.name LIKE 'DEMO AML %';
GRANT ALL ON dset TO authenticated;

-- ---------------------------------------------------------------------------
-- D-01 — the dataset exists at its full size
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM dset;
  IF n <> 24 THEN RAISE EXCEPTION 'FAIL D-01: expected 24 demo entities, found %', n; END IF;
  IF EXISTS (SELECT 1 FROM dset GROUP BY case_no HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'FAIL D-01: duplicated demo case numbers (seed is not idempotent)'; END IF;
  RAISE NOTICE 'PASS D-01: 24 distinct AML/CFT demonstration cases are present';
END $$;

-- ---------------------------------------------------------------------------
-- D-02 — the perimeter case is the only entity outside the AML/CFT perimeter
-- ---------------------------------------------------------------------------
DO $$
DECLARE ent uuid;
BEGIN
  SELECT entity_id INTO ent FROM dset WHERE case_no = 21;
  IF public.supervisory_domain_applicable(ent,'AML_CFT') THEN
    RAISE EXCEPTION 'FAIL D-02: case 21 was not placed outside the perimeter'; END IF;
  IF EXISTS (SELECT 1 FROM dset d WHERE d.case_no <> 21
              AND NOT public.supervisory_domain_applicable(d.entity_id,'AML_CFT')) THEN
    RAISE EXCEPTION 'FAIL D-02: another demonstration entity is outside the perimeter'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_domain_perimeter p
              JOIN dset d ON d.entity_id = p.entity_id
             WHERE p.determined_by IS NULL OR coalesce(btrim(p.basis),'') = '') THEN
    RAISE EXCEPTION 'FAIL D-02: a perimeter determination is unattributed or unreasoned'; END IF;
  RAISE NOTICE 'PASS D-02: exactly one demonstration entity sits outside the perimeter, with a reasoned determination';
END $$;

-- ---------------------------------------------------------------------------
-- D-03 — assessment lifecycle coverage: never assessed, draft, submitted, approved
-- ---------------------------------------------------------------------------
DO $$
DECLARE s text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment a JOIN dset d ON d.entity_id = a.entity_id
              WHERE d.case_no IN (1,21)) THEN
    RAISE EXCEPTION 'FAIL D-03: an unassessed case carries an assessment'; END IF;

  SELECT a.status INTO s FROM public.supervisory_assessment a JOIN dset d ON d.entity_id = a.entity_id
    WHERE d.case_no = 2;
  IF s <> 'draft' THEN RAISE EXCEPTION 'FAIL D-03: case 2 should be draft, is %', s; END IF;

  SELECT a.status INTO s FROM public.supervisory_assessment a JOIN dset d ON d.entity_id = a.entity_id
    WHERE d.case_no = 3;
  IF s <> 'submitted' THEN RAISE EXCEPTION 'FAIL D-03: case 3 should be submitted, is %', s; END IF;

  IF (SELECT count(*) FROM public.supervisory_assessment a JOIN dset d ON d.entity_id = a.entity_id
       WHERE a.status = 'approved' AND a.is_current) < 19 THEN
    RAISE EXCEPTION 'FAIL D-03: too few current approved assessments for the deeper cases'; END IF;
  RAISE NOTICE 'PASS D-03: the assessment lifecycle is represented from unassessed to approved';
END $$;

-- ---------------------------------------------------------------------------
-- D-04 — every approved rating is the authoritative risk state, and only one
--         assessment per entity is current
-- ---------------------------------------------------------------------------
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad
    FROM public.entity_risk_state r JOIN dset d ON d.entity_id = r.entity_id
   WHERE r.domain_code = 'AML_CFT'
     AND (r.driving_assessment_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.supervisory_assessment a
                       WHERE a.id = r.driving_assessment_id AND a.status = 'approved' AND a.is_current));
  IF bad > 0 THEN
    RAISE EXCEPTION 'FAIL D-04: % risk states are not driven by a current approved assessment', bad; END IF;

  IF EXISTS (SELECT 1 FROM public.supervisory_assessment a JOIN dset d ON d.entity_id = a.entity_id
              WHERE a.is_current AND a.domain_code = 'AML_CFT'
              GROUP BY a.entity_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'FAIL D-04: an entity has two current AML/CFT assessments'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.entity_risk_state r JOIN dset d ON d.entity_id = r.entity_id
                  WHERE r.domain_code='AML_CFT' AND upper(r.residual_rating)='LOW')
     OR NOT EXISTS (SELECT 1 FROM public.entity_risk_state r JOIN dset d ON d.entity_id = r.entity_id
                  WHERE r.domain_code='AML_CFT' AND upper(r.residual_rating)='MODERATE')
     OR NOT EXISTS (SELECT 1 FROM public.entity_risk_state r JOIN dset d ON d.entity_id = r.entity_id
                  WHERE r.domain_code='AML_CFT' AND upper(r.residual_rating)='HIGH') THEN
    RAISE EXCEPTION 'FAIL D-04: the dataset does not cover LOW, MODERATE and HIGH residual ratings'; END IF;
  RAISE NOTICE 'PASS D-04: authoritative AML/CFT risk states cover LOW, MODERATE and HIGH and are singular';
END $$;

-- ---------------------------------------------------------------------------
-- D-05 — a deteriorating case and an improving case each carry a recorded movement
-- ---------------------------------------------------------------------------
DO $$
DECLARE m record;
BEGIN
  SELECT * INTO m FROM public.entity_risk_state_movement mv
    JOIN dset d ON d.entity_id = mv.entity_id
   WHERE d.case_no = 7 AND mv.domain_code = 'AML_CFT'
     AND upper(coalesce(mv.previous_rating,'')) = 'MODERATE' AND upper(coalesce(mv.new_rating,'')) = 'HIGH';
  IF m IS NULL THEN RAISE EXCEPTION 'FAIL D-05: the deteriorating case has no MODERATE -> HIGH movement'; END IF;

  SELECT * INTO m FROM public.entity_risk_state_movement mv
    JOIN dset d ON d.entity_id = mv.entity_id
   WHERE d.case_no = 20 AND mv.domain_code = 'AML_CFT'
     AND upper(coalesce(mv.previous_rating,'')) = 'HIGH' AND upper(coalesce(mv.new_rating,'')) = 'MODERATE';
  IF m IS NULL THEN RAISE EXCEPTION 'FAIL D-05: the completed loop has no HIGH -> MODERATE movement'; END IF;
  RAISE NOTICE 'PASS D-05: risk movements are recorded in both directions with provenance';
END $$;

-- ---------------------------------------------------------------------------
-- D-06 — every examination is governed, scoped from its assessment and
--         opened only from an endorsed intervention
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.examinations e JOIN dset d ON d.entity_id = e.entity_id;
  IF n < 13 THEN RAISE EXCEPTION 'FAIL D-06: expected at least 13 demo examinations, found %', n; END IF;

  IF EXISTS (SELECT 1 FROM public.examinations e JOIN dset d ON d.entity_id = e.entity_id
              WHERE e.origin_provenance <> 'GOVERNED' OR e.intervention_id IS NULL OR e.plan_id IS NULL) THEN
    RAISE EXCEPTION 'FAIL D-06: an examination is ungoverned or detached from its intervention and plan'; END IF;

  IF EXISTS (SELECT 1 FROM public.examinations e JOIN dset d ON d.entity_id = e.entity_id
              WHERE NOT EXISTS (SELECT 1 FROM public.examination_scope_dimension s WHERE s.examination_id = e.id)) THEN
    RAISE EXCEPTION 'FAIL D-06: an examination has no assessment-derived scope'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.examination_scope_area a
                  JOIN public.examinations e ON e.id = a.examination_id
                  JOIN dset d ON d.entity_id = e.entity_id
                 WHERE a.source = 'EXAMINER_AMENDED' AND coalesce(a.amendment_rationale,'') <> '') THEN
    RAISE EXCEPTION 'FAIL D-06: no examiner-amended scope area with a rationale'; END IF;
  RAISE NOTICE 'PASS D-06: % examinations are governed, scoped and traceable', n;
END $$;

-- ---------------------------------------------------------------------------
-- D-07 — a joint engagement records both domains as its origin
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(DISTINCT a.domain_code) INTO n
    FROM public.examination_origin o
    JOIN public.examinations e ON e.id = o.examination_id
    JOIN dset d ON d.entity_id = e.entity_id
    JOIN public.supervisory_assessment a ON a.id = o.assessment_id
   WHERE d.case_no = 22;
  IF n < 2 THEN
    RAISE EXCEPTION 'FAIL D-07: the joint examination records % originating domain(s)', n; END IF;
  RAISE NOTICE 'PASS D-07: the joint AML/CFT and prudential engagement carries both origins';
END $$;

-- ---------------------------------------------------------------------------
-- D-08 — an overdue information request exists and is honest about it
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.examination_data_requests r
                  JOIN public.examinations e ON e.id = r.examination_id
                  JOIN dset d ON d.entity_id = e.entity_id
                 WHERE d.case_no = 13 AND r.issued_at IS NOT NULL
                   AND r.received_at IS NULL AND r.due_date < current_date) THEN
    RAISE EXCEPTION 'FAIL D-08: no overdue outstanding information request in the overdue case'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.examination_data_requests r
                  JOIN public.examinations e ON e.id = r.examination_id
                  JOIN dset d ON d.entity_id = e.entity_id
                 WHERE r.outstanding_items IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL D-08: no partially received request records what is still outstanding'; END IF;
  RAISE NOTICE 'PASS D-08: information requests include an overdue case and a partial receipt';
END $$;

-- ---------------------------------------------------------------------------
-- D-09 — every workpaper carries population, sample, exceptions and a conclusion
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.examination_workpapers w
    JOIN public.examinations e ON e.id = w.examination_id
    JOIN dset d ON d.entity_id = e.entity_id;
  IF n < 12 THEN RAISE EXCEPTION 'FAIL D-09: expected at least 12 workpapers, found %', n; END IF;
  IF EXISTS (SELECT 1 FROM public.examination_workpapers w
              JOIN public.examinations e ON e.id = w.examination_id
              JOIN dset d ON d.entity_id = e.entity_id
             WHERE w.population_size IS NULL OR w.sample_size IS NULL
                OR w.exceptions_count IS NULL OR coalesce(w.conclusion,'') = ''
                OR w.assessment_dimension_id IS NULL) THEN
    RAISE EXCEPTION 'FAIL D-09: a workpaper is narrative rather than evidence'; END IF;
  RAISE NOTICE 'PASS D-09: % workpapers carry testing evidence tied to a risk dimension', n;
END $$;

-- ---------------------------------------------------------------------------
-- D-10 — every finding carries the whole backward provenance chain
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.supervisory_finding f JOIN dset d ON d.entity_id = f.entity_id;
  IF n < 9 THEN RAISE EXCEPTION 'FAIL D-10: expected at least 9 demo findings, found %', n; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_finding f JOIN dset d ON d.entity_id = f.entity_id
              WHERE f.origin_provenance <> 'GOVERNED' OR f.source_kind <> 'EXAMINATION'
                 OR f.workpaper_id IS NULL OR f.examination_id IS NULL OR f.assessment_id IS NULL
                 OR f.assessment_dimension_id IS NULL OR f.intervention_id IS NULL
                 OR f.plan_id IS NULL OR f.attention_id IS NULL) THEN
    RAISE EXCEPTION 'FAIL D-10: a finding does not carry the whole supervisory chain'; END IF;
  RAISE NOTICE 'PASS D-10: % findings trace back to workpaper, examination, intervention, plan, attention and dimension', n;
END $$;

-- ---------------------------------------------------------------------------
-- D-11 — the finding lifecycle is represented, and every recorded response
--         states how it was received
-- ---------------------------------------------------------------------------
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(x, ', ') INTO missing FROM (
    SELECT x FROM unnest(ARRAY['ISSUED','MANAGEMENT_RESPONSE','REMEDIATION_REQUIRED','VALIDATION','CLOSED']) AS x
    WHERE NOT EXISTS (SELECT 1 FROM public.supervisory_finding f JOIN dset d ON d.entity_id = f.entity_id
                       WHERE f.status = x)) t;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL D-11: finding states not represented in the dataset: %', missing; END IF;

  IF EXISTS (SELECT 1 FROM public.supervisory_finding f JOIN dset d ON d.entity_id = f.entity_id
              WHERE f.response_source = 'OFFICER_RECORDED'
                AND (f.response_received_from IS NULL OR f.response_received_date IS NULL
                     OR f.response_channel IS NULL OR f.response_recorded_at IS NULL)) THEN
    RAISE EXCEPTION 'FAIL D-11: an officer-recorded response lacks receipt provenance'; END IF;
  RAISE NOTICE 'PASS D-11: the finding lifecycle is fully represented with receipt provenance';
END $$;

-- ---------------------------------------------------------------------------
-- D-12 — remediation states cover the whole lifecycle, and effectiveness is
--         only ever the conclusion of a governed validation
-- ---------------------------------------------------------------------------
DO $$
DECLARE missing text; n int;
BEGIN
  SELECT string_agg(x, ', ') INTO missing FROM (
    SELECT x FROM unnest(ARRAY['ACTION_PLAN_SUBMITTED','IMPLEMENTING','EVIDENCE_SUBMITTED','VALIDATION',
                               'EFFECTIVE','PARTIALLY_EFFECTIVE','INEFFECTIVE','CLOSED']) AS x
    WHERE NOT EXISTS (SELECT 1 FROM public.supervisory_remediation_action ra
                       JOIN public.supervisory_finding f ON f.id = ra.finding_id
                       JOIN dset d ON d.entity_id = f.entity_id
                      WHERE ra.status = x)) t;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL D-12: remediation states not represented: %', missing; END IF;

  SELECT count(*) INTO n FROM public.supervisory_remediation_action ra
    JOIN public.supervisory_finding f ON f.id = ra.finding_id
    JOIN dset d ON d.entity_id = f.entity_id
   WHERE ra.status IN ('EFFECTIVE','PARTIALLY_EFFECTIVE','INEFFECTIVE','CLOSED')
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_remediation_validation v WHERE v.action_id = ra.id);
  IF n > 0 THEN
    RAISE EXCEPTION 'FAIL D-12: % concluded actions have no governed validation record', n; END IF;
  RAISE NOTICE 'PASS D-12: the remediation lifecycle is complete and every conclusion is validated';
END $$;

-- ---------------------------------------------------------------------------
-- D-13 — a partially effective action closes only on an accepted residual
--         deficiency, decided by someone other than the validator
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM public.supervisory_residual_acceptance ra
    JOIN public.supervisory_finding f ON f.id = ra.finding_id
    JOIN dset d ON d.entity_id = f.entity_id
   WHERE ra.accepted_by IS NOT NULL AND coalesce(ra.residual_materiality,'') <> '';
  IF n < 1 THEN RAISE EXCEPTION 'FAIL D-13: no attributed, graded residual acceptance in the dataset'; END IF;

  IF EXISTS (SELECT 1 FROM public.supervisory_remediation_action a
              JOIN public.supervisory_finding f ON f.id = a.finding_id
              JOIN dset d ON d.entity_id = f.entity_id
             WHERE a.status = 'CLOSED'
               AND EXISTS (SELECT 1 FROM public.supervisory_remediation_validation v
                            WHERE v.action_id = a.id AND v.conclusion = 'PARTIALLY_EFFECTIVE')
               AND NOT EXISTS (SELECT 1 FROM public.supervisory_residual_acceptance r WHERE r.action_id = a.id)) THEN
    RAISE EXCEPTION 'FAIL D-13: a partially effective action closed without a residual decision'; END IF;
  RAISE NOTICE 'PASS D-13: residual deficiencies are decided explicitly before closure';
END $$;

-- ---------------------------------------------------------------------------
-- D-14 — escalation and enforcement referral are separate supervisory decisions
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.supervisory_remediation_action ra
    JOIN public.supervisory_finding f ON f.id = ra.finding_id
    JOIN dset d ON d.entity_id = f.entity_id
   WHERE ra.escalated_attention_id IS NOT NULL;
  IF n < 1 THEN RAISE EXCEPTION 'FAIL D-14: no escalated corrective action in the dataset'; END IF;

  SELECT count(*) INTO n FROM public.enforcement_actions ea JOIN dset d ON d.entity_id = ea.entity_id;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL D-14: expected exactly one enforcement referral, found %', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.enforcement_actions ea JOIN dset d ON d.entity_id = ea.entity_id
                  WHERE ea.supervisory_finding_id IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL D-14: the enforcement referral lost its finding provenance'; END IF;
  RAISE NOTICE 'PASS D-14: escalation never creates enforcement, and the one referral is fully provenanced';
END $$;

-- ---------------------------------------------------------------------------
-- D-15 — closure demands a reassessment, and the completed loop fulfils it
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.supervisory_reassessment_requirement rr JOIN dset d ON d.entity_id = rr.entity_id;
  IF n < 2 THEN RAISE EXCEPTION 'FAIL D-15: expected reassessment requirements for both closed loops, found %', n; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_reassessment_requirement rr JOIN dset d ON d.entity_id = rr.entity_id
              WHERE rr.finding_id IS NULL OR rr.examination_id IS NULL OR rr.trigger_kind IS NULL) THEN
    RAISE EXCEPTION 'FAIL D-15: a reassessment requirement lost its causal provenance'; END IF;
  RAISE NOTICE 'PASS D-15: closure mandates a reassessment, with the reason and cause recorded';
END $$;

-- ---------------------------------------------------------------------------
-- D-16 — the AML read models the screens use reconcile with the records
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'OFF';
DO $$
DECLARE m jsonb; expect int; got int;
BEGIN
  m := public.aml_overview_metrics();

  SELECT count(*) INTO expect FROM public.entity_risk_state r
    JOIN dset d ON d.entity_id = r.entity_id
   WHERE r.domain_code='AML_CFT' AND upper(r.residual_rating) = 'HIGH';
  IF (m->>'high_risk_entities')::int < expect THEN
    RAISE EXCEPTION 'FAIL D-16: the overview reports fewer HIGH risk entities (%) than the dataset holds (%)',
      m->>'high_risk_entities', expect; END IF;

  IF (m->>'entities_outside_perimeter')::int < 1 THEN
    RAISE EXCEPTION 'FAIL D-16: the overview does not report the out-of-perimeter entity'; END IF;

  SELECT count(*) INTO got FROM public.aml_portfolio(500) p
   WHERE p.entity_id = (SELECT entity_id FROM dset WHERE case_no = 21);
  IF got <> 0 THEN
    RAISE EXCEPTION 'FAIL D-16: the out-of-perimeter entity appears in the AML portfolio'; END IF;

  SELECT count(*) INTO got FROM public.aml_portfolio(500) p JOIN dset d ON d.entity_id = p.entity_id;
  IF got < 23 THEN
    RAISE EXCEPTION 'FAIL D-16: only % of the 23 in-perimeter demo entities appear in the portfolio', got; END IF;
  RAISE NOTICE 'PASS D-16: the AML overview and portfolio read models reconcile with the dataset';
END $$;

-- ---------------------------------------------------------------------------
-- D-17 — Entity 360 supervisory state resolves for a deep case
-- ---------------------------------------------------------------------------
DO $$
DECLARE j jsonb; ent uuid;
BEGIN
  SELECT entity_id INTO ent FROM dset WHERE case_no = 20;
  j := public.entity_supervisory_360(ent);
  IF j IS NULL OR j = 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL D-17: Entity 360 returned nothing for the completed loop'; END IF;
  RAISE NOTICE 'PASS D-17: Entity 360 resolves the supervisory state of the completed loop';
END $$;

-- ---------------------------------------------------------------------------
-- D-18 — every governed operation left an audit trail on the demo records
-- ---------------------------------------------------------------------------
RESET ROLE;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.compliance_audit_logs c
   WHERE c.object_type LIKE 'supervisory_%'
     AND c.object_id::text IN (
       SELECT a.id::text FROM public.supervisory_assessment a JOIN dset d ON d.entity_id = a.entity_id
       UNION SELECT f.id::text FROM public.supervisory_finding f JOIN dset d ON d.entity_id = f.entity_id);
  IF n < 20 THEN
    RAISE EXCEPTION 'FAIL D-18: only % audit entries for the demo assessments and findings', n; END IF;
  RAISE NOTICE 'PASS D-18: % compliance audit entries evidence the governed operations', n;
END $$;

ROLLBACK;

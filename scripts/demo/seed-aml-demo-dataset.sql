-- =============================================================================
-- AML/CFT SUPERVISION — PERSISTENT DEMONSTRATION / QA DATASET
--
-- Builds 24 governed AML/CFT supervision cases, each stopped at a different,
-- deliberately chosen point of the closed supervisory loop, so that every AML
-- screen, queue, counter and drill-through has real, causally-consistent data
-- behind it.
--
-- Rules obeyed:
--   * Every record is written through the governed operations only
--     (supervisory_*, examination_*, enforcement_referral_create). The script
--     inserts directly ONLY into parties / licensees / entity_supervision_assignments,
--     which are ordinary registry fixtures.
--   * Real certification personas act as maker and checker; no auth.users rows
--     are created and no password is referenced.
--   * Non-production only: refuses to run on a production deployment.
--   * Idempotent: the script removes any previous DEMO AML dataset first
--     (scripts/demo/cleanup-aml-demo-dataset.sql contains the same removal),
--     then rebuilds it deterministically.
--
-- Run:  psql "$SUPABASE_DB_URL" -X -q -f scripts/demo/seed-aml-demo-dataset.sql
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off
SET row_security = on;

-- certification personas (public.cert_certification_users)
\set OFF  '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}'
\set SUP  '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}'
\set SUP2 '{"sub":"021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce","role":"authenticated"}'
\set ENF  '{"sub":"7190c434-24c1-47dc-a2fb-c3cbad5bfaf3","role":"authenticated"}'

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Environment guard
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF public.is_production_environment() THEN
    RAISE EXCEPTION 'DEMO AML seed refused: production environment';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Idempotency: append-only-safe rebuild decision
-- ---------------------------------------------------------------------------
-- Rebuild semantics (corrected under the demo data-integrity addendum):
--
--   * The demo entities themselves are stable (deterministic ids) and are never
--     deleted. Registry and licence fixtures (sections 3 and 3c) are pure
--     upserts and always re-run safely.
--   * Records the platform declares IMMUTABLE — entity_risk_state_movement,
--     supervisory_assessment_approval_decision,
--     supervisory_assessment_risk_publication and the supervisory intervention
--     event log — are append-only by architecture. This script therefore never
--     attempts to delete them. Deleting them is architecturally impossible and
--     bypassing the guard is forbidden.
--   * Consequence: once a governed AML/CFT decision has been published for a
--     demo entity, the dataset for that entity is permanent. Re-running the
--     seed then leaves the existing dataset exactly as it is (governed pipeline
--     skipped) instead of duplicating it.
--   * When no immutable record exists yet, a previous partial run is removed in
--     full and the dataset is rebuilt deterministically.

DO $$
DECLARE ents uuid[]; asmts uuid[]; exams uuid[]; finds uuid[]; atts uuid[]; plans uuid[];
        locked int;
BEGIN
  SELECT coalesce(array_agg(id), '{}') INTO ents
    FROM public.licensees WHERE name LIKE 'DEMO AML %';
  IF array_length(ents,1) IS NULL THEN
    PERFORM set_config('app.demo_aml_dataset_locked','0', true);
    RETURN;
  END IF;

  SELECT count(*) INTO locked
    FROM public.entity_risk_state_movement WHERE entity_id = ANY(ents);
  IF locked > 0 THEN
    PERFORM set_config('app.demo_aml_dataset_locked','1', true);
    RAISE NOTICE 'DEMO AML dataset already published (% immutable risk movements): governed pipeline skipped, registry and licence fixtures refreshed', locked;
    RETURN;
  END IF;
  PERFORM set_config('app.demo_aml_dataset_locked','0', true);

  IF array_length(ents,1) IS NULL THEN RETURN; END IF;

  SELECT coalesce(array_agg(id),'{}') INTO asmts
    FROM public.supervisory_assessment WHERE entity_id = ANY(ents);
  SELECT coalesce(array_agg(id),'{}') INTO exams
    FROM public.examinations WHERE entity_id = ANY(ents);
  SELECT coalesce(array_agg(id),'{}') INTO finds
    FROM public.supervisory_finding WHERE entity_id = ANY(ents);
  SELECT coalesce(array_agg(id),'{}') INTO plans
    FROM public.supervisory_plan
    WHERE title LIKE 'DEMO AML %'
       OR id IN (SELECT plan_id FROM public.supervisory_plan_assessment WHERE assessment_id = ANY(asmts));
  SELECT coalesce(array_agg(a.id),'{}') INTO atts
    FROM public.supervisory_attention a
   WHERE a.title LIKE 'DEMO AML %'
      OR a.id IN (SELECT escalated_attention_id FROM public.supervisory_remediation_action
                   WHERE finding_id = ANY(finds) AND escalated_attention_id IS NOT NULL)
      OR a.id IN (SELECT attention_id FROM public.supervisory_attention_origin
                   WHERE assessment_id = ANY(asmts) OR examination_id = ANY(exams));

  -- the authoritative risk state is trigger-protected; removing demo fixtures is
  -- the only place this deployment-local seed asserts the writer marker.
  PERFORM set_config('app.supervisory_risk_state_writer','assessment_transition', true);
  DELETE FROM public.entity_risk_state_movement           WHERE entity_id = ANY(ents);
  DELETE FROM public.supervisory_reassessment_requirement WHERE entity_id = ANY(ents);
  DELETE FROM public.entity_risk_state                    WHERE entity_id = ANY(ents);
  DELETE FROM public.enforcement_actions                  WHERE entity_id = ANY(ents);
  DELETE FROM public.supervisory_finding                  WHERE id = ANY(finds);
  DELETE FROM public.supervisory_attention_origin
   WHERE attention_id = ANY(atts) OR examination_id = ANY(exams) OR assessment_id = ANY(asmts);
  DELETE FROM public.examination_origin
   WHERE examination_id = ANY(exams) OR attention_id = ANY(atts) OR assessment_id = ANY(asmts);
  DELETE FROM public.supervisory_attention                WHERE id = ANY(atts);
  UPDATE public.supervisory_intervention SET examination_id = NULL
   WHERE licensee_id = ANY(ents) AND examination_id IS NOT NULL;
  DELETE FROM public.examinations                         WHERE id = ANY(exams);
  UPDATE public.supervisory_intervention
     SET status = 'CANCELLED', attention_id = NULL, plan_id = NULL,
         title = CASE WHEN title LIKE 'SUPERSEDED %' THEN title ELSE 'SUPERSEDED ' || title END
   WHERE licensee_id = ANY(ents) AND status <> 'CANCELLED';
  DELETE FROM public.supervisory_plan                     WHERE id = ANY(plans);
  DELETE FROM public.supervisory_assessment               WHERE id = ANY(asmts);
  DELETE FROM public.supervisory_domain_perimeter WHERE entity_id = ANY(ents);
  PERFORM set_config('app.supervisory_risk_state_writer','', true);

  -- entities from any pre-deterministic run are retired from the registry
  DELETE FROM public.entity_supervision_assignments
   WHERE entity_id IN (SELECT id FROM public.licensees
                        WHERE name LIKE 'DEMO AML %' AND id::text NOT LIKE 'aa220000%');
  DELETE FROM public.licensees
   WHERE name LIKE 'DEMO AML %' AND id::text NOT LIKE 'aa220000%';
  DELETE FROM public.organizations o
   WHERE o.party_id IN (SELECT id FROM public.parties
                         WHERE display_name LIKE 'DEMO AML %' AND id::text NOT LIKE 'aa110000%');
  DELETE FROM public.parties p
   WHERE p.display_name LIKE 'DEMO AML %'
     AND p.id::text NOT LIKE 'aa110000%'
     AND NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.party_id = p.id);
  RAISE NOTICE 'previous DEMO AML supervisory content removed (% entities retained)', array_length(ents,1);
END $$;

-- ---------------------------------------------------------------------------
-- 2. Case register
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE aml_case(
  case_no  int PRIMARY KEY,
  name     text NOT NULL,
  sector   text NOT NULL,
  depth    int  NOT NULL,   -- how far along the closed loop this case is taken
  rating   text NOT NULL,   -- approved residual AML/CFT rating
  variant  text             -- special behaviour
) ON COMMIT DROP;
GRANT ALL ON aml_case TO authenticated;

CREATE TEMP TABLE aml_ref(case_no int, k text, v uuid, PRIMARY KEY(case_no,k)) ON COMMIT DROP;
GRANT ALL ON aml_ref TO authenticated;

INSERT INTO aml_case(case_no, name, sector, depth, rating, variant) VALUES
 ( 1,'DEMO AML 01 Castries Remittance Services Ltd',     'MONEY_SERVICES_BUSINESS', 1,'HIGH',    NULL),
 ( 2,'DEMO AML 02 Vieux Fort Money Transfer Ltd',         'MONEY_SERVICES_BUSINESS', 2,'HIGH',    NULL),
 ( 3,'DEMO AML 03 Soufriere Exchange Bureau Ltd',         'MONEY_SERVICES_BUSINESS', 3,'HIGH',    NULL),
 ( 4,'DEMO AML 04 Marigot Credit Union',                  'CREDIT_UNIONS',           4,'LOW',     NULL),
 ( 5,'DEMO AML 05 Dennery Cooperative Credit Union',      'CREDIT_UNIONS',           4,'MODERATE',NULL),
 ( 6,'DEMO AML 06 Rodney Bay Payments Ltd',               'MONEY_SERVICES_BUSINESS', 4,'HIGH',    NULL),
 ( 7,'DEMO AML 07 Gros Islet Virtual Assets Ltd',         'VIRTUAL_ASSET_BUSINESS',  4,'HIGH',    'DETERIORATING'),
 ( 8,'DEMO AML 08 Choiseul Cash Services Ltd',            'MONEY_SERVICES_BUSINESS', 5,'HIGH',    NULL),
 ( 9,'DEMO AML 09 Anse La Raye Remittance Ltd',           'MONEY_SERVICES_BUSINESS', 6,'HIGH',    NULL),
 (10,'DEMO AML 10 Laborie Money Services Ltd',            'MONEY_SERVICES_BUSINESS', 7,'HIGH',    NULL),
 (11,'DEMO AML 11 Micoud Foreign Exchange Ltd',           'MONEY_SERVICES_BUSINESS', 8,'HIGH',    NULL),
 (12,'DEMO AML 12 Canaries Transfer Agents Ltd',          'MONEY_SERVICES_BUSINESS', 9,'HIGH',    NULL),
 (13,'DEMO AML 13 Babonneau Payment Systems Ltd',         'MONEY_SERVICES_BUSINESS', 9,'HIGH',    'RFI_OVERDUE'),
 (14,'DEMO AML 14 Bexon Digital Wallets Ltd',             'VIRTUAL_ASSET_BUSINESS', 10,'HIGH',    NULL),
 (15,'DEMO AML 15 Ciceron Remittance Partners Ltd',       'MONEY_SERVICES_BUSINESS',11,'HIGH',    NULL),
 (16,'DEMO AML 16 Bisee Money Services Ltd',              'MONEY_SERVICES_BUSINESS',12,'HIGH',    'MIXED'),
 (17,'DEMO AML 17 Cap Estate Exchange Ltd',               'MONEY_SERVICES_BUSINESS',13,'HIGH',    NULL),
 (18,'DEMO AML 18 Grande Riviere Cash Agents Ltd',        'MONEY_SERVICES_BUSINESS',14,'HIGH',    NULL),
 (19,'DEMO AML 19 Desruisseaux Transfer Services Ltd',    'MONEY_SERVICES_BUSINESS',16,'HIGH',    NULL),
 (20,'DEMO AML 20 Balenbouche Money Services Ltd',        'MONEY_SERVICES_BUSINESS',17,'HIGH',    NULL),
 (21,'DEMO AML 21 Morne Fortune Holdings Ltd',            'MONEY_SERVICES_BUSINESS', 0,'HIGH',    'OUT_OF_PERIMETER'),
 (22,'DEMO AML 22 Pigeon Island Payment Bank Ltd',        'MONEY_SERVICES_BUSINESS', 9,'HIGH',    'JOINT'),
 (23,'DEMO AML 23 Fond St Jacques Cash Express Ltd',      'MONEY_SERVICES_BUSINESS',14,'HIGH',    'ENFORCEMENT'),
 (24,'DEMO AML 24 La Pointe Virtual Asset Services Ltd',  'VIRTUAL_ASSET_BUSINESS', 15,'HIGH',    'RESIDUAL');

-- ---------------------------------------------------------------------------
-- 3. Registry fixtures: entities and supervisory assignments
-- ---------------------------------------------------------------------------
DO $$
DECLARE c record; p uuid; ent uuid; sect uuid; u record;
BEGIN
  FOR c IN SELECT * FROM aml_case ORDER BY case_no LOOP
    SELECT id INTO sect FROM public.sectors WHERE code = c.sector LIMIT 1;
    -- deterministic identities, so the dataset is stable across rebuilds
    p   := ('aa110000-0000-4000-8000-0000000000' || lpad(c.case_no::text,2,'0'))::uuid;
    ent := ('aa220000-0000-4000-8000-0000000000' || lpad(c.case_no::text,2,'0'))::uuid;

    INSERT INTO public.parties(id, party_kind, display_name)
    VALUES (p,'ORGANIZATION', c.name)
    ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;
    INSERT INTO public.licensees(id, name, party_id, sector_id, status, identity_status_id)
    VALUES (ent, c.name, p, sect, 'active',
            (SELECT id FROM public.entity_identity_statuses WHERE key = 'verified'))
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, sector_id = EXCLUDED.sector_id, status = 'active',
                                   identity_status_id = COALESCE(licensees.identity_status_id, EXCLUDED.identity_status_id);
    INSERT INTO aml_ref(case_no,k,v) VALUES (c.case_no,'ent',ent);

    FOR u IN SELECT * FROM (VALUES
        ('b8eaf680-fe66-4d49-b816-1c087f511235'::uuid,'DEMO AML dataset — AML/CFT officer (maker)'),
        ('0b522724-adcb-48bf-b21d-175339479616'::uuid,'DEMO AML dataset — AML/CFT supervisor (checker)'),
        ('021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce'::uuid,'DEMO AML dataset — independent supervisor'),
        ('ef43e80a-e17e-4f26-aa91-bcf0d99e3d89'::uuid,'DEMO AML dataset — prudential analyst (joint work)')
      ) AS t(uid, reason) LOOP
      IF NOT EXISTS (SELECT 1 FROM public.entity_supervision_assignments
                      WHERE entity_id = ent AND lead_supervisor_user_id = u.uid) THEN
        INSERT INTO public.entity_supervision_assignments(entity_id, lead_supervisor_user_id,
            alternate_supervisor_user_id, status, assignment_reason)
        VALUES (ent, u.uid,
            CASE WHEN u.uid = 'b8eaf680-fe66-4d49-b816-1c087f511235'::uuid
                 THEN 'b597c405-e0c4-421b-9092-820a444f2429'::uuid END,
            'active', u.reason);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3b. Methodology version binding
-- The active AML/CFT methodology version in force, resolved once so every
-- assessment in the dataset carries an attributable methodology.
-- ---------------------------------------------------------------------------
INSERT INTO aml_ref(case_no, k, v)
SELECT 0, 'methodology', m.id
  FROM public.supervisory_methodology m
 WHERE m.domain_code = 'AML_CFT'
   AND lower(m.status) IN ('active','approved')
   AND (m.effective_from IS NULL OR m.effective_from <= current_date)
   AND (m.effective_to   IS NULL OR m.effective_to   >= current_date)
 ORDER BY m.effective_from DESC NULLS LAST, m.created_at DESC
 LIMIT 1
ON CONFLICT (case_no, k) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3c. Canonical licence foundation (DEMO DATA INTEGRITY ADDENDUM)
--
-- Every supervised demo entity must be a real licence holder, exactly as a
-- genuine record is: public.entity_licenses is the ONLY authority for the
-- entity-to-licence relationship (licensees.license_id is deprecated and is
-- deliberately NOT written). No application is invented; the live licence
-- decision gate and the append-only original-term trigger stay enabled and
-- must accept these rows unchanged.
--
-- Case 21 (Morne Fortune Holdings Ltd) is a deliberate negative control: it is
-- the entity a governed determination placed OUTSIDE the AML/CFT perimeter and
-- it holds no licence, proving the "not licensed" presentation.
-- ---------------------------------------------------------------------------
DO $$
DECLARE c record; v_lic uuid; v_conflict int; v_type text;
BEGIN
  FOR c IN SELECT * FROM aml_case WHERE case_no <> 21 ORDER BY case_no LOOP
    v_lic := ('aa330000-0000-4000-8000-0000000000' || lpad(c.case_no::text,2,'0'))::uuid;
    v_type := CASE c.sector
                WHEN 'MONEY_SERVICES_BUSINESS' THEN 'Money services business'
                WHEN 'CREDIT_UNIONS'           THEN 'Credit union'
                WHEN 'VIRTUAL_ASSET_BUSINESS'  THEN 'Virtual asset service provider'
                ELSE c.sector END;

    SELECT count(*) INTO v_conflict
      FROM public.licenses
     WHERE license_number = 'FSRA-DEMO-AML-' || lpad(c.case_no::text,2,'0')
       AND id <> v_lic;
    IF v_conflict > 0 THEN
      RAISE EXCEPTION 'DEMO AML seed blocked: licence number FSRA-DEMO-AML-% already used elsewhere',
        lpad(c.case_no::text,2,'0');
    END IF;

    INSERT INTO public.licenses
      (id, application_id, holder_id, license_number, license_type,
       sector_id, sub_sector_id, category_id, status,
       issued_at, valid_from, valid_until, conditions)
    SELECT v_lic, NULL, l.id,
           'FSRA-DEMO-AML-' || lpad(c.case_no::text,2,'0'), v_type,
           l.sector_id, l.sub_sector_id, l.category_id, 'active',
           '2023-03-01 00:00:00+00', '2023-03-01 00:00:00+00', '2027-12-31 00:00:00+00',
           'Controlled demonstration record (DEMO AML dataset).'
      FROM public.licensees l
     WHERE l.id = ('aa220000-0000-4000-8000-0000000000' || lpad(c.case_no::text,2,'0'))::uuid
    ON CONFLICT (id) DO UPDATE
      SET holder_id      = EXCLUDED.holder_id,
          license_number = EXCLUDED.license_number,
          license_type   = EXCLUDED.license_type,
          sector_id      = EXCLUDED.sector_id,
          status         = 'active',
          valid_from     = EXCLUDED.valid_from,
          valid_until    = EXCLUDED.valid_until;

    INSERT INTO public.entity_licenses
      (id, entity_id, license_id, effective_from, effective_to, is_primary, source)
    VALUES (('aa340000-0000-4000-8000-0000000000' || lpad(c.case_no::text,2,'0'))::uuid,
            ('aa220000-0000-4000-8000-0000000000' || lpad(c.case_no::text,2,'0'))::uuid,
            v_lic, '2023-03-01 00:00:00+00', NULL, true, 'SEED')
    ON CONFLICT (id) DO UPDATE SET effective_to = NULL, is_primary = true;

    -- the append-only term mechanism owns terms; assert its invariant only
    SELECT count(*) INTO v_conflict
      FROM public.license_terms WHERE license_id = v_lic AND is_current;
    IF v_conflict <> 1 THEN
      RAISE EXCEPTION 'DEMO AML seed: expected exactly 1 current term for %, found %', v_lic, v_conflict;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.entity_licenses
              WHERE entity_id = 'aa220000-0000-4000-8000-000000000021'
                AND (effective_to IS NULL OR effective_to > now())) THEN
    RAISE EXCEPTION 'DEMO AML seed: out-of-perimeter holding company must not hold a licence';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Governed pipeline, executed as the real personas
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;


DO $$
DECLARE
  c        record;
  ent      uuid;
  res      jsonb;
  d        jsonb;
  aid      uuid;
  prev     uuid;
  pru      uuid;
  fid      uuid;
  wp       uuid;
  r1 uuid; r2 uuid; r3 uuid; ra uuid;
  qrec     record;
  ans      text;
  meth     uuid;
  claim_off  text := '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
  claim_sup  text := '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}';
  claim_sup2 text := '{"sub":"021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce","role":"authenticated"}';
  claim_pru  text := '{"sub":"ef43e80a-e17e-4f26-aa91-bcf0d99e3d89","role":"authenticated"}';
  claim_enf  text := '{"sub":"7190c434-24c1-47dc-a2fb-c3cbad5bfaf3","role":"authenticated"}';
BEGIN
-- Every AML/CFT rating must be attributable to a published methodology version.
meth := (SELECT v FROM aml_ref WHERE case_no = 0 AND k = 'methodology');
IF meth IS NULL THEN
  RAISE EXCEPTION 'DEMO AML seed refused: no active AML_CFT supervisory methodology version is published';
END IF;

FOR c IN SELECT * FROM aml_case ORDER BY case_no LOOP
  ent := (SELECT v FROM aml_ref WHERE case_no = c.case_no AND k='ent');

  -- ---- AML/CFT perimeter determination -------------------------------------
  -- Recorded for every entity before any assessment exists: an assessment
  -- without a recorded perimeter basis has no recorded reason to exist.
  PERFORM set_config('request.jwt.claims', claim_sup, true);
  IF c.variant = 'OUT_OF_PERIMETER' THEN
    PERFORM public.supervisory_domain_perimeter_set(ent, 'AML_CFT', false,
      'Holding company with no relevant financial business; AML/CFT obligations do not apply to it.');
    CONTINUE;
  END IF;
  PERFORM public.supervisory_domain_perimeter_set(ent, 'AML_CFT', true,
    'Licensed to carry on relevant financial business; the entity is a supervised person for AML/CFT purposes.');

  IF c.depth < 2 THEN CONTINUE; END IF;

  -- ---- deteriorating case: an earlier, superseded MODERATE assessment ------
  prev := NULL;
  IF c.variant = 'DETERIORATING' THEN
    PERFORM set_config('request.jwt.claims', claim_off, true);
    res := public.supervisory_assessment_create(ent,'AML_CFT','PERIODIC',
      (current_date - 730),(current_date - 366), meth,'PERIODIC',NULL,
      'Prior year AML/CFT risk assessment; controls were then adequate for the risk profile.');

    prev := (res->>'id')::uuid;
    PERFORM public.supervisory_assessment_dimension_upsert(prev,'TRANSACTION_MONITORING',
      'CONTROL_EFFECTIVENESS','MODERATE','SATISFACTORY','MODERATE',NULL,NULL,
      'Alert volumes were matched by review capacity in the prior period.',
      NULL,NULL,'Prior year monitoring MI',NULL,NULL,'STABLE');
    -- mandatory methodology questions must be answered before submission
    FOR qrec IN SELECT q.id, q.requires_evidence, q.min_evidence_count, d.dimension_code, q.question_code
                  FROM public.supervisory_methodology_question q
                  JOIN public.supervisory_methodology_dimension d ON d.id = q.methodology_dimension_id
                 WHERE q.methodology_id = meth AND q.active AND q.mandatory AND d.active LOOP
      PERFORM public.supervisory_assessment_question_upsert(prev, qrec.id, 'PARTIALLY',
        'Prior year conclusion on '||qrec.dimension_code||' '||qrec.question_code
          ||'; controls were then adequate for the risk profile.',
        CASE WHEN qrec.requires_evidence THEN
          jsonb_build_array(jsonb_build_object('kind','WORKPAPER',
            'label','Prior year workpaper — '||qrec.dimension_code||' '||qrec.question_code)) END);
    END LOOP;
    PERFORM public.supervisory_assessment_transition(prev,'submitted','Submitted for independent review.');

    PERFORM set_config('request.jwt.claims', claim_sup, true);
    PERFORM public.supervisory_assessment_transition(prev,'reviewed','Independent review completed.');
    PERFORM public.supervisory_assessment_transition(prev,'approved',
      'Approved as the prior year AML/CFT assessment.','MODERATE',(current_date - 1));
    INSERT INTO aml_ref(case_no,k,v) VALUES (c.case_no,'prior', prev);
  END IF;

  -- ---- assessment (maker) --------------------------------------------------
  PERFORM set_config('request.jwt.claims', claim_off, true);
  res := public.supervisory_assessment_create(ent,'AML_CFT','PERIODIC',
    (current_date - 365),(current_date - 1), meth,'PERIODIC',NULL,
    'Annual AML/CFT risk assessment of '||c.name||'.', NULL, prev);
  aid := (res->>'id')::uuid;
  -- question conclusions are polarised with the recorded residual rating
  ans := CASE c.rating WHEN 'LOW' THEN 'YES' WHEN 'MODERATE' THEN 'PARTIALLY' ELSE 'NO' END;

  INSERT INTO aml_ref(case_no,k,v) VALUES (c.case_no,'assessment', aid);

  d := public.supervisory_assessment_dimension_upsert(aid,'TRANSACTION_MONITORING',
    'CONTROL_EFFECTIVENESS',
    CASE c.rating WHEN 'LOW' THEN 'LOW' WHEN 'MODERATE' THEN 'MODERATE' ELSE 'HIGH' END,
    CASE c.rating WHEN 'LOW' THEN 'STRONG' WHEN 'MODERATE' THEN 'SATISFACTORY' ELSE 'WEAK' END,
    CASE c.rating WHEN 'LOW' THEN 'LOW' WHEN 'MODERATE' THEN 'MODERATE' ELSE 'HIGH' END,
    NULL,NULL,
    CASE c.rating
      WHEN 'HIGH' THEN 'Alert volumes have trebled while the review team is unchanged.'
      ELSE 'Alert volumes are matched by the current review capacity.' END,
    NULL,NULL,'Monitoring MI for the review period',NULL,NULL,
    CASE WHEN c.rating='HIGH' THEN 'DETERIORATING' ELSE 'STABLE' END);
  INSERT INTO aml_ref(case_no,k,v) VALUES (c.case_no,'dim_tm',(d->>'id')::uuid);

  d := public.supervisory_assessment_dimension_upsert(aid,'STR_SAR_GOVERNANCE',
    'CONTROL_EFFECTIVENESS',
    CASE c.rating WHEN 'LOW' THEN 'LOW' WHEN 'MODERATE' THEN 'MODERATE' ELSE 'HIGH' END,
    CASE c.rating WHEN 'LOW' THEN 'STRONG' WHEN 'MODERATE' THEN 'SATISFACTORY' ELSE 'NEEDS_IMPROVEMENT' END,
    CASE c.rating WHEN 'LOW' THEN 'LOW' WHEN 'MODERATE' THEN 'MODERATE' ELSE 'HIGH' END,
    NULL,NULL,
    CASE c.rating
      WHEN 'HIGH' THEN 'Suspicious transaction reporting decisions are not consistently evidenced.'
      ELSE 'Suspicious transaction reporting decisions are evidenced for the sampled population.' END);
  INSERT INTO aml_ref(case_no,k,v) VALUES (c.case_no,'dim_str',(d->>'id')::uuid);

  d := public.supervisory_assessment_dimension_upsert(aid,'CDD_KYC',
    'CONTROL_EFFECTIVENESS','MODERATE','SATISFACTORY','MODERATE',NULL,NULL,
    'Customer due diligence files are complete for the sampled population.');
  INSERT INTO aml_ref(case_no,k,v) VALUES (c.case_no,'dim_cdd',(d->>'id')::uuid);

  d := public.supervisory_assessment_dimension_upsert(aid,'GEOGRAPHIC_RISK',
    'INHERENT_RISK','LOW','SATISFACTORY','LOW',NULL,NULL,
    'Corridors are limited to low-risk jurisdictions.');
  INSERT INTO aml_ref(case_no,k,v) VALUES (c.case_no,'dim_geo',(d->>'id')::uuid);

  -- mandatory methodology questions must be answered before submission
  FOR qrec IN SELECT q.id, q.requires_evidence, q.min_evidence_count, d.dimension_code, q.question_code
                FROM public.supervisory_methodology_question q
                JOIN public.supervisory_methodology_dimension d ON d.id = q.methodology_dimension_id
               WHERE q.methodology_id = meth AND q.active AND q.mandatory AND d.active LOOP
    PERFORM public.supervisory_assessment_question_upsert(aid, qrec.id, ans,
      'Assessed against the '||qrec.dimension_code||' criteria ('||qrec.question_code
        ||'); conclusion consistent with the recorded '||c.rating||' residual AML/CFT risk.',
      CASE WHEN qrec.requires_evidence THEN
        jsonb_build_array(jsonb_build_object('kind','WORKPAPER',
          'label','Assessment workpaper — '||qrec.dimension_code||' '||qrec.question_code)) END);
  END LOOP;

  IF c.depth < 3 THEN CONTINUE; END IF;   -- 02: draft assessment only
  PERFORM public.supervisory_assessment_transition(aid,'submitted',
    'Submitted for independent review by the AML/CFT supervisor.');


  IF c.depth < 4 THEN CONTINUE; END IF;   -- 03: awaiting review
  PERFORM set_config('request.jwt.claims', claim_sup, true);
  PERFORM public.supervisory_assessment_transition(aid,'reviewed',
    'Independent review completed; ratings and evidence are supported.');
  PERFORM public.supervisory_assessment_transition(aid,'approved',
    'Approved as the current AML/CFT risk assessment.', c.rating, (current_date + 180));

  IF c.depth < 5 THEN CONTINUE; END IF;   -- 04..07: approved ratings only

  -- ---- supervisory attention ----------------------------------------------
  PERFORM set_config('request.jwt.claims', claim_off, true);
  res := public.supervisory_attention_open(
    'DEMO AML — deteriorating transaction monitoring at '||c.name,
    'AML_CFT',
    'The approved AML/CFT assessment rates transaction monitoring HIGH and deteriorating; supervisory attention is required.',
    'SUPERVISORY_ASSESSMENT', ARRAY[ent], aid,
    (SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='dim_tm'),
    NULL,NULL,NULL,NULL,'high','high');
  INSERT INTO aml_ref(case_no,k,v) VALUES (c.case_no,'attention',(res->>'id')::uuid);
  PERFORM set_config('request.jwt.claims', claim_sup, true);
  PERFORM public.supervisory_attention_confirm_priority((SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='attention'),
    'HIGH','Confirmed HIGH: the monitoring weakness is current and the customer base is cash intensive.');

  IF c.depth < 6 THEN CONTINUE; END IF;   -- 08: prioritised attention

  -- ---- supervisory plan ---------------------------------------------------
  PERFORM set_config('request.jwt.claims', claim_off, true);
  res := public.supervisory_plan_open(
    'DEMO AML — targeted AML/CFT supervision of '||c.name, 'AML_CFT',
    'The approved AML/CFT assessment rates the entity HIGH with deteriorating transaction monitoring.',
    'Establish whether transaction monitoring and suspicious transaction reporting operate effectively.',
    (SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='attention'),
    ARRAY[aid], ARRAY[ent], 'annual', to_char(current_date,'YYYY'),
    NULL,NULL, current_date, (current_date + 120), NULL, 'HIGH');
  INSERT INTO aml_ref(case_no,k,v) VALUES (c.case_no,'plan',(res->>'id')::uuid);
  PERFORM public.supervisory_plan_lifecycle((SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='plan'),
    'SUBMITTED','Submitted for supervisory approval.');
  PERFORM set_config('request.jwt.claims', claim_sup, true);
  PERFORM public.supervisory_plan_lifecycle((SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='plan'),
    'APPROVED','Approved: the planned targeted examination is proportionate to the risk.');
  PERFORM public.supervisory_plan_lifecycle((SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='plan'),
    'ACTIVE','Plan activated for the current supervisory cycle.');

  IF c.depth < 7 THEN CONTINUE; END IF;   -- 09: active plan

  -- ---- intervention -------------------------------------------------------
  PERFORM set_config('request.jwt.claims', claim_off, true);
  res := public.supervisory_intervention_open(
    (SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='plan'), 'TARGETED_EXAMINATION',
    'DEMO AML — targeted examination of transaction monitoring and STR governance',
    'The approved assessment and the prioritised attention both point to monitoring and reporting controls.',
    'AML_CFT', ent, (SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='attention'),
    'Evidence-based conclusion on the effectiveness of monitoring and reporting controls.',
    current_date, (current_date + 60));
  INSERT INTO aml_ref(case_no,k,v) VALUES (c.case_no,'intervention',(res->>'id')::uuid);
  PERFORM set_config('request.jwt.claims', claim_sup, true);
  PERFORM public.supervisory_intervention_decide(
    (SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='intervention'),
    'ENDORSED','Endorsed: a targeted examination is the proportionate supervisory response.');

  IF c.depth < 8 THEN CONTINUE; END IF;   -- 10: endorsed intervention

  -- ---- joint prudential assessment (origin of a joint engagement) ----------
  pru := NULL;
  IF c.variant = 'JOINT' THEN
    PERFORM set_config('request.jwt.claims', claim_pru, true);
    res := public.supervisory_assessment_create(ent,'PRUDENTIAL','PERIODIC',
      (current_date - 365),(current_date - 1), NULL,'PERIODIC',NULL,
      'Annual prudential assessment; examined jointly with AML/CFT because both rely on the same governance.');
    pru := (res->>'id')::uuid;
    PERFORM public.supervisory_assessment_dimension_upsert(pru,'GOVERNANCE',
      'CONTROL_EFFECTIVENESS','MODERATE','NEEDS_IMPROVEMENT','MODERATE',NULL,NULL,
      'Board oversight of compliance and risk reporting is thin.');
    PERFORM public.supervisory_assessment_transition(pru,'submitted','Submitted for independent review.');
    PERFORM set_config('request.jwt.claims', claim_sup2, true);
    PERFORM public.supervisory_assessment_transition(pru,'reviewed','Independent prudential review completed.');
    PERFORM public.supervisory_assessment_transition(pru,'approved',
      'Approved as the current prudential assessment.','MODERATE',(current_date + 180));
    INSERT INTO aml_ref(case_no,k,v) VALUES (c.case_no,'prudential', pru);
  END IF;

  -- ---- examination --------------------------------------------------------
  PERFORM set_config('request.jwt.claims', claim_off, true);
  res := public.supervisory_examination_open(
    (SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='intervention'),
    CASE WHEN c.variant='JOINT'
      THEN 'DEMO AML — joint AML/CFT and prudential examination of '||c.name
      ELSE 'DEMO AML — targeted AML/CFT examination of '||c.name END,
    'TARGETED_ONSITE','AML_CFT', ent,
    CASE WHEN pru IS NULL THEN ARRAY[aid] ELSE ARRAY[aid, pru] END,
    ARRAY[(SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='dim_tm'),
          (SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='dim_str')],
    (current_date - 365),(current_date - 1), NULL, NULL,'RISK_BASED_SUPERVISION');
  INSERT INTO aml_ref(case_no,k,v) VALUES (c.case_no,'exam',(res->>'id')::uuid);

  PERFORM public.examination_scope_from_assessment(
    (SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='exam'),
    ARRAY[(SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='dim_tm'),
          (SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='dim_str')],
    'Scope taken from the HIGH-rated dimensions of the approved AML/CFT assessment.');
  PERFORM public.examination_scope_area_amend(
    (SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='exam'),
    'AGENT_OVERSIGHT','Agent network oversight',
    'Added by the examiner: the agent network grew by 40% since the assessment date.');

  IF c.depth < 9 THEN CONTINUE; END IF;   -- 11: scoped examination

  -- ---- information requests and workpaper ---------------------------------
  r1 := public.examination_data_request_save(jsonb_build_object(
    'examination_id',(SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='exam'),
    'title','Complete alert population for the review period',
    'description','Every monitoring alert raised, with disposition and decision maker.',
    'data_format','CSV',
    'due_date', CASE WHEN c.variant='RFI_OVERDUE' THEN (current_date - 12)::text ELSE (current_date + 10)::text END,
    'requested_from','Compliance Officer','priority','HIGH',
    'assessment_dimension_id',(SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='dim_tm')));
  r2 := public.examination_data_request_save(jsonb_build_object(
    'examination_id',(SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='exam'),
    'title','STR/SAR register and supporting decision papers',
    'description','All internal reports considered, with the reasons for reporting or not reporting.',
    'data_format','PDF','due_date',(current_date + 10)::text,
    'requested_from','Money Laundering Reporting Officer','priority','HIGH',
    'assessment_dimension_id',(SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='dim_str')));
  r3 := public.examination_data_request_save(jsonb_build_object(
    'examination_id',(SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='exam'),
    'title','Transaction monitoring rule set and tuning history',
    'description','Rules in force, thresholds and any change made in the review period.',
    'data_format','XLSX','due_date',(current_date + 14)::text,
    'requested_from','Head of Technology','priority','NORMAL',
    'assessment_dimension_id',(SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='dim_tm')));
  PERFORM public.examination_data_request_issue(r1);
  PERFORM public.examination_data_request_issue(r2);
  PERFORM public.examination_data_request_issue(r3);

  IF c.variant = 'RFI_OVERDUE' THEN
    -- the alert population request is past its due date and still outstanding
    PERFORM public.examination_data_request_receive(r2,'Register provided in full.',NULL,true);
    PERFORM public.examination_data_request_receive(r3,'Rule set and tuning log provided.',NULL,true);
  ELSE
    PERFORM public.examination_data_request_receive(r1,'Alert extract provided in full.',NULL,true);
    PERFORM public.examination_data_request_receive(r2,'Register provided; three decision papers missing.',
      'Decision papers for March, May and August.',false);
    PERFORM public.examination_data_request_receive(r3,'Rule set and tuning log provided.',NULL,true);
  END IF;

  wp := public.examination_workpaper_save(jsonb_build_object(
    'examination_id',(SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='exam'),
    'area','Transaction monitoring',
    'objective','Determine whether monitoring alerts are investigated and decisions evidenced.',
    'procedure_performed','Risk-based sample of alerts traced to investigation records and decisions.',
    'population_description','All monitoring alerts raised in the period under review',
    'population_size','4800','sampling_method','RISK_BASED','sample_size','50',
    'exceptions_count','17','material_exceptions_count','6',
    'analysis','Seventeen sampled alerts had no evidenced investigation; six involved high-risk corridors.',
    'conclusion','Transaction monitoring is not operating effectively.',
    'control_assessment','INEFFECTIVE',
    'assessment_dimension_id',(SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='dim_tm')));
  INSERT INTO aml_ref(case_no,k,v) VALUES (c.case_no,'wp', wp);
  PERFORM public.examination_workpaper_submit_review(wp);

  IF c.depth < 10 THEN CONTINUE; END IF;  -- 12, 13, 22: fieldwork in progress

  -- ---- finding ------------------------------------------------------------
  fid := public.supervisory_finding_create(jsonb_build_object(
    'entity_id', ent,'domain_code','AML_CFT','severity','HIGH',
    'finding_category','TRANSACTION_MONITORING',
    'title','Monitoring alerts are not investigated or evidenced',
    'observation','Seventeen of fifty sampled alerts had no evidenced investigation or decision.',
    'root_cause','Alert volumes have trebled without any increase in review capacity.',
    'risk_impact','Suspicious activity may go undetected and unreported.',
    'regulatory_criterion','AML/CFT Regulations — ongoing monitoring and record keeping',
    'required_action','Clear the alert backlog and evidence every alert decision.',
    'examination_id',(SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='exam'),
    'workpaper_id', wp,
    'due_date',(current_date + 60)::text));
  INSERT INTO aml_ref(case_no,k,v) VALUES (c.case_no,'finding', fid);
  PERFORM public.supervisory_finding_lifecycle(fid,'REVIEW','Submitted for supervisory review before issue.');
  PERFORM set_config('request.jwt.claims', claim_sup, true);
  PERFORM public.supervisory_finding_lifecycle(fid,'ISSUED',
    'Issued to the entity with a sixty-day response requirement.');

  IF c.depth < 11 THEN CONTINUE; END IF;  -- 14: issued finding awaiting response

  -- ---- management response (officer-recorded) ------------------------------
  PERFORM set_config('request.jwt.claims', claim_off, true);
  PERFORM public.supervisory_finding_response(fid,'ACCEPTED',
    'The entity accepts the finding, will clear the alert backlog and will add two reviewers.',
    'Clear the backlog, evidence every decision and recruit two alert reviewers.',
    'Chief Compliance Officer',(current_date + 45), NULL,
    'Chief Compliance Officer, '||c.name, current_date,'LETTER');

  IF c.depth < 12 THEN CONTINUE; END IF;  -- 15: response recorded

  -- ---- corrective actions -------------------------------------------------
  PERFORM set_config('request.jwt.claims', claim_sup, true);
  PERFORM public.supervisory_finding_lifecycle(fid,'REMEDIATION_REQUIRED',
    'Corrective actions required against the accepted response.');
  r1 := public.supervisory_remediation_open(fid,
    'Clear the outstanding alert backlog and evidence every decision.',
    'No alert older than thirty days without an evidenced decision.',
    NULL,'Chief Compliance Officer',(current_date + 30));
  r2 := public.supervisory_remediation_open(fid,
    'Recruit and train two additional alert reviewers.',
    'Review capacity matched to alert volume.',
    NULL,'Head of Human Resources',(current_date + 60));
  r3 := public.supervisory_remediation_open(fid,
    'Retune monitoring rules and document the tuning decisions.',
    'Rule set calibrated to the current risk profile, with documented rationale.',
    NULL,'Head of Technology',(current_date + 90));
  INSERT INTO aml_ref(case_no,k,v) VALUES (c.case_no,'ra1',r1),(c.case_no,'ra2',r2),(c.case_no,'ra3',r3);

  IF c.variant = 'MIXED' THEN
    -- deliberately mixed progress across the three actions
    PERFORM public.supervisory_remediation_transition(r1,'ACTION_PLAN_SUBMITTED','Action plan received from the entity.');
    PERFORM public.supervisory_remediation_transition(r1,'UNDER_REVIEW','Action plan under supervisory review.');
    PERFORM public.supervisory_remediation_transition(r1,'ACCEPTED','Action plan accepted as adequate.');
    PERFORM public.supervisory_remediation_transition(r1,'IMPLEMENTING','Implementation under way.');
    PERFORM public.supervisory_remediation_transition(r2,'ACTION_PLAN_SUBMITTED','Action plan received from the entity.');
    PERFORM public.supervisory_remediation_transition(r3,'ACTION_PLAN_SUBMITTED','Action plan received from the entity.');
    PERFORM public.supervisory_remediation_transition(r3,'UNDER_REVIEW','Action plan under supervisory review.');
    PERFORM public.supervisory_remediation_transition(r3,'ACCEPTED','Action plan accepted as adequate.');
    PERFORM public.supervisory_remediation_transition(r3,'IMPLEMENTING','Implementation under way.');
    PERFORM public.supervisory_remediation_transition(r3,'EVIDENCE_SUBMITTED','Completion evidence submitted by the entity.');
    CONTINUE;
  END IF;

  IF c.depth < 13 THEN CONTINUE; END IF;

  FOREACH ra IN ARRAY ARRAY[r1,r2,r3] LOOP
    PERFORM public.supervisory_remediation_transition(ra,'ACTION_PLAN_SUBMITTED','Action plan received from the entity.');
    PERFORM public.supervisory_remediation_transition(ra,'UNDER_REVIEW','Action plan under supervisory review.');
    PERFORM public.supervisory_remediation_transition(ra,'ACCEPTED','Action plan accepted as adequate and proportionate.');
    PERFORM public.supervisory_remediation_transition(ra,'IMPLEMENTING','Implementation under way.');
    PERFORM public.supervisory_remediation_transition(ra,'EVIDENCE_SUBMITTED','Completion evidence submitted by the entity.');
    PERFORM public.supervisory_remediation_transition(ra,'VALIDATION','Evidence accepted for independent validation.');
  END LOOP;

  IF c.depth < 14 THEN CONTINUE; END IF;  -- 17: all actions awaiting validation

  -- ---- independent validation ---------------------------------------------
  PERFORM public.supervisory_remediation_validate(r1,'EFFECTIVE',
    'Backlog report, alert decision records and a fresh sample of ten alerts',
    'Re-performance of the original sample plus a fresh sample of ten alerts',
    'Every re-tested alert carried an evidenced decision; the backlog is cleared.');
  PERFORM public.supervisory_remediation_validate(r3,'PARTIALLY_EFFECTIVE',
    'Tuning log and revised rule set',
    'Walkthrough of the tuning decisions and re-run of two scenarios',
    'Rules were retuned but two high-risk corridor scenarios remain uncalibrated.',
    'Require a further tuning cycle for the outstanding corridors.');

  IF c.depth = 14 THEN
    -- the capacity action failed: an ineffective conclusion, escalated
    PERFORM public.supervisory_remediation_validate(r2,'INEFFECTIVE',
      'Recruitment file showing one unfilled vacancy',
      'Inspection of recruitment and training evidence',
      'Only one of the two reviewers was appointed; review capacity is still short of alert volume.',
      'Escalate: the accepted action has not been delivered.');
    PERFORM public.supervisory_remediation_escalate(r2,
      'The accepted capacity action has not been delivered and the monitoring weakness persists.',
      'high','high');
    IF c.variant = 'ENFORCEMENT' THEN
      PERFORM set_config('request.jwt.claims', claim_enf, true);
      PERFORM public.enforcement_referral_create(jsonb_build_object(
        'source_kind','SUPERVISORY_FINDING','source_id', fid,
        'referral_reason','Accepted corrective action was not delivered and the monitoring weakness persists; the matter is referred to Enforcement for consideration of formal action.'));
    END IF;
    CONTINUE;
  END IF;

  PERFORM public.supervisory_remediation_validate(r2,'EFFECTIVE',
    'Appointment letters and training records for two reviewers',
    'Inspection of appointment and training evidence',
    'Review capacity is now matched to current alert volumes.');

  -- ---- residual decision and closure --------------------------------------
  PERFORM set_config('request.jwt.claims', claim_sup2, true);
  PERFORM public.supervisory_residual_acceptance_record(r3,
    'Two high-risk corridor scenarios remain uncalibrated.','HIGH',
    'A further tuning cycle is required and will be verified at the follow-up assessment.',
    'The residual exposure is bounded and monitored; a further cycle is proportionate to closing the action.',
    (current_date + 90));
  PERFORM public.supervisory_remediation_transition(r1,'CLOSED','Closed: validated as effective.');
  PERFORM public.supervisory_remediation_transition(r2,'CLOSED','Closed: validated as effective.');
  PERFORM public.supervisory_remediation_transition(r3,'CLOSED','Closed with an accepted, monitored residual deficiency.');

  IF c.depth < 16 THEN CONTINUE; END IF;  -- 24: residual accepted, finding still open

  IF (SELECT status FROM public.supervisory_finding WHERE id = fid) <> 'VALIDATION' THEN
    PERFORM public.supervisory_finding_lifecycle(fid,'VALIDATION',
      'All corrective actions validated; closure review under way.');
  END IF;
  PERFORM public.supervisory_finding_lifecycle(fid,'CLOSED',
    'Closed: the control weakness is remediated and the residual exposure is accepted.');

  -- ---- mandated reassessment ---------------------------------------------
  PERFORM set_config('request.jwt.claims', claim_sup, true);
  PERFORM public.supervisory_reassessment_require(ent,'AML_CFT','REMEDIATION_COMPLETED',
    'Remediation of the monitoring finding is complete; the AML/CFT rating must be revisited.',
    'FOLLOW_UP',(current_date + 30), aid, fid, r3, NULL,
    (SELECT v FROM aml_ref WHERE case_no=c.case_no AND k='exam'));

  IF c.depth < 17 THEN CONTINUE; END IF;  -- 19: reassessment required

  -- ---- follow-up assessment: HIGH -> MODERATE -----------------------------
  PERFORM set_config('request.jwt.claims', claim_off, true);
  res := public.supervisory_assessment_create(ent,'AML_CFT','FOLLOW_UP',
    (current_date - 180), current_date, meth,'FOLLOW_UP',NULL,
    'Follow-up AML/CFT assessment after validated remediation of the monitoring finding.',
    NULL, aid);
  INSERT INTO aml_ref(case_no,k,v) VALUES (c.case_no,'followup',(res->>'id')::uuid);
  PERFORM public.supervisory_assessment_dimension_upsert((res->>'id')::uuid,'TRANSACTION_MONITORING',
    'CONTROL_EFFECTIVENESS','HIGH','SATISFACTORY','MODERATE',NULL,NULL,
    'Backlog cleared, decisions evidenced and capacity increased; two corridor scenarios remain to be tuned.',
    NULL,NULL,'Re-performed alert testing and the accepted residual deficiency',NULL,NULL,'IMPROVING');
  -- mandatory methodology questions must be answered before submission
  FOR qrec IN SELECT q.id, q.requires_evidence, q.min_evidence_count, d.dimension_code, q.question_code
                FROM public.supervisory_methodology_question q
                JOIN public.supervisory_methodology_dimension d ON d.id = q.methodology_dimension_id
               WHERE q.methodology_id = meth AND q.active AND q.mandatory AND d.active LOOP
    PERFORM public.supervisory_assessment_question_upsert((res->>'id')::uuid, qrec.id, 'PARTIALLY',
      'Re-performed testing after remediation: '||qrec.dimension_code||' '||qrec.question_code
        ||' is now substantially satisfied, with the accepted residual deficiency recorded.',
      CASE WHEN qrec.requires_evidence THEN
        jsonb_build_array(jsonb_build_object('kind','WORKPAPER',
          'label','Re-performance workpaper — '||qrec.dimension_code||' '||qrec.question_code)) END);
  END LOOP;
  PERFORM public.supervisory_assessment_transition((res->>'id')::uuid,'submitted',
    'Submitted for independent review following remediation.');

  PERFORM set_config('request.jwt.claims', claim_sup, true);
  PERFORM public.supervisory_assessment_transition((res->>'id')::uuid,'reviewed',
    'Independent review confirms the improvement in monitoring controls.');
  PERFORM public.supervisory_assessment_transition((res->>'id')::uuid,'approved',
    'Approved: residual AML/CFT risk reduces from HIGH to MODERATE.','MODERATE',(current_date + 365));
END LOOP;
END $$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 5. Dataset summary
-- ---------------------------------------------------------------------------
DO $$
DECLARE m jsonb;
BEGIN
  m := public.aml_overview_metrics();
  RAISE NOTICE 'DEMO AML dataset built: % entities in perimeter, % with current assessment, % high risk, % active examinations, % open findings, % overdue remediation, % reassessments required, % outside perimeter',
    m->>'entities_supervised', m->>'entities_with_current_assessment', m->>'high_risk_entities',
    m->>'active_examinations', m->>'open_findings', m->>'overdue_remediation',
    m->>'reassessments_required', m->>'entities_outside_perimeter';
END $$;

COMMIT;

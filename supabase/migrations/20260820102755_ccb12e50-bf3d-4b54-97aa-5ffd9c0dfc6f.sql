-- ============================================================
-- CERTIFICATION DATASET v1 — Part B: ownership, governance, history, requests
-- ============================================================
CREATE OR REPLACE FUNCTION public.cert_seed_structure_v1()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_seed_user uuid := '6d4f5483-b81b-47bb-9e4d-265f9c1b0f25';
  v_reg uuid := (SELECT id FROM regulators ORDER BY created_at LIMIT 1);
  r record; g record;
  v_entity uuid; v_cs uuid; v_fpi uuid;
  v_ot_direct uuid := (SELECT id FROM ownership_types WHERE key='DIRECT_SHAREHOLDING');
  v_ot_indirect uuid := (SELECT id FROM ownership_types WHERE key='INDIRECT_SHAREHOLDING');
  v_ot_benef uuid := (SELECT id FROM ownership_types WHERE key='BENEFICIAL_INTEREST');
  v_ot_voting uuid := (SELECT id FROM ownership_types WHERE key='VOTING_CONTROL');
BEGIN
  ------------------------------------------------------------------
  -- 1. Direct ownership (each intended full holding reconciles to 100%)
  ------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      ('E01','org','H1',60),('E01','person','P01',25),('E01','person','P02',15),
      ('E02','person','P03',50),('E02','person','P04',30),('E02','person','P05',20),
      ('E03','org','H2',70),('E03','person','P06',20),('E03','person','P07',10),
      ('E04','person','P08',50),('E04','person','P09',30),('E04','person','P10',20),
      ('E05','person','P11',50),('E05','person','P12',30),('E05','person','P13',20),
      ('E06','org','H1',55),('E06','person','P14',30),('E06','person','P15',15),
      ('E07','person','P16',50),('E07','person','P17',30),('E07','person','P18',20),
      ('E08','person','P19',50),('E08','person','P20',30),('E08','person','P21',20),
      ('E09','person','P22',50),('E09','person','P23',30),('E09','person','P24',20),
      ('E10','person','P25',60),('E10','person','P26',25),('E10','person','P27',15),
      ('E11','person','P28',50),('E11','person','P29',30),('E11','person','P30',20),
      ('E12','org','H2',65),('E12','person','P31',20),('E12','person','P32',15),
      ('E13','person','P33',50),('E13','person','P34',30),('E13','person','P35',20),
      ('E14','org','H1',51),('E14','person','P36',30),('E14','person','P37',19),
      ('E15','person','P38',50),('E15','person','P39',30),('E15','person','P40',20),
      ('E16','person','P41',50),('E16','person','P42',30),('E16','person','P43',20),
      ('E17','person','P44',50),('E17','person','P45',30),('E17','person','P46',20),
      ('E18','person','P47',60),('E18','person','P48',40),
      ('E19','person','P49',50),('E19','person','P50',30),('E19','person','P01',20),
      ('E20','person','P02',60),('E20','person','P03',40)
    ) AS t(ek, kind, owner_key, pct)
  LOOP
    INSERT INTO ownership_interests (id, owner_party_id, owned_entity_id, ownership_type_id,
      shares_held, total_shares, economic_interest_percentage, voting_rights_percentage,
      beneficial_interest_percentage, is_direct, is_controller, is_ubo, control_determination,
      effective_from, approval_status, approved_by, approved_at, verified_by, verified_at)
    VALUES (cert_uuid('own:'||r.ek||':'||r.owner_key),
            cert_uuid('party:'||CASE WHEN r.kind='org' THEN 'org' ELSE 'person' END||':'||r.owner_key),
            cert_uuid('entity:'||r.ek), v_ot_direct,
            r.pct * 10000, 1000000, r.pct, r.pct, NULL, true,
            (r.pct >= 50), false, 'VERIFIED',
            TIMESTAMPTZ '2025-01-01 00:00+00', 'APPROVED', v_seed_user, TIMESTAMPTZ '2025-01-05 00:00+00',
            v_seed_user, TIMESTAMPTZ '2025-01-05 00:00+00')
    ON CONFLICT (id) DO UPDATE SET economic_interest_percentage = EXCLUDED.economic_interest_percentage,
      voting_rights_percentage = EXCLUDED.voting_rights_percentage, shares_held = EXCLUDED.shares_held;
  END LOOP;

  ------------------------------------------------------------------
  -- 2. Indirect / beneficial / voting interests (never part of the direct 100%)
  ------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      ('E01','P01',36.0,'BENEFICIAL_INTEREST','Ultimate beneficial owner through Caribbean Holdings Ltd (60% of 60%)'),
      ('E06','P01',33.0,'BENEFICIAL_INTEREST','Ultimate beneficial owner through Caribbean Holdings Ltd (60% of 55%)'),
      ('E14','P01',30.6,'BENEFICIAL_INTEREST','Ultimate beneficial owner through Caribbean Holdings Ltd (60% of 51%)'),
      ('E03','P06',42.0,'BENEFICIAL_INTEREST','Ultimate beneficial owner through Federation Financial Holdings Ltd (60% of 70%)'),
      ('E12','P06',39.0,'BENEFICIAL_INTEREST','Ultimate beneficial owner through Federation Financial Holdings Ltd (60% of 65%)')
    ) AS t(ek, pk, pct, otype, note)
  LOOP
    INSERT INTO ownership_interests (id, owner_party_id, owned_entity_id, ownership_type_id,
      beneficial_interest_percentage, is_direct, is_controller, is_ubo, control_determination,
      effective_from, approval_status, approved_by, approved_at)
    VALUES (cert_uuid('ownubo:'||r.ek||':'||r.pk), cert_uuid('party:person:'||r.pk),
            cert_uuid('entity:'||r.ek), v_ot_benef, r.pct, false, true, true, 'DERIVED',
            TIMESTAMPTZ '2025-01-01 00:00+00','APPROVED', v_seed_user, TIMESTAMPTZ '2025-01-05 00:00+00')
    ON CONFLICT (id) DO UPDATE SET beneficial_interest_percentage = EXCLUDED.beneficial_interest_percentage;
  END LOOP;

  -- indirect group shareholding: holding company interest in a downstream regulated entity
  INSERT INTO ownership_interests (id, owner_party_id, owned_entity_id, ownership_type_id,
    economic_interest_percentage, is_direct, is_controller, is_ubo, control_determination,
    effective_from, approval_status, approved_by, approved_at)
  VALUES
    (cert_uuid('ownind:E14:H2'), cert_uuid('party:org:H2'), cert_uuid('entity:E14'), v_ot_indirect,
     12.0, false, false, false, 'DERIVED', TIMESTAMPTZ '2025-02-01 00:00+00','APPROVED', v_seed_user, TIMESTAMPTZ '2025-02-05 00:00+00'),
    (cert_uuid('ownvote:E10:P25'), cert_uuid('party:person:P25'), cert_uuid('entity:E10'), v_ot_voting,
     NULL, false, true, false, 'VERIFIED', TIMESTAMPTZ '2025-01-01 00:00+00','APPROVED', v_seed_user, TIMESTAMPTZ '2025-01-05 00:00+00')
  ON CONFLICT (id) DO NOTHING;
  UPDATE ownership_interests SET voting_rights_percentage = 60
    WHERE id = cert_uuid('ownvote:E10:P25');

  ------------------------------------------------------------------
  -- 3. Ownership change history (8 entities, superseded rows retained)
  ------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      ('E01','P44',25),('E02','P45',50),('E03','P46',20),('E06','P47',30),
      ('E10','P48',60),('E12','P49',20),('E14','P50',30),('E16','P13',50)
    ) AS t(ek, pk, pct)
  LOOP
    INSERT INTO ownership_interests (id, owner_party_id, owned_entity_id, ownership_type_id,
      economic_interest_percentage, voting_rights_percentage, is_direct, is_controller, is_ubo,
      control_determination, effective_from, effective_to, approval_status, approved_by, approved_at, superseded_at)
    VALUES (cert_uuid('ownhist:'||r.ek||':'||r.pk), cert_uuid('party:person:'||r.pk),
            cert_uuid('entity:'||r.ek), v_ot_direct, r.pct, r.pct, true, (r.pct>=50), false, 'VERIFIED',
            TIMESTAMPTZ '2024-01-15 00:00+00', TIMESTAMPTZ '2024-12-31 00:00+00',
            'SUPERSEDED', v_seed_user, TIMESTAMPTZ '2024-02-01 00:00+00', TIMESTAMPTZ '2024-12-31 00:00+00')
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  ------------------------------------------------------------------
  -- 4. Governance appointments
  ------------------------------------------------------------------
  FOR g IN
    SELECT m.scenario_key AS ek, m.entity_id, (substr(m.scenario_key,2,2))::int AS n,
           l.lifecycle_stage_id, ls.key AS lifecycle
    FROM certification_seed_manifest m
    JOIN licensees l ON l.id = m.entity_id
    LEFT JOIN lifecycle_stages ls ON ls.id = l.lifecycle_stage_id
    WHERE m.record_kind = 'REGULATED_ENTITY'
  LOOP
    FOR r IN
      SELECT * FROM (VALUES
        ('chairperson',1,false),('director',2,false),('director',3,false),
        ('chief_executive_officer',4,true),('chief_financial_officer',5,true),
        ('compliance_officer',6,true),('money_laundering_reporting_officer',7,true),
        ('company_secretary',8,false)
      ) AS t(role_key, slot, is_exec)
    LOOP
      CONTINUE WHEN g.lifecycle IN ('applicant') AND r.slot > 4;
      INSERT INTO entity_appointments (id, entity_id, person_party_id, role_type_id, appointment_date,
        effective_from, is_executive, status, regulatory_approval_status, recorded_at)
      SELECT cert_uuid('appt:'||g.ek||':'||r.role_key||':'||r.slot), g.entity_id,
             cert_uuid('party:person:P'||lpad((((g.n * 7 + r.slot * 3) % 50) + 1)::text,2,'0')),
             rt.id, DATE '2024-03-01', TIMESTAMPTZ '2024-03-01 00:00+00', r.is_exec,
             'ACTIVE',
             CASE WHEN g.lifecycle = 'applicant' THEN 'PENDING'
                  WHEN rt.requires_fit_and_proper THEN 'APPROVED' ELSE 'NOT_REQUIRED' END,
             TIMESTAMPTZ '2024-03-01 00:00+00'
      FROM role_types rt WHERE rt.key = r.role_key
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;
    END LOOP;
  END LOOP;

  -- appointment change history (8 entities, ended appointments retained)
  FOR r IN
    SELECT * FROM (VALUES
      ('E01','director','P30'),('E02','chief_executive_officer','P31'),('E03','compliance_officer','P32'),
      ('E06','chief_financial_officer','P33'),('E07','director','P34'),('E10','money_laundering_reporting_officer','P35'),
      ('E14','chairperson','P36'),('E19','company_secretary','P37')
    ) AS t(ek, role_key, pk)
  LOOP
    INSERT INTO entity_appointments (id, entity_id, person_party_id, role_type_id, appointment_date,
      effective_from, effective_to, is_executive, status, regulatory_approval_status, recorded_at, superseded_at)
    SELECT cert_uuid('appthist:'||r.ek||':'||r.role_key), cert_uuid('entity:'||r.ek),
           cert_uuid('party:person:'||r.pk), rt.id, DATE '2022-04-01',
           TIMESTAMPTZ '2022-04-01 00:00+00', TIMESTAMPTZ '2024-02-28 00:00+00',
           rt.is_governance, 'ENDED',
           CASE WHEN rt.requires_fit_and_proper THEN 'APPROVED' ELSE 'NOT_REQUIRED' END,
           TIMESTAMPTZ '2022-04-01 00:00+00', TIMESTAMPTZ '2024-02-28 00:00+00'
    FROM role_types rt WHERE rt.key = r.role_key
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  ------------------------------------------------------------------
  -- 5. Party / group relationships
  ------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      ('H1','E01','parent_of','ACTIVE'),('H1','E06','parent_of','ACTIVE'),('H1','E14','parent_of','ACTIVE'),
      ('H2','E03','parent_of','ACTIVE'),('H2','E12','parent_of','ACTIVE'),
      ('H4','E01','external_auditor_of','ACTIVE'),('H4','E02','external_auditor_of','ACTIVE'),
      ('H4','E03','external_auditor_of','ACTIVE'),('H4','E06','external_auditor_of','ACTIVE'),
      ('H4','E07','external_auditor_of','ACTIVE'),('H4','E10','external_auditor_of','ACTIVE'),
      ('H4','E14','external_auditor_of','ACTIVE'),('H4','E17','external_auditor_of','ACTIVE'),
      ('H5','E01','service_provider_to','ACTIVE'),('H5','E04','service_provider_to','ACTIVE'),
      ('H5','E10','service_provider_to','ACTIVE'),('H5','E13','service_provider_to','ACTIVE'),
      ('H5','E16','service_provider_to','ACTIVE'),
      ('H3','E11','service_provider_to','ENDED'),('H3','E12','service_provider_to','ENDED'),
      ('H3','E15','service_provider_to','ENDED'),('H4','E09','external_auditor_of','ENDED'),
      ('H2','E19','parent_of','ENDED')
    ) AS t(hk, ek, rel, st)
  LOOP
    INSERT INTO party_relationships (id, source_party_id, target_party_id, relationship_type_id,
      entity_id, effective_from, effective_to, status, notes, recorded_at, superseded_at)
    SELECT cert_uuid('prel:'||r.hk||':'||r.ek||':'||r.rel), cert_uuid('party:org:'||r.hk),
           cert_uuid('party:org:'||r.ek), rt.id, cert_uuid('entity:'||r.ek),
           TIMESTAMPTZ '2024-02-01 00:00+00',
           CASE WHEN r.st='ENDED' THEN TIMESTAMPTZ '2025-06-30 00:00+00' END,
           r.st, 'CERTIFICATION DATASET v1 relationship', TIMESTAMPTZ '2024-02-01 00:00+00',
           CASE WHEN r.st='ENDED' THEN TIMESTAMPTZ '2025-06-30 00:00+00' END
    FROM relationship_types rt WHERE rt.key = r.rel
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  ------------------------------------------------------------------
  -- 6. Effective-dated entity facts (identity + 5 legal-name history events)
  ------------------------------------------------------------------
  INSERT INTO entity_facts (id, entity_id, data_concept_id, value_text, valid_from, recorded_at, approval_status)
  SELECT cert_uuid('fact:name:'||m.scenario_key), m.entity_id,
         (SELECT id FROM data_concepts WHERE code='ENTITY.LEGAL_NAME'), m.display_name,
         TIMESTAMPTZ '2025-01-01 00:00+00', TIMESTAMPTZ '2025-01-01 00:00+00','APPROVED'
  FROM certification_seed_manifest m WHERE m.record_kind='REGULATED_ENTITY'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO entity_facts (id, entity_id, data_concept_id, value_text, valid_from, valid_to,
                            recorded_at, superseded_at, approval_status)
  SELECT cert_uuid('fact:namehist:'||h.ek), cert_uuid('entity:'||h.ek),
         (SELECT id FROM data_concepts WHERE code='ENTITY.LEGAL_NAME'), h.old_name,
         TIMESTAMPTZ '2018-01-01 00:00+00', TIMESTAMPTZ '2024-12-31 00:00+00',
         TIMESTAMPTZ '2018-01-01 00:00+00', TIMESTAMPTZ '2024-12-31 00:00+00','SUPERSEDED'
  FROM (VALUES
    ('E01','Atlantic Bank & Trust Ltd'),
    ('E03','Federation Credit Union Finance Ltd'),
    ('E08','Island Re Company Ltd'),
    ('E14','Caribbean Brokerage Services Ltd'),
    ('E17','Caribbean Corporate Services Ltd')
  ) AS h(ek, old_name)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO entity_facts (id, entity_id, data_concept_id, value_text, valid_from, recorded_at, approval_status)
  SELECT cert_uuid('fact:crn:'||m.scenario_key), m.entity_id,
         (SELECT id FROM data_concepts WHERE code='ENTITY.REGISTRATION_NUMBER'),
         m.primary_identifiers->>'company_registration_number',
         TIMESTAMPTZ '2024-01-15 00:00+00', TIMESTAMPTZ '2024-01-15 00:00+00','APPROVED'
  FROM certification_seed_manifest m WHERE m.record_kind='REGULATED_ENTITY'
  ON CONFLICT (id) DO NOTHING;

  ------------------------------------------------------------------
  -- 7. Regulatory requests + change sets
  ------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      ('Q01','E01','CHANGE_OF_LEGAL_NAME','APPROVED'),
      ('Q02','E01','DIRECTOR_APPOINTMENT','APPROVED'),
      ('Q03','E02','SHAREHOLDING_CHANGE','APPROVED'),
      ('Q04','E02','AUDITOR_CHANGE','SUBMITTED'),
      ('Q05','E03','BENEFICIAL_OWNER_CHANGE','UNDER_REVIEW'),
      ('Q06','E03','LICENSE_VARIATION','APPROVED'),
      ('Q07','E04','DIRECTOR_RESIGNATION','APPROVED'),
      ('Q08','E04','CHANGE_OF_ADDRESS','DRAFT'),
      ('Q09','E05','LICENSE_SURRENDER','APPROVED'),
      ('Q10','E06','GROUP_RESTRUCTURE','APPROVED'),
      ('Q11','E06','KEY_PERSON_CHANGE','UNDER_REVIEW'),
      ('Q12','E07','DIRECTOR_APPOINTMENT','APPROVED'),
      ('Q13','E08','CHANGE_OF_LEGAL_NAME','APPROVED'),
      ('Q14','E09','MATERIAL_INCIDENT','CLOSED'),
      ('Q15','E10','SHAREHOLDING_CHANGE','APPROVED'),
      ('Q16','E10','NEW_BRANCH','SUBMITTED'),
      ('Q17','E11','OUTSOURCING_NOTIFICATION','CLOSED'),
      ('Q18','E12','BENEFICIAL_OWNER_CHANGE','REJECTED'),
      ('Q19','E12','LICENSE_VARIATION','UNDER_REVIEW'),
      ('Q20','E13','DIRECTOR_APPOINTMENT','APPROVED'),
      ('Q21','E14','GROUP_RESTRUCTURE','APPROVED'),
      ('Q22','E15','AUDITOR_CHANGE','APPROVED'),
      ('Q23','E16','DIRECTOR_RESIGNATION','SUBMITTED'),
      ('Q24','E17','CHANGE_OF_LEGAL_NAME','UNDER_REVIEW'),
      ('Q25','E19','KEY_PERSON_CHANGE','APPROVED'),
      ('Q26','E12','MATERIAL_INCIDENT','DRAFT')
    ) AS t(k, ek, rtype, st)
  LOOP
    v_entity := cert_uuid('entity:'||r.ek);
    v_cs := cert_uuid('cs:'||r.k);

    IF r.st IN ('APPROVED','REJECTED') THEN
      INSERT INTO entity_change_sets (id, change_set_number, entity_id, origin_type, status,
        effective_date, summary, submitted_by, submitted_at, reviewed_by, reviewed_at,
        approved_by, approved_at, rejected_by, rejected_at, rejection_reason, applied_by, applied_at, created_by)
      VALUES (v_cs, 'CERT-ECS-'||substr(r.k,2,3), v_entity, 'REGULATORY_REQUEST',
        CASE WHEN r.st='APPROVED' THEN 'APPLIED' ELSE 'REJECTED' END,
        DATE '2026-01-15', r.rtype||' arising from regulatory request '||r.k,
        v_seed_user, TIMESTAMPTZ '2026-01-05 00:00+00', v_seed_user, TIMESTAMPTZ '2026-01-08 00:00+00',
        CASE WHEN r.st='APPROVED' THEN v_seed_user END,
        CASE WHEN r.st='APPROVED' THEN TIMESTAMPTZ '2026-01-12 00:00+00' END,
        CASE WHEN r.st='REJECTED' THEN v_seed_user END,
        CASE WHEN r.st='REJECTED' THEN TIMESTAMPTZ '2026-01-12 00:00+00' END,
        CASE WHEN r.st='REJECTED' THEN 'Supporting beneficial ownership evidence was insufficient.' END,
        CASE WHEN r.st='APPROVED' THEN v_seed_user END,
        CASE WHEN r.st='APPROVED' THEN TIMESTAMPTZ '2026-01-15 00:00+00' END,
        v_seed_user)
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

      INSERT INTO entity_change_items (id, change_set_id, change_type, operation, target_table,
        proposed_value, effective_from, apply_status, sequence)
      VALUES (cert_uuid('csi:'||r.k), v_cs,
        CASE WHEN r.rtype IN ('DIRECTOR_APPOINTMENT','DIRECTOR_RESIGNATION','KEY_PERSON_CHANGE') THEN 'APPOINTMENT'
             WHEN r.rtype IN ('SHAREHOLDING_CHANGE','BENEFICIAL_OWNER_CHANGE','CHANGE_OF_CONTROL') THEN 'OWNERSHIP'
             WHEN r.rtype IN ('GROUP_RESTRUCTURE','AUDITOR_CHANGE','OUTSOURCING_NOTIFICATION') THEN 'RELATIONSHIP'
             WHEN r.rtype = 'CHANGE_OF_LEGAL_NAME' THEN 'ORGANIZATION_NAME'
             ELSE 'ENTITY_FACT' END,
        CASE WHEN r.rtype IN ('DIRECTOR_RESIGNATION','LICENSE_SURRENDER') THEN 'CLOSE' ELSE 'UPSERT' END,
        CASE WHEN r.rtype IN ('DIRECTOR_APPOINTMENT','DIRECTOR_RESIGNATION','KEY_PERSON_CHANGE') THEN 'entity_appointments'
             WHEN r.rtype IN ('SHAREHOLDING_CHANGE','BENEFICIAL_OWNER_CHANGE') THEN 'ownership_interests'
             WHEN r.rtype = 'GROUP_RESTRUCTURE' THEN 'party_relationships'
             ELSE 'licensees' END,
        jsonb_build_object('request_key', r.k, 'change_type', r.rtype, 'dataset','CERTIFICATION_DATASET_V1'),
        TIMESTAMPTZ '2026-01-15 00:00+00',
        CASE WHEN r.st='APPROVED' THEN 'APPLIED' ELSE 'SKIPPED' END, 1)
      ON CONFLICT (id) DO NOTHING;
    END IF;

    INSERT INTO regulatory_requests (id, request_number, entity_id, request_type_id, status,
      change_set_id, effective_date, priority, submitted_by, submitted_at, assigned_to,
      decided_by, decided_at, decision_rationale, closed_by, closed_at, summary, created_by, created_at)
    SELECT cert_uuid('req:'||r.k), 'CERT-REQ-'||substr(r.k,2,3), v_entity, rt.id, r.st,
           CASE WHEN r.st IN ('APPROVED','REJECTED') THEN v_cs END,
           DATE '2026-01-15', 3,
           CASE WHEN r.st <> 'DRAFT' THEN v_seed_user END,
           CASE WHEN r.st <> 'DRAFT' THEN TIMESTAMPTZ '2026-01-05 00:00+00' END,
           CASE WHEN r.st IN ('UNDER_REVIEW','APPROVED','REJECTED','CLOSED') THEN v_seed_user END,
           CASE WHEN r.st IN ('APPROVED','REJECTED') THEN v_seed_user END,
           CASE WHEN r.st IN ('APPROVED','REJECTED') THEN TIMESTAMPTZ '2026-01-12 00:00+00' END,
           CASE WHEN r.st='APPROVED' THEN 'Request satisfied the applicable regulatory requirements.'
                WHEN r.st='REJECTED' THEN 'Supporting beneficial ownership evidence was insufficient.' END,
           CASE WHEN r.st='CLOSED' THEN v_seed_user END,
           CASE WHEN r.st='CLOSED' THEN TIMESTAMPTZ '2026-01-20 00:00+00' END,
           rt.label||' — '||(SELECT name FROM licensees WHERE id = v_entity),
           v_seed_user, TIMESTAMPTZ '2026-01-02 00:00+00'
    FROM regulatory_request_types rt WHERE rt.key = r.rtype
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;
  END LOOP;

  ------------------------------------------------------------------
  -- 8. Fit & Proper coverage
  ------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      ('P01','E01','determined','approved'),('P02','E01','screening','under_assessment'),
      ('P08','E02','determined','approved'),('P09','E02','awaiting_committee','under_assessment'),
      ('P14','E06','determined','approved'),('P15','E06','submitted','under_assessment'),
      ('P25','E10','determined','approved'),('P26','E10','determined','reassessment_due'),
      ('P36','E14','determined','approved'),('P37','E14','screening','under_assessment'),
      ('P47','E18','submitted','under_assessment'),('P48','E18','draft','under_assessment'),
      ('P02','E20','submitted','under_assessment'),('P31','E12','determined','reassessment_due'),
      ('P41','E16','determined','approved'),('P44','E17','determined','approved')
    ) AS t(pk, ek, st, scenario)
  LOOP
    v_fpi := cert_uuid('fpi:'||r.pk);
    INSERT INTO fp_individuals (id, full_name, status, regulator_id, notes, created_by, email)
    SELECT v_fpi, p.full_name, 'active', v_reg,
           'CERTIFICATION DATASET v1 — canonical person party '||r.pk, v_seed_user, NULL
    FROM persons p WHERE p.party_id = cert_uuid('party:person:'||r.pk)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO fp_assessments (id, individual_id, licensee_id, assessment_type, status,
      submitted_at, submitted_by, determined_at, closed_at, regulator_id, created_by)
    VALUES (cert_uuid('fpa:'||r.pk||':'||r.ek), v_fpi, cert_uuid('entity:'||r.ek),
      CASE WHEN r.scenario='reassessment_due' THEN 'renewal' ELSE 'initial' END, r.st,
      CASE WHEN r.st <> 'draft' THEN TIMESTAMPTZ '2025-09-01 00:00+00' END,
      CASE WHEN r.st <> 'draft' THEN v_seed_user END,
      CASE WHEN r.st='determined' THEN TIMESTAMPTZ '2025-10-01 00:00+00' END,
      CASE WHEN r.scenario='reassessment_due' THEN TIMESTAMPTZ '2025-10-15 00:00+00' END,
      v_reg, v_seed_user)
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

    UPDATE entity_appointments SET fp_individual_id = v_fpi
     WHERE entity_id = cert_uuid('entity:'||r.ek)
       AND person_party_id = cert_uuid('party:person:'||r.pk);
  END LOOP;
END;
$fn$;

REVOKE ALL ON FUNCTION public.cert_seed_structure_v1() FROM PUBLIC, anon, authenticated;

SELECT public.cert_seed_structure_v1();
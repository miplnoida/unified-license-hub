-- ============================================================
-- CERTIFICATION DATASET v1 — Part A: identity, licensing, resolution
-- ============================================================

-- Jurisdiction reference data required by JURISDICTION-scoped identifiers
INSERT INTO public.countries (id, name, iso_code, status)
VALUES (public.cert_uuid('country:KN'), 'Saint Kitts and Nevis', 'KN', 'active')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.cert_seed_identity_v1()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_seed_user uuid := '6d4f5483-b81b-47bb-9e4d-265f9c1b0f25'; -- existing platform super admin (seed actor)
  v_reg uuid := (SELECT id FROM regulators ORDER BY created_at LIMIT 1);
  r record;
  v_entity uuid;
  v_party uuid;
  v_lic uuid;
  v_app uuid;
  i int;
BEGIN
  ------------------------------------------------------------------
  -- 1. Supporting non-regulated organization parties
  ------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      ('H1','Caribbean Holdings Ltd','caribbeanholdings'),
      ('H2','Federation Financial Holdings Ltd','federationfinancialholdings'),
      ('H3','Eastern Caribbean Services Ltd','easterncaribbeanservices'),
      ('H4','Island Audit Partners Ltd','islandauditpartners'),
      ('H5','Regional Technology Services Ltd','regionaltechnologyservices')
    ) AS t(k,nm,slug)
  LOOP
    v_party := cert_uuid('party:org:'||r.k);
    INSERT INTO parties (id, party_kind, display_name) VALUES (v_party,'ORGANIZATION',r.nm)
      ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;
    INSERT INTO organizations (party_id, legal_name, display_name, legal_name_authority)
      VALUES (v_party, r.nm, r.nm, 'LOCAL_VERIFIED')
      ON CONFLICT (party_id) DO UPDATE SET legal_name = EXCLUDED.legal_name;
    INSERT INTO certification_seed_manifest (scenario_key, record_kind, display_name, party_id, organization_party_id, entity_email, notes)
      VALUES (r.k,'SUPPORTING_ORGANIZATION', r.nm, v_party, v_party, r.slug||'@mishainfotech.com',
              'Non-regulated organization party — proves Organization Party <> Regulated Entity')
      ON CONFLICT (dataset_key, scenario_key, record_kind) DO UPDATE
        SET display_name = EXCLUDED.display_name, party_id = EXCLUDED.party_id,
            organization_party_id = EXCLUDED.organization_party_id, updated_at = now();
  END LOOP;

  ------------------------------------------------------------------
  -- 2. Canonical persons (50)
  ------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      ('P01','Alton Bradshaw'),('P02','Marcella Duncan'),('P03','Everton Liburd'),('P04','Sylvia Warner'),
      ('P05','Desmond Caines'),('P06','Yvette Hodge'),('P07','Curtis Maynard'),('P08','Pamela Isaac'),
      ('P09','Lionel Sargeant'),('P10','Rosalind Pemberton'),('P11','Wendell Browne'),('P12','Andrea Nisbett'),
      ('P13','Neville Archibald'),('P14','Cheryl Bassue'),('P15','Godfrey Wilkin'),('P16','Marion Herbert'),
      ('P17','Trevor Phillip'),('P18','Denise Hanley'),('P19','Osmond Tyson'),('P20','Beverley Jeffers'),
      ('P21','Kenrick Morton'),('P22','Ingrid Skerritt'),('P23','Alphonso Weekes'),('P24','Charmaine Dore'),
      ('P25','Vernon Matthew'),('P26','Ophelia Gumbs'),('P27','Rupert Freeman'),('P28','Sandra Elliott'),
      ('P29','Clement Rawlins'),('P30','Joycelyn Powell'),('P31','Hensley Daniel'),('P32','Marva Berridge'),
      ('P33','Errol Stapleton'),('P34','Lucinda Manners'),('P35','Franklyn Audain'),('P36','Estelle Parry'),
      ('P37','Milton Guishard'),('P38','Delia Huggins'),('P39','Norbert Sutton'),('P40','Karlene Blackett'),
      ('P41','Sylvester Nugent'),('P42','Winifred Cranston'),('P43','Egbert Claxton'),('P44','Antoinette Bertie'),
      ('P45','Rolston Seaton'),('P46','Gloria Rodriquez'),('P47','Bertram Knight'),('P48','Nadine Prentice'),
      ('P49','Cuthbert Panton'),('P50','Rhoda Vanterpool')
    ) AS t(k,nm)
  LOOP
    v_party := cert_uuid('party:person:'||r.k);
    INSERT INTO parties (id, party_kind, display_name) VALUES (v_party,'PERSON',r.nm)
      ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;
    INSERT INTO persons (party_id, full_name, given_name, family_name)
      VALUES (v_party, r.nm, split_part(r.nm,' ',1), split_part(r.nm,' ',2))
      ON CONFLICT (party_id) DO UPDATE SET full_name = EXCLUDED.full_name;
  END LOOP;

  ------------------------------------------------------------------
  -- 3. Regulated entity cohort (20)
  ------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      ('E01','Atlantic Commercial Bank Ltd','atlanticcommercialbank','Commercial Bank','authorised','verified','PUBLIC_AFTER_AUTHORISATION','SYSTEMIC'),
      ('E02','Caribbean Merchant Bank Ltd','caribbeanmerchantbank','Merchant Bank','authorised','verified','PUBLIC','HIGH'),
      ('E03','Federation Credit Finance Ltd','federationcreditfinance','Micro-credit Institution','authorised','verified','PUBLIC_AFTER_AUTHORISATION','MEDIUM'),
      ('E04','Eastern Caribbean Mortgage Ltd','easterncaribbeanmortgage','Building Society','authorised','verified','PUBLIC_AFTER_AUTHORISATION','MEDIUM'),
      ('E05','St Kitts Community Credit Ltd','stkittscommunitycredit','Micro-credit Institution','former_licensee','verified','PUBLIC_LIMITED','LOW'),
      ('E06','Caribbean General Insurance Ltd','caribbeangeneralinsurance','General Insurance','authorised','verified','PUBLIC','HIGH'),
      ('E07','Nevis Life Assurance Ltd','nevislifeassurance','Life Insurance','authorised','verified','PUBLIC_AFTER_AUTHORISATION','MEDIUM'),
      ('E08','Island Reinsurance Ltd','islandreinsurance','General Insurance','authorised','verified','PUBLIC_AFTER_AUTHORISATION','MEDIUM'),
      ('E09','Federation Insurance Brokers Ltd','federationinsurancebrokers','General Insurance','authorised','verified','PUBLIC_AFTER_AUTHORISATION','LOW'),
      ('E10','Island Payments Ltd','islandpayments','Payment Service Provider','authorised','verified','PUBLIC','HIGH'),
      ('E11','Caribbean Money Services Ltd','caribbeanmoneyservices','Money Service Business','authorised','verified','PUBLIC_AFTER_AUTHORISATION','MEDIUM'),
      ('E12','Federation Remittance Services Ltd','federationremittance','Money Service Business','authorised','verified','PUBLIC_AFTER_AUTHORISATION','MEDIUM'),
      ('E13','Eastern Digital Wallet Ltd','easterndigitalwallet','Payment Service Provider','authorised','provisional','PUBLIC_AFTER_AUTHORISATION','LOW'),
      ('E14','Caribbean Capital Markets Ltd','caribbeancapitalmarkets','Securities Dealer','authorised','verified','PUBLIC','HIGH'),
      ('E15','Nevis Investment Management Ltd','nevisinvestmentmanagement','Securities Dealer','authorised','verified','PUBLIC_AFTER_AUTHORISATION','MEDIUM'),
      ('E16','Federation Securities Ltd','federationsecurities','Securities Dealer','authorised','verified','PUBLIC_AFTER_AUTHORISATION','MEDIUM'),
      ('E17','Caribbean Trust & Corporate Services Ltd','caribbeantrustcorporateservices','Financial Holding Company','authorised','verified','PUBLIC_AFTER_AUTHORISATION','MEDIUM'),
      ('E18','Nevis Fiduciary Services Ltd','nevisfiduciaryservices','Financial Holding Company','applicant','pending_verification','NOT_PUBLISHED','LOW'),
      ('E19','Heritage Finance Ltd','heritagefinance','Pension Fund Administrator','authorised','verified','PUBLIC_AFTER_AUTHORISATION','MEDIUM'),
      ('E20','Nevis Digital Finance Ltd','nevisdigitalfinance','Payment Service Provider','applicant','provisional','NOT_PUBLISHED','LOW')
    ) AS t(k,nm,slug,sector_name,lifecycle,identity_status,pub_policy,importance)
  LOOP
    v_party  := cert_uuid('party:org:'||r.k);
    v_entity := cert_uuid('entity:'||r.k);

    INSERT INTO parties (id, party_kind, display_name) VALUES (v_party,'ORGANIZATION', r.nm)
      ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;
    INSERT INTO organizations (party_id, legal_name, display_name, legal_name_authority, legal_name_verified_at)
      VALUES (v_party, r.nm, r.nm,
              CASE WHEN r.identity_status='verified' THEN 'LOCAL_VERIFIED' ELSE 'LOCAL_PROVISIONAL' END,
              CASE WHEN r.identity_status='verified' THEN TIMESTAMPTZ '2024-02-01 00:00+00' ELSE NULL END)
      ON CONFLICT (party_id) DO UPDATE SET legal_name = EXCLUDED.legal_name;

    INSERT INTO licensees (id, name, party_id, sector_id, sub_sector_id, category_id,
                           lifecycle_stage_id, identity_status_id, publication_policy_id,
                           public_slug, status, systemic_importance, lead_regulator_id, created_at)
    SELECT v_entity, r.nm, v_party, s.id, ss.id, c.id,
           (SELECT id FROM lifecycle_stages WHERE key = r.lifecycle AND domain='entity'),
           (SELECT id FROM entity_identity_statuses WHERE key = r.identity_status),
           (SELECT id FROM registry_publication_policies WHERE key = r.pub_policy),
           'cert-'||r.slug,
           CASE WHEN r.lifecycle='former_licensee' THEN 'inactive' ELSE 'active' END,
           r.importance, NULL, TIMESTAMPTZ '2024-01-15 00:00+00'
    FROM sectors s
    JOIN sub_sectors ss ON ss.sector_id = s.id AND ss.name = s.name
    JOIN categories c ON c.sub_sector_id = ss.id AND c.name = s.name
    WHERE s.name = r.sector_name
    ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, party_id = EXCLUDED.party_id, sector_id = EXCLUDED.sector_id,
          sub_sector_id = EXCLUDED.sub_sector_id, category_id = EXCLUDED.category_id,
          lifecycle_stage_id = EXCLUDED.lifecycle_stage_id, identity_status_id = EXCLUDED.identity_status_id,
          publication_policy_id = EXCLUDED.publication_policy_id, public_slug = EXCLUDED.public_slug,
          status = EXCLUDED.status, systemic_importance = EXCLUDED.systemic_importance;

    -- canonical identifiers (never a licence number)
    INSERT INTO entity_identifiers (id, entity_id, identifier_type_id, identifier_value, normalized_value,
                                    uniqueness_scope, is_primary, verification_status, effective_from,
                                    source_type, source_reference, regulator_id, jurisdiction_id)
    SELECT cert_uuid('ident:'||r.k||':'||t.key), v_entity, t.id, x.val, x.val, t.uniqueness_scope,
           (t.key='company_registration_number'),
           CASE WHEN r.identity_status='verified' THEN 'VERIFIED' ELSE 'PROVISIONAL' END,
           TIMESTAMPTZ '2024-01-15 00:00+00', 'MANUAL', 'CERTIFICATION DATASET v1',
           CASE WHEN t.uniqueness_scope='REGULATOR' THEN v_reg ELSE NULL END,
           CASE WHEN t.uniqueness_scope='JURISDICTION' THEN cert_uuid('country:KN') ELSE NULL END
    FROM entity_identifier_types t
    JOIN (VALUES
      ('company_registration_number','CRN'||substr(r.k,2,2)||'0'||substr(r.k,2,2)||'KN'),
      ('regulatory_entity_number','REN-'||substr(r.k,2,2)||'-0'||substr(r.k,2,2)),
      ('taxpayer_registration_number','9'||substr(r.k,2,2)||'00'||substr(r.k,2,2)||'11')
    ) AS x(tkey,val) ON x.tkey = t.key
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO certification_seed_manifest (scenario_key, record_kind, display_name, party_id,
      organization_party_id, entity_id, public_slug, entity_email, primary_identifiers, notes)
    VALUES (r.k,'REGULATED_ENTITY', r.nm, v_party, v_party, v_entity, 'cert-'||r.slug,
            r.slug||'@mishainfotech.com',
            jsonb_build_object(
              'company_registration_number','CRN'||substr(r.k,2,2)||'0'||substr(r.k,2,2)||'KN',
              'regulatory_entity_number','REN-'||substr(r.k,2,2)||'-0'||substr(r.k,2,2),
              'taxpayer_registration_number','9'||substr(r.k,2,2)||'00'||substr(r.k,2,2)||'11'),
            'Sector: '||r.sector_name||'; lifecycle: '||r.lifecycle||'; publication: '||r.pub_policy)
    ON CONFLICT (dataset_key, scenario_key, record_kind) DO UPDATE
      SET display_name = EXCLUDED.display_name, party_id = EXCLUDED.party_id,
          organization_party_id = EXCLUDED.organization_party_id, entity_id = EXCLUDED.entity_id,
          public_slug = EXCLUDED.public_slug, entity_email = EXCLUDED.entity_email,
          primary_identifiers = EXCLUDED.primary_identifiers, notes = EXCLUDED.notes, updated_at = now();
  END LOOP;

  ------------------------------------------------------------------
  -- 4. Applications + licences (entity-id-first)
  ------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      -- key, entity_key, sector for licence, licence status, app status, conditions, is_primary, issued
      ('L01','E01','Commercial Bank','active','approved',NULL,true,'2024-03-01'),
      ('L02','E01','Securities Dealer','active','approved',NULL,false,'2025-02-01'),
      ('L03','E02','Merchant Bank','active','approved',NULL,true,'2024-03-15'),
      ('L04','E02','Securities Dealer','active','approved',NULL,false,'2025-04-01'),
      ('L05','E03','Micro-credit Institution','active','approved','Lending limited to XCD 5m aggregate exposure; quarterly conditional reporting required.',true,'2024-04-01'),
      ('L06','E04','Building Society','active','approved',NULL,true,'2024-04-15'),
      ('L07','E05','Micro-credit Institution','surrendered','approved',NULL,true,'2021-06-01'),
      ('L08','E06','General Insurance','active','approved',NULL,true,'2024-05-01'),
      ('L09','E06','Life Insurance','active','approved',NULL,false,'2025-01-15'),
      ('L10','E07','Life Insurance','active','approved',NULL,true,'2024-05-15'),
      ('L11','E08','General Insurance','active','approved',NULL,true,'2024-06-01'),
      ('L12','E09','General Insurance','suspended','approved',NULL,true,'2024-06-15'),
      ('L13','E10','Payment Service Provider','active','approved',NULL,true,'2024-07-01'),
      ('L14','E10','Money Service Business','active','approved',NULL,false,'2025-03-01'),
      ('L15','E11','Money Service Business','active','approved',NULL,true,'2024-07-15'),
      ('L16','E12','Money Service Business','restricted','approved','Restricted to inbound remittance corridors pending AML remediation.',true,'2024-08-01'),
      ('L17','E13','Payment Service Provider','active','approved',NULL,true,'2024-08-15'),
      ('L18','E14','Securities Dealer','active','approved',NULL,true,'2024-09-01'),
      ('L19','E14','Securities Dealer','active','approved','Restricted to discretionary portfolio management activity.',false,'2025-05-01'),
      ('L20','E15','Securities Dealer','active','approved',NULL,true,'2024-09-15'),
      ('L21','E16','Securities Dealer','active','approved',NULL,true,'2024-10-01'),
      ('L22','E17','Financial Holding Company','active','approved',NULL,true,'2024-10-15'),
      ('L23','E19','Pension Fund Administrator','active','approved',NULL,true,'2024-11-01')
    ) AS t(k, ek, sector_name, lic_status, app_status, cond, is_primary, issued)
  LOOP
    v_entity := cert_uuid('entity:'||r.ek);
    v_app := cert_uuid('app:'||r.k);
    v_lic := cert_uuid('lic:'||r.k);

    INSERT INTO applications (id, application_number, applicant_id, entity_id, license_type, status,
                              submitted_at, approved_at, data, regulator_id, created_at)
    SELECT v_app, 'CERT-APP-'||substr(r.k,2,3), v_seed_user, v_entity, r.sector_name||' Licence', 'approved',
           (r.issued::date - 60)::timestamptz, r.issued::timestamptz,
           jsonb_build_object('certification_dataset','CERTIFICATION_DATASET_V1',
                              'scenario_key', r.k,
                              'contact_email', (SELECT entity_email FROM certification_seed_manifest
                                                WHERE scenario_key = r.ek AND record_kind='REGULATED_ENTITY'),
                              'legal_name', (SELECT name FROM licensees WHERE id = v_entity)),
           v_reg, (r.issued::date - 90)::timestamptz
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, entity_id = EXCLUDED.entity_id;

    INSERT INTO licenses (id, application_id, holder_id, license_number, license_type, sector_id,
                          sub_sector_id, category_id, status, issued_at, valid_from, valid_until,
                          conditions, regulator_id, created_at)
    SELECT v_lic, v_app, v_entity, 'CERT-LIC-'||substr(r.k,2,3), r.sector_name||' Licence',
           s.id, ss.id, c.id, r.lic_status, r.issued::timestamptz, r.issued::timestamptz,
           (r.issued::date + INTERVAL '3 years')::timestamptz, r.cond, v_reg, r.issued::timestamptz
    FROM sectors s
    JOIN sub_sectors ss ON ss.sector_id = s.id AND ss.name = s.name
    JOIN categories c ON c.sub_sector_id = ss.id AND c.name = s.name
    WHERE s.name = r.sector_name
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, conditions = EXCLUDED.conditions;

    INSERT INTO entity_licenses (id, entity_id, license_id, effective_from, effective_to, is_primary, source)
    VALUES (cert_uuid('entlic:'||r.k), v_entity, v_lic, r.issued::timestamptz,
            CASE WHEN r.lic_status='surrendered' THEN TIMESTAMPTZ '2024-06-30 00:00+00' ELSE NULL END,
            r.is_primary, 'MANUAL')
    ON CONFLICT (id) DO UPDATE SET is_primary = EXCLUDED.is_primary, effective_to = EXCLUDED.effective_to;

    IF r.is_primary THEN
      UPDATE licensees SET license_id = v_lic WHERE id = v_entity;
    END IF;
  END LOOP;

  -- Licence-period history: 5 closed then re-opened periods (no destructive overwrite)
  FOR r IN SELECT * FROM (VALUES ('L01','E01'),('L03','E02'),('L08','E06'),('L13','E10'),('L18','E14')) AS t(k,ek)
  LOOP
    INSERT INTO entity_licenses (id, entity_id, license_id, effective_from, effective_to, is_primary, source)
    VALUES (cert_uuid('entlic:hist:'||r.k), cert_uuid('entity:'||r.ek), cert_uuid('lic:'||r.k),
            TIMESTAMPTZ '2023-01-01 00:00+00', TIMESTAMPTZ '2024-01-31 00:00+00', false, 'MANUAL')
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  ------------------------------------------------------------------
  -- 5. In-flight / exception applications
  ------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      ('A24','E18','Financial Holding Company Licence','submitted','2026-06-01'),
      ('A25','E20','Payment Service Provider Licence','under_review','2026-05-10'),
      ('A26','E16','Securities Dealer Licence Variation','rejected','2026-02-15'),
      ('A27','E11','Money Service Business Licence Variation','withdrawn','2026-03-20')
    ) AS t(k, ek, ltype, st, sub)
  LOOP
    v_entity := cert_uuid('entity:'||r.ek);
    INSERT INTO applications (id, application_number, applicant_id, entity_id, license_type, status,
                              submitted_at, rejected_at, cancelled_at, data, regulator_id, created_at)
    VALUES (cert_uuid('app:'||r.k), 'CERT-APP-'||substr(r.k,2,3), v_seed_user, v_entity, r.ltype, r.st,
            r.sub::timestamptz,
            CASE WHEN r.st='rejected' THEN (r.sub::date + 30)::timestamptz END,
            CASE WHEN r.st='withdrawn' THEN (r.sub::date + 14)::timestamptz END,
            jsonb_build_object('certification_dataset','CERTIFICATION_DATASET_V1','scenario_key', r.k,
                               'contact_email', (SELECT entity_email FROM certification_seed_manifest
                                                 WHERE scenario_key = r.ek AND record_kind='REGULATED_ENTITY')),
            v_reg, (r.sub::date - 20)::timestamptz)
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;
  END LOOP;

  ------------------------------------------------------------------
  -- 6. Entity resolution coverage
  ------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      ('R1','Atlantic Commercial Bank Ltd','RESOLVED','EXACT_MATCH','LOCAL_ONLY','E01','Exact normalized legal name and company registration number matched the existing entity.'),
      ('R2','Caribbean Merchant Bank Limited','OPEN','POSSIBLE_MATCH','LOCAL_ONLY',NULL,'Name similarity to two existing entities — officer review required. No duplicate entity created.'),
      ('R3','Nevis Digital Finance Ltd','RESOLVED','CONFIRMED_NEW','LOCAL_ONLY','E20','No match found; officer confirmed a new entity for the applicant.'),
      ('R4','Island Reinsurance Holdings Ltd','ESCALATED','PROVIDER_UNAVAILABLE','PROVIDER_UNAVAILABLE',NULL,'External registry provider unavailable — failure policy escalated the case.'),
      ('R5','Island Payments Ltd','RESOLVED','RESOLVED_EXISTING','LOCAL_ONLY','E10','Existing entity confirmed for a new user authority (membership) request.'),
      ('R6','Caribbean Capital Markets Ltd','RESOLVED','RESOLVED_EXISTING','LOCAL_ONLY','E14','Existing entity confirmed for a second licence application — no second entity created.')
    ) AS t(k, subj, st, outcome, provider, ek, notes)
  LOOP
    INSERT INTO entity_resolution_cases (id, case_number, status, outcome, subject_name, subject_identifiers,
      subject_payload, provider_status, authority_mode, resolved_entity_id, decision_notes,
      requested_by, requested_at, resolved_by, resolved_at, escalated_at)
    VALUES (cert_uuid('rescase:'||r.k), 'CERT-ERC-'||substr(r.k,2,2), r.st, r.outcome, r.subj,
            '[]'::jsonb, jsonb_build_object('legal_name', r.subj, 'certification_dataset','CERTIFICATION_DATASET_V1'),
            r.provider, 'LOCAL_AUTHORITATIVE',
            CASE WHEN r.ek IS NOT NULL THEN cert_uuid('entity:'||r.ek) END, r.notes,
            v_seed_user, TIMESTAMPTZ '2026-04-01 00:00+00',
            CASE WHEN r.st='RESOLVED' THEN v_seed_user END,
            CASE WHEN r.st='RESOLVED' THEN TIMESTAMPTZ '2026-04-03 00:00+00' END,
            CASE WHEN r.st='ESCALATED' THEN TIMESTAMPTZ '2026-04-02 00:00+00' END)
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, outcome = EXCLUDED.outcome,
      resolved_entity_id = EXCLUDED.resolved_entity_id, decision_notes = EXCLUDED.decision_notes;
  END LOOP;

  INSERT INTO entity_match_candidates (id, case_id, entity_id, match_score, match_basis, signals, is_selected)
  VALUES
    (cert_uuid('rescand:R1:E01'), cert_uuid('rescase:R1'), cert_uuid('entity:E01'), 1.00,'NORMALIZED_LEGAL_NAME_AND_IDENTIFIER','{"identifier":"exact"}'::jsonb, true),
    (cert_uuid('rescand:R2:E02'), cert_uuid('rescase:R2'), cert_uuid('entity:E02'), 0.86,'NORMALIZED_LEGAL_NAME_SIMILARITY','{"similarity":0.86}'::jsonb, false),
    (cert_uuid('rescand:R2:E11'), cert_uuid('rescase:R2'), cert_uuid('entity:E11'), 0.61,'NORMALIZED_LEGAL_NAME_SIMILARITY','{"similarity":0.61}'::jsonb, false),
    (cert_uuid('rescand:R5:E10'), cert_uuid('rescase:R5'), cert_uuid('entity:E10'), 0.98,'NORMALIZED_LEGAL_NAME','{"similarity":0.98}'::jsonb, true),
    (cert_uuid('rescand:R6:E14'), cert_uuid('rescase:R6'), cert_uuid('entity:E14'), 0.99,'NORMALIZED_LEGAL_NAME','{"similarity":0.99}'::jsonb, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO entity_resolution_events (id, case_id, event_type, actor_id, detail)
  SELECT cert_uuid('resevt:'||c.case_number), c.id, 'CERTIFICATION_SEED', v_seed_user,
         jsonb_build_object('outcome', c.outcome, 'dataset','CERTIFICATION_DATASET_V1')
  FROM entity_resolution_cases c WHERE c.case_number LIKE 'CERT-ERC-%'
  ON CONFLICT (id) DO NOTHING;
END;
$fn$;

REVOKE ALL ON FUNCTION public.cert_seed_identity_v1() FROM PUBLIC, anon, authenticated;

-- Run it with product-side automation triggers held back (seed data is authored explicitly)
ALTER TABLE public.applications DISABLE TRIGGER USER;
ALTER TABLE public.licenses DISABLE TRIGGER USER;
ALTER TABLE public.licensees DISABLE TRIGGER USER;
SELECT public.cert_seed_identity_v1();
ALTER TABLE public.licensees ENABLE TRIGGER USER;
ALTER TABLE public.licenses ENABLE TRIGGER USER;
ALTER TABLE public.applications ENABLE TRIGGER USER;
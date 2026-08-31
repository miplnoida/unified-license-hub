-- =====================================================================
-- DEMO ENVIRONMENT: DEMO_SLU_FSRA_2026
-- Saint Lucia FSRA final demonstration seed — STAGE 1
-- Canonical universe: entities, persons, appointments, ownership,
-- addresses, registered agent, financial group.
--
-- Properties:
--   * Idempotent — fixed UUIDs + ON CONFLICT DO NOTHING. Running twice
--     creates zero duplicate business records.
--   * Non-production guarded — refuses to run in a production database.
--   * Canonical only — no new tables, no retired ratio store, no RLS or
--     permission changes. Derived values (effective ownership, ratios,
--     risk, coverage) are NEVER stored by this seed; they are computed by
--     the certified engines from this source data.
--   * All records are synthetic and tagged (SAINT-LUCIA-FSRA-DEMO),
--     matching the existing FSRA demo convention.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF public.is_production_environment() THEN
    RAISE EXCEPTION 'DEMO seed refused: production environment';
  END IF;
END $$;

-- Act as the certification super admin so governed RPCs authorise on auth.uid().
SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', (SELECT id::text FROM auth.users WHERE email = 'super_admin@mishainfotech.com'),
    'role', 'authenticated')::text, true);

-- ---------------------------------------------------------------------
-- 1. Legal persons (parties + organizations)
-- ---------------------------------------------------------------------
INSERT INTO public.parties (id, party_kind, display_name) VALUES
  ('5c1b0001-0000-4000-8000-000000000001','ORGANIZATION','Hewanorra Nexus Digital Finance Ltd (SAINT-LUCIA-FSRA-DEMO)'),
  ('5c1b0002-0000-4000-8000-000000000002','ORGANIZATION','Piton Community Credit Union Ltd (SAINT-LUCIA-FSRA-DEMO)'),
  ('5c1b0003-0000-4000-8000-000000000003','ORGANIZATION','Coral Corporate & Fiduciary Services Ltd (SAINT-LUCIA-FSRA-DEMO)'),
  ('5c1b0004-0000-4000-8000-000000000004','ORGANIZATION','Soufriere Shield Insurance Ltd (SAINT-LUCIA-FSRA-DEMO)'),
  ('5c1b0005-0000-4000-8000-000000000005','ORGANIZATION','Marigot International Bank Ltd (SAINT-LUCIA-FSRA-DEMO)'),
  ('5c1b0006-0000-4000-8000-000000000006','ORGANIZATION','Rodney Bay Fund Administrators Ltd (SAINT-LUCIA-FSRA-DEMO)'),
  ('5c1b0007-0000-4000-8000-000000000007','ORGANIZATION','Castries Remittance Services Ltd (SAINT-LUCIA-FSRA-DEMO)'),
  ('5c1b0008-0000-4000-8000-000000000008','ORGANIZATION','Lucia Pension Services Ltd (SAINT-LUCIA-FSRA-DEMO)'),
  ('5c1b0009-0000-4000-8000-000000000009','ORGANIZATION','Piton Finance Services Ltd (SAINT-LUCIA-FSRA-DEMO)'),
  ('5c1b0010-0000-4000-8000-000000000010','ORGANIZATION','Piton Property Holdings Ltd (SAINT-LUCIA-FSRA-DEMO)'),
  -- Non-licensee corporate owners (upper ownership layers)
  ('5c1d0001-0000-4000-8000-000000000001','ORGANIZATION','Nexus Caribbean Holdings Ltd (SAINT-LUCIA-FSRA-DEMO)'),
  ('5c1d0002-0000-4000-8000-000000000002','ORGANIZATION','Lucia Payments Holdings Ltd (SAINT-LUCIA-FSRA-DEMO)'),
  ('5c1d0003-0000-4000-8000-000000000003','ORGANIZATION','Caribbean Digital Ventures Ltd (SAINT-LUCIA-FSRA-DEMO)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (party_id, legal_name, display_name, legal_name_authority)
SELECT p.id, p.display_name, p.display_name, 'LOCAL_PROVISIONAL'
FROM public.parties p
WHERE p.id::text LIKE '5c1b00%' OR p.id::text LIKE '5c1d00%'
ON CONFLICT (party_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Natural persons (parties + persons)
-- ---------------------------------------------------------------------
INSERT INTO public.parties (id, party_kind, display_name) VALUES
  ('5c1c0001-0000-4000-8000-000000000001','PERSON','Alicia Joseph (SAINT-LUCIA-FSRA-DEMO)'),
  ('5c1c0002-0000-4000-8000-000000000002','PERSON','Daniel Mercer (SAINT-LUCIA-FSRA-DEMO)'),
  ('5c1c0003-0000-4000-8000-000000000003','PERSON','Nadine Pierre (SAINT-LUCIA-FSRA-DEMO)'),
  ('5c1c0004-0000-4000-8000-000000000004','PERSON','Sophia Baptiste (SAINT-LUCIA-FSRA-DEMO)'),
  ('5c1c0005-0000-4000-8000-000000000005','PERSON','Andre Paul (SAINT-LUCIA-FSRA-DEMO)'),
  ('5c1c0006-0000-4000-8000-000000000006','PERSON','Leah Auguste (SAINT-LUCIA-FSRA-DEMO)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.persons (party_id, full_name, given_name, family_name) VALUES
  ('5c1c0001-0000-4000-8000-000000000001','Alicia Joseph (SAINT-LUCIA-FSRA-DEMO)','Alicia','Joseph'),
  ('5c1c0002-0000-4000-8000-000000000002','Daniel Mercer (SAINT-LUCIA-FSRA-DEMO)','Daniel','Mercer'),
  ('5c1c0003-0000-4000-8000-000000000003','Nadine Pierre (SAINT-LUCIA-FSRA-DEMO)','Nadine','Pierre'),
  ('5c1c0004-0000-4000-8000-000000000004','Sophia Baptiste (SAINT-LUCIA-FSRA-DEMO)','Sophia','Baptiste'),
  ('5c1c0005-0000-4000-8000-000000000005','Andre Paul (SAINT-LUCIA-FSRA-DEMO)','Andre','Paul'),
  ('5c1c0006-0000-4000-8000-000000000006','Leah Auguste (SAINT-LUCIA-FSRA-DEMO)','Leah','Auguste')
ON CONFLICT (party_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Supervised entities (licensees) on the canonical FSRA sector model
-- ---------------------------------------------------------------------
INSERT INTO public.licensees
  (id, name, party_id, sector_id, sub_sector_id, status, lead_regulator_id,
   lifecycle_stage_id, identity_status_id)
VALUES
  -- SLU-ENT-001 applicant (Virtual Asset Business / VASP)
  ('5c1a0001-0000-4000-8000-000000000001','Hewanorra Nexus Digital Finance Ltd (SAINT-LUCIA-FSRA-DEMO)',
   '5c1b0001-0000-4000-8000-000000000001',
   'ba6f00d3-b9c2-4c7a-94ce-11181db69a99','36a489e2-1d78-4736-b66f-b96529575ba6','active',
   NULL,
   '94759371-4e04-48f3-829e-e34f0b7b37aa','326157a4-66b1-4ec0-ad9e-3d06115736bc'),
  -- SLU-ENT-002 main supervised institution (Credit Unions / Credit Union)
  ('5c1a0002-0000-4000-8000-000000000002','Piton Community Credit Union Ltd (SAINT-LUCIA-FSRA-DEMO)',
   '5c1b0002-0000-4000-8000-000000000002',
   '17a9fbec-5377-4f3d-a7b8-e2c357966d23','fb630e15-a4a6-43d8-b002-ade1039f9edc','active',
   NULL, NULL,'a0c1e6a4-ad03-4ad8-ad84-8035c9769dbb'),
  -- SLU-ENT-003 registered agent / corporate service provider
  ('5c1a0003-0000-4000-8000-000000000003','Coral Corporate & Fiduciary Services Ltd (SAINT-LUCIA-FSRA-DEMO)',
   '5c1b0003-0000-4000-8000-000000000003',
   'b1a44f80-9c68-4039-acac-f31e2067cb40','e6379b66-c175-436c-833e-5e3bd6af2156','active',
   NULL, NULL,'a0c1e6a4-ad03-4ad8-ad84-8035c9769dbb'),
  -- SLU-ENT-004..008 comparators
  ('5c1a0004-0000-4000-8000-000000000004','Soufriere Shield Insurance Ltd (SAINT-LUCIA-FSRA-DEMO)',
   '5c1b0004-0000-4000-8000-000000000004',
   'd6daa71a-35c0-4987-ac9a-a73a94bcdbc8','0c6f360c-fcdc-478c-831e-553264bfbbe5','active',
   NULL, NULL,'a0c1e6a4-ad03-4ad8-ad84-8035c9769dbb'),
  ('5c1a0005-0000-4000-8000-000000000005','Marigot International Bank Ltd (SAINT-LUCIA-FSRA-DEMO)',
   '5c1b0005-0000-4000-8000-000000000005',
   '6e089cf6-975e-4f55-982f-bc75bf54b896','480872b8-9ca5-4692-88fa-68431a4c3aed','active',
   NULL, NULL,'a0c1e6a4-ad03-4ad8-ad84-8035c9769dbb'),
  ('5c1a0006-0000-4000-8000-000000000006','Rodney Bay Fund Administrators Ltd (SAINT-LUCIA-FSRA-DEMO)',
   '5c1b0006-0000-4000-8000-000000000006',
   '875deb8f-b392-412e-949c-264ea535c92d','9b053879-0df4-457a-84b1-9695dc26cb77','active',
   NULL, NULL,'a0c1e6a4-ad03-4ad8-ad84-8035c9769dbb'),
  ('5c1a0007-0000-4000-8000-000000000007','Castries Remittance Services Ltd (SAINT-LUCIA-FSRA-DEMO)',
   '5c1b0007-0000-4000-8000-000000000007',
   '48c4caeb-3c31-408e-9cac-778e3e8fe7c6','711ed24f-ecb1-40bf-bd50-e4b8f9b3663b','active',
   NULL, NULL,'a0c1e6a4-ad03-4ad8-ad84-8035c9769dbb'),
  ('5c1a0008-0000-4000-8000-000000000008','Lucia Pension Services Ltd (SAINT-LUCIA-FSRA-DEMO)',
   '5c1b0008-0000-4000-8000-000000000008',
   'd6daa71a-35c0-4987-ac9a-a73a94bcdbc8','e702cdec-0f3d-4bc4-a7d7-10bc21946b48','active',
   NULL, NULL,'a0c1e6a4-ad03-4ad8-ad84-8035c9769dbb'),
  -- Group members for SLU-GROUP-001
  ('5c1a0009-0000-4000-8000-000000000009','Piton Finance Services Ltd (SAINT-LUCIA-FSRA-DEMO)',
   '5c1b0009-0000-4000-8000-000000000009',
   '48c4caeb-3c31-408e-9cac-778e3e8fe7c6','450db6d6-c83b-47ce-b5cb-1438b7b4283d','active',
   NULL, NULL,'a0c1e6a4-ad03-4ad8-ad84-8035c9769dbb'),
  ('5c1a0010-0000-4000-8000-000000000010','Piton Property Holdings Ltd (SAINT-LUCIA-FSRA-DEMO)',
   '5c1b0010-0000-4000-8000-000000000010',
   '17a9fbec-5377-4f3d-a7b8-e2c357966d23','fb630e15-a4a6-43d8-b002-ade1039f9edc','active',
   NULL, NULL,'3c6f5b36-e80e-47f2-88ba-a34c685f55a7')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. Appointments — control/management layer (separate from ownership)
-- ---------------------------------------------------------------------
-- effective_from is set explicitly from the appointment date: the column default
-- (now()) would stamp every appointment with the seed run time, which breaks the
-- governance chronology and can end an appointment before it starts.
INSERT INTO public.entity_appointments
  (id, entity_id, person_party_id, role_type_id, appointment_date, effective_from, is_executive, status,
   regulatory_approval_status)
VALUES
  -- Alicia Joseph: CEO + Director
  ('5c1e0001-0000-4000-8000-000000000001','5c1a0001-0000-4000-8000-000000000001',
   '5c1c0001-0000-4000-8000-000000000001','71fb18d0-8a7c-48af-a749-82cfd146ee6a','2025-11-03','2025-11-03T00:00:00Z',true,'ACTIVE','APPROVED'),
  ('5c1e0002-0000-4000-8000-000000000002','5c1a0001-0000-4000-8000-000000000001',
   '5c1c0001-0000-4000-8000-000000000001','4a0f0d82-55ec-4c54-81b9-9a5df0ec0602','2025-11-03','2025-11-03T00:00:00Z',false,'ACTIVE','APPROVED'),
  -- Daniel Mercer: Director
  ('5c1e0003-0000-4000-8000-000000000003','5c1a0001-0000-4000-8000-000000000001',
   '5c1c0002-0000-4000-8000-000000000002','4a0f0d82-55ec-4c54-81b9-9a5df0ec0602','2025-11-03','2025-11-03T00:00:00Z',false,'ACTIVE','APPROVED'),
  -- Nadine Pierre: Compliance Officer + MLRO (0% ownership)
  ('5c1e0004-0000-4000-8000-000000000004','5c1a0001-0000-4000-8000-000000000001',
   '5c1c0003-0000-4000-8000-000000000003','c1b45b28-621b-4ed2-8032-c5c7cccbd06d','2025-12-01','2025-12-01T00:00:00Z',true,'ACTIVE','APPROVED'),
  ('5c1e0005-0000-4000-8000-000000000005','5c1a0001-0000-4000-8000-000000000001',
   '5c1c0003-0000-4000-8000-000000000003','f077a5d4-97f9-4e8f-83a0-0dd2f70894fa','2025-12-01','2025-12-01T00:00:00Z',true,'ACTIVE','APPROVED'),
  -- Sophia Baptiste: Finance Director (CFO role type, 0% ownership)
  ('5c1e0006-0000-4000-8000-000000000006','5c1a0001-0000-4000-8000-000000000001',
   '5c1c0004-0000-4000-8000-000000000004','60086ccb-e16b-48d0-8033-3c83ffc9e38f','2025-12-01','2025-12-01T00:00:00Z',true,'ACTIVE','APPROVED'),
  -- Daniel Mercer historic cross-entity appointment (Person 360 richness, ENDED)
  ('5c1e0007-0000-4000-8000-000000000007','5c1a0007-0000-4000-8000-000000000007',
   '5c1c0002-0000-4000-8000-000000000002','4a0f0d82-55ec-4c54-81b9-9a5df0ec0602','2021-06-01','2021-06-01T00:00:00Z',false,'ENDED','APPROVED')
ON CONFLICT (id) DO NOTHING;

-- Repair rows seeded before effective_from was explicit (ON CONFLICT DO NOTHING
-- leaves existing rows untouched).
UPDATE public.entity_appointments
   SET effective_from = appointment_date::timestamptz
 WHERE id::text LIKE '5c1e%'
   AND effective_from <> appointment_date::timestamptz;

UPDATE public.entity_appointments
   SET effective_to = '2024-12-31T00:00:00Z'
 WHERE id = '5c1e0007-0000-4000-8000-000000000007' AND effective_to IS NULL;


-- ---------------------------------------------------------------------
-- 5. Ownership — legal ledger only. Effective/indirect interest is
--    DERIVED by entity_ownership_network / entity_ubo_resolve.
-- ---------------------------------------------------------------------
-- Hewanorra Nexus direct shareholders = exactly 100%
INSERT INTO public.ownership_interests
  (id, owner_party_id, owned_entity_id, owned_party_id, ownership_type_id, economic_interest_percentage,
   voting_rights_percentage, is_direct, is_controller, control_determination,
   effective_from, approval_status, verified_at)
VALUES
  ('5c1f0001-0000-4000-8000-000000000001','5c1d0001-0000-4000-8000-000000000001',
   '5c1a0001-0000-4000-8000-000000000001',NULL,'dca687d0-4b0b-4432-aa74-33b1a7b3f279',60,60,true,true,'VERIFIED',
   '2025-11-03T00:00:00Z','APPROVED','2026-08-05T00:00:00Z'),
  ('5c1f0002-0000-4000-8000-000000000002','5c1c0002-0000-4000-8000-000000000002',
   '5c1a0001-0000-4000-8000-000000000001',NULL,'dca687d0-4b0b-4432-aa74-33b1a7b3f279',25,25,true,false,'VERIFIED',
   '2025-11-03T00:00:00Z','APPROVED','2026-08-05T00:00:00Z'),
  ('5c1f0003-0000-4000-8000-000000000003','5c1c0001-0000-4000-8000-000000000001',
   '5c1a0001-0000-4000-8000-000000000001',NULL,'dca687d0-4b0b-4432-aa74-33b1a7b3f279',15,15,true,false,'VERIFIED',
   '2025-11-03T00:00:00Z','APPROVED','2026-08-05T00:00:00Z'),
  -- Upper corporate layer: Nexus Caribbean Holdings Ltd (Barbados) = 100%
  ('5c1f0004-0000-4000-8000-000000000004','5c1c0001-0000-4000-8000-000000000001',
   NULL,'5c1d0001-0000-4000-8000-000000000001','dca687d0-4b0b-4432-aa74-33b1a7b3f279',65,65,true,true,'VERIFIED',
   '2024-04-01T00:00:00Z','APPROVED','2026-08-05T00:00:00Z'),
  ('5c1f0005-0000-4000-8000-000000000005','5c1c0002-0000-4000-8000-000000000002',
   NULL,'5c1d0001-0000-4000-8000-000000000001','dca687d0-4b0b-4432-aa74-33b1a7b3f279',35,35,true,false,'VERIFIED',
   '2024-04-01T00:00:00Z','APPROVED','2026-08-05T00:00:00Z'),
  -- Castries Remittance current structure (ownership-change case)
  ('5c1f0006-0000-4000-8000-000000000006','5c1d0002-0000-4000-8000-000000000002',
   '5c1a0007-0000-4000-8000-000000000007',NULL,'dca687d0-4b0b-4432-aa74-33b1a7b3f279',70,70,true,true,'VERIFIED',
   '2022-01-01T00:00:00Z','APPROVED','2026-01-15T00:00:00Z'),
  ('5c1f0007-0000-4000-8000-000000000007','5c1c0005-0000-4000-8000-000000000005',
   '5c1a0007-0000-4000-8000-000000000007',NULL,'dca687d0-4b0b-4432-aa74-33b1a7b3f279',30,30,true,false,'VERIFIED',
   '2022-01-01T00:00:00Z','APPROVED','2026-01-15T00:00:00Z'),
  -- Castries Remittance PROPOSED structure — pending regulatory review
  ('5c1f0008-0000-4000-8000-000000000008','5c1d0002-0000-4000-8000-000000000002',
   '5c1a0007-0000-4000-8000-000000000007',NULL,'dca687d0-4b0b-4432-aa74-33b1a7b3f279',50,50,true,true,'NOT_ASSESSED',
   '2026-10-01T00:00:00Z','PROPOSED',NULL),
  ('5c1f0009-0000-4000-8000-000000000009','5c1d0003-0000-4000-8000-000000000003',
   '5c1a0007-0000-4000-8000-000000000007',NULL,'dca687d0-4b0b-4432-aa74-33b1a7b3f279',20,20,true,false,'NOT_ASSESSED',
   '2026-10-01T00:00:00Z','PROPOSED',NULL),
  -- Piton group ownership (holding CU owns the two service companies)
  ('5c1f0010-0000-4000-8000-000000000010','5c1b0002-0000-4000-8000-000000000002',
   '5c1a0009-0000-4000-8000-000000000009',NULL,'dca687d0-4b0b-4432-aa74-33b1a7b3f279',100,100,true,true,'VERIFIED',
   '2023-01-01T00:00:00Z','APPROVED','2026-02-01T00:00:00Z'),
  ('5c1f0011-0000-4000-8000-000000000011','5c1b0002-0000-4000-8000-000000000002',
   '5c1a0010-0000-4000-8000-000000000010',NULL,'dca687d0-4b0b-4432-aa74-33b1a7b3f279',75,75,true,true,'VERIFIED',
   '2023-01-01T00:00:00Z','APPROVED','2026-02-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 6. Registered agent relationship (NOT ownership)
-- ---------------------------------------------------------------------
INSERT INTO public.party_relationships
  (id, source_party_id, target_party_id, relationship_type_id, entity_id, status, notes)
VALUES
  ('5c200001-0000-4000-8000-000000000001',
   '5c1b0003-0000-4000-8000-000000000003',
   '5c1b0001-0000-4000-8000-000000000001',
   'da4d258f-95e7-4ed3-bb22-1e92a032d98d',
   '5c1a0001-0000-4000-8000-000000000001',
   'ACTIVE',
   'Registered agent / corporate service provider. Not an ownership interest.')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 7. Addresses — canonical normalisation decides whether the applicant
--    and its registered agent resolve to ONE canonical address.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  addr_a uuid;
  addr_b uuid;
  usage_id uuid;
BEGIN
  addr_a := public.address_upsert_canonical(
    'LC', 'Suite 4, Harbour View Business Centre, 12 Demo Waterfront Avenue', NULL, NULL,
    'Castries', 'Castries', NULL,
    'Suite 4, Harbour View Business Centre, 12 Demo Waterfront Avenue, Castries, Saint Lucia');

  addr_b := public.address_upsert_canonical(
    'LC', 'Suite 4 Harbour View Business Ctr, 12 Demo Waterfront Ave.', NULL, NULL,
    'Castries', 'Castries', NULL,
    'Suite 4 Harbour View Business Ctr, 12 Demo Waterfront Ave., Castries, St. Lucia');

  -- Applicant registered address
  IF NOT EXISTS (SELECT 1 FROM public.address_usages
                  WHERE address_id = addr_a AND subject_id = '5c1a0001-0000-4000-8000-000000000001'
                    AND usage_type = 'REGISTERED') THEN
    usage_id := public.address_usage_propose(addr_a, 'ENTITY',
      '5c1a0001-0000-4000-8000-000000000001', 'REGISTERED', CURRENT_DATE - 200,
      'REGISTRATION', NULL, 'Demo application registered office');
    PERFORM public.address_usage_approve(usage_id, true);
  END IF;

  -- Registered agent business address
  IF NOT EXISTS (SELECT 1 FROM public.address_usages
                  WHERE address_id = addr_b AND subject_id = '5c1a0003-0000-4000-8000-000000000003'
                    AND usage_type = 'PRINCIPAL') THEN
    usage_id := public.address_usage_propose(addr_b, 'ENTITY',
      '5c1a0003-0000-4000-8000-000000000003', 'PRINCIPAL', CURRENT_DATE - 900,
      'REGISTRATION', NULL, 'Demo corporate service provider place of business');
    PERFORM public.address_usage_approve(usage_id, true);
  END IF;

  -- Daniel Mercer correspondence address at the same premises
  IF NOT EXISTS (SELECT 1 FROM public.address_usages
                  WHERE subject_id = '5c1c0002-0000-4000-8000-000000000002'
                    AND usage_type = 'CORRESPONDENCE') THEN
    usage_id := public.address_usage_propose(addr_a, 'PERSON',
      '5c1c0002-0000-4000-8000-000000000002', 'CORRESPONDENCE', CURRENT_DATE - 150,
      'FP_DECLARATION', NULL, 'Demo fit & proper declaration correspondence address');
    PERFORM public.address_usage_approve(usage_id, true);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 8. Financial group SLU-GROUP-001 (certified W1B architecture)
-- ---------------------------------------------------------------------
INSERT INTO public.financial_groups
  (id, group_code, name, holding_entity_id, sector_id, status, notes)
VALUES
  ('5c210001-0000-4000-8000-000000000001','SLU-GROUP-001',
   'Piton Financial Cooperative Group (SAINT-LUCIA-FSRA-DEMO)',
   '5c1a0002-0000-4000-8000-000000000002',
   '17a9fbec-5377-4f3d-a7b8-e2c357966d23','active',
   'Demonstration group perimeter. Consolidation treatment per configured methodology.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.financial_group_members
  (id, group_id, licensee_id, parent_member_id, member_role, ownership_percentage, consolidation_treatment, effective_date, notes)
VALUES
  ('5c220001-0000-4000-8000-000000000001','5c210001-0000-4000-8000-000000000001',
   '5c1a0002-0000-4000-8000-000000000002',NULL,'ultimate_holding',NULL,'full','2023-01-01',
   'Regulated credit union — parent of the group perimeter.'),
  ('5c220002-0000-4000-8000-000000000002','5c210001-0000-4000-8000-000000000001',
   '5c1a0009-0000-4000-8000-000000000009','5c220001-0000-4000-8000-000000000001','subsidiary',100,'full','2023-01-01',
   'Regulated money services subsidiary — fully consolidated.'),
  ('5c220003-0000-4000-8000-000000000003','5c210001-0000-4000-8000-000000000001',
   '5c1a0010-0000-4000-8000-000000000010','5c220001-0000-4000-8000-000000000001','subsidiary',75,'excluded','2023-01-01',
   'Non-regulated property holding company — excluded from prudential consolidation.')
ON CONFLICT (id) DO UPDATE
  SET parent_member_id = EXCLUDED.parent_member_id;

-- Active version 1 consolidation methodology so consolidated figures are
-- always traceable to a configured method (matches the app's own default
-- behaviour when a group is created through the UI).
INSERT INTO public.group_consolidation_methods
  (group_id, version, ratio_rules, eliminate_exposure_types, large_exposure_pct,
   total_assets_ratio_key, capital_ratio_key, is_active, notes)
VALUES
  ('5c210001-0000-4000-8000-000000000001', 1,
   '[{"ratio_key":"TOTAL_ASSETS","method":"sum","eliminate":true},
     {"ratio_key":"TOTAL_CAPITAL","method":"sum","eliminate":false},
     {"ratio_key":"CAPITAL_ADEQUACY_RATIO","method":"weighted_avg","eliminate":false},
     {"ratio_key":"LIQUIDITY_RATIO","method":"weighted_avg","eliminate":false},
     {"ratio_key":"NPL_RATIO","method":"weighted_avg","eliminate":false}]'::jsonb,
   ARRAY['loan','deposit','capital']::text[], 10,
   'TOTAL_ASSETS', 'TOTAL_CAPITAL', true,
   'Demonstration methodology (SAINT-LUCIA-FSRA-DEMO). Members treated per configured consolidation_treatment; excluded members contribute nothing.')
ON CONFLICT (group_id, version) DO NOTHING;



-- =====================================================================
-- CANONICAL LICENCE ATTACHMENTS (DEMO INTEGRITY REMEDIATION 2026-08-31)
--
-- Defect repaired: the demo entities appeared on the licence-holder register
-- purely because licensees.status = 'active'. public.entity_licenses is the
-- ONLY authority for entity-to-licence relationships; licensees.license_id is
-- deprecated and is NOT written here.
--
-- The manifest describes nine REGULATED demo entities plus one NON-FINANCIAL
-- group member (Piton Property Holdings Ltd). Each regulated entity therefore
-- receives exactly one canonical licence; Piton Property Holdings deliberately
-- receives none and must never be presented as a licence holder.
--
-- These are controlled historical demonstration records: no application is
-- invented, licence type mirrors the manifest sector wording, and the existing
-- trg_license_open_original_term trigger owns term creation (exactly one
-- current original term per licence). Deterministic IDs keep this idempotent.
-- =====================================================================

DO $$
DECLARE
  r          record;
  v_conflict int;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('01','5c1a0001-0000-4000-8000-000000000001','Virtual asset service provider'),
      ('02','5c1a0002-0000-4000-8000-000000000002','Credit union'),
      ('03','5c1a0003-0000-4000-8000-000000000003','Registered agent / trustee'),
      ('04','5c1a0004-0000-4000-8000-000000000004','Domestic general insurance'),
      ('05','5c1a0005-0000-4000-8000-000000000005','International bank (class B)'),
      ('06','5c1a0006-0000-4000-8000-000000000006','Mutual fund administrator'),
      ('07','5c1a0007-0000-4000-8000-000000000007','Money services business (class B)'),
      ('08','5c1a0008-0000-4000-8000-000000000008','Pension fund plan'),
      ('09','5c1a0009-0000-4000-8000-000000000009','Money services business (class A)')
    ) AS t(seq, entity_id, licence_type)
  LOOP
    -- Collision guard: never guess if another licence already owns the number.
    SELECT count(*) INTO v_conflict
      FROM public.licenses
     WHERE license_number = 'FSRA-SLU-2023-00' || r.seq
       AND id <> ('5c4000' || r.seq || '-0000-4000-8000-0000000000' || r.seq)::uuid;
    IF v_conflict > 0 THEN
      RAISE EXCEPTION 'DEMO seed blocked: licence number FSRA-SLU-2023-00% already used elsewhere', r.seq;
    END IF;

    INSERT INTO public.licenses
      (id, application_id, holder_id, license_number, license_type,
       sector_id, sub_sector_id, category_id, status,
       issued_at, valid_from, valid_until, conditions)
    SELECT ('5c4000' || r.seq || '-0000-4000-8000-0000000000' || r.seq)::uuid,
           NULL, l.id, 'FSRA-SLU-2023-00' || r.seq, r.licence_type,
           l.sector_id, l.sub_sector_id, l.category_id, 'active',
           '2023-01-15 00:00:00+00', '2023-01-15 00:00:00+00', '2027-12-31 00:00:00+00',
           'Controlled historical demonstration record (SAINT-LUCIA-FSRA-DEMO).'
      FROM public.licensees l
     WHERE l.id = r.entity_id::uuid
    ON CONFLICT (id) DO UPDATE
      SET holder_id      = EXCLUDED.holder_id,
          license_number = EXCLUDED.license_number,
          license_type   = EXCLUDED.license_type,
          sector_id      = EXCLUDED.sector_id,
          sub_sector_id  = EXCLUDED.sub_sector_id,
          status         = 'active',
          valid_until    = EXCLUDED.valid_until;

    -- Canonical entity <-> licence attachment: the authoritative reader.
    INSERT INTO public.entity_licenses
      (id, entity_id, license_id, effective_from, effective_to, is_primary, source)
    VALUES
      (('5c4100' || r.seq || '-0000-4000-8000-0000000000' || r.seq)::uuid,
       r.entity_id::uuid,
       ('5c4000' || r.seq || '-0000-4000-8000-0000000000' || r.seq)::uuid,
       '2023-01-15 00:00:00+00', NULL, true, 'MANUAL')
    ON CONFLICT (id) DO UPDATE
      SET effective_to = NULL, is_primary = true;

    -- The append-only term mechanism owns terms; assert its invariant only.
    SELECT count(*) INTO v_conflict
      FROM public.license_terms
     WHERE license_id = ('5c4000' || r.seq || '-0000-4000-8000-0000000000' || r.seq)::uuid
       AND is_current;
    IF v_conflict <> 1 THEN
      RAISE EXCEPTION 'DEMO seed: expected 1 current term for FSRA-SLU-2023-00%, found %', r.seq, v_conflict;
    END IF;
  END LOOP;

  -- Piton Property Holdings Ltd (5c1a0010…) is a NON-FINANCIAL group member:
  -- no licence by design. Its presence proves the "Not licensed" presentation.
  IF EXISTS (
    SELECT 1 FROM public.entity_licenses
     WHERE entity_id = '5c1a0010-0000-4000-8000-000000000010'
       AND (effective_to IS NULL OR effective_to > now())
  ) THEN
    RAISE EXCEPTION 'DEMO seed: non-financial group member must not hold a licence';
  END IF;
END $$;



COMMIT;

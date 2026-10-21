## Stage A: exact SQL (runs all-or-nothing, safe to run twice)

```sql
BEGIN;
DO $$ BEGIN
  IF public.is_production_environment() THEN RAISE EXCEPTION 'production refused'; END IF;
  IF EXISTS (SELECT 1 FROM parties WHERE display_name IN (
      'DEMO Rodney Bay Community Credit Union Ltd',
      'DEMO Vieux Fort Community Credit Union Ltd',
      'DEMO Castries Members Credit Union Ltd')
      AND id NOT IN ('cc330000-0000-4000-8000-000000000001',
                     'cc330000-0000-4000-8000-000000000002',
                     'cc330000-0000-4000-8000-000000000003'))
  THEN RAISE EXCEPTION 'duplicate name under another id'; END IF;
END $$;

INSERT INTO parties (id, party_kind, display_name) VALUES
 ('cc330000-0000-4000-8000-000000000001','organisation','DEMO Rodney Bay Community Credit Union Ltd'),
 ('cc330000-0000-4000-8000-000000000002','organisation','DEMO Vieux Fort Community Credit Union Ltd'),
 ('cc330000-0000-4000-8000-000000000003','organisation','DEMO Castries Members Credit Union Ltd')
ON CONFLICT (id) DO NOTHING;

INSERT INTO licensees (id, party_id, name, sector_id, sub_sector_id, lead_regulator_id, status) VALUES
 ('cc331000-0000-4000-8000-000000000001','cc330000-0000-4000-8000-000000000001','DEMO Rodney Bay Community Credit Union Ltd',
  '17a9fbec-5377-4f3d-a7b8-e2c357966d23','fb630e15-a4a6-43d8-b002-ade1039f9edc','8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3','active'),
 ('cc331000-0000-4000-8000-000000000002','cc330000-0000-4000-8000-000000000002','DEMO Vieux Fort Community Credit Union Ltd',
  '17a9fbec-5377-4f3d-a7b8-e2c357966d23','fb630e15-a4a6-43d8-b002-ade1039f9edc','8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3','active'),
 ('cc331000-0000-4000-8000-000000000003','cc330000-0000-4000-8000-000000000003','DEMO Castries Members Credit Union Ltd',
  '17a9fbec-5377-4f3d-a7b8-e2c357966d23','fb630e15-a4a6-43d8-b002-ade1039f9edc','8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3','active')
ON CONFLICT (id) DO NOTHING;
COMMIT;
```
Before running, I will check the allowed `party_kind` value against the existing credit union records and match it. I will also check that registration-number and contact fields follow the existing registry rules. If either check does not match, I stop and report back.

## Verification
```sql
SELECT p.id, p.display_name, l.id AS entity_id, l.sub_sector_id
FROM parties p JOIN licensees l ON l.party_id = p.id
WHERE p.id::text LIKE 'cc330000-%';                        -- expect 3 rows
SELECT count(*) FROM parties;  SELECT count(*) FROM licensees;  -- expect +3 each
```
Before and after the run I take a fingerprint of the existing Piton, Marigot and Dennery records. Both fingerprints must match.

## Rollback (only if nothing references the entities yet)
```sql
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM applications a JOIN licensees l ON l.applicant_id = a.applicant_id
             WHERE l.id::text LIKE 'cc331000-%') THEN RAISE EXCEPTION 'in use - refuse'; END IF;
END $$;
DELETE FROM licensees WHERE id::text LIKE 'cc331000-%';
DELETE FROM parties   WHERE id::text LIKE 'cc330000-%';
COMMIT;
```
Once Stage B has created applications, returns or complaints, removing these records is no longer allowed. That history is kept permanently.

## Expected counts
| Record | Change |
|---|---|
| Entities (parties) | +3 |
| Entity registry records (licensees) | +3 |
| Everything else | 0 |

## Configuration gaps
- No AML data in Session 3 while the freeze is in place.
- Licences, approvals, fees paid, risk ratings and enforcement decisions exist only after Stage B.
- Demo staff accounts are needed for Stage B. The existing certification test personas will be used.

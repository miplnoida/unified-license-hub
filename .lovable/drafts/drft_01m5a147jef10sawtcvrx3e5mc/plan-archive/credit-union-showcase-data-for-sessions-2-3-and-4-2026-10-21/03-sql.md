## Stage A: exact SQL (runs all-or-nothing, safe to run twice)

```sql
BEGIN;
DO $$ BEGIN
  IF public.is_production_environment() THEN RAISE EXCEPTION 'production refused'; END IF;
  IF EXISTS (SELECT 1 FROM parties
             WHERE display_name = 'Rodney Bay Community Credit Union Ltd'
               AND id <> 'cc330000-0000-4000-8000-000000000001')
  THEN RAISE EXCEPTION 'duplicate name under another id'; END IF;
END $$;

INSERT INTO parties (id, party_kind, display_name) VALUES
 ('cc330000-0000-4000-8000-000000000001','organisation','Rodney Bay Community Credit Union Ltd')
ON CONFLICT (id) DO NOTHING;

INSERT INTO licensees (id, party_id, name, sector_id, sub_sector_id, lead_regulator_id, status) VALUES
 ('cc331000-0000-4000-8000-000000000001','cc330000-0000-4000-8000-000000000001',
  'Rodney Bay Community Credit Union Ltd',
  '17a9fbec-5377-4f3d-a7b8-e2c357966d23','fb630e15-a4a6-43d8-b002-ade1039f9edc',
  '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3','active')
ON CONFLICT (id) DO NOTHING;
COMMIT;
```
Before running, I will check the allowed `party_kind` value and the registry rules against the existing credit union records. If either one does not match the SQL above, I stop and report back.

## Verification
```sql
SELECT p.id, p.display_name, l.id AS entity_id, l.sub_sector_id
FROM parties p JOIN licensees l ON l.party_id = p.id
WHERE p.id = 'cc330000-0000-4000-8000-000000000001';   -- expect 1 row
SELECT count(*) FROM parties; SELECT count(*) FROM licensees;   -- expect +1 each
```
I take a fingerprint of the existing Piton, Marigot and Dennery records before and after. They must match.

## Rollback (only while nothing references the entity)
```sql
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM applications a JOIN licensees l ON l.applicant_id = a.applicant_id
             WHERE l.id = 'cc331000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'in use - refuse'; END IF;
END $$;
DELETE FROM licensees WHERE id = 'cc331000-0000-4000-8000-000000000001';
DELETE FROM parties   WHERE id = 'cc330000-0000-4000-8000-000000000001';
COMMIT;
```
Once Stage B starts, removing this entity is no longer allowed. Its history is kept permanently.

## Expected counts
| Record | Change |
|---|---|
| Entities (parties) | +1 |
| Entity registry records (licensees) | +1 |
| Everything else | 0 |

## Gaps
- No AML/CFT data while the freeze is in place.
- The licence, approvals, paid fees, ratings and decisions exist only after Stage B.
- Stage B uses the existing test staff and licensee accounts.

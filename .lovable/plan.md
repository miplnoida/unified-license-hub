# Fix: `licensees.applicant_id` column missing

## Root cause

`public.provision_application_entity(_application_id uuid)` inserts into `public.licensees` with three columns:

```sql
INSERT INTO public.licensees (license_id, name, applicant_id)
VALUES (v_license.id, v_entity_name, v_app.applicant_id)
```

but the current `licensees` schema only has: `id, name, sector_id, sub_sector_id, category_id, license_id, status, created_at, updated_at`. No `applicant_id`. That's why `perform_final_workflow_approval` (which calls `provision_application_entity`) returns `42703: column "applicant_id" of relation "licensees" does not exist` right after the earlier `context` fix unblocked the flow.

No other function/table reads `licensees.applicant_id` — the other matches for "applicant_id" refer to `applications.applicant_id` or `profiles.id` joins. Safe to add the column.

## Fix (single migration)

Add the missing column and backfill:

```sql
ALTER TABLE public.licensees
  ADD COLUMN IF NOT EXISTS applicant_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_licensees_applicant_id
  ON public.licensees(applicant_id);

-- Backfill from the license's holder (holder_id is set to applicant_id at issue time)
UPDATE public.licensees l
   SET applicant_id = lic.holder_id
  FROM public.licenses lic
 WHERE l.license_id = lic.id
   AND l.applicant_id IS NULL
   AND lic.holder_id IS NOT NULL;
```

No RLS/policy changes needed — `licensees` policies do not reference this column. No frontend or edge-function code changes needed.

## Verification

1. Re-run the failing action: as the reviewer, click Approve on the final step of application `APP-2026-000106` → `perform_final_workflow_approval` should now return `success:true` and provision the licensee row with `applicant_id` populated.
2. `SELECT applicant_id FROM public.licensees WHERE license_id = ...` returns the applicant's user id.
3. Existing rows are backfilled where the license has a holder; older rows without a holder simply keep `NULL` (nullable column, no constraint break).

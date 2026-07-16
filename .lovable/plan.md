## Problem
The "Map to licensee" search returns no results because the query targets `licensees.legal_name`, but that column doesn't exist on the table (the column is `name`). PostgREST returns HTTP 400 (`column licensees.legal_name does not exist`), so the dropdown always renders empty.

## Fix
In `src/pages/complaints/ComplaintDetail.tsx`, replace every `legal_name` reference with `name` (the actual column on `public.licensees`):

- Line 65: state type `{ id; legal_name; ... }` → `{ id; name; ... }`
- Line 290: `.select('id, legal_name, license_number').order('legal_name')` → `.select('id, name, license_number').order('name')`
- Line 293: `.or('legal_name.ilike…,license_number.ilike…')` → use `name.ilike…`
- Line 305: linked-licensee fetch `.select('id, legal_name, license_number')` → `.select('id, name, license_number')`
- Lines 522, 536, 556, 562: render `l.name` / `stagedLicensee.name` instead of `legal_name`

No schema/migration changes — the DB is already correct; only the client query is wrong. No other complaint logic is touched.

## Verification
- Open a complaint without a linked licensee, type into the search — results appear (no 400 in network tab).
- Select a licensee → link succeeds and the card shows the name.

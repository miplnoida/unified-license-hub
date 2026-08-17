# Fix Entity section on Complaint Detail

Two separate defects, both confirmed against the live database.

## What is actually wrong

1. **The red "temporary problem" box** — the licensed-entity search asks for a column that does not exist. `ComplaintEntityCard` selects and filters on `licensees.regulator_id`, but the table has `lead_regulator_id`, `regulator_officer_id` and `alternate_regulator_id` — no `regulator_id`. Every search request fails with a 400 error, so the picker can only ever show the error state.

2. **"Applicant entity — Application rejected"** — the complainant (Test Entity 1) *is* licensed: there is an active licensee record linked to this applicant, created from approved application APP-2026-000135. The resolver ignores that record and instead reports the applicant's most recent application, which happens to be a later rejected one (APP-2026-000136). So a licensed entity is shown as an unlicensed applicant, and the escalation warning is wrong.

## The fix

**Entity resolution (backend, read-only function):**
- `resolve_complaint_entity_context` gains one more lookup step before falling back to applicant status: if a licensee row exists for the complainant (via the applicant link), return `kind: licensed` with that entity's name, id and license number, and record the source as the licensee record.
- Prefer active licensee records; only fall back to applicant/pre-license context when no licensee record exists at all.
- Applicant fallback keeps showing application status, but picks the most relevant application (approved over rejected) instead of blindly the newest, so a stale rejection never overrides a granted licence.
- Still read-only and gated by the same complaint view permission checks. No workflow, RBAC, or complaint business rules touched.

**Search card (frontend):**
- Drop `regulator_id` from the licensee query and filter on `lead_regulator_id` instead, so search works and stays scoped to the complaint's regulator.
- Keep the existing distinct search states (searching / no match / failed with retry).

**Result on this complaint:** the Entity section shows Test Entity 1 as a licensed entity with its licence number, the amber "requires a licensed entity record" warning disappears, and the search box is only offered as a secondary "change linked entity" action.

## Files touched

- Migration: update `public.resolve_complaint_entity_context`.
- `src/components/complaints/ComplaintEntityCard.tsx` — correct regulator column.

## Out of scope

Approval workflow definitions, steps, actions, approval matrices, RLS/RBAC, complaint lifecycle.

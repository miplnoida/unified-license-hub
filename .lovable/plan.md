# Fix registration final-approval error ("record new has no field contact_person_name")

## What is happening

Approving step 2 of a registration flips the registration status to `approved`. That update fires a database trigger function, `trg_registration_approved_notification`, which builds the "registration approved" notification payload.

That function reads two fields that do not exist on the registrations table:

- `contact_person_name`
- `entity_name`

The registrations table actually stores the applicant name as `applicant_name` (plus `applicant_name_alt`, `first_name`, `last_name`). In PL/pgSQL, referencing a non-existent field on `NEW` raises the exact runtime error you see, so the whole approval transaction aborts. This affects every registration at final approval, not just REG-2026-000033.

## Fix

Update the trigger function so the applicant name resolves from real columns, in this order:

1. `applicant_name`
2. `applicant_name_alt`
3. `first_name || ' ' || last_name` when present
4. literal `'Applicant'` fallback

No other logic in the function changes: same event name (`registration.approved`), same payload keys, same portal/login URL handling, so the existing notification template keeps working.

## Verification

- Re-run the final approval for REG-2026-000033 and confirm the status becomes `approved` with no error.
- Confirm a `registration.approved` notification event is queued with a populated `applicant_name`.
- Check that no other database function references `contact_person_name` or `entity_name` against registrations.

## Technical detail

Single migration: `CREATE OR REPLACE FUNCTION public.trg_registration_approved_notification()` with the corrected `COALESCE`. No schema, RLS, or frontend changes needed.

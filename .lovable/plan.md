# Fix registration final-approval error ("record new has no field contact_person_name")

## What is happening

Approving step 2 of a registration flips the registration status to `approved`. That update fires a database trigger function, `trg_registration_approved_notification`, which builds the "registration approved" notification payload.

That function reads two fields that do not exist on the registrations table:

- `contact_person_name`
- `entity_name`

The registrations table actually stores the applicant name as `applicant_name` (plus `applicant_name_alt`, `first_name`, `last_name`). In PL/pgSQL, referencing a non-existent field on `NEW` raises the exact runtime error you see, so the whole approval transaction aborts. This affects every registration at final approval, not just REG-2026-000033.

## Why it broke only now

It genuinely did work until yesterday. The trigger function was last rewritten in the migration dated 2026-08-17 09:01 UTC (yesterday morning), as part of the notification-payload work. The earlier version read `COALESCE(NEW.applicant_name, 'Applicant')` — a real column. The rewrite changed that line to `COALESCE(NEW.contact_person_name, NEW.entity_name, 'Applicant')`, borrowing column names from a different table. PL/pgSQL only resolves `NEW.<field>` at execution time, so the migration applied cleanly and nothing failed until the first registration reached final approval after that change.


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

Single migration: `CREATE OR REPLACE FUNCTION public.trg_registration_approved_notification()` with the corrected `COALESCE`. No schema, RLS, or frontend changes needed for the approval fix.

## Also included: two unrelated typecheck errors

The build currently fails on two pre-existing type-cast errors that are unrelated to registrations. They will be fixed in the same pass by casting through `unknown` before the target type:

- `src/pages/fpa/FpaEntityRedirect.tsx` (line 33)
- `src/pages/fpa/FpaTraining.tsx` (line 42)

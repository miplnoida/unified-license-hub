# Allow a new licence application after a withdrawal

## Confirmed root cause (verified in the database)

`public.create_application_draft` — initial-licence branch:

```text
IF v_handoff.application_id IS NOT NULL THEN
  SELECT * INTO v_application FROM applications WHERE id = v_handoff.application_id;
  IF FOUND THEN RETURN v_application; END IF;   <-- returns the WITHDRAWN app
END IF;
```

It returns the handoff-linked application **regardless of status**, so every
"Apply for New Licence" attempt hands the applicant back the closed record
instead of creating a new one. Confirmed for the live case:

```text
handoff 1a91b071… → application 83ffc118… (APP-2026-001929) status = withdrawn
registration ef413c74… status = approved
```

Two supporting structural defects, also verified:

- `registration_licensing_handoffs` has `UNIQUE (registration_id)` and
  `application_id NOT NULL` — one registration can represent only one licence
  attempt, so a second attempt cannot be linked at all.
- The trailing `UPDATE … SET application_id = … WHERE registration_id = _reg_id
  AND application_id IS NULL` in the same function is dead code: the column is
  `NOT NULL`, so it never matches.

Verified as already correct (no change needed): `apply_application_guard`,
`prevent_duplicate_active_application` and the post-licence guard all exclude
`withdrawn` from active/duplicate matching, and re-application policy is read
from `site_settings.application_settings.allow_reapplication`. Different-sector
and same-sector policy handling is therefore already right once the handoff no
longer hijacks creation.

## Fix

### 1. Migration — handoff linkage supports multiple attempts

- Drop `UNIQUE (registration_id)`; add `UNIQUE (registration_id, application_id)`.
- Keep `application_id NOT NULL` and the `ON DELETE RESTRICT` FK, so every
  historical link (including the withdrawn one) is preserved permanently.
- No data is updated, deleted or repointed — the existing withdrawn link stays.

### 2. Migration — `create_application_draft` becomes status-aware

- Registration eligibility stays exactly as today (approved registration +
  ownership check, `REGISTRATION_HANDOFF_REQUIRED` / `_FORBIDDEN` unchanged).
- Resolve the registration's handoff rows and return an existing application
  **only when it is still open for editing** (`draft`, `in_progress`,
  `resubmission_requested`, `resubmission_required`, `query_raised`,
  `returned_for_correction`, `info_requested`) — preserving today's resume
  behaviour for genuine drafts.
- When every linked application is terminal (`withdrawn`, `rejected`,
  `approved`, `cancelled`) or submitted-like, insert a **new** application and
  `INSERT` a new handoff row for `(registration_id, new application_id)`
  (`ON CONFLICT DO NOTHING`), replacing the dead `UPDATE`.
- The new row is a normal `draft` with a fresh id and application number,
  its own classification, forms, documents, payments and workflow.

### 3. Frontend

`src/pages/NewApplication.tsx` — no rule changes. Only: when the RPC returns an
application whose id differs from the current wizard id, adopt the returned id
(already the case) and surface `REGISTRATION_HANDOFF_*` / duplicate codes through
the existing `friendlyApplicationError` mapping. The existing closed-draft
hydration guard stays.

### 4. Verification and tests

- `scripts/verify-application-reapply-after-withdrawal.sql` — rollback-scoped
  fixture asserting, for one applicant with an approved registration:
  withdrawn + different sector → new row; withdrawn + same sector with
  re-application ON → new row; re-application OFF → business block, no new row;
  active duplicate → still blocked; open draft → resumed, no second draft;
  withdrawn record byte-identical afterwards (status, number, data, payments,
  workflow, withdrawal reason/actor/timestamp).
- Existing `src/test/duplicateApplicationGuard.test.ts` and
  `src/test/newApplicationClosedDraftGuard.test.ts` extended with the
  withdrawn-handoff case.
- `verify-and-submit` is untouched: submitting the withdrawn application itself
  must keep failing.
- Run: the new SQL fixture, focused vitest, `tsgo` typecheck, build; then an
  authenticated end-to-end pass through the wizard to final submission, and
  report the before/after database state of both applications.

## Out of scope

Ratio/prudential work, withdrawal flow, RLS, form package resolution, payment
rules, workflow routing, returns and post-licence services.

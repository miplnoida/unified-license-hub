## Fix: "Only internal staff can add remarks" for legal_compliance users

### Root cause
`supabase/functions/add-application-remark/index.ts` has a hardcoded `INTERNAL_ROLES` list that is out of sync with the canonical list in `src/types/platform.ts`. It is missing `legal_compliance`, so users with that role (a legitimate internal role used elsewhere in the app) get a 403 "Only internal staff can add remarks" when they try to record a remark.

Frontend `INTERNAL_ROLES` (source of truth):
`super_admin, admin, supervisor, licensing_officer, analyst, legal_compliance, developer`

Edge function currently has:
`super_admin, admin, supervisor, licensing_officer, analyst, developer` — `legal_compliance` missing.

### Fix
Update `supabase/functions/add-application-remark/index.ts`:
- Add `"legal_compliance"` to the `INTERNAL_ROLES` constant so it matches `src/types/platform.ts`.

That's the only change required — the RLS-style role check is what's rejecting the user; no DB migration or UI change is needed.

### Verification
- Log in as a `legal_compliance` user and add a remark on an application → should succeed and record a row in `approval_actions` with `action='remark_added'`.
- Other roles (`applicant`, `licensee_*`, `pre_licensee`) still correctly get 403.

## Scope

Close the last three `enforced: false` entries in `src/lib/rbac/catalog.json` and add the verification evidence the closure prompt requires. Do not restart or redesign any RBAC work.

Confirmed pre-plan reads:
- `catalog.json` still has exactly 3 unenforced pairs: `correspondence_management.export`, `correspondence_management.reject`, `fit_and_proper.export`.
- UI surfaces DO exist for all three (previous "no surface" note was wrong):
  - `src/pages/correspondence/CorrespondenceRecords.tsx` → Export index button
  - `src/components/correspondence/ReviewApprovalPanel.tsx` → Reject button
  - `src/pages/fit-and-proper/FitAndProperIndividualDetail.tsx`, `FpInitiationLog.tsx`, `FpScheduler.tsx`, `src/pages/fpa/FpaMonitoring.tsx` → Export buttons

## Changes

### 1. Gate the three remaining pairs at their real mutation sites

- `CorrespondenceRecords.tsx`: wrap Export index onClick with `authorizedExport('correspondence_management', ...)`; ensure the underlying data query already filters by scope (verify via read; if not, filter server-side).
- `ReviewApprovalPanel.tsx` (and the mutation hook it calls): wrap the reject mutation with `authorizedAction('correspondence_management', 'reject', { id })`. Add matching server gate via `enforce_permission` in the RPC/edge path that performs the reject; if reject writes directly to a table, add a `SECURITY DEFINER` reject RPC gated by `enforce_permission` and switch the client to call it.
- The four FP export buttons: wrap each CSV/export onClick with `authorizedExport('fit_and_proper', 'export', …)` so the export intent is recorded and permission enforced.

### 2. Flip catalog flags

Flip `enforced: true` for the three pairs in `src/lib/rbac/catalog.json`. Result: zero remaining `enforced: false` entries.

### 3. Backend authority proofs (pgTAP)

Add `supabase/tests/rbac/282_final_closure_gates.sql`:
- `enforce_permission('correspondence_management','export')` denies without perm, allows with.
- Same for `correspondence_management.reject` and `fit_and_proper.export`.
- Assert `record_export_intent` writes an audit row for each successful export call.

### 4. Custom-role regression test

Add `supabase/tests/rbac/283_custom_role_noop.sql`:
- Create a custom role with N permission rows.
- Run `rbac_save_role` with only metadata (name/description/status) changes.
- Assert `role_permissions` row set is unchanged (same count, same set) after each save.

### 5. Persona coverage expansion (vitest)

Extend `src/test/personaMatrix.test.ts` (or add a sibling test file) with the three added surfaces:
- Correspondence export button hidden/disabled without `correspondence_management.export`.
- Correspondence reject button hidden/disabled without `.reject`.
- FP export buttons hidden/disabled without `fit_and_proper.export`.
Cover the personas already in the matrix — no new personas needed.

### 6. Consistency sweep (read-only verification, code changes only where a violation is found)

Grep for direct role comparisons and permission array scans outside the centralized path (`user.role === 'admin'`, `permissions.find(...)`, `hasRole('...')`) and replace any hits with `useCan` / `authorize()` / `has_permission`. If none found, note it as verified in the completion report.

### 7. Documentation

Update `docs/rbac/completion-report.md` only to reflect: 0 unenforced entries, new pgTAP files, new vitest coverage, and consistency-sweep result. No new plans, no roadmap.

## Evidence to report back

- Files changed list.
- `grep -c '"enforced": false' src/lib/rbac/catalog.json` → 0.
- pgTAP: `282_final_closure_gates.sql`, `283_custom_role_noop.sql` pass locally via `supabase--test_edge_functions`/db test runner as available.
- Vitest: extended persona tests pass.
- Consistency sweep result (grep output summarized).

## Out of scope

- No architectural changes to `authorize.ts`, `has_permission`, `has_scoped_permission`, or scope resolver.
- No new personas beyond current 13.
- No changes to unrelated modules or business logic.

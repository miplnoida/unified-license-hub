
## Goal

Reverse one earlier rule: an internal user assigned as Lead Regulator / Regulator / Alternate Regulator on an entity must be able to see that entity's **submitted** returns from the Returns menu, even if their role (e.g. `license_analyst`) lacks `returns_management.view`. Super admin and `returns_management.view_all_entities` continue to bypass. All other existing rules (drafts hidden from assignees, external users, PPOC, creator, workflow approvers, ownership) stay untouched.

## Backend

New migration redefines both overloads of `public.can_view_entity_returns`:

- Remove the `user_has_permission(_user_id,'returns_management','view')` gate on the assignment branch.
- Assignment branch: user is Lead/Regulator/Alternate on the licensee AND (for the 4-arg overload) the return is in a submitted lifecycle status (`SUB`, `submitted`, `under_review`, `approved`, `validated`, `accepted`, `rejected`, `resubmission_requested`, `VAL`, `TBR`, `REJ`).
- Bypass branch unchanged: `super_admin` OR `returns_management.view_all_entities`.

Because every RLS policy (`returns_filed`, `return_form_data`, `return_documents`, `return_upload_attempts`, `return_consolidated_analysis`), `can_view_return_filed`, and the `return-uploads` storage policy already delegate to this helper, no other SQL changes are required. Existing external-user / PPOC / creator / approver policies remain intact.

## Frontend

1. `src/hooks/usePermissions.ts` — add an `assignedLicenseeIds` fetch (from `licensees` where the user is one of the three regulator columns). Expose:
   - `hasAnyEntityAssignment: boolean`
   - update `hasModuleAccess('returns_management')` and `canAccessPath` for `/admin/returns*` and `/entity/returns*` list/detail routes to return `true` when the user has at least one assignment, even without the module permission. Other modules unchanged.

2. `src/components/layout/Sidebar.tsx` — no code change needed; it reads `hasModuleAccess`, which now returns true for assigned users.

3. Route guards on returns list/detail pages: rely on the same hook, so an assigned analyst can open the queue and detail pages. Backend RLS still filters rows to only their assigned entities' submitted returns, so the list will show exactly those entities.

4. Returns queue page: no query change required — RLS narrows results. Confirm the page renders gracefully with a small result set (already handles empty state).

## Tests

- Extend `supabase/tests/regulator_access/01_can_view_entity_returns.sql`:
  - Mapped user WITHOUT base view perm + submitted → **true** (was previously asserted false; flip).
  - Mapped user WITHOUT base view perm + draft → **false** (unchanged).
  - Unmapped user without base perm → false (unchanged).
  - view_all bypass + draft → true (unchanged).
- Extend `src/test/regulatorAssignment.test.tsx`:
  - Sidebar/permissions hook: user with no `returns_management` permission but with an entity assignment → `hasModuleAccess('returns_management') === true`.
  - Same user with no assignment → `false`.

## Out of scope

- Admin config pages under `/admin/returns/{types,configurations,cutoff,due-dates,late-fees,...}` remain permission-gated; assignment does not unlock configuration screens.
- Draft visibility for assigned regulators stays denied.
- Reports/exports continue to run through the same helpers, so they inherit the new behavior automatically; no separate policy edits.

## Technical notes

- Migration: single `CREATE OR REPLACE FUNCTION` for both overloads, `SECURITY DEFINER`, `SET search_path = public`.
- Submitted-status list kept identical to the existing 4-arg overload to avoid drift.
- Assignment lookup in the hook is cached (`staleTime: 60_000`) alongside existing permission query.

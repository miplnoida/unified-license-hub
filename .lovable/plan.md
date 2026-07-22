# Complete remaining RBAC gaps

Three surgical changes. No business-logic touchpoints — all edits are in the RBAC catalogue, capability registry, parity script, and one seed migration.

## 1. Parity oracle detects Record Scope drift

Extend `scripts/verify-rbac-parity.mjs` so CI fails when `rbac_module_scopes` diverges from `src/lib/rbac/scopeCapabilities.ts`.

- Build the expected tuple set `(module, scope, selector)` by importing `MODULE_SCOPE_CAPABILITIES` (dynamic `import()` of the TS file compiled via a lightweight regex parser — the script must stay dependency-free, so I'll parse `scopeCapabilities.ts` with a small regex that captures `mk('kind', 'selector')` entries per module block, matching the current parser style used elsewhere in the file).
- Statically parse the latest seed migration (`supabase/migrations/*rbac_transactional_saves*.sql` — the file that seeds `public.rbac_module_scopes`) to build the backend tuple set. Grep for `INSERT INTO public.rbac_module_scopes` rows.
- Diff both directions:
  - **UI has scope, DB missing** → hard failure (frontend would offer an option the backend can't enforce).
  - **DB has scope, UI missing** → hard failure (backend accepts a scope no UI can produce — cruft that could leak).
- When `PGHOST` is set, also verify the live table matches (best-effort; skipped in offline CI).
- Report block added to the JSON output: `scopeParity: { expected, actual, missingInDb, missingInUi }`.

## 2. Sensitive-privilege catalogue covers `export`

`src/lib/rbac/accessLevels.ts` currently only tags `export_confidential`. Any plain `export`, `download`, `bulk_export`, `export_all` action would slip past `partitionSensitive` and get auto-included by the Manager level (which already lists `export`).

- Remove `export` from `LEVEL_ADDITIONAL_ACTIONS.manager` (it must never be auto-granted).
- Add to `SENSITIVE_ACTION_NAMES`: `export`, `export_all`, `bulk_export`, `download`, `download_all`, `download_bulk`, `print_bulk`.
- Add matching `SENSITIVE_ACTION_LABELS` entries ("Export data", "Bulk export", "Bulk download", …).
- Add a unit assertion in `src/test/roleValidation.test.ts` (or the sensible neighbouring `accessLevels`-focused spec if one exists) that `partitionSensitive` puts `export` into `sensitive` and `expandLevelActionNames('manager')` no longer contains it.

## 3. Drop team/department from the scope registry

No `teams` or `departments` tables exist, so `has_scoped_permission` already denies both branches and `RecordScopePanel` renders an empty picker. The safest fix is to remove the options entirely until backing data is added.

- `src/lib/rbac/scopeCapabilities.ts`: remove the `team` option from `complaint_management` and the `department` option from `application_management`. Drop `teams` / `departments` from `SelectorOptions` and the `mk` selector union in a follow-up if desired (keeping the union preserves type stability for a future re-add).
- `RecordScopePanel.tsx`: no code change needed once the registry drops the options — the `.filter` already hides options the registry omits. Remove the now-dead `departments`/`teams` fields from `SelectorOptions`/`EMPTY_OPTS` and the `selectorKind === 'departments'` / `'teams'` branches to keep the component tight.
- Seed migration: add a small follow-up migration that deletes the two rows from `public.rbac_module_scopes` (`complaint_management,team` and `application_management,department`) so the parity check in step 1 stays green.
- Keep `ScopeKind` union values `team`/`department` in `scopeCapabilities.ts` (backend helper still recognises them) — only the option arrays lose the entries.

## Files touched

- `scripts/verify-rbac-parity.mjs` — extend with scope-parity block.
- `src/lib/rbac/accessLevels.ts` — sensitive list + manager fix.
- `src/lib/rbac/scopeCapabilities.ts` — drop team/department options.
- `src/components/rbac/RecordScopePanel.tsx` — remove dead selector branches.
- `src/test/roleValidation.test.ts` (or a new `src/test/accessLevels.test.ts`) — add sensitive-privilege regression.
- New migration `…_rbac_scope_registry_prune.sql` — delete stale rows.
- `docs/rbac/role-migration.md` — one-paragraph note on the sensitive `export` rule and the pruned scopes.

## Verification

- `node scripts/verify-rbac-parity.mjs` runs clean locally and fails deliberately when I mutate the registry to prove it detects drift.
- Vitest suite passes with the new sensitive-privilege assertions.
- `psql -c "SELECT module, scope FROM public.rbac_module_scopes ORDER BY 1,2"` matches the registry entry-for-entry after the prune migration.

## Non-goals

- No changes to enforcement helpers (`has_scoped_permission`, RLS policies, storage) — behaviour already denies unbacked scopes.
- No new backing tables for teams/departments. When those land, re-adding the options is a two-line change plus a seed migration.

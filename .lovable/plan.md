
# Slice B — Turn `roles.scope_config` into real enforcement

Slice A shipped a UI + registry + transactional save so admins can pick scopes like *"assigned only"*, *"selected sectors"*, *"selected institutions"*. Today that config is stored but ignored — every RLS policy still says "if `has_permission(user, module, action)` then allow". Slice B rewires the backend so the stored scope becomes the actual gate.

## Current state (verified this turn)

- `public.has_permission(user, module, action)` — resolves through `user_dynamic_roles → roles(status='active') → role_permissions → permissions`. **No scope awareness.**
- `roles.scope_config jsonb` exists on every role but is `{}` for all 5 sampled roles — no live enforcement yet, safe to layer on.
- ~150+ RLS policies call `has_permission(...)` directly (sample: `applications`, `complaints`, `conduct_*`, `compliance_*`, `application_rfi_*`).
- `can_view_entity_returns` already understands assignment; it's the only scoped helper today.

## Design

Add one small helper family, then rewrite policies for the highest-value scoped modules to route through it. Non-scoped modules (`settings`, `role_management`, `audit_management`, `notification_management`) keep the plain `has_permission` call.

### Scope contract stored in `roles.scope_config`

```json
{
  "returns_management":   { "kind": "institution", "licensee_ids": ["uuid", ...] },
  "licensee_management":  { "kind": "sector",      "sector_ids":  ["uuid", ...] },
  "application_management": { "kind": "assigned" },
  "form_management":      { "kind": "own" },
  "complaint_management": { "kind": "all" }
}
```

Missing module ⇒ treat as `all` (backwards compatible — existing roles keep working). Kinds unsupported for a module (per `scopeCapabilities.ts`) fall back to `all` at read time so admin drift can't lock everyone out.

### New helpers (all `SECURITY DEFINER, STABLE, SET search_path = public`)

| Helper | Returns | Purpose |
| --- | --- | --- |
| `public.user_module_scope(uid, module)` | `jsonb` | Aggregates the user's scope across every active role. If any active role says `all`, returns `{"kind":"all"}`. Otherwise unions ids for the tightest kind. Super admin ⇒ `{"kind":"all"}`. |
| `public.has_scoped_permission(uid, module, action, licensee_id, sector_id, owner_id)` | `bool` | `has_permission(...)` **AND** the row matches the user's aggregated scope for `(module)`. Any of the three context args may be `NULL` — the check simply skips that dimension. |
| `public.user_scope_licensee_ids(uid, module)` | `setof uuid` | Convenience for `WHERE licensee_id IN (...)` style policies and reports; empty set when scope is `all` (caller must handle). |
| `public.user_scope_sector_ids(uid, module)` | `setof uuid` | Same as above for sector-scoped modules. |

Assignment-only regulators keep their existing narrower gate — `has_permission` still returns `false` for them, so `has_scoped_permission` also returns `false` and the existing `can_view_entity_returns` branch remains their only door.

### Policy rewrite pattern

```sql
-- SELECT on a licensee-owned table
USING (
  public.is_super_admin(auth.uid())
  OR public.has_scoped_permission(
       auth.uid(), '<module>', 'view',
       <this_table>.licensee_id, NULL, <this_table>.created_by
     )
  OR <existing assignment branch, unchanged>
)
```

Writes use the same helper with the specific action (`edit`, `delete`, `approve`, …).

## Files this slice will touch

### Migration (single migration)
- **New helpers** — `user_module_scope`, `has_scoped_permission`, `user_scope_licensee_ids`, `user_scope_sector_ids`. `GRANT EXECUTE` to `authenticated` and `service_role` only.
- **Policy rewrites** on the scoped tables that carry a resolvable `licensee_id` / `sector_id` / `created_by`:
  - `returns_filed`, `return_documents`, `return_form_data`, `return_upload_attempts`, `return_edit_requests`, `return_comments`, `return_calculated_ratios`, `return_consolidated_analysis`, `return_threshold_breaches`
  - `applications`, `application_ai_assessments`, `application_rfis`, `application_rfi_items`, `application_rfi_responses`, `application_legal_notes`
  - `licensees`, `licenses`, `license_renewals`, `license_certificates`, `license_conditions`, `license_actions`
  - `compliance_returns`, `returns_filed` compliance overlap
  - `complaints`, `complaint_evidence`, `complaint_investigation_tasks`, `complaint_correspondence`
  - `conduct_*` set (market_conduct)
  - `prudential_assessments`, `prudential_actions`, `prudential_escalations`
  - `fp_assessments`, `fp_findings`, `fp_individuals`, `fp_individual_roles`, `fp_conditions`, `fp_determinations`, `fp_appeals`
  - `inspections`, `inspection_findings`
  - `enforcement_actions`, `enforcement_case_events`
  - `reports`, `report_run_files`, `report_run_rows`
  - `form_management` — `own` scope on `forms`, `form_templates` via `created_by`

Non-scoped tables and the `_management → view` on lookup/config tables are left alone.

### pgTAP
- `supabase/tests/rbac/160_scope_config_enforcement.sql` — new file. Cases per scope kind:
  - `all` role sees everything.
  - `institution` role sees only listed licensee ids; cannot read siblings.
  - `sector` role sees only rows in listed sectors (through `licensees.sector_id`).
  - `assigned` role sees only its mapped licensees (via `user_has_entity_assignment`).
  - `own` role on `forms` sees only rows it created.
  - Empty selector lists behave as "no access" (not "all").
  - Inactive role (`status='inactive'`) grants nothing regardless of scope.
  - Super admin bypasses every scope.

### Frontend/edge (thin follow-ups, same slice)
- `supabase/functions/_shared/authz.ts` — extend `enforceScope` to call `has_scoped_permission` with the resolved licensee/sector/owner instead of the current permissive fallback.
- `src/lib/rbac/scopeCapabilities.ts` — no code change, but add a comment pointing at the new helpers as the "backend truth".
- `scripts/verify-rbac-parity.mjs` — extend the parity check to cross-reference the registry against `rbac_module_scopes` **and** confirm each scoped module in the registry has at least one policy calling `has_scoped_permission` for that module (fails CI on drift).

## Technical details

- `user_module_scope` aggregation rules when a user has multiple active roles for the same module:
  - Any `all` ⇒ `all`.
  - Otherwise merge kinds by widest first: `sector` ∪ `institution` ⇒ union of resolved licensee ids (sectors expanded to their licensees at read time via join).
  - `assigned` combines additively with explicit id lists (union).
  - `own` only counts when no other role widens it.
- Kind fallback: if a role stores a kind not in `rbac_module_scopes` for that module, treat that role's contribution as empty (fail closed for that role, not the user).
- All new helpers are `STABLE` — safe inside RLS `USING`/`WITH CHECK`.
- Backfill: no data migration needed; empty `scope_config` continues to mean "all".

## Out of scope (deferred to Slice C)

- Storage bucket policy rewrites (they currently defer to table-level checks via signed URLs).
- Edge functions that pull data through service role and re-filter in JS — those get a second sweep once the SQL layer is authoritative.
- UI badges surfacing "you are scoped to X institutions" in the app shell.

## Deliverable checklist

- [ ] Migration applied; `supabase--linter` clean on touched tables.
- [ ] `supabase/tests/rbac/160_scope_config_enforcement.sql` green.
- [ ] `scripts/verify-rbac-parity.mjs` reports zero drift for scoped modules.
- [ ] Manual smoke: a role saved with `institution: [A]` reads only licensee A's returns/applications/licenses; a role saved with `sector:[X]` reads only sector X's licensees.

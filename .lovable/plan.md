# Backend RBAC Hardening — has_permission Everywhere

Frontend gates are cosmetic. This plan makes the database the authorization boundary: every read, write, storage access, RPC, view, report, and export is authorized by one helper — `public.has_permission(user, module, action)` — and assignment-only regulators are strictly scoped to submitted-lifecycle returns on their mapped entities.

## Guiding principles

- **Single source of truth.** All backend authorization decisions call `public.has_permission(auth.uid(), module, action)`. `user_has_permission` is preserved only as a thin alias so existing policies keep working during rollout.
- **Super admin bypass, nothing else.** Only `super_admin` (dynamic role) bypasses. Static-`admin` and legacy code paths do not.
- **Deny by default.** Every table has RLS enabled with explicit policies. No `USING (true)` and no `TO public` on business tables.
- **Assignment ≠ permission.** Assignment-only regulators (mapped as `lead_regulator_id` / `regulator_officer_id` / `alternate_regulator_id` on `licensees`, with zero dynamic-role permissions) get one narrow capability: read submitted-lifecycle returns and their strictly co-owned artifacts for mapped entities. Nothing else. Never drafts, WIP, TEMP, due-soon, unassigned entities, or admin configuration.
- **No frontend-only fixes.** UI hiding is defense-in-depth, never the gate.

## Canonical helpers (add / consolidate)

- `public.has_permission(uuid, text, text)` — already exists. Keep as the sole entry point. Add `SET search_path = public` and `STABLE`.
- `public.has_any_permission(uuid, text[])` — accepts `{module.action, ...}`; returns true if any match. Used for OR-style policies.
- `public.is_super_admin(uuid)` — thin wrapper for readability.
- `public.is_assignment_only_regulator(uuid)` — true when the user has ≥1 entity assignment and zero dynamic-role permissions.
- `public.user_has_entity_assignment(uuid, uuid)` — true when user is Lead / Officer / Alternate for the given licensee.
- `public.return_status_is_submitted_lifecycle(text)` — already exists; reuse.
- `public.can_view_entity_returns(uuid, uuid, text)` — already exists; refactor to compose the helpers above so semantics live in one place.

All helpers: `SECURITY DEFINER`, `STABLE`, `SET search_path = public`, execute granted only to `authenticated` and `service_role`.

## Policy pattern (applied uniformly)

```text
SELECT policy:
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), '<module>', 'view')
  OR (<narrow assignment branch, only where explicitly allowed>)

INSERT/UPDATE/DELETE policies:
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), '<module>', '<create|edit|delete|approve|...>')
```

The assignment branch is added **only** to a fixed allow-list of tables (below). Every other table denies assignment-only regulators outright because `has_permission` returns false for them.

## Scope — modules and tables covered

Grouped by module. Each group gets: RLS rewrite, RPC/function guard, storage policy rewrite, pgTAP suite.

- **Returns** — `returns_filed`, `return_form_data`, `return_documents`, `return_comments`, `return_audit_log`, `return_data_revisions`, `return_edit_requests`, `return_calculated_ratios`, `return_consolidated_analysis`, `return_threshold_breaches`, `return_upload_attempts`, `return_upload_imports`, `return_template_downloads`, `return_validation_run_log`. Assignment branch permitted **only** when the parent `returns_filed.status` is submitted-lifecycle AND user is mapped on the licensee.
- **Admin / Configuration** — `return_configs`, `return_configurations`, `return_types`, `return_cutoff_config`, `return_templates`, `return_config_forms`, `return_validation_rules`, `return_validation_rule_versions`, `return_notification_templates`, `late_fee_structures`, `late_fee_penalty_tiers`, `sla_configurations`, `sla_escalation_tiers`, `sla_process_team_leads`, `business_calendar_*`, `report_*` configuration tables, `notification_*` config, `permission_*`, `roles`, `permissions`, `role_permissions`, `master_data_*`, `regulators`, `sectors`, `sub_sectors`, `categories`. Assignment branch: **never**. Only permission-based access.
- **Applications / Registrations / Licenses / Complaints / Compliance / Prudential / Conduct / Enforcement / Inspections / Correspondence / Coordination / Fit & Proper / Fees & Payments / Refunds / Audit Logs / Reports** — each rewritten to the pattern above. Assignment-only regulators denied outright.
- **Storage (buckets)** — every bucket policy is rewritten to require the same `has_permission(module, action)` check for read/write. Return attachment bucket adds the parent-status + assignment gate.
- **Reports / Exports** — `report_run_files`, `report_run_rows`, `report_logs`, `audit_export_jobs`. Read requires `report_management.view`; export/download requires `report_management.export`. Assignment-only regulators denied.
- **Search / AI / Consolidated** — `application_ai_assessments`, `return_consolidated_analysis`. Read requires the parent module's `.view`, plus assignment gate for returns. Write requires `.ai_analysis` or `.consolidated`.

## Assignment-only regulator — the exact allow-list

Read-only, entity-scoped, submitted-lifecycle only:

- `returns_filed` — where `licensee_id` in assignments AND `return_status_is_submitted_lifecycle(status)`.
- `return_form_data`, `return_documents`, `return_comments`, `return_audit_log`, `return_data_revisions`, `return_calculated_ratios`, `return_consolidated_analysis`, `return_threshold_breaches` — same, joined via `return_id → returns_filed`.
- Storage: `return-attachments/{return_id}/*` — signed-URL read only when the return above matches.

Everything else: **denied**. Explicitly enumerated denials in pgTAP:

- Drafts, WIP, TEMP, due-soon, or any non-submitted status.
- Unassigned entities.
- Admin/configuration tables and views.
- Any write on any table.
- Any RPC that mutates.
- Report exports, CSV/Excel/PDF endpoints.

## Edge functions and RPCs

Every SECURITY DEFINER function that mutates or reads privileged data:

1. Re-derive `auth.uid()` inside the function; ignore any `user_id` argument.
2. Call `public.has_permission` for the exact `(module, action)` the operation represents; fall through only when it also passes the assignment gate for returns.
3. Return `raise exception 'not_authorized'` on failure — no silent no-ops.

Edge functions using `service_role` (storage cleanup, escalation sweep, notification dispatch) validate the caller's JWT and their permission via `has_permission` before performing any privileged action. Cron-triggered jobs run with a service identity and skip the check, but only touch queue/log tables that are locked down from user access.

## Views and materialized views

- Every view/MV recreated with `WITH (security_invoker = on)` so it inherits the caller's RLS.
- Any view exposing sensitive columns is paired with a base-table policy that denies direct SELECT.
- Reporting MVs used by dashboards are wrapped by a `SECURITY DEFINER` RPC that checks `has_permission(<module>, 'view')` before returning rows.

## pgTAP coverage

New suites under `supabase/tests/rbac/`:

```text
00_helpers.sql               -- has_permission, is_super_admin, is_assignment_only_regulator
01_returns_rls.sql           -- 40+ assertions across personas × operations
02_returns_storage.sql       -- signed URL + object read/write matrix
03_admin_config_rls.sql      -- configuration tables never readable by non-permissioned users
04_reports_and_exports.sql   -- run rows, run files, audit_export_jobs
05_ai_and_consolidated.sql   -- application_ai_assessments, return_consolidated_analysis
06_rpc_authorization.sql     -- every mutating RPC rejects unauthorized callers
07_assignment_only.sql       -- exhaustive negative matrix for the assignment-only persona
08_super_admin_bypass.sql    -- one positive test per module
09_module_matrix.sql         -- applications / registrations / licenses / complaints / compliance / prudential / conduct / enforcement / inspections / correspondence / fit-proper / fees / refunds / audit
```

Personas seeded per suite: `super_admin`, `legacy_admin` (dynamic role), `analyst_returns`, `analyst_complaints`, `reviewer`, `assignment_only_regulator`, `external_licensee_primary`, `external_licensee_secondary`, `pre_license_user`, `anon`.

Each suite: verifies both positive (allowed) and negative (blocked) paths for SELECT/INSERT/UPDATE/DELETE, plus explicit denial for the drafts / WIP / TEMP / unassigned / admin cases the requirement calls out.

CI: `.github/workflows/ci.yml` runs the pgTAP suite via `supabase db test` against an ephemeral local instance. Fail closed on any regression.

## Documentation

- `docs/rbac/backend-authorization.md` — helper contract, policy pattern, assignment-only allow-list, denial matrix.
- `docs/rbac/policy-inventory.md` — auto-generated from `pg_policies`; one row per policy with module, action, table, and pgTAP test file linked.
- `docs/rbac/assignment-only-matrix.md` — explicit table showing what an assignment-only regulator can and cannot see.
- `docs/rbac/change-log.md` — every policy this plan replaces, before/after, with migration filename.

## Rollout — phased migrations

Each phase is one migration + one pgTAP suite + one docs section. No phase merges until its tests pass.

1. **Helpers + tests infrastructure.** Add `has_any_permission`, `is_super_admin`, `is_assignment_only_regulator`, refactor `can_view_entity_returns`. Add `00_helpers.sql`.
2. **Returns core.** Rewrite policies on `returns_filed` and every child return_* table using the canonical pattern. `01_returns_rls.sql`, `07_assignment_only.sql`.
3. **Return storage + attachments.** Rewrite storage.objects policies for `return-attachments`; add object-scoped assignment/status gate. `02_returns_storage.sql`.
4. **Admin/config lockdown.** Rewrite policies on every configuration table listed above; deny assignment-only outright. `03_admin_config_rls.sql`.
5. **Reports / exports / AI / consolidated.** Rewrite `report_*`, `audit_export_jobs`, `application_ai_assessments`, `return_consolidated_analysis`. `04_reports_and_exports.sql`, `05_ai_and_consolidated.sql`.
6. **RPCs + edge functions.** Add `has_permission` guards at the top of every mutating RPC; verify JWT + permission in each edge function. `06_rpc_authorization.sql`.
7. **Remaining modules.** Applications, registrations, licenses, complaints, compliance, prudential, conduct, enforcement, inspections, correspondence, fit & proper, fees, payments, refunds, audit_logs. `09_module_matrix.sql`.
8. **Views / MVs.** Recreate with `security_invoker = on`; wrap dashboard MVs behind RPCs. Add coverage to the relevant suites.
9. **Cleanup.** Remove superseded permissive policies. Run `supabase--linter`; fix every finding. Regenerate `docs/rbac/policy-inventory.md`.

## Verification (per phase)

- pgTAP suite green.
- `supabase--linter` clean for touched tables.
- Manual query as each persona confirming: allowed rows return, blocked rows raise or return zero, writes rejected with `not_authorized`.
- For assignment-only regulator specifically: seed one draft and one submitted return on a mapped entity plus one submitted return on an unmapped entity; assert only the mapped submitted return is visible everywhere (list, detail, storage signed URL, RPC, dashboard, export endpoint).

## Non-goals

- No changes to business logic, UI flows, workflow transitions, or notification content.
- No new permissions catalog entries unless a policy needs an action that does not yet exist; those are listed explicitly in the phase migration.
- Frontend guard changes are limited to swapping any lingering `user_has_permission` frontend references to the canonical helper and adding tests — no visible UI change.

## Deliverables checklist

- [ ] Helper set consolidated, granted, `SET search_path = public`.
- [ ] Every table in scope has RLS enabled with policies that call `has_permission` (or the assignment gate where allowed).
- [ ] Every storage bucket policy rewritten.
- [ ] Every mutating RPC + edge function guards on `has_permission`.
- [ ] Views / MVs use `security_invoker = on` or are wrapped by permission-checked RPCs.
- [ ] pgTAP suites 00–09 exist and pass in CI.
- [ ] `docs/rbac/*` updated: contract, inventory, assignment-only matrix, change log.
- [ ] `supabase--linter` clean.
- [ ] Assignment-only regulator negative matrix (drafts / WIP / TEMP / unassigned / admin / exports / writes) verified by pgTAP.

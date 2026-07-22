# Roles & Permissions — Final Closure Plan (Single Cohesive Pass)

Close every remaining gap in one implementation. No new phases. Deliver until UI drift = 0, every enforcement surface is scoped, CI is green, and the completion report is internally consistent.

## 1. Enforcement matrix — finish every module

For each of: Applications, Registration, Licensing, Licensees, Returns, Compliance Returns, Prudential, Enforcement, Inspections, Reports, Forms, record-scoped Notifications — wire `has_scoped_permission(_user, module, action, _licensee_id, _record_id)` into every surface:

- SELECT / INSERT / UPDATE / DELETE RLS on the primary table (and child evidence/attachment tables)
- Every `SECURITY DEFINER` function and RPC callable from PostgREST
- Every Edge Function that reads or mutates the module
- `storage.objects` policies for the module's buckets + any `create_signed_url` RPC wrappers
- Dashboard count RPCs / SQL views used by list pages
- Export/download RPCs and edge endpoints (CSV/XLSX/PDF)
- Workflow transition RPCs and their edge wrappers
- Bulk action RPCs

Legacy paths (raw `investigator_id = auth.uid()`, `created_by = auth.uid()`, `lead_regulator_id`, direct `has_role(...)` in policies) are deleted or refactored to call the scoped helper. Only super_admin bypass, and only through `is_super_admin(auth.uid())`.

## 2. One authorization path

Repo-wide sweep for: `has_permission(`, `has_scoped_permission(`, `has_role(`, `is_super_admin(`, `investigator_id`, `assigned_to`, `assigned_investigator`, `inspector_id`, `lead_regulator_id`, `regulator_officer_id`, `alternate_regulator_id`, `owner_id`, `created_by`, `auth.uid() =`. Every hit is either (a) the canonical scoped helper, (b) an assignment resolver inside `is_record_assigned_to_user`, or (c) deleted. Duplicate helpers removed; a single migration consolidates.

## 3. Edge Function security

Every function under `supabase/functions/*/index.ts` (excluding `_shared`) must call `requireUserPermission(req, module, action, scope?)` with a real `AuthzScope` when the endpoint touches a record. Public/worker endpoints keep their existing markers (`markPublicFunction`, `requireWorkerInvocation`). `scripts/verify-edge-authz.mjs` is extended to also assert that any function whose name matches a record-scoped module passes a `scope` argument. 401 for missing/invalid JWT, 403 for permission/scope failure, no existence leak (same 403 for "not found" vs "forbidden"). Add Deno tests per function covering: no token, wrong permission, inactive role, unassigned record, assigned record, super_admin.

## 4. Storage security

Rewrite `storage.objects` policies for every protected bucket (application-documents, complaint-evidence, inspection-files, prudential-evidence, returns, payment-documents, certificates, audit-exports, reports, license-documents) to derive `(module, record_id)` from the object path prefix and then delegate to `has_scoped_permission`. Signed-URL issuers (edge + RPC) call the identical check before minting URLs. Folder-name-only checks removed. pgTAP coverage in `supabase/tests/rbac/150_storage_policy_hardening.sql` extended per bucket.

## 5. Export & download security

Every export/download entry point (edge + RPC + client-side CSV builders that hit list RPCs) is routed through a `require_export_permission(module)` guard that verifies `<module>.export` (distinct from `.view` and `.download`) AND applies the same scope filter as list reads. Dataset rows are filtered server-side; the client cannot pass a "bypass scope" flag. Signed URLs for generated files expire and re-check on access.

## 6. Workflow authorization

Every `perform_*_workflow_transition` RPC and its edge wrapper enforces: active role, `<module>.workflow_action` (or specific action like `approve`/`reject`), current state ∈ allowed source states for the action, scope + assignment for the record, segregation-of-duties (actor ≠ submitter for approve/reject unless `workflow_override`), audit row written. Direct RPC calls from PostgREST fail identically. pgTAP covers submit/review/approve/reject/conditional/request-info/return-for-correction/publish/issue/suspend/revoke/close/reopen/override per workflow-bearing module.

## 7. UI catalogue drift → 0

Run `scripts/verify-rbac-parity.mjs` in report mode, produce the full 306-item mismatch list, and resolve each by: (a) adding the missing permission to `src/lib/rbac/catalog.json` + a seed migration when it's a real capability, (b) rewriting the UI reference to the canonical permission, or (c) deleting the dead reference. Remove `RBAC_UI_PARITY_BASELINE` from CI and replace it with a strict `--fail-on-any` mode. `scripts/verify-rbac-ui-parity-ratchet.mjs` is deleted.

## 8. Permission naming unification

Canonicalize on the plural, underscored form already used by `has_permission`: `applications`, `licenses`, `licensees`, `returns_management`, `compliance_returns`, `prudential_supervision`, `enforcement`, `inspections`, `reports`, `forms`, `notifications`, `complaints`, `conduct`, `registration`, `role_management`, `audit_management`. A one-shot migration renames DB rows and updates `role_permissions`; a codemod rewrites TS/TSX references; a lint rule (`no-legacy-permission-keys`) prevents reintroduction. No hidden alias table.

## 9. Menu / route / button parity

Every `<M module=… action=…>` guard, `ModuleRoute`, sidebar entry, `GuardedButton`, dialog trigger, bulk-action toolbar, and context-menu item resolves through `useCan(module, action)` — no `hasRole`, no `profile.role ===`, no hardcoded arrays. `scripts/verify-rbac-parity.mjs` grows a "surface coverage" mode that fails if any interactive JSX element in a protected page lacks a guard.

## 10. Persona matrix — 12 personas, every surface

Extend `src/test/personaMatrix.test.ts` from 7 to 12 personas (add Prudential Officer, Market Conduct Officer, Read-Only User, Custom Role, plus split Administrator vs Super Admin). Each persona × module × surface (menu/route/list/view/create/edit/delete/approve/reject/assign/workflow/export/download/storage/edge/rpc/reports/dashboards/sensitive) is a table-driven assertion. Backed by DB fixtures in pgTAP (`260_persona_matrix.sql`) so the same matrix runs at the SQL layer.

## 11. Custom-role preservation proofs

Add `src/test/customRolePreservation.test.ts` and pgTAP `270_custom_role_preservation.sql`: open custom role → save no-op → diff empty; edit description only → only description column changes; toggle status → only status column changes; run `rbac_reclassify_roles()` → custom role's `role_permissions` rows are byte-identical before/after; migration replay leaves custom roles untouched.

## 12. Sensitive-privilege proofs

Expand `SENSITIVE_ACTION_NAMES` to the full brief list (`delete`, `bulk_delete`, `bulk_update`, `override_workflow`, `manage_users`, `manage_roles`, `assign_permissions`, `view_all_entities`, `export_confidential`, `suspend`, `revoke`, `issue_license`, `purge`, `delete_evidence`, plus existing export variants). `sensitivePrivilegeProofs.test.ts` and pgTAP `250_phase6_sensitive_privileges.sql` assert no access level and no standard template pre-grants any of them, and `has_permission` never returns true for them without an explicit `role_permissions` row.

## 13. pgTAP coverage completion

New/expanded files so every module has: RLS SELECT/INSERT/UPDATE/DELETE assertions, scoped-helper assertions, RPC hardening assertions, workflow assertions, storage policy assertions, selector validator assertions, inactive-role regression assertions. Missing files enumerated by CI's "required RBAC pgTAP files exist" block, expanded to the full list.

## 14. CI hardening

`.github/workflows/ci.yml` runs, with no `continue-on-error` and no skips: build, tsgo typecheck, lint, vitest, pgTAP (all files under `supabase/tests/`), migration validation (`supabase db reset` clean), Deno edge tests, storage-policy pgTAP, workflow pgTAP, authorization integration tests (vitest suite hitting a local Supabase), parity oracle in `--fail-on-any` mode, dependency-registry parity, sensitive-privilege proofs, persona matrix, edge-authz coverage. `rbac-oracles` and `db-tests` are required checks.

## 15. Completion report rewrite

`docs/rbac/completion-report.md` is rewritten so every one of the 17 requirements has: status = Done, files/migrations/tests, exact CI job that gates it. Remove every "pending / partial / slice X remaining" phrase. If any item cannot legitimately reach Done in this pass, the report says so plainly and the final declaration is the incomplete one.

## 16. Final verification walk

For every protected feature, a checklist row in the report answers YES to: permission, role status, record scope, assignment, selector validation, workflow authority, storage authz, edge authz, export authz, download authz, automated test, CI gate. Any NO forces the incomplete declaration.

## Evidence bundle

Appended to the report: files changed, migrations added, RLS policies rewritten (table list), RPCs changed, edge functions changed, storage policies changed, workflow RPCs changed, UI drift count = 0 with parity output, naming normalization diff, module enforcement matrix, 12-persona matrix, sensitive-privilege matrix, custom-role preservation diff, pgTAP results, vitest results, Deno results, build/typecheck/lint output, CI run link. Ends with exactly one of the two mandated declarations based on measured state.

## Technical notes

- Single umbrella migration series under `supabase/migrations/2026072x_rbac_final_closure_*.sql`, split by concern (naming, policies, storage, workflows, dependencies) but landing together so no intermediate state ships.
- `has_scoped_permission` remains the only public entry; helpers like `can_view_entity_returns` become thin wrappers or are dropped once callers migrate.
- Codemod for permission renaming lives at `scripts/codemod-normalize-permission-keys.mjs` and is idempotent.
- No `SECURITY DEFINER` function may exist without `SET search_path = public` — audited by existing `20_definer_search_path.sql`, extended to cover new functions.
- Client `useCan` stays the sole read path; `usePermissions` internals do not gain new fallbacks.

## Out of scope

- No UX redesign of Role Management beyond wiring already-built components.
- No new business modules.
- No changes to auth provider configuration.

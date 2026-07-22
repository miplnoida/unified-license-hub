# Roles & Permissions — Final Completion Plan (Phases 2–8)

Scope: close every gap in the 17-section brief. Delivered in ordered phases; each phase lands migrations + code + tests together so CI stays green.

## Phase 2 — Assigned-scope must prove assignment (Sec. 1)

Fix the critical defect where `has_scoped_permission(..., scope='assigned')` returns true unconditionally.

- Migration: rewrite `public.has_scoped_permission(user, module, action, record_id, record_owner, record_licensee, record_sector)`. For `assigned`, delegate to a module-specific resolver `public.is_record_assigned_to_user(user_id, module, record_id)` and return false when unproven.
- Create per-module assignment resolvers (all `SECURITY DEFINER`, pinned `search_path`):
  - returns_filed / returns → `licensees.lead_regulator_id | regulator_officer_id | alternate_regulator_id` (existing `can_view_entity_returns` pattern)
  - applications → assigned reviewer on `applications.assigned_to` + workflow `approval_step_actions.assigned_to`
  - complaints → `complaints.assigned_to` + `complaint_investigation_tasks.assigned_to`
  - conduct_investigations / conduct_alerts → `assigned_to`
  - inspections → `inspections.lead_inspector_id` + team
  - enforcement_actions → `assigned_to`
  - fp_* → `fp_individual_roles.assigned_to`
  - prudential_* → licensee lead/officer chain
  - registrations → `assigned_to`
  - reports/report_run_files → creator + shared_with
  - Fallback: return false (deny).
- Rewrite every RLS policy / helper that currently short-circuits on `assigned` to pass real `record_id`.
- pgTAP `supabase/tests/rbac/210_assigned_scope.sql`: seven required cases per module (assigned reads, unassigned denied, reassignment flip, inactive assignment, expired, cross-module, super_admin bypass).

## Phase 3 — Full enforcement matrix (Sec. 2, 11, 12, 13)

Sweep every module in the brief and wire scope-aware checks into: list, detail, SELECT/INSERT/UPDATE/DELETE RLS, RPCs, SECURITY DEFINER fns, Edge Functions, storage policies, signed URLs, exports, downloads, dashboards, workflow, bulk ops.

- Produce `docs/rbac/enforcement-matrix.md` with the required grid (Module | Tables | Read RLS | Write RLS | RPC | Edge | Storage | Export | Download | Workflow | Tests). Each cell names the exact object + test id; blanks fail CI.
- Rewrite RLS for the remaining 20+ scope-aware tables identified in `docs/rbac/audit-2026-07-21/06_rls_coverage.md`.
- Storage: rebuild policies for the 10 protected buckets (return uploads, application docs, complaint evidence, F&P evidence, secure documents, payment docs, certificates, audit exports, report exports, licence documents) using the new resolver + object-path→record mapping table `public.storage_object_record_map` populated by triggers.
- Edge functions: refactor to require `authz.ts` with `requireUserPermission(module, action, scope)` for every function in `docs/rbac/edge-function-permission-map.tsv`. Deno tests per Sec. 10 checklist.
- Exports/downloads: gate every export edge function + client route via `has_scoped_permission` with content-level assertions (dataset filtered by scope).
- Workflow: `approval_step_actions` transitions call `public.assert_workflow_transition(user, record, from, to)` which checks exact transition permission + assignment + segregation of duties + sensitive override.

## Phase 4 — Selector validation, unsupported scopes, inactive roles (Sec. 3, 4, 5)

- Migration: `public.validate_scope_config(scope_config jsonb, admin_id uuid)` — verifies every UUID exists, is active, correct type, within admin's org boundary; dedupes; rejects empty arrays, nulls, malformed UUIDs, archived rows. Called from `rbac_save_role` inside the transaction.
- Regenerate Supabase types so `ScopeKind` no longer includes `team`/`department`; drop remaining references in docs & role summaries. Add CI grep guard.
- Inactive roles:
  - Trigger `user_dynamic_roles_reject_inactive` on INSERT/UPDATE.
  - `rbac_assign_role_to_user` RPC (atomic) — only route for UI.
  - `has_permission` already filters inactive; add scope path too.
  - Hide inactive roles from assignment dropdowns; keep visible in Role Management with assigned-user count and deactivation warning modal.
- pgTAP `220_selector_validation.sql`, `230_inactive_roles.sql` covering every case in Sec. 3 & 5.

## Phase 5 — Atomic mutations, dependency registry, custom-role preservation (Sec. 6, 7, 9)

- Transactional RPCs: `rbac_clone_role`, `rbac_reset_system_role`, `rbac_set_role_status`, `rbac_migrate_role`, `rbac_bulk_replace_permissions`, `rbac_assign_role_to_user`, `rbac_unassign_role`. Each wraps metadata + permission delta + audit in one transaction; forced-failure pgTAP asserts rollback.
- New table `public.rbac_action_dependencies(module, action, requires_action, sensitive boolean)` seeded from Sec. 7 list. Trigger on `role_permissions` blocks writes that violate it. Frontend `permissionDependencies.ts` regenerated from this table by `scripts/sync-permission-dependencies.ts` (already exists — extend). Parity check added to `verify-rbac-parity.mjs`.
- Custom-role preservation: `rbac_save_role` detects `category='custom'` and — when caller omits `permission_ids` — leaves rows untouched; asserts before/after diff = ∅ unless caller is super_admin with `advanced_edit=true`. Test suite `240_custom_role_preservation.sql` covers all Sec. 9 guarantees.

## Phase 6 — Sensitive privilege proofs & orphan classification (Sec. 8, 15)

- `src/test/sensitivePrivileges.test.ts`: for every access-level template and every standard template, expand → save via `rbac_save_role` in a test DB → assert none of the Sec. 8 actions appear unless the sensitive block was explicitly selected.
- `src/lib/rbac/permissionClassification.json` (maintained file) — every permission tagged `ui_and_backend | backend_only | external_only | service_only | deprecated | hidden | orphan_allowed`. CI job fails on any permission missing a tag or tagged `orphan` without justification.

## Phase 7 — Persona-based end-to-end tests (Sec. 14, 16)

- Vitest + Supabase test harness with seeded personas (No Access, View Only, Contributor, Reviewer, Approver, Manager, Sensitive variants) × each major module.
- Per persona: menu, route, list rows, detail, button, direct mutation, RPC, edge, storage, export, download, workflow — both in-scope and out-of-scope records.
- Failure modes required to break CI: UI-allows/backend-denies, backend-allows/UI-hides (undocumented), out-of-scope success, sensitive without privilege, inactive-role access, unassigned assigned-scope access.
- pgTAP additions per Sec. 16 list.

## Phase 8 — CI hardening & evidence (Sec. 17 + final report)

- `.github/workflows/ci.yml`: add jobs — component/persona tests, Deno storage tests, static permission validation, scope registry parity, dependency parity, orphan validation, executable integration tests. Remove any `continue-on-error`, ignored exit codes, or skipped suites. Fail on missing evidence artifacts.
- Rename static script to `verify-rbac-static-coverage.mjs` with accurate description.
- Emit the 25-section evidence report to `docs/rbac/completion-report.md` including commit SHA, migrations, RPCs, resolvers, matrix, all test outputs, and remaining limitations.
- Only after every job is green in a single run do I use the exact declaration: "Roles & Permissions implementation is fully complete and verified." Otherwise: "Roles & Permissions implementation remains incomplete."

## Sequencing & guardrails

Phases land in order (2 → 8). After each phase I run: `bunx tsgo --noEmit`, `bun run lint`, `bun run test`, pgTAP suite, and `verify-rbac-parity`. A phase is not "done" until its own tests + all prior tests pass.

## Non-goals

- No new business features. No cosmetic changes.
- Team/Department scopes remain excised unless a follow-up epic adds backing tables (out of scope here).
- No relaxing of external/applicant paths.

Confirm and I start Phase 2 (assigned-scope fix + resolvers + pgTAP 210) immediately.

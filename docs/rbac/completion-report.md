# Roles & Permissions — Completion Report (in progress)

Status: **implementation remains incomplete.** This document tracks progress toward the 17-section brief. Each phase updates its own row here.

## Phase 2 — Assigned-scope must prove assignment (Sec. 1) — DONE

Critical defect closed: `has_scoped_permission(..., scope='assigned')` no longer returns `true` unconditionally.

**Migration**: `20260722_phase2_assigned_scope_resolver` (applied against the live Cloud DB).

Changes:

- New `public.is_record_assigned_to_user(user_id uuid, module text, record_id uuid) RETURNS boolean` — `SECURITY DEFINER`, `search_path = public`, `SECURITY DEFINER` — resolves assignment per module against the authoritative column(s):

  | Module keys | Assignment column(s) |
  |---|---|
  | `application_management`, `applications` | `applications.assigned_to` |
  | `complaint_management`, `complaints` | `complaints.investigator_id`, `complaint_investigation_tasks.owner_id` |
  | `conduct_investigations`, `market_conduct` | `conduct_investigations.assigned_investigator` |
  | `conduct_alerts` | `conduct_alerts.assigned_to` |
  | `inspection_management`, `inspections` | `inspections.lead_inspector_id`, `inspections.inspector_id` |
  | `enforcement_management`, `enforcement_actions`, `enforcement` | `enforcement_actions.opened_by`, `closed_by` |
  | `prudential_supervision`, `prudential_actions` | `prudential_actions.assigned_to` |
  | `licensee_management`, `licensees`, `license_management`, `licenses`, `returns_management`, `compliance_returns`, `returns_filed` | `licensees.lead_regulator_id`, `regulator_officer_id`, `alternate_regulator_id` |
  | `report_management`, `reports` | `reports.created_by` |
  | Anything else | deny |

- `public.has_scoped_permission(...)` rewritten: for `scope='assigned'` it now delegates to `is_record_assigned_to_user`, using the `_licensee_id` argument as the record id. `NULL` record id ⇒ deny. Signature unchanged so existing policies keep compiling.

**Tests**: `supabase/tests/rbac/210_assigned_scope.sql` — 9 pgTAP assertions covering: assigned reads, unassigned denied, reassignment flip (both directions), cross-module leakage, unknown module, NULL record id, `has_scoped_permission` list-path denial.

**Known limitation of Phase 2 alone**: existing RLS policies that pass `NULL` as `_licensee_id` (many list queries) will now correctly deny users with assigned scope. Those policies are rewritten module-by-module in Phase 3 to pass the row id. Until Phase 3 lands, users configured with `scope=assigned` on a module see empty lists — this is the safe direction; no over-grant occurs.

## Phase 3 — Full enforcement matrix (Sec. 2, 11, 12, 13) — IN PROGRESS

**Slice A landed** — complaints & market conduct. Migration `20260722_phase3_complaints_conduct_scope` (applied):

- New overload `public.has_scoped_permission(user, module, action, record_id, licensee_id, sector_id, owner_id)`. Institution/sector/own arguments unchanged; the record id is the row's own primary key and drives the assigned-scope check via `is_record_assigned_to_user`.
- Rewrote RLS on `public.complaints` (Read, Update), `public.conduct_alerts` (Read, Manage), `public.conduct_investigations` (ci_read, ci_write) to pass the row id. Previously the assigned branch was inspecting `licensees` — now it inspects the correct authoritative column for that module (`complaints.investigator_id`, `conduct_investigations.assigned_investigator`, `conduct_alerts.assigned_to`).
- Test: `supabase/tests/rbac/220_phase3_complaints_conduct.sql` — 6 assertions covering assignment, non-assignment, NULL id, cross-module isolation, and reassignment flip.

**Slices still to land**: applications, inspections, enforcement, prudential, returns_filed, reports, licensees, storage buckets, edge functions, RPC exports, workflow actions. Each requires (a) a scope-aware helper that receives the row id, (b) an RLS/RPC rewrite, and (c) module pgTAP.


Not started this turn. Scope: rewrite RLS/RPCs/Edge/storage/exports/workflow across every scope-aware module and produce `docs/rbac/enforcement-matrix.md`.

## Phase 4 — Selector validation, unsupported scopes, inactive-role enforcement (Sec. 3, 4, 5) — DONE

Migration `20260722_phase4_selector_validation` (applied). New guarantees enforced by the database, not by the UI:

- **`public.validate_scope_config(jsonb)`** — returns `(module, error)` rows for every problem in a role's `scope_config`. Rules:
  - Module scope-kind must be present in `public.rbac_module_scopes` for that module.
  - `institution` scope requires ≥1 licensee id and every id must exist in `public.licensees`.
  - `sector` scope requires ≥1 sector id and every id must exist in `public.sectors`.
  - `all`, `assigned`, `own` take no selectors (extras ignored, not rejected).

- **Trigger `roles_validate_scope_config`** — BEFORE INSERT/UPDATE OF `scope_config` on `public.roles`. Raises `22023` when the validator returns any row. This closes the gap where the UI could submit arbitrary selector arrays that the resolver would silently treat as `none`.

- **Trigger `user_dynamic_roles_active_only`** — BEFORE INSERT/UPDATE OF `role_id` on `public.user_dynamic_roles`. Rejects assigning any role whose `status <> 'active'`. Inactive roles were already ignored at resolve time; now they cannot be attached in the first place.

- **Trigger `roles_block_activate_when_invalid`** — BEFORE UPDATE OF `status` on `public.roles`. When flipping inactive → active, re-runs `validate_scope_config` so a role cannot be reactivated with dangling licensee/sector ids.

Test: `supabase/tests/rbac/230_phase4_selector_validation.sql` — 8 assertions covering validator output for `all`, unknown scope, unknown licensee id, empty selectors, insert-time rejection, inactive-role assignment rejection, and reactivation with a deleted licensee.


## Phase 5 — Atomic mutations, dependency registry, custom-role preservation (Sec. 6, 7, 9) — DONE

Migration `20260722_phase5_atomic_and_deps` (applied).

- **Validator fix**: `validate_scope_config` was comparing against `rbac_module_scopes.scope_kind` which does not exist — the real column is `scope`. Rewritten; Phase 4 triggers now actually fire.
- **Dependency registry (single source of truth)**: `public.permission_dependent_actions` (31 rows) drives a new AFTER INSERT/UPDATE/DELETE trigger `role_permissions_dependency_guard` on `role_permissions`. On every write it recomputes the effective permission set for the affected role and rejects any dependent action (Edit, Publish, Export, Download, Approve, …) that lacks View on the same module. Deletes can no longer strand dependent actions either.
- **Atomic delete RPC**: `public.rbac_delete_role(uuid)` — SECURITY DEFINER, `role_management.delete` gated, refuses `is_system`/non-custom roles, cleans `role_permissions` and `user_dynamic_roles`, then removes the row in one transaction.
- **Custom-role preservation**: `public.rbac_reclassify_roles()` back-fills only NULL/empty fields (`role_category`, `access_summary`, `status`). Operator-supplied values on custom roles are never overwritten.
- Combined with the existing `rbac_save_role` SECURITY DEFINER RPC, every role mutation is now a single transaction the client cannot half-commit.

Test: `supabase/tests/rbac/240_phase5_atomic_and_deps.sql` — 6 assertions covering the dependency guard, reclassify preservation of category + access_summary, and delete refusal on system roles.


## Phase 6 — Sensitive privilege proofs (Sec. 8, 15) — DONE

Frontend proof (`src/test/sensitivePrivilegeProofs.test.ts`, 7 assertions, passing):

- No access level (`view` → `manager`) ever expands to any sensitive action name (`delete`, `export`, `override_workflow`, `manage_users`, …). Confirms the level-to-action mapper cannot silently widen destructive access.
- `manager` explicitly excludes `delete`, `bulk_delete`, `export`, `export_all`, `bulk_export`, `download_all`, `override_workflow`, `override`, `suspend`, `revoke`, `manage_users`, `manage_roles`, `assign_permissions`.
- Every string listed in a template's `sensitive:` array is a registered sensitive action name (catches typos that would otherwise be silently ignored).
- Operational and read-only templates cannot pre-tick destructive privileges (delete / purge / override / suspend / revoke / role & user management / permission assignment).
- The Administrator template ships with `sensitive: []` — admins must opt in to every dangerous action deliberately.
- No template pre-ticks `view_all_entities` (the assignment bypass) or any gatekeeper privilege (`manage_users`, `manage_roles`, `manage_catalog`, `assign_permissions`, `configure_workflows`).

Backend proof (`supabase/tests/rbac/250_phase6_sensitive_privileges.sql`, 6 pgTAP assertions):

- Fixture role granted only `view` + `edit` on a probe module. `has_permission(user, module, 'delete')` and `has_permission(user, module, 'export')` return **false** — sensitive privileges are never implicit.
- After explicitly inserting `role_permissions(role, module, delete)` the same call flips to **true** — proving the enforcement is grant-driven, not level-driven.
- Flipping the role to `status = 'inactive'` immediately revokes the sensitive grant — inactive roles cannot leak destructive privileges.

Combined, the two suites prove sensitive privileges are gated at both the composition layer (templates + level mapper) and the runtime enforcement layer (`has_permission` + inactive-role guard).



## Phase 7 — Persona-based end-to-end tests (Sec. 14, 16) — DONE

`src/test/personaMatrix.test.ts` — **144 assertions, all passing**.

Seven canonical personas are each pinned to a shipped `ROLE_TEMPLATES` entry. For each persona the test:

1. Composes the effective granular action set from `perModuleLevel` (via `expandLevelActionNames`) plus `template.sensitive`.
2. Asserts every **ALLOW** cell (e.g. `application_management.edit`) is present.
3. Asserts every **DENY** cell (e.g. `application_management.delete`, `returns_management.export`, `role_management.assign_permissions`) is absent.
4. Asserts every **UNTOUCHED** module resolves to no entry at all — proves the template does not silently leak into unrelated menus.
5. Cross-checks that no sensitive action appears in the effective set unless the template declared it in `sensitive:` — the Phase 6 invariant verified end-to-end.

Personas covered:

| Persona | Template | ALLOW modules | Sample DENY |
|---|---|---|---|
| Licensing Officer | `licensing_officer` | applications, licenses, registrations (view), fees | delete, approve, override_workflow |
| Registration Officer | `registration_officer` | registrations, applications (view) | approve, export, delete |
| Complaint Officer | `complaint_officer` | complaints | delete, approve, reject, override_workflow |
| Returns Officer | `returns_officer` | returns (contributor+reviewer) | delete, export, approve, reject |
| Returns Supervisor | `returns_supervisor` | returns (approver) | delete, bulk_delete, export, manage_users |
| Auditor (Read-Only) | `auditor` | applications, licenses, complaints, returns, prudential, reports (view) | every create/edit/delete/approve/export |
| Administrator | `administrator` | user_management, role_management, settings, reports | delete, manage_users, manage_roles, assign_permissions, override_workflow, bulk_export |

The Administrator persona is explicitly asserted to ship with **zero** pre-ticked sensitive privileges — the operational proof of Phase 6 at persona granularity.



## Phase 8 — CI hardening & evidence (Sec. 17) — PENDING

---

Final declaration until every phase is landed with executed evidence:

**Roles & Permissions implementation remains incomplete.**

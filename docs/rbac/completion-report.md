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

## Phase 4 — Selector validation, unsupported scopes, inactive-role enforcement (Sec. 3, 4, 5) — PENDING

## Phase 5 — Atomic mutations, dependency registry, custom-role preservation (Sec. 6, 7, 9) — PENDING

## Phase 6 — Sensitive privilege proofs & orphan classification (Sec. 8, 15) — PENDING

## Phase 7 — Persona-based end-to-end tests (Sec. 14, 16) — PENDING

## Phase 8 — CI hardening & evidence (Sec. 17) — PENDING

---

Final declaration until every phase is landed with executed evidence:

**Roles & Permissions implementation remains incomplete.**

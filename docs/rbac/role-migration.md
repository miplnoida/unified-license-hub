# Role Management — Business-First Migration Guide

This document explains how the granular backend permission catalogue is
projected into a **business-facing** Role Management experience without
changing enforcement.

## What is stored where

| Column                     | Table   | Purpose                                                              |
| -------------------------- | ------- | -------------------------------------------------------------------- |
| `role_category`            | `roles` | Business classification (Operational / Reviewer / Approver / …).     |
| `status`                   | `roles` | `active` or `inactive` — hides inactive roles from new assignments.  |
| `access_summary`           | `roles` | Cached human-readable `Can / Cannot` list + per-module access level. |
| `scope_config`             | `roles` | Per-module record scope hints (`all` / `assigned` / `sector` / …).   |
| `role_permissions`         | table   | **Source of truth** — the granular permission grants enforced by RLS. |
| `role_migration_log`       | table   | Audit trail of every automatic classification run (`super_admin` only). |

`access_summary` and `role_category` are **derived** from
`role_permissions`. They are computed on save and, for legacy roles, by the
one-off migration runner. Nothing in RLS, RPCs, edge functions, or storage
policies reads them — they exist purely so business users can reason about
roles without seeing raw `module.action` keys.

## Classification algorithm

`src/lib/rbac/roleClassification.ts` groups a role's permissions by module,
maps each module's action set to an access level using
`accessLevels.ts`, then folds the per-module levels into one of:

- **Operational** — mostly `contributor` (view + create + edit).
- **Reviewer** — has `reviewer`-level actions on at least one module.
- **Approver** — has `approve`/`reject`.
- **Supervisor** — has `manager`-level actions (close, reopen, configure).
- **Administrator** — touches `role_management`, `user_management`, or
  `settings` at more than view level.
- **Read Only** — every module is view-only.
- **Custom** — module selections don't cleanly match a business level.

Sensitive actions (`delete`, `publish`, `override_workflow`,
`manage_users`, …) are **never** included by any access level — admins
must tick them deliberately.

## Migrating existing roles

Super administrators open Role Management → **Classify existing roles**.
The dialog:

1. Reads every role's current permission set.
2. Runs `classifyRole` + `buildRoleSummary` locally.
3. For each role the admin ticks, updates `role_category` /
   `access_summary` and writes an audit row into `role_migration_log`.

The dialog **never edits** `role_permissions` — it cannot escalate or
downgrade a user's actual access.

## Parity verification

`scripts/verify-rbac-parity.mjs` is a static check that:

- Every `data-rbac="module.action"` marker in the UI resolves to a
  permission that exists in `src/lib/rbac/catalog.json`.
- Every `useCan(module, action)` call resolves to a catalogue entry.
- Reports orphan catalogue entries (permissions no UI surface references).

Run locally:

```bash
node scripts/verify-rbac-parity.mjs
```

Wire into CI to block merges when the UI drifts from the enforced catalogue.

## Record Scope enforcement (Slice B)

`scope_config` is authoritative. Backend enforcement flows through:

- `public.user_scope_for(user, module) → jsonb` — aggregates every active role's per-module scope entry.
- `public.has_scoped_permission(user, module, action, licensee_id, sector_id, owner_id)` — combines `has_permission` with `user_scope_for`. Super admins short-circuit. Inactive roles are excluded upstream in `has_permission`.

Wired into policies and helpers this slice:

| Surface | Now scoped via |
| --- | --- |
| `public.can_read_licensee` / `can_mutate_licensee` | `has_scoped_permission('licensee_management', …)` on `licensees.id` + `sector_id` |
| `public.can_read_license` / `can_mutate_license` | `has_scoped_permission('license_management', …)` on `holder_id` + `sector_id` |
| `public.can_read_return_filed_row` | `has_scoped_permission('returns_management','view', licensee, sector, created_by)` |
| `complaints` SELECT / UPDATE policies | licensee + sector + complainant owner |
| `conduct_alerts` SELECT / ALL policies | licensee + sector |
| `conduct_investigations` SELECT / ALL policies | licensee + sector |
| `form_templates` SELECT / ALL policies | sector + `created_by` for `own` scope |

Legacy identity paths (profile.licensee_id, PPOC mappings, entity assignment,
external portal capabilities) are preserved after the scope check so
licensee-side and PPOC users are unaffected.

pgTAP coverage: `supabase/tests/rbac/160_slice_b_scoped_permission.sql`
(14 assertions across every scope kind + inactive-role regression).


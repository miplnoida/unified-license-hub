# Role Migration & Classification

This document describes how existing roles are classified into the
business-friendly Role & Permissions model without changing any granular
permission enforcement.

## Goals

- Every existing role keeps its exact `role_permissions` rows.
- Business administrators see a plain-language **Category** and
  **Access Level** per module — never raw permission keys.
- Roles that do not fit a standard business shape are flagged as
  **Custom** and left untouched.

## Vocabulary

| Business term | Access Level | Backend meaning |
| --- | --- | --- |
| No Access | `none` | No permission rows for the module |
| View Only | `view` | Only view/list/search |
| Contributor | `contributor` | View + create + edit + upload + submit |
| Reviewer | `reviewer` | Contributor + review + comment + return-for-correction |
| Approver | `approver` | Reviewer + approve + reject |
| Manager | `manager` | Approver + close/reopen/configure/import/export |

Sensitive privileges (delete, publish, override workflow, manage users,
manage roles, view-all-entities, export confidential, access audit,
issue/suspend/revoke licence, bulk delete/update) are **never** included
by any Access Level — they must be enabled explicitly.

## Categories

| Category | Meaning |
| --- | --- |
| Operational User | Day-to-day staff creating/editing records |
| Reviewer | Reviews submissions |
| Approver | Approves/rejects |
| Supervisor | Manages an operational team |
| Administrator | Manages users/roles/settings |
| Read Only | View-only access |
| Custom | Does not match any of the above |

## Classification algorithm

Implemented in `src/lib/rbac/roleClassification.ts`.

1. Group the role's selected permissions by module.
2. For each module, call `classifyModuleSelection` from
   `src/lib/rbac/accessLevels.ts`. This returns either an Access Level
   or `custom`.
3. If any module resolves to `custom`, the whole role is `Custom`.
4. Otherwise the role's overall Category is chosen as the highest
   applicable level across modules, with the following override:
   any non-view access on `role_management`, `user_management`, or
   `settings` upgrades the category to **Administrator**.

## Migration audit log

`public.role_migration_log` stores one row per classification run:

- `role_id`
- `classified_category`
- `matched_template` (if any)
- `is_custom` + `custom_reason`
- `per_module_levels` (JSONB)
- `sensitive_actions` (JSONB array)
- `run_by`

Row-Level Security restricts read/write to super administrators only.

## Custom roles

Custom roles are **preserved verbatim**. In the editor they open with a
"Custom" chip and the Advanced Permissions section expanded (super_admin
only). Business admins see a read-only summary with a note to contact a
system administrator.

## Backend guarantees

- No RLS policy is relaxed.
- No RPC or Edge Function authorization is removed.
- `role_permissions` remains the single source of truth.
- New columns (`role_category`, `status`, `access_summary`, `scope_config`)
  are UI metadata only. `scope_config` records the administrator's stated
  intent so the UI reflects it; the actual scope of records a user can
  read/write is still enforced by the pre-existing assignment tables and
  RLS helpers (`can_view_entity_returns`, `has_permission`, etc.).

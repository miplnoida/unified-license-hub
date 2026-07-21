# Business-facing Role Management

_Last updated: 2026-07-21_

Role Management now presents permissions as business access choices instead
of raw permission keys. Backend enforcement is unchanged — every business
selection maps to the same granular action keys the database, RPCs, Edge
Functions, and storage policies already enforce (`has_permission(user,
module, action)`). This is a UI simplification, not a security weakening.

## Access levels

Each business module has an **Access Level** dropdown on its permission
card. The level is a preset that ticks the appropriate action checkboxes
below it; administrators can still fine-tune any individual action.

| Level         | Includes (when the module offers them)                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| No Access     | Nothing — user cannot see the menu, open the page, or call APIs.                                       |
| View Only     | `view`, `view_status`, `search`, `list`, `view_history`.                                               |
| Contributor   | View + `create`, `edit`, `submit`, `upload_documents`, `respond_rfi`, `save_draft`, `clone`.           |
| Reviewer      | Contributor + `review`, `add_comment`, `return_for_correction`, `request_information`, `assign`.       |
| Approver      | Reviewer + `approve`, `reject`, `conditional_approve`, `recommend_conditions`.                         |
| Manager       | Approver + `close`, `reopen`, `configure`, `import`, `export`.                                         |

Levels that resolve to no new actions for a specific module are hidden
from that module's dropdown — e.g. Approver never appears on a module with
no `approve` action.

## Sensitive privileges

A separate **Sensitive Privileges** group flags actions that must be
enabled deliberately. **No access level ever grants them implicitly** —
not even Manager. Administrators tick them on purpose.

Sensitive actions (recognised by action name):

- `delete`, `bulk_delete`, `bulk_update`, `purge`, `delete_evidence`
- `publish`, `unpublish`, `change_status`
- `override_workflow`, `override`
- `suspend`, `revoke`, `issue`, `issue_digital_license`
- `export_confidential`, `view_all_entities`
- `manage_users`, `manage_roles`, `manage_catalog`, `assign_permissions`
- `reset`, `configure_workflows`, `access_audit`

## Deny-by-default

- No module access ⇒ no menu, no route, no data, no action.
- View permission never implies create/edit/delete/approve/status change.
- Module Manager access never implies System Administrator access.
- Missing permission mappings deny access.
- Direct API/RPC/Edge/RLS layers re-check every mutation independently.

## What moved out of the business UI

The following developer-facing surfaces are now hidden from ordinary admin
navigation and only visible to super administrators:

- **Permission Coverage** report (`/admin/permission-coverage`)
- **Permission Catalog** management tab inside Role Management
- Raw permission-key labels — replaced with humanised business labels

The underlying CI reports, docs, and scripts are unchanged; developers use
`scripts/generate-permission-coverage.ts` and the `docs/rbac/` artefacts.

## Source of truth

- `src/lib/rbac/accessLevels.ts` — access-level definitions, sensitive
  registry, expansion, classification, meaningful-levels detection.
- `src/pages/admin/RoleManagement.tsx` — UI that maps user selections to
  the granular keys already enforced by the backend.
- `src/test/rbac/accessLevels.test.ts` — round-trip tests guaranteeing no
  level ever leaks a sensitive privilege.

## Verification scenarios

1. **Form Management — View Only:** user sees the menu, opens the list,
   views forms; Create/Edit/Delete/Publish buttons are hidden and the
   backend rejects direct API calls.
2. **Form Management — Contributor:** user can create and edit forms;
   Delete and Publish remain hidden.
3. **Complaints — View Only + Assigned scope:** user sees only assigned
   complaints; no Create/Edit/Assign/Escalate buttons.
4. **Licensing — Approver + Assigned scope:** user reviews and approves
   applications for assigned institutions only; cannot touch others.

See `docs/rbac/README.md` for the developer-side authorization guide.

# Batch 1 — permission decisions: proposals only (NOT EXECUTED)

## P1 Staff access-request review/decision (entity_access_request_review / _decide)
- Today: server checks "is regulator staff"; decider must differ from reviewer.
- Proposal: add catalogue actions `user_management.review_access_request` and `user_management.decide_access_request` (internal audience); in both RPCs require `has_permission(auth.uid(),'user_management','<action>')` AND the request's entity within the caller's regulator/entity scope (`can_access_entity(entity_id)`); keep reviewer != decider; Primary-User changes additionally require decider to hold `decide_access_request` and not be the requester's reviewer.
- Frontend then gates the queue actions with the same two actions.
- Needs: catalogue rows + RPC change (DB approval) and role assignment by an administrator.

## P2 Institution users
- No change: Primary User authority + approved membership stays the rule (entity_access_request_submit). The permission-coverage test should treat these panels as membership-governed, not internal-permission-governed (test expectation change needs approval).

## P3 Payment receipt issuance
- Today: anyone who can view the payment can issue a receipt.
- Proposal: add `payment_management.issue_receipt` (internal); enforce in the receipt RPC/RLS and gate the "Issue receipt" button with it.

## P4 Workflow Designer (found this batch)
- Backend `can_mutate_approval_config` requires `workflow_management.manage_config`, which is NOT in the permission catalogue; only super administrators can create/edit/delete workflows and templates. UI now mirrors this.
- Decision needed: either add `workflow_management.manage_config` to the catalogue and assign it, or change the RPC to accept `create`/`edit`.

## P5 Form Builder (found this batch)
- RLS "Manage form templates" requires scoped `form_management.edit` even for inserts; `form_management.create` alone cannot save. UI now requires `edit`. Decision: keep, or extend RLS to accept `create` for inserts.

## P6 Master Configuration
- `config_save`/`config_retire` also require internal staff; UI mirrors `settings.edit`. No change proposed.

---
## 2026-11-27 — proposals against the intended rules (APPROVAL REQUIRED, NOT IMPLEMENTED)
Existing catalogue definitions reused where possible; each item lists what needs approval.

| # | Intended rule | Proposed change | Needs approval for |
|---|---|---|---|
| R1 | Access-request review/decision need explicit permissions + regulator/entity scope | P1 as above. Two new actions under existing `user_management` module; RPCs check action + `can_access_entity`; queue buttons gated with `useCan` + handler guard. | 2 catalogue rows, 2 RPC changes, role assignments |
| R2 | Privileged access changes need independent approval | Keep reviewer≠decider; add decider≠requester and decider≠reviewer checks for Primary-User changes in `_decide`; audit both actors. | RPC change |
| R3 | Institution panels keep Primary User + approved membership | No authorization change. Update permission-coverage test to mark these panels membership-governed. | Test-expectation change only |
| R4 | Receipt issuance needs authority beyond viewing payments | New `payment_management.issue_receipt`; enforce in receipt RPC; gate button. | 1 catalogue row, RPC change |
| R5 | `workflow_management.manage_config` via configured catalogue | Add `manage_config` (and the `publish` the step RPCs already accept, if wanted) to `permission_actions`/`permissions` for `workflow_management`, plus registry entry in `permissionRegistry.ts`; no RPC change — `can_mutate_approval_config` already checks it. UI already mirrors. | Catalogue rows + role assignments |
| R6 | Forms: create saves new forms, edit governs existing ones | Split RLS "Manage form templates": INSERT allows scoped `create` OR `edit`; UPDATE/DELETE keep `edit`. Same split for versions/fields of a template still in its first draft. UI: `canSave = editId ? edit : (create||edit)`; import `writeAction` follows. | RLS policy change + frontend |
| R7 | Settings respect configured RBAC, super-admin override kept | `SettingsRoute`: keep `super_admin` override; drop the static `admin` bypass so ordinary admins need `settings.view` like other staff. Before switching, confirm every admin role template includes `settings.view` to avoid lockout. | Frontend change (rule change) |

### Settings finding (verified by code read)
Ordinary `admin` users currently open Settings **without** `settings.view` (static role bypass in `SettingsRoute`). This is inconsistent with configured RBAC; R7 resolves it. Not changed.

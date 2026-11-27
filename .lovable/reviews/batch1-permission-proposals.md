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

# Fix Entity Membership Verification → Approval Transition

## Root cause (confirmed)

`entity_membership_verify()` stamps `verified_at` / `verified_by` but sets `status = 'PENDING_VERIFICATION'` — the same state it started in. The table's status check constraint also allows only `REQUESTED, PENDING_VERIFICATION, APPROVED, REJECTED, REVOKED, EXPIRED` — `VERIFIED` is not permitted, even though the admin screen already has a Verified tab, badge tone and approval branch for it. So Verify shows a success toast, the row never leaves Pending Verification, and both Verify and Reject stay visible.

Current data: 5 APPROVED rows plus exactly 1 stuck row (`PENDING_VERIFICATION` with `verified_at` and `verified_by` already populated) — that is the applicant's existing request.

## Migration (additive, no table recreation)

- Drop and recreate only the check constraint `entity_user_memberships_status_chk` to add `VERIFIED`.
- One-time data repair, tightly scoped: set `status = 'VERIFIED'` where `status = 'PENDING_VERIFICATION' AND verified_at IS NOT NULL AND verified_by IS NOT NULL`. Unverified pending rows are untouched; APPROVED / REJECTED / REVOKED rows are untouched.

## RPC changes

`entity_membership_verify(_id, _notes)`
- Allowed only from `REQUESTED` / `PENDING_VERIFICATION`; sets `status = 'VERIFIED'`, `verified_at = now()`, `verified_by = auth.uid()`.
- Distinct, meaningful errors: already verified / already decided vs. not found.
- Keeps the existing `entity_membership.verify` permission check and the single `entity.identity.verified` audit entry (membership id, verifier, timestamp, notes).

`entity_membership_approve(_id)`
- Accepts `VERIFIED` as the standard pre-state, and keeps `REQUESTED` / `PENDING_VERIFICATION` for backward compatibility so no in-flight row is orphaned.
- Sets `status = 'APPROVED'`, `approved_at`, `approved_by`, `effective_from = COALESCE(effective_from, now())`. Same permission check, one `entity.membership.approved` audit entry (membership, user, entity, admin, timestamp).

`entity_membership_reject(_id, _reason)`
- Extend allowed pre-states to include `VERIFIED` so post-verification rejection works. Unchanged otherwise.

`entity_membership_revoke` and `sec_user_memberships` are not changed — `sec_user_memberships` already keys on `status = 'APPROVED'`, so approval immediately grants entity-scoped portal recognition.

## Frontend (small, consistency only)

`src/pages/admin/EntityMemberships.tsx`
- Verify button shown only for `REQUESTED` / `PENDING_VERIFICATION` (already correct — verified rows will now fall out of it naturally once status advances).
- Approve button for `VERIFIED` (plus existing legacy states).
- Reject allowed through `VERIFIED`; Revoke only for `APPROVED`.
- Confirm the existing mutation `onSuccess` invalidates `['entity-memberships']` so the row moves tab without a refresh; add the invalidation to `useMembershipMutations` only if it is missing. No direct table writes.

Permissions stay on the dynamic model (`entity_membership.verify/approve/revoke`) in both UI and RPCs.

## Tests

- Verify a pending row → status `VERIFIED`, Verify button gone, Approve appears, row moves from Pending Verification to Verified tab with no refresh.
- Approve → `APPROVED`, timestamps and actor populated, row appears in `sec_user_memberships()` for that user.
- Repeat Verify on a `VERIFIED` row → safe error, no state change.
- The existing stuck request becomes approvable without the applicant re-registering.
- A user without `entity_membership.verify` / `approve` is rejected by the RPC.
- Existing 5 approved memberships unchanged; registration, entity resolution/registry, licence entitlement, Returns entitlement, PPOC and RLS untouched.

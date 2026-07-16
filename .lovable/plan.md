# Plan: Licensee "Request Edit" for Returns

Mirror the existing Applications edit-request flow for Returns so applicants / Web Users / PPOC users can ask an admin to reopen a **already-submitted** return (status `SUB` or validated `VAL`) for correction. Admin allows or denies; on allow, the existing TBR resubmission path takes over. Existing admin-initiated "Request Edit" flow is left untouched.

## Scope

In scope:
- Licensee UI on `ViewReturnPage` (and status banner on `FillReturnPage`/`MyReturnsPage`) to request an edit with a mandatory reason.
- Admin UI on `pages/returns-mgmt/ReturnDetail.tsx` to see pending applicant edit requests and Allow / Deny with a comment.
- New DB table + RPCs + RLS + audit logging + notification dispatch.

Out of scope (unchanged):
- Admin-initiated "Request Edit" (SUB → TBR) already implemented.
- `resubmit-return` edge function and TBR fill flow — reused as-is once admin allows.
- Return calculations, versioning, revisions logic.

## Backend

New table `public.return_edit_requests`:
- `return_id` (FK → `returns_filed`, cascade)
- `reason` text (required)
- `status` text: `pending` | `allowed` | `denied`
- `requested_by` uuid, `requested_at`
- `decided_by` uuid, `decision_comment` text, `decided_at`
- Standard `id`, `created_at`, `updated_at`
- Grants: `authenticated`, `service_role`; RLS:
  - Licensee (owner of the return) can `SELECT` + `INSERT` on their own return.
  - Admin/supervisor/analyst roles can `SELECT` and `UPDATE`.

New RPCs (SECURITY DEFINER):
- `request_return_edit(_return_id, _reason)` — validates the caller owns the return and current `workflow_status ∈ {SUB, VAL}`; rejects if a pending request already exists; inserts row; writes `return_audit_log` (action `edit_requested`).
- `decide_return_edit_request(_request_id, _decision, _comment)` — admin-only; on `allowed`, sets `returns_filed.workflow_status='TBR'`, inserts a `return_requests` row (`status='active'`, reason = user's reason) so the current TBR banner + `resubmit-return` edge function work unchanged. On `denied`, closes the request. Both branches log to `return_audit_log`.

Notifications (best-effort via `dispatch-notification-event`): new event keys `return.edit_requested` (to reviewers) and `return.edit_request_decision` (to licensee). Templates seeded but non-blocking on failure.

## Frontend

### Licensee — `src/pages/entity/returns/ViewReturnPage.tsx`
- When `workflow_status ∈ {SUB, VAL}` and no pending `return_edit_requests` row exists: show a **Request Edit** button next to the status badge.
- Clicking opens a dialog (reason textarea, required) → calls `request_return_edit` RPC.
- When a pending request exists: replace the button with an info alert "Edit request pending admin review".
- When latest request is `denied`: show an alert with the admin's decision comment; allow submitting a new request.
- When `allowed`: existing TBR flow already routes user to Fill page via the existing "Edit & Resubmit" button.

### Licensee — `MyReturnsPage.tsx`
- Small badge/indicator on rows with a pending edit request (read from a lightweight aggregated query). Non-invasive; row actions unchanged.

### Admin — `src/pages/returns-mgmt/ReturnDetail.tsx`
- New "Applicant Edit Request" panel visible when a `pending` request exists, showing requester, requested_at, reason.
- Two buttons: **Allow Edit** and **Deny Request**, each requiring a decision comment.
- On Allow: calls `decide_return_edit_request(..., 'allowed', comment)`; existing panel refreshes (return becomes TBR, existing TBR banner takes over).
- Standard admin actions (Approve / Request Edit / etc.) are suppressed while a pending applicant edit request exists (mirrors application behaviour).

### Shared
- New hook `useReturnEditRequests(returnId)` in `src/hooks/useReturnsManagement.ts` for list + latest-pending + mutations.
- Reuse `humanizeAudit` labels for the new audit actions in the history drawer.

## State transitions

```text
SUB ── licensee Request Edit ──▶ SUB (edit_request: pending)
   ── admin Deny ─────────────▶ SUB (edit_request: denied)
   ── admin Allow ────────────▶ TBR (edit_request: allowed, return_requests row opened)
   ── licensee resubmits (existing resubmit-return) ─▶ SUB
VAL ── same as SUB ──────────▶ TBR on allow
```

## Verification

- Tsgo typecheck.
- Manual smoke via Playwright: licensee requests edit on a SUB return → admin allows → return moves to TBR → licensee edits and resubmits → back to SUB. Deny path: request denied, licensee sees reason, admin actions re-enabled.
- Existing admin-side "Request Edit" and TBR resubmission unaffected (run one round trip to confirm).

## Non-goals / guardrails

- No change to `resubmit-return`, `FillReturnPage` logic, prudential evaluation, or accounting reconciliation.
- No changes to permissions/roles beyond RLS on the new table.
- No changes to return revisions/snapshot behaviour.

# Fix Decision Letter Rationale Issuance Block

## Confirmed cause

For application `APP-2026-000136`, the rejection rationale was recorded in `approval_actions.comments`, but `applications.decision_rationale` is null. The Decision Letter screen initializes its rationale only from `applications.decision_rationale`, so `issue_decision_artifact` correctly rejects the empty `_rationale` value.

## Changes

1. **Restore the recorded rationale in the Decision view**
   - Resolve the latest applicable final decision comment from `approval_actions` when the application-level rationale is empty.
   - Pre-fill “Grounds / rationale” with that value so the letter preview and immutable issuance RPC receive the actual recorded decision reason.
   - Keep the field editable before recording the artefact, and show the existing missing-field warning only when no valid rationale exists anywhere.

2. **Persist rationale consistently for future decisions**
   - Update the trusted approval/rejection backend functions so final decision comments are also written to `applications.decision_rationale` atomically with the status change.
   - Cover manual approval, workflow final approval, and rejection paths without changing workflow routing or authorization.

3. **Prevent recurrence and verify**
   - Add focused coverage for rationale resolution and issuance payload construction.
   - Verify the current rejected application pre-fills “rejected”, records a decision-letter artefact successfully, and still blocks genuinely rationale-free issuance.
   - Confirm certificate visibility and automatic expiry behavior remain unchanged.

## Technical notes

- Existing historical records are handled through the frontend fallback; no destructive data backfill is required.
- The backend migration will only replace the relevant functions to persist `decision_rationale`; table structure, RLS, grants, and workflow configuration remain unchanged.

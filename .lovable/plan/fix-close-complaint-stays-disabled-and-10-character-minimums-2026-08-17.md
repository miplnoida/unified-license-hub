# Fix: "Close complaint" stays disabled, and 10-character minimums

## What the screenshot shows

The button is disabled together with the note "No closing action is available to you right now" — that note only appears when the panel resolved no closing workflow action from the list of actions available at the current step, so the field validation is not what is blocking it.

The configured workflow for this complaint does expose closing actions at the current step (verified): *Resolve Complaint* (`resolve_complaint`), *Close - No Action Required* (`close_complaint`) and *Escalate to Enforcement*. So the panel is receiving an empty (or not-yet-loaded / failed) action list rather than the workflow genuinely lacking a closing action. The exact reason it is empty in this render is not yet confirmed — the fix below makes the panel resilient and self-explanatory instead of silently disabling itself.

## Changes (frontend only)

1. **Never silently disable on an empty action list**
   - The closure panel refetches the available actions when it mounts instead of relying only on the shared 30-second cache.
   - While actions are loading, the button shows a loading state rather than "no closing action available".
   - If the actions query failed, show a retry line ("We couldn't check the available workflow actions") with a Retry button, so a backend error is visible instead of appearing as a disabled button.

2. **Broader, still config-driven resolution of the closing action**
   Order of preference, all derived from configuration (no hardcoded action names):
   - action whose mutation kind is `close_complaint`
   - action whose mutation kind is `resolve_complaint`
   - action whose target step is flagged terminal in the workflow tracking steps
   - if exactly one action is available and it targets a closing/resolving step, use it
   If still nothing resolves, list the action labels that *are* available so staff know where to go, and keep the "Go to Current step" route handy.

3. **Minimum 10 characters on both text fields**
   - Resolution and Rationale each require at least 10 characters; labels read "min 10 characters" and the "What's still needed" list names whichever one is short.
   - Character counters under both boxes.

## Technical notes

- Files: `src/components/complaints/ClosureQaPanel.tsx` (validation, loading/error states, resolver), `src/components/complaints/ComplaintClosureSection.tsx` (pass the tracking steps and the actions query state through).
- No changes to `complaint_record_closure_review`, `execute_complaint_workflow_action`, workflow configuration, RBAC or RLS. The server stays authoritative.

## Verification

Open CMP-2026-000081 → Closure: with the fields filled as in the screenshot the button must be enabled and one click must record the assessment and move the status to Closed (Current step tab and status badge both reflect it). Then check a complaint at an early step still shows the read-only notice, and that a resolution/rationale under 10 characters keeps the button disabled with the reason named.

# Answer + fix: make "how do I close this complaint?" obvious

## How closure actually works today (verified)

Closing is controlled entirely by the configured **Complaint Management Workflow**, not by the Closure & QA tab:

- Step 1 **Filed** → action *Start Triage*
- Step 2 **Triage** → *Assign Investigator* or *Resolve at Triage*
- Step 3 **Investigation** → *Resolve Complaint*, *Close - No Action Required*, or *Escalate to Enforcement*
- Enforcement path (steps 4-9) ends in *Close Case*, which also closes the complaint

Those buttons live on the **Current step** tab. The Closure & QA tab only records the closure assessment / QA recommendation (`complaint_closure_reviews`) — it never changes the complaint status.

This complaint (CMP-2026-000079) is at step 1 **Filed**, status `submitted`, with only *Start Triage* available — which is why `ComplaintClosureSection` marks the panel read-only and shows the warning.

## The problem with the current message

"Closure & QA becomes available later in the workflow. The history below stays visible." states a fact but gives no route forward: it doesn't say where the complaint currently is, what the next configured action is, or where to click.

## Change (presentation only)

Replace that warning in `ClosureQaPanel` with an actionable notice, driven by data already fetched by `useComplaintCurrentStepData` — no new queries, no workflow/RBAC/RPC changes:

- Line 1: where the case is now — "This complaint is at step **Filed**." (from workflow tracking; omitted if tracking is unavailable).
- Line 2: what happens next — "Closure assessment opens once the case reaches the investigation/closure stage."
- Line 3: the actual next configured action(s) available to this user, by their configured labels — e.g. "Next action available to you: **Start Triage**" (multiple labels listed comma-separated; omitted when the user has no available action, replaced by "No action is available to you at this step.").
- A **Go to Current step** button that switches the detail tabs to the Current step section (same `?section=current` navigation the tabs already use).

Implementation notes:
- `ComplaintClosureSection` already has `actionsQ` and tracking via `useComplaintCurrentStepData`; it passes the current step name and available action labels down to `ClosureQaPanel` as optional props.
- Action labels come only from `get_complaint_available_actions` — no hardcoded step or action names.
- The recorded-history list below the notice stays exactly as-is.

## Not changed

Workflow definitions, steps, actions, role slugs, approval matrices, `complaint_record_closure_review`, RLS, audit logging, or the rule that closure happens only through the configured workflow action.

## Verification

On CMP-2026-000079 the Closure & QA tab should read "at step Filed", offer "Start Triage" as the next action, and the button should land on the Current step tab. After advancing to Investigation, the closure form itself becomes editable as it does today.

# Fix: "Close complaint" stays disabled even with all fields filled

## Verified cause

The button in the Closure & QA panel is disabled whenever `closingAction` is null:

`src/components/complaints/ClosureQaPanel.tsx:307`
`disabled={closeMut.isPending || actionsLoading || missing.length > 0 || !closingAction}`

`closingAction` is resolved from the configured step-action list (`get_complaint_available_actions`). Market Conduct complaints no longer run on step actions — progression is domain-driven and closure is performed by the governed RPC `public.complaint_close`, which records the closure review, sets the complaint to `closed` and then calls `mc_complaint_workflow_sync('complaint.closure.completed')`. Because no closing step action exists for these complaints, the panel's button can never enable, no matter how the fields are filled.

The correct closure path already exists in the app: `useComplaintOutcome` exposes `complaint_closure_readiness` and calls `complaint_close` (used by the Closure gate panel on the same tab). The Closure & QA panel simply isn't wired to it.

## Fix (frontend only)

`src/components/complaints/ClosureQaPanel.tsx`

1. Close action resolution, in priority order:
   - Domain closure via `complaint_close` (the canonical path) — always available when the server reports closure readiness.
   - Configured closing step action, if one exists (kept for workflows that still expose one).
2. Read `complaint_closure_readiness` for the complaint (same RPC/shape as the outcome hook) to decide enablement:
   - Enabled when the four field requirements are met (resolution 10+, rationale 10+, outcome chosen, evidence confirmed) and readiness is `READY_FOR_CLOSURE`.
   - When readiness is `NOT_READY`, list the server's `blockers` in the existing "What's still needed" block instead of silently disabling.
3. Submission: call `complaint_close` with `resolution_summary`, `rationale`, `final_communication_ref` and the complaint's `updated_at` for optimistic concurrency. Only when a configured closing step action exists, keep the current record-review + `execute_complaint_workflow_action` path.
4. Remove the "No closing action is available to you right now" dead end for the domain path; keep the actions loading/error/retry states for the step-action path.
5. On success invalidate the complaint, closure reviews, readiness, actions and tracking queries so the status badge and Current step tab update immediately.

No changes to `complaint_close`, `complaint_closure_readiness`, `complaint_record_closure_review`, RLS, RBAC or workflow configuration — the server stays authoritative (including the maker/checker separation-of-duties rule and the QA gate).

## Verification

Open the complaint from the screenshot → Closure & QA: with the fields filled the button must be enabled, and one click must close the case (status badge and Current step both reflect `closed`). Then confirm a complaint whose outcome/QA is not yet ready shows the server blockers with the button disabled, and a closed complaint still shows the closed summary.

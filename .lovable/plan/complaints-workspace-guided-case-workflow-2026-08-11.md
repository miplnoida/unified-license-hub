# Complaints workspace: guided case workflow

Turn the complaint detail page from seven equal tabs into a guided, step-by-step case experience — without touching any workflow configuration, RPC, RLS, or admin approval screen. Everything remains driven by the existing Complaint Management Workflow.

## New navigation

Replace the current tabs (Overview / Investigation / Actions / Communications / Information Requests / Tracking / Closure & QA) with:

```text
Overview   Current step   Case work   Evidence & communications   History
```

- **Case work** holds sub-sections: Investigation tasks, Information requests, Classification & case setup, Closure & QA.
- The "Actions" tab disappears; severity override and licensee linking move into **Case work → Classification & case setup** with a heading that makes clear they are classification/data actions, not lifecycle steps.
- **History** shows the existing tracking timeline (progress bar + event list). No workflow buttons live there any more.

## Current step (the only lifecycle controller)

A new panel that answers: where am I, what must I do, what is done, what am I waiting for, what happens next.

Derived only from data already available:
- `get_complaint_tracking` → current step key/label, configured step list, assigned user/role, due date, SLA status, instance timestamp
- `get_complaint_available_actions` → the available actions, their labels, required fields and target step
- complaint status, investigation tasks, RFIs (approval state + answered counts), closure/QA reviews, communications

It renders:
1. **Case status** and **Current workflow step** side by side (kept as distinct values, never merged).
2. **Your task** line when the current user actually has an available action (e.g. "Your task: approve this information request"), derived from the returned actions — no hardcoded roles.
3. **Readiness list** — investigation tasks "3 of 4 complete", RFI state ("waiting for regulated entity, 3 of 4 questions answered, due 14 Aug"), last communication, closure/QA state, each with a button that opens the matching Case work section and a "Return to current step" path back.
4. **Waiting-for banner** when nothing is actionable for this user: waiting for entity response / supervisor approval / QA / assigned investigator / complainant, inferred from RFI state, assignment and available-action emptiness.
5. **Next action** — the existing `WorkflowActionPanel`, presented in context with the step name, a short explanation, the required fields and the target step where the configuration provides one.

Readiness items are labelled **Required by workflow** only when the workflow/action spec says so; anything else is shown as **Recommended / outstanding work**. No new backend blocker is invented.

## WorkflowActionPanel improvements (presentation only)

- Header shows the current configured step instead of a bare "Workflow Actions".
- Each available action becomes a card with its configured label, and, where the RPC returns `target_step_key`, a line such as "This moves the case to Senior Review".
- Required fields and the comments requirement are listed before the confirm button.
- Action keys, labels, validation and the `execute_complaint_workflow_action` call stay exactly as they are.

## Closure & QA wording and gating

- Buttons relabelled: "Propose closure" → "Propose closure (recommendation)", "Record closure" → "Record closure assessment"; a note states that the actual transition to Closed happens through the workflow action on Current step.
- When the complaint is still early in the lifecycle, the section renders read-only with "Closure & QA becomes available later in the workflow." The RPC and stored data are untouched; the server stays authoritative.

## Investigation vs communications

- Investigation keeps tasks and internal notes.
- The existing `complaint_correspondence` list stays where it is but is retitled "Investigation notes / legacy correspondence".
- External communication remains `CaseThreadsPanel` + `CommunicationTimeline` under Evidence & communications. No data is migrated or deleted.

## Overview as command centre

One summary card: complaint number, complainant, entity, type, status, current step, severity, priority, SLA, assignee, vulnerability flag, open tasks, open RFIs, pending approvals, latest communication, closure/QA state — plus a compact "Your next task" block with a button that jumps to Current step. Existing detail/complainant/attachment/classification/triage cards remain below.

## Technical notes

- New: `src/lib/complaintWorkflow.ts` (pure derivation of readiness/waiting state from tracking + actions + tasks + RFIs + closure rows), `src/components/complaints/ComplaintCurrentStepPanel.tsx`, `src/components/complaints/ComplaintCaseWorkTabs.tsx`, `src/components/complaints/ComplaintOverviewSummary.tsx`.
- Edited: `ComplaintDetail.tsx` (tab restructure, section deep-linking via a `section`/`sub` URL param), `WorkflowActionPanel.tsx` (presentation), `ClosureQaPanel.tsx` (labels + read-only mode prop), `ComplaintInvestigationTab.tsx` (correspondence heading).
- Not touched: any admin approval workflow page/builder, workflow tables or configuration, `execute_complaint_workflow_action`, `get_complaint_available_actions`, `get_complaint_tracking`, RFI approval logic and permissions, RLS, severity/licensee RPCs, notifications, audit, SLA.
- No new hardcoded state machine: step order, labels and actions come only from the configuration returned by the RPCs, so admin changes flow through automatically.
- Verification: unit tests for the derivation helper, plus a browser walkthrough of the investigator, RFI and closure scenarios in the acceptance criteria.

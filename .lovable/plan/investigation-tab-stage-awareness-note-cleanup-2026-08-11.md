# Investigation tab: stage awareness + note cleanup

Focused correction to Complaint Detail → Case work → Investigation. The entity-mapping work stays exactly as it is. No workflow definitions, steps, actions, roles, matrices, RFI workflow, RBAC or RLS are touched.

## What is wrong today (verified in `ComplaintInvestigationTab.tsx`)

- Editing is gated only by `readOnly = complaintStatus === 'closed'`. The tab knows nothing about the configured workflow step, so work items and notes stay fully editable at every other stage.
- The right-hand card is labelled "Investigation notes / legacy correspondence" and mixes internal notes with historical inbound/outbound `complaint_correspondence` rows in one feed.
- The note form asks for a Subject and a "Message body…", with a **Send**-style "Record" button — it reads like email, not case notes.
- It runs its own `complaint_tasks` query (`staleTime` unset) while `useComplaintCurrentStepData` already caches the identical key with a 30s stale time.
- Loading/error/empty handling is ad-hoc (`Failed to load tasks`), not the shared `SectionState` pattern.

## 1. Stage awareness — configuration-driven, no hardcoded step names

Reuse the existing cached `useComplaintCurrentStepData(complaintId)` (tracking + actions + tasks) instead of a new query. Derive one presentation mode in `src/lib/complaintWorkflow.ts` via a new pure helper `deriveInvestigationMode({ tracking, actions, status, hasRecords })`, using only signals the workflow already returns:

- **not_relevant** — no workflow instance/current step yet and no existing investigation records. Copy: "Investigation work is not required at the current complaint step." Existing records (if any) still render below, read-only.
- **active** — a current step exists, it is not terminal, and the viewer either has at least one available configured action on this step or the step is assigned to them. Full editing (subject to permissions).
- **read_only** — status is closed/resolved, or the current step is terminal, or no action is available to this viewer. Copy: "Investigation records are read-only at the current complaint step."

No step-name matching, no `status === 'investigation'`, no new workflow metadata, no admin config change. If tracking fails to load, fall back to the current behaviour (editable unless closed) rather than blocking work.

## 2. Work items stay work items

Unchanged semantics and wording: Not started / Being worked on / Done / No longer required; actions "Mark as being worked on", "Mark work item done", "Reopen work item"; "No longer required" stays inside **More options** with the existing confirmation. Audit event keys stay as they are (`complaint.investigation_task_*`). Nothing writes complaint status or workflow step. The explanatory line stays: these record progress only; the complaint moves from **Current step**.

## 3. Internal investigation notes

- Card renamed to **Internal investigation notes**, description: "Record internal observations, findings and investigation notes. These notes are not sent to the complainant or entity."
- Form becomes a single **Note** textarea + **Add note** button. Subject is dropped from the UI and inserted as `null` (column stays nullable — no schema change). Direction remains hard-fixed to `internal_note`; no inbound/outbound options exist here.
- Notes render as a chronological case notebook: "11 Aug 2026, 3:20 PM — Jane Smith" then the note text. No "message", "send", or correspondence wording.

## 4. Historical correspondence, preserved and read-only

The same `complaint_correspondence` query splits client-side:

- `direction = internal_note` → the notes notebook above.
- inbound/outbound rows → a collapsible **Historical correspondence** section, rendered only when such rows exist. Read-only: direction, date/time, author, subject if present, message. Copy: "Historical correspondence recorded in the previous complaint process. New external communication is managed under Evidence & communications." No composer, no edit/send controls, no data deleted or migrated.

## 5. Reliability

Both lists use the shared `SectionState` (Loading / Error+Retry / Empty / Data) from `src/components/complaints/DataState.tsx`, so a failed query reads "Investigation notes could not be loaded. [Try again]" and never "No notes". The tasks query is served from the shared cached hook.

## 6. Current step summary

Keeps the existing Investigation entry in "Outstanding work" (`3 of 5 done`, marked Recommended, with **Open investigation**). No configured workflow action is disabled because work items remain open, and the next action still comes only from `get_complaint_available_actions`.

## Files touched

- `src/components/complaints/ComplaintInvestigationTab.tsx` — stage modes, notes rework, historical section, shared states.
- `src/lib/complaintWorkflow.ts` — add `deriveInvestigationMode` (pure, no state machine).
- `src/pages/complaints/ComplaintDetail.tsx` — pass the complaint status/id props already available (no new queries).
- `src/test/complaintWorkflowGuardrails.test.ts` — cases for the three modes.

## Out of scope

Admin Approval Workflow pages and builder, workflow/step/action definitions, role mappings, approval matrices, RFI workflow, entity-context resolver and licensee search, Evidence & communications behaviour, and any migration of existing correspondence data.

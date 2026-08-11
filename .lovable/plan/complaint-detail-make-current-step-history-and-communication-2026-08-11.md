# Complaint detail: make Current step, History and Communications readable for non-technical staff

## What is wrong today (verified)

Checked complaint CMP-2026-000079 (the record open in the preview) and the code behind the three tabs:

- The complaint has an **active workflow instance with 12 configured steps but zero recorded actions yet**. The History tab (`ComplaintTrackingTimeline`) only builds its timeline from workflow actions and enforcement events, so it renders 12 grey step pills and "No activity recorded yet" — it looks broken even though intake, triage and assignment did happen (those live in `audit_logs`, which this tab never reads).
- `get_complaint_tracking` decides "internal viewer" purely from the legacy roles admin / super_admin / regulator. Staff who hold complaint permissions through the dynamic RBAC roles are treated as external: assignee, notes and actor names come back empty and the step list is filtered to publicly visible steps only. That is the second reason Current step / History look empty or partial.
- The History modal (`ChangeHistoryDrawer`) shows raw action codes, a key/value diff of database columns, and a "Technical details" JSON block.
- Evidence & communications shows an 8-column engineering table (`event_key`, `template v3`, provider message IDs, `SENT_TO_PROVIDER`, `DEAD_LETTER`, retry counts, raw error strings) and no evidence at all — attachments actually live on the Overview tab despite the tab name.

## What I will build

### 1. History tab — one plain-language case story
Replace the empty-looking tracking timeline content with a merged, chronological story that combines:
- workflow actions and enforcement events (from the existing tracking RPC),
- the complaint's audit trail (`audit_logs` for `entity_type = 'complaint'`), reusing the existing entity-audit hook,
- RFI and closure/QA milestones already loaded elsewhere on the page.

Each entry reads as a sentence: "Complaint received from the portal — 11 Aug 2026, 3:14 pm", "Assigned to Priya Sharma", "Information request sent to the licensee". Keeps a "Progress" strip at the top showing completed / current / remaining steps with clear ticks, and never shows a bare "no activity" state for a case that has been created.

### 2. History modal — business wording
- Action codes become sentences; database column names become business labels; drop the diff arrows for single-value entries.
- Keep, but collapse behind one small "Technical details" link, the raw JSON (unchanged behaviour for power users).
- Group entries by day with friendly date headers, show actor name and role in words, hide internal IDs (override_id, entity_id, template ids) from the visible summary.

### 3. Evidence & communications — real evidence, human delivery status
- Rename to **Evidence & communications** with two clear blocks: **Evidence & attachments** (the complaint attachment list moves here from Overview, with a pointer left on Overview) and **Messages & notifications**.
- Replace the engineering table with a card/timeline list per message: what was sent, to whom, when, and a single plain status chip — "Delivered", "Sent, awaiting confirmation", "Could not be delivered", "Retrying". Failure text is mapped to business reasons ("email address rejected") with the technical error hidden behind a "Details" toggle.
- Provider names, message IDs, template versions, event keys and retry counters move into that same collapsed Details area.

### 4. Current step tab
- Show the step list as a readable vertical progress list (Done / You are here / Next) instead of relying on the pill row, and show "With <assignee>" or "Unassigned" in words.
- When the tracking call returns a restricted (external-shaped) payload for a staff user, show an explicit "limited visibility" note instead of silently blank fields.

## Technical notes

- All of 1–4 are presentation-layer changes in `src/pages/complaints/ComplaintDetail.tsx`, `src/components/complaints/ComplaintTrackingTimeline.tsx`, `ComplaintCurrentStepPanel.tsx`, `src/components/audit/ChangeHistoryDrawer.tsx` + `humanizeAudit.ts`, and `src/components/notifications/CommunicationTimeline.tsx`, plus two new label helpers (`src/lib/complaintHistoryLabels.ts`, `src/lib/communicationPlainLanguage.ts`).
- One backend read-path change is required for staff visibility: `public.get_complaint_tracking` will treat a caller who already passes `has_complaint_perm` **and** holds an internal (non-external) account as internal, instead of only the three legacy roles. This affects only what the read RPC returns.
- **No change to the admin approval workflow**: workflow definitions, `approval_steps`, `approval_step_actions`, `execute_complaint_workflow_action`, admin workflow screens and notification dispatch are untouched.
- `CommunicationTimeline`'s exported `stateLabel` / `stateTone` contract stays truthful (provider acceptance is never labelled "delivered"), so `src/test/communicationTimeline.test.ts` keeps passing.

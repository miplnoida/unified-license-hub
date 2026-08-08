# Appeal Panel Constitution + Licensing Appeal Integration

## What exists today (verified)

- `license_appeals` — reference, application/license/licensee/regulator, grounds, relief, status, `panel_id`, `assigned_to`, `hearing_date`, acknowledgement, decision + rationale + decided_by/at. Triggers already log events and fire notifications.
- `license_appeal_panels` — only `name`, `description`, `regulator_id`, `is_active`.
- `license_appeal_panel_members` — table already exists (`panel_id`, `user_id`, `member_role`, `is_active`) with RLS, but **no UI or hook uses it at all**.
- `license_appeal_events` — event log, RLS via `can_read_license_appeal`.
- Notification events already configured: `license_appeal.filed`, `.acknowledged`, `.panel_assigned`, `.decided`.
- Admin screen `LicenseAppealPanels.tsx` edits only name/description/active. Register `LicenseAppealsRegister.tsx` + `AppealActionsDialog.tsx` handle acknowledge/decide/reinstate.
- A comparable constituted-body model already exists for Fit & Proper (`fp_committees`, `fp_committee_members`, `fp_committee_decision_snapshots` with `member_roster`, `quorum`, `quorum_met`) — reuse its shape rather than inventing a new one.

## Gaps to close

| Requirement | Existing | Gap | Fix |
|---|---|---|---|
| Panel governance fields | name/desc/active only | no scope, effective dates, quorum, decision rule, hearing format, notes | add columns to `license_appeal_panels` |
| Panel members | table exists, unused | no UI, no chair/voting/effective dates | extend table + build composition UI |
| Historical snapshot | none | panel edits would rewrite decided appeals | new `license_appeal_panel_snapshots` written on assignment |
| Panel eligibility on assignment | free choice of any panel | inactive/wrong-scope panels selectable | eligibility filter + server check |
| Hearing management | single `hearing_date` | no format/venue/minutes/reschedule | add hearing fields + reschedule event |
| Quorum enforcement | none | decision possible without quorum | block decision when snapshot quorum unmet |
| Panel member access | broad `license_appeals.view` | member of any panel sees all appeals | scope reads through snapshot membership |
| Audit events | filed/ack/panel/decided | no panel-config or hearing events | emit the missing event types |

Voting is **not** being added: the current licensing appeal model records one final decision, and the FRD only requires a properly constituted panel with quorum. Chair + quorum + snapshot satisfies that without a new voting subsystem (F&P keeps its own voting).

## Plan

### 1. Database
- `license_appeal_panels`: add `appeal_scope` (text, default `licensing`), `effective_from`, `effective_to`, `default_hearing_format`, `quorum` (int, default 3), `decision_rule` (text: `majority` / `unanimous` / `chair_casting`), `notes`.
- `appeal_panel_scopes` lookup seeded with Licensing, Fit & Proper, Enforcement / Supervisory Action so scope is configuration-driven.
- `license_appeal_panel_members`: add `member_role` check (`chair`,`member`,`legal_adviser`,`observer`), `is_chair`, `is_voting`, `vote_weight`, `regulator_id`, `effective_from`, `effective_to`. Partial unique index: one active chair per panel. Members are deactivated, never deleted, once used in a snapshot.
- New `license_appeal_panel_snapshots`: `appeal_id`, `panel_id`, panel config copy (name, quorum, decision rule, hearing format, scope), `member_roster jsonb`, `snapshot_at`, `snapshot_by`. Append-only (no update/delete policies).
- `license_appeals`: add `hearing_format`, `hearing_venue`, `hearing_link`, `hearing_notes`, `hearing_completed_at`, `case_file_ready_at`, `quorum_met`.
- RPCs (SECURITY DEFINER, permission-gated, all writing `license_appeal_events`):
  - `assign_appeal_panel(_appeal_id, _panel_id, _hearing_date, _hearing_format)` — validates panel active, in-scope, regulator match, quorum-capable member count, case file ready; writes `panel_id`, snapshot, `panel_constituted` event, sets status `panel_review`.
  - `schedule_appeal_hearing(...)` / `reschedule_appeal_hearing(...)` and `complete_appeal_hearing(...)`.
  - `record_appeal_decision(_appeal_id, _decision, _rationale, _dissent, _conditions)` — refuses when snapshot missing or quorum unmet, sets `quorum_met`, then calls the existing `reinstate_application_after_appeal` for allowed appeals. Frontend stops updating `license_appeals` directly for the decision.
  - `appeal_case_file_status(_appeal_id)` — reads existing application/decision-artifact/document tables; no new document system.
- RLS: add snapshot-membership read path so an assigned panel member can read that appeal and its events, and nothing else. Panel master config stays on `license_appeals.manage_config`.
- Register the missing permission actions (`decide`, `manage_config`, `assign_panel`) in the permission registry/catalog so the existing `useCan` gates resolve.

### 2. Admin → Appeal Panels (config only, stays master data)
- Panel form gains scope, regulator, effective dates, quorum, decision rule, default hearing format, notes.
- Row expands to a composition manager: add member (existing internal-user combobox), role, chair toggle, voting/weight, effective dates, deactivate. Shows member count / chair / quorum status ("quorum 3 — 2 active voting members: not constitutable").

### 3. Appeal case lifecycle (register + detail dialog)
- Case-file checklist panel gating panel constitution.
- Assign-panel dialog: only eligible panels (active, in-scope, regulator match, quorum-capable), showing chair, member count, quorum, hearing format.
- Constituted panel card renders the **snapshot** roster, never the live master.
- Hearing section: format, date/time, venue/link, parties, minutes, reschedule, mark complete.
- Decision block: blocked with an explanatory message when quorum is unmet; adds dissent/minority view and conditions.

### 4. Notifications & audit
- Reuse `license_appeal.panel_assigned` / `.acknowledged` / `.decided`; add config-driven events for hearing scheduled/rescheduled and panel-member assignment (no hardcoded addresses).
- Audit through the existing compliance-audit path: `PANEL_CREATED`, `PANEL_UPDATED`, `PANEL_MEMBER_ADDED`, `PANEL_MEMBER_DEACTIVATED`, `APPEAL_PANEL_ASSIGNED`, `PANEL_CONSTITUTED`, `HEARING_SCHEDULED`, `HEARING_RESCHEDULED`, `APPEAL_DECISION_RECORDED`, `APPEAL_OUTCOME_APPLIED`.

### 5. Tests
- pgTAP `supabase/tests/appeals/`: panel config + member CRUD, chair uniqueness, ineligible-panel assignment rejected, snapshot immutability after master change, quorum-unmet decision rejected, panel-member vs unrelated-user vs applicant RLS matrix, outcome applied to the application.
- Vitest for the eligibility/quorum helpers.

### 6. Runtime verification
Exercised in the running app: create a panel with chair + 2 members and quorum, assign it to a real appeal on a refused application, confirm the snapshot, schedule and complete a hearing, record the decision, confirm application reinstatement and the appellant notification, then change the panel master and confirm the existing appeal's roster is unchanged. Results reported as a PASS/FAIL table; anything not exercisable end-to-end (e.g. an applicant-session step) is reported as not verified rather than claimed.

## Not touched
Existing appeal lodging/withdrawal/acknowledgement, the register, `reinstate_application_after_appeal`, application workflow, decision artifacts, F&P appeals and F&P committee voting.

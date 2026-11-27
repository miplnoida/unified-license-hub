# OLRAS consolidated functional tracker (updated 27 Nov 2026)

Evidence levels: **E2E** = real browser write journey · **UI** = browser read-only, writes blocked · **ISO** = isolated or mocked test · **SRC** = source only. Only E2E counts as full functional verification.

| Module | Feature / workbook | Result | Defect | Fix | Retest | Blocker | Approval |
|---|---|---|---|---|---|---|---|
| 01 Config & master data | F01-01/02/06 | E2E pass (QA records) | Excel import, regulator switch, toast | Fixed | Pass (toast SRC) | — | — |
| 01 Form Builder | F01-03 | E2E draft + ISO 11 tests | Import fields lost | Fixed | Pass | Publishing not approved | — |
| 01 Workflow Designer | F01-04/05 | BLOCKED | Create function casts to a removed type | — | — | Backend | A |
| 02 Users/Roles | F02-05, F19-02 | Roles E2E; employees BLOCKED | Employee gets licensee notice | — | — | Backend | C |
| 02 Fees | F08 config | E2E pass | Calc rule without expression | Fixed | SRC | — | — |
| 03 Registration & Entity 360 | F03-01..06 | UI pass (22 sections) | Regulatory history 400 | — | — | Backend | B |
| 03 Person 360 | F03-04 | UI pass | Raw error code | Fixed | ISO | — | — |
| 03 Public register | F07 | UI | False "no matches" | Fixed | UI pass | Signed-out search not permitted | D (held) |
| 04 Applications | F04-01..07 | UI pass (11 tabs) | Communications tab 400 | — | — | Backend | B |
| 05 Fit & Proper | F05-01..06 | UI pass (hub + 14 pages) | — | — | — | Write tests | — |
| 06 Licensing lifecycle | F06 | UI: register, statuses, next actions | — | — | — | Write tests | — |
| Returns | F09 | UI: queue + filing (9 tabs) | — | — | — | Validation-rule saves 403 | D (held) |
| Payments / penalties | F08 | UI: list, penalty → enforcement link | — | — | — | No real payments | — |
| Prudential / assessments / actions | F10/F11 | UI: assessment (5 tabs), actions | — | — | — | — | — |
| Planning / examinations | F12/F13 | UI: plans, exam detail (6 tabs) | — | — | — | — | — |
| Conduct findings / investigations | F14/F15 | UI (7 tabs) | Correspondence tab 400 | — | — | Backend | B |
| Complaints | F15 | UI: list (22) | — | — | — | — | — |
| Enforcement | F16 | UI: detail (7 tabs) | — | — | — | — | — |
| Appeals | F06-08 | UI: APL-2026-000001 shown | — | — | — | No new appeal data | — |
| Correspondence | F17 | UI: inbox + thread (4 tabs) | — | — | — | — | — |
| Documents | F18 | UI: registry + detail | — | — | — | — | — |
| Notifications | F19 | UI: events, templates, settings | — | — | — | Real sends forbidden | — |
| Reports & dashboards | F20 | UI: catalogue (6 tabs); 44/46 opened earlier | — | — | — | Register grants held | D (held) |
| Audit | F21 | UI (earlier error-state fix) | — | — | — | — | — |

Sweep 27 Nov: 132 remaining-module pages opened signed in, 0 page crashes. 8 write attempts were blocked, so nothing was saved. Legacy addresses redirect to their current pages as intended.

**Not certified.** Write journeys outside Batch 1, workflow creation, ordinary-role access and the held security packages remain open.
Approvals A–D: `consolidated-approval-request.md`.

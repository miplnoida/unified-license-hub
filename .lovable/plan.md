# OLRAS certification and demo readiness plan (26 Nov to 1 Dec 2026, 5:00 PM IST)

## Honest position first
- Time: about 4.5 working days. Workload: 19 modules, 123 features, 369 tests, 26 journeys, plus about 60 known gaps.
- One person using Lovable can build, fix and run browser tests. One person cannot be the "independent QA reviewer" the protocol requires. Self-tested items can reach **Built / Tested**, never **Verified**, until a second person reviews them.
- Some items are blocked by decisions only management can make:
  - AML/CFT freeze (module 11, G17)
  - SQL holds G01, G08, G09, G10, G11, G12 and G19
  - Scanner provider (G05)
  - SMTP mailbox evidence (G18)
- **Full-platform certification by 1 Dec is not achievable.** The protocol itself forbids certifying it while any hold is open.
- **The achievable target:** a demo environment that genuinely works for the in-scope journeys, plus an honest workbook. Every row will be PASS with evidence, FAIL with a defect, or BLOCKED with its reason. This matches the protocol's "limited demo with explicit omissions" rule.

## Escalate today (26 Nov)
Send these to management with the plan:
1. Name an independent QA reviewer for sampling and sign-off. Without one, nothing becomes Verified.
2. Approve or decline each SQL hold. Exact SQL is already written in the review memos.
3. Decide on the AML freeze: keep module 11 BLOCKED, or authorize a separate release.
4. Choose a malware scanner and confirm a test mailbox for SMTP.
5. Accept or reject the demo-scope list (Day 1 output).

## Day plan
| Day | Work | Output |
|---|---|---|
| Thu 26 (evening) | Copy the workbook. Record the deployed SHA and environment. Reconcile modules against the codebase's routes, screens and functions; add missing feature rows. Classify each feature as Missing, Partial or Built. Map G01 to G19 to their features. | Reconciled workbook v0.1, escalation note, first daily report |
| Fri 27 | Phase 2 security fixes that need no SQL hold: email function caller check, record-scope checks in correspondence, document extraction and return analysis, scan gate on extraction, API-key scopes, fail-closed package when unreadable, the fake "delivered" queue processor. Tests for each rule. | P0 defects closed or logged, regression tests passing |
| Sat 28 | Broken-workflow fixes: real error states in place of "no records", sweep pagination and partial-failure status, corrective-action reviewer must differ from submitter, a correct label for the unwired import, honest correspondence send status. Apply any SQL holds approved by then. | P1 fixes, retest results |
| Sun 29 / Mon 30 | Run journeys J01 to J10 and J12 to J19 in a real browser with ordinary role accounts: applicant, pre-licensee, primary and secondary users in two entities, officer, reviewer, approver. Screenshot every step and record record IDs. Fill the Test Cases and Journeys sheets with actual results and log defects. Fix P0/P1 defects found, then rerun them. | Workbook v0.3 with evidence folder |
| Tue 1 (by 1 PM) | Internal demo rehearsal on the release intended for the customer. Smoke-test the published site. Final workbook, module declarations stating Built/Tested/Blocked, and a readiness letter listing every incomplete item with its impact and recovery plan. | Final pack in Files |

Daily report by 5:00 PM IST: tests run, PASS/FAIL/BLOCKED counts, defects opened and closed, new blockers.

## Demo scope (proposed, to confirm)
**Demo-critical:**
- Configuration (01)
- Identity and access (02)
- Registration and Entity 360 (03)
- New licence (04)
- Fit & Proper (05)
- Renewal and post-licence (06)
- Licensee portal (07)
- Fees (08)
- Returns (09; validation save blocked by G08)
- Examination and findings (13, 14)
- Complaints (15)
- Dashboards and reports (18)

**Best effort:** 10, 12, 16, 17, 19.

**BLOCKED:** 11 (AML freeze), plus the parts of 17 that need a scanner and of 16 that need SMTP.

## Rules I keep
- No manual database edits to make a test pass.
- No API-created test data.
- No assumed PASS results.
- Rodney Bay records and the AML/CFT data stay untouched.
- Every database permission change comes with its SQL, impact and undo steps, and runs only after approval.

## Technical details
- Workbook edits: openpyxl on a copy at `/mnt/documents/certification/OLRAS_Master_Certification_v0.x.xlsx`. Formulas stay intact; they are recalculated and checked for errors.
- Evidence: Playwright screenshots in `/mnt/documents/certification/evidence/<TestID>/`, named by test ID, with secrets and personal details redacted.
- Inventory source: route table, sidebar config, `supabase/functions/*`, RPC usage. Results are written to the Screen Reconciliation rows.
- Defect IDs follow D-YYYYMMDD-nnn with P0 to P3 severity as the protocol defines. A defect closes only with a fix commit SHA plus a retest.
- Tests are Vitest tests next to the existing ones, one per business rule.

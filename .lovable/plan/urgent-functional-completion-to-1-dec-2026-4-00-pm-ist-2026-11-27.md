# Urgent Functional Completion (to 1 Dec 2026, 4:00 PM IST)

This is a short execution plan, not a new assessment. Approving it switches me to build mode so I can start straight away. I won't stop between batches.

## Today, 27 Nov
1. One approval pack (`.lovable/reviews/consolidated-approval-request.md`) with the exact change, impact and rollback for:
   - Workflow creation (one-line fix to the step-actions conversion).
   - The three read-only functions that create temporary tables (Communications, Entity 360 history, F&P positions).
   - Employee provisioning: skip the licensee "Portal access granted" notice when the new user is an employee.
   - Previously held items, listed by name only. Their holds stay as they are.
2. Continue Batch 2 with the remaining read-only checks (Entity 360 Licences and Prudential sections), then start Licensing and Post-Licensing.

## 30 Nov (time-boxed, about 25 minutes per module)
Licensing lifecycle, Post-Licensing, Licensee Portal, Fees and Payments, Returns, Prudential, Risk, Planning, Examinations, Findings, Complaints and Conduct, Investigations, Enforcement and Appeals, Correspondence, Documents, Notifications, Reports and Dashboards, Audit.
- In the browser, with saves blocked by default: page opens, search, filters, paging, validation, tabs, and exports that download files only.
- Writes only on QA records already covered by earlier approvals, through the normal screens.
- Frontend defects get fixed straight away, with a focused test and a browser retest.
- Backend dependencies get recorded in the approval pack, and I move on.
- Full offline regression at the end of the day.

## 1 Dec
Fix critical frontend defects, verify the end-to-end journeys that are possible, then run the final regression, type checks and build. One consolidated tracker (`.lovable/reviews/functional-tracker.md`, mapped to workbook IDs) with the readiness status by 3:30 PM IST.

## Evidence rules
Loading a page, mocked tests and reading the code are never reported as full functional verification. Certification is not claimed while blocked journeys or security release gates remain.

## Restrictions unchanged
No SQL or backend changes without approval. No deploys, publishing, real communications or payments. No changes to existing records, global settings or AML/CFT work. SEC-01 A, B and C and every hold stay as they are.

## Note on working days
Sessions run only when you send a message. No work happens on 28–29 Nov or between your messages, so each working day needs a message from you to start it.

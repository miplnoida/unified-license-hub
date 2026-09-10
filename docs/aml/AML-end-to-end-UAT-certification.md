# AML-UAT-01 — End-to-end acceptance record (in progress)

## Rebaseline and environment
- Expected baseline: `39f110a7a`; actual starting HEAD `c2de587c5` (one commit after: "Logged AML-12A rehearsal start"), tree clean.
- Preview responded HTTP 200; latest build log entry `build OK`.
- Connected environment: Lovable Cloud backend for this project; no live AML/CFT calculation policy exists (`ACTIVE` calculation configurations = 0). DEC-01…DEC-08 remain unsigned.
- Personas: 46 certification users, including AML/CFT supervision officer and supervisor, read-only, auditor and licensee accounts.

## Baseline census (pre-acceptance)
- canonical AML risk digest `8385b6c8f7ba2b4102ab054c8f5ac686`
- assessments total/current 28/25; responses 984; AML risk-of-record rows 21 (22 total); movements 25
- calculation policies 0; live policies 0; calculation runs 0
- methodology v1.0 `ACTIVE / REGULATOR_AUTHORED`; v1.1 `DRAFT / MIPL_REFERENCE`

## Browser acceptance (real login UI, real routes)
- AML/CFT supervision officer signed in through the login form and reached `/dashboard`, then every AML/CFT route (`overview`, `work-queue`, `entities`, `assessments`, `heatmap`, `examinations`, `findings`, `portfolio`) with real server-rendered content and no HTTP failures.
- Administration screens (methodology, policy profiles, programmes, calculation) correctly refused the officer.
- Read-only and licensee personas were refused every AML/CFT and administration route.
- Observed non-AML console noise, recorded as pre-existing and not AML defects: React Router v7 future-flag warnings, a nested-button DOM nesting warning in the supervisory register copy control, a seeded navigation icon key (`ChartNetwork`) outside the approved icon map, and function-ref warnings.

## Backend acceptance journey — `scripts/uat-aml-end-to-end.sql`
One transaction, real authenticated personas, canonical governed operations only, `ROLLBACK` at the end. Result: **29 gates passed, 0 failed**, and zero AMLUAT survivors in methodology, dimensions, questions, assessments, plans, consequence decisions, monitoring decisions, and zero live calculation policies after rollback.

Covered: governed assessment creation and server-owned lifecycle; responses and dimension ratings; synthetic maker-checker calculation policy activation; reproducible server calculation with identical result hash and refusal of a stale run; submission gating; refusal of self-approval; reviewer return, resubmission into a new review round; maker-checker approval; risk-of-record publication, lineage and post-approval immutability; consequence linkage to a governed plan and its server read model; server-owned review-cycle state, governed reschedule and reassessment that creates work without changing the rating; governed finding issuance through the real lifecycle; outcome eligibility decided server-side; portfolio report and governed export reconciliation with formula neutralisation; refusal of unauthorised creation, unauthorised portfolio reads, direct ledger writes and direct risk-of-record edits; audit records produced by the journey.

## Defect corrected
- `UAT_PRODUCT_DEFECT` — portfolio movement trends split one rating into two buckets (`HIGH` and `high`) because a small number of historical movement rows store lower-case rating codes. Corrected server-side: the portfolio report and export now emit canonical upper-case rating codes in movement rows and in the opening/closing distributions. The immutable movement ledger was not modified and no band, threshold, interval or regulator policy was introduced.

## Preservation
- Canonical digest unchanged: `8385b6c8f7ba2b4102ab054c8f5ac686`.
- No live AML/CFT calculation policy created or activated; DEC-01…DEC-08 unsigned; LINK-11 unchanged.
- v1.0 remains `ACTIVE / REGULATOR_AUTHORED`; v1.1 remains `DRAFT / MIPL_REFERENCE`.
- No demo data seeded; no operational assessment, risk-of-record, action or evidence row modified.

## Outstanding gates (not yet run in this wave)
- Full repository integration suite and the affected focused suites after the portfolio correction.
- Action/RBAC coverage re-run and security scan re-baseline after the correction.
- Deeper browser coverage of the supervisor review/approval journey and portfolio export from the UI.

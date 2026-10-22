# CU-DEMO-2026 — completion checklist (Rodney Bay `cc331…` only)

Nothing is executed by this plan until you approve each configuration step. No new entities, no repeat inserts, no code/schema/security changes. Officers act through their own sign-in.

New facts confirmed now: an active **FSRA_CREDIT_UNIONS_QTR** quarterly return definition exists (FSRA), and the metrics **CAPITAL_ADEQUACY_RATIO, LIQUIDITY_RATIO, NPL_RATIO** (delinquency) exist. No Credit Union *filing configuration* exists in Returns Configurations yet. Named staff accounts exist for every role below.

## Session 2 — Licensing

| # | Screen URL | Action | Role (account) | Depends on | State |
|---|---|---|---|---|---|
| 1 | `/register` → Start New Registration | New applicant `rodneybay.registration@yopmail.com`, exact legal name "Rodney Bay Community Credit Union Ltd". Stop if a provisional entity is proposed. | Applicant (you) | — | Ready |
| 2 | `/admin/registration-review/:id` | Resolve possible-match case to registry `cc331…` | Entity Resolution Officer (`entity_resolution_officer@`) → Entity Resolution Supervisor confirms | 1 | Blocked by 1 |
| 3 | `/admin/registration-review/:id` | Approve registration (creates hand-off) | Registration Officer (`registration_officer@`) | 2 | Blocked by 2 |
| 4 | `/admin/fees` | Add fee: Credit Unions → Credit Union, Pre-licence, fictional XCD 2,500 | System Administrator or Super Admin | your approval | Awaiting approval |
| 5 | `/admin/workflow-engine` | Add active Pre Application workflow, Credit Unions sector: Licensing Officer (review) → Licensing Supervisor (approve/decide) | Workflow Administrator (`workflow_administrator@`) | your approval | Awaiting approval |
| 6 | `/pre-license/new` | Fill CU pre-licence form, pay via payment simulation, submit | New applicant | 3, 4, 5 | Blocked |
| 7 | Application review (from `/admin/applications`) | Review → recommend; then approve → licence issues via workflow | Licensing Officer (`licensing_officer@`) → Licensing Supervisor (`licensing_supervisor@`) | 6 | Blocked |
| 8 | `/admin/entity-registry/cc331…` → Documents | Upload 6 PDFs from `rodney-bay-cu-demo-2026/` (incorporation, bylaws, business plan, projections, AML policy, director CVs), one per document type | Licensing Officer | — | Ready |
## Session 3 — Prudential

| # | Screen URL | Action | Role | Depends on | State |
|---|---|---|---|---|---|
| 9 | `/admin/returns/configurations` | Add quarterly filing configuration: Credit Unions sector, FSRA, linked to FSRA_CREDIT_UNIONS_QTR, due 30 days after quarter end | Returns Supervisor (`returns_supervisor@`) | your approval | Awaiting approval |
| 10 | `/admin/returns/schedule` | Confirm Rodney Bay obligations Q4-2025 to Q3-2026 generated from its licence | Returns Officer | 7, 9 | Blocked |
| 11 | `/compliance/returns/submit` | File 4 quarters with capital, liquid assets, short-term liabilities, gross loans, non-performing loans | New applicant (now licensee) | 10 | Blocked |
| 12 | `/admin/returns/queue/:id` | Validate/accept each filing | Returns Officer → Returns Supervisor | 11 | Blocked |
| 13 | `/admin/returns/prudential/ratios` | Check capital adequacy, liquidity and NPL (delinquency) ratios for Rodney Bay | Prudential Analyst | 12 | Blocked |

Returns attach to Rodney Bay automatically through its licence; no manual linking.

## Session 4 — Conduct (assignments need your go-ahead)

| # | Screen URL | Action | Role (eligible accounts) | Depends on | State |
|---|---|---|---|---|---|
| 14 | `/conduct/findings/:id` for CF-CU-DEMO-2026-01 and -02 | Set owner | Conduct Analyst (`conduct_analyst@`) as owner, assigned by Conduct Supervisor (`conduct_supervisor@`) | your approval | Ready on approval |
| 15 | `/enforcement/:id` for ENF-CU-DEMO-2026-01 | Assign officer | Enforcement Officer (`enforcement_officer@`), assigned by Enforcement Supervisor (`enforcement_supervisor@`) | your approval | Ready on approval |

## Decisions you need to give
1. Approve fee (step 4), workflow (step 5) and return configuration (step 9).
2. Approve the assignments in steps 14–15.
3. Confirm you will run step 1 yourself (it needs the email OTP).

## Technical notes
- Before steps 14–15, the assignment controls on those two pages will be confirmed and any narrower eligibility list they show takes precedence.
- Step 7 issues the licence only through the workflow; payment only via the existing simulation.

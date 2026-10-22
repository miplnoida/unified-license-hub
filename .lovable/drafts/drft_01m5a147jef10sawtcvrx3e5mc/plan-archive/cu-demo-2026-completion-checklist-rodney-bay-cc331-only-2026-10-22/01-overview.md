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

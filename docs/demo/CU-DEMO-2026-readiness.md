# CU-DEMO-2026 readiness — Rodney Bay (registry cc331000-0000-4000-8000-000000000001)

Verified read-only 2026-10-21. No data/config changed. Screens not browser-verified (no staff session approved).

## Data checks
| Record | Link to cc331 | Regulator | Status | Gap |
|---|---|---|---|---|
| 5 complaints CMP-2026-000126–130 | yes | FSRA | 2 under_investigation, 3 submitted | — |
| 4 F&P cases | yes | FSRA | 2 screening, 2 submitted | — |
| Prudential assessment | yes | — | draft | — |
| Supervisory plan SP-CU-DEMO-2026-01 | yes | — | draft | — |
| Examination EXM-CU-DEMO-2026-01 | yes | FSRA | — | — |
| Conduct investigation CI-CU-DEMO-2026-01 | yes | — | open | — |
| Conduct findings CF-…-01/02 | yes | — | remediation_required | no owner set |
| Enforcement ENF-CU-DEMO-2026-01 | yes | — | open | not assigned |
| Licences | 0 | | | blocks returns |
| CU fee configs / fee bindings | 0 | | | blocks submission |
| Active CU workflows | 0 | | | blocks approval |
| CU return configurations | 0 | | | blocks quarterly returns/ratios |

## Screens
Session 2: /entities/cc331…, Fit & Proper queue. Session 3: Entity 360 prudential/supervision tabs. Session 4: /complaints, /conduct/investigations, /conduct/findings, /enforcement, /conduct/entities/cc331…/360.

## Licensing prerequisites (not executed)
1. Registration: /register → Start New Registration, new email, exact legal name; stop if provisional entity proposed; officer resolves match to cc331 and approves at /admin/registration-review/:id.
2. Fee: /admin/fees — Credit Unions → Credit Union, pre-licence, fictional XCD 2,500.
3. Workflow: /admin/workflow-engine — Credit Unions sector; Licensing Officer → Supervisor → Admin.

## Prudential (after a real licence)
Needs a Credit Union return configuration (none exists) at /admin/returns/configurations, schedule/due dates, then licensee files 4 quarters at /compliance/returns/submit, officer validates at /admin/returns/queue/:id, ratios at /admin/returns/prudential/ratios.

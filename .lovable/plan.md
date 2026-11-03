# Manual QA Verification Workbook – Sessions 1–4

Deliverable: `/mnt/documents/demo/OLRAS_Manual_QA_Tracker_Sessions_1-4.xlsx`. No app code or data changes.

## Sheets
1. **Dashboard** – counts by session/status/priority, % pass, open defects (live formulas).
2. **Session 1 – Configuration & Security** – regulator/org setup, users, roles/RBAC/scopes, Form Builder and publishing, Workflow Designer/routing, notifications, master data, settings/branding, subscription package, audit and config versioning.
3. **Session 2 – Licensing & Entity 360** – registration+OTP, application, documents, fees/payments, review/RFI/F&P, approval, licence and certificate, conditions/renewal/variation, post-licence requests, primary/secondary user requests, Entity 360/Person 360, My Institution.
4. **Session 3 – Supervision, Prudential & AML/CFT** – portfolio, returns obligations/filing/review, risk scoring, planning/monitoring, prudential assessment, AML policies/methodology/assessment/override/publication, examinations/findings/corrective actions.
5. **Session 4 – Conduct, Enforcement & Intelligence** – complaints, conduct, investigations, enforcement, appeals, dashboards, reports/Board Pack/branding, AI features, integrations/APIs, audit and assurance.
6. **Defect Log** – ID, linked test, severity, owner, status, dates.
7. **Test Accounts & Data** – roles and the Rodney Bay references (`APP-2026-002011`, `LIC-2026-000166`, `FIL-2026-000001-b43a`, CMP and ENF IDs). No passwords.

## Test case columns
ID, Session, Module, Sub-module, Test scenario, Preconditions, Role, Navigation path, Steps, Expected result, Priority, Type (Positive/Negative/Access), Status dropdown (Not Started/Pass/Fail/Blocked/N/A), Actual result, Defect ID, Tester, Planned date, Executed date, Remarks.

Coverage: about 250–300 granular test cases, including negative access checks such as pre-licensee post-licence blocks and staff-only pages. Known gaps go in Remarks, for example the frozen AML-CLOSE-08 and unverified flows.

## Format
Project-management style: frozen headers, filters, data validation, conditional colours, priority colours, Arial font, wrapped text, and print setup. Before delivery, recalculate the workbook and check it for errors.

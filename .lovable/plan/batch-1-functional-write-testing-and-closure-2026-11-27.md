# Batch 1 Functional Write Testing and Closure

Execute the approved brief in one cycle through the normal browser application only.

## Order of execution
1. Pre-write safety check per activity: confirm the action touches only QA-B1 records and sends no email/OTP/notification/payment. If not provable, mark BLOCKED and continue.
2. Master Configuration: QA-B1 Sector > Sub-Sector > Category > Service; create, edit, save, duplicate validation, dependent dropdowns, visibility in regulator/fee/form filters, retire.
3. Regulators: QA-B1 Regulator (QAB1), assign only QA sector, visibility check, edit, retire. No existing regulator/sector touched.
4. Fees: QA-B1 Fee 1.00 on QA records only; edit, validation, applicability, retire. Browser-test fee rule and fee type Delete confirmations (Cancel path).
5. Users: one QA employee (controlled test address) with Licensing Analyst role, only if welcome email can be suppressed for this account without global changes; otherwise BLOCKED.
6. Roles: QA-B1 Viewer (view-only), assigned only to the QA account; test allowed/refused screens, buttons, direct URLs, action handlers.
7. Ordinary-role pass: sign in as the QA account through normal login; test the six modules plus Fees, allowed and refused.
8. Form Builder: QA-B1 Form draft; sections, field types, mandatory, conditional logic, preview, Excel import, save, reopen, refresh persistence. Never publish.
9. Workflow Designer: QA-B1 Workflow on the QA service only; steps, roles, routing, transitions, validation, edit. Publish a version only if confirmed isolated from live services/cases/communications, else BLOCKED. Set inactive.
10. Fix confirmed frontend defects in scope and retest them plus dependents. Schema/grant/RLS/function issues are reported, not fixed.
11. Cleanup: retire/deactivate QA records via app actions; no deletes; record actual IDs and final statuses.
12. Regression: full Vitest, TypeScript, build, changed-file lint, compared with e52f66603.
13. Final report in `.lovable/reviews/batch1-functional-results.md` (module/feature results, workbook IDs, evidence, ordinary-role results, defects, blocked items, QA record register, regression, dependencies). Stop before Batch 2.

## Constraints kept
No SQL writes, migrations, grants, RLS, function deploys, publishing, global config, AML/CFT changes; all existing holds and the AML-CLOSE-08 freeze unchanged.

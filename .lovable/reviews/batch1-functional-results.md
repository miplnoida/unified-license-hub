# Batch 1 functional testing results (2026-11-27)

Evidence types: B = real browser (super admin rohit@, all data writes, non-read lookups and backend functions blocked at the network layer); S = source review; M = mocked test.
Workbook mapping: Master Config/Regulators/Fees = F01-01, F01-02, F01-06; Form Builder = F01-03; Workflow Designer = F01-05 (+F01-04 versioning); Users/Roles = F02-05, F19-02.

| Module | Identified | Tested | Pass | Fail | Fixed+retested | Blocked | Not tested |
|---|---|---|---|---|---|---|---|
| Master Configuration (/admin/masters/*, /admin/master-data) | 14 | 11 | 11 | 0 | 0 | 3 | 0 |
| Regulatory Management (/admin/regulators) | 6 | 5 | 4 | 0 | 1 | 1 | 0 |
| Fees (/admin/fees) | 8 | 4 | 3 | 0 | 1 | 4 | 0 |
| User Management (/admin/users, /admin/web-users) | 10 | 7 | 6 | 0 | 1 | 3 | 0 |
| Roles and Permissions (/admin/roles) | 7 | 5 | 5 | 0 | 0 | 2 | 0 |
| Form Builder (/admin/forms*, /admin/registration-forms) | 12 | 9 | 9 | 0 | 0 | 3 | 0 |
| Workflow Designer (/workflows, /admin/workflow-engine*, rule pages) | 12 | 8 | 8 | 0 | 0 | 4 | 0 |

Fixed (B retested): employee Deactivate, fee configuration/rule/type Delete and regulator Retire changed live records on one click; all now ask for confirmation first and Cancel sends nothing.

Blocked: every save/create/edit/delete/import/publish (no isolated database; writes not approved); ordinary-role browser checks (no permission to sign in as existing officers; a test user needs an approved role grant).

---

# Batch 1 write testing and closure (2026-11-27, approved brief)

Evidence: B = real browser as super admin rohit@ with backend functions blocked at the network layer; every write went through the normal screen. DB = read-only lookup to confirm IDs/statuses. No SQL writes, migrations, grants, function deploys or publishing. No notification queue entries were created during the run.

## Results by module (workbook IDs)
| Module | Feature | Result |
|---|---|---|
| Master Config F01-01/F01-06 | Create sector, sub-sector, category, service under QA regulator | PASS (B) |
| | Duplicate validation (sector, sub-sector, service; case-insensitive) | PASS (B) |
| | Dependent dropdowns (sector > sub-sector > category/service) | PASS (B) |
| | Edit (category, service renamed) | PASS (B) |
| | Retire (status Inactive, child first) | PASS (B) |
| | Visible in Fee, Form and Workflow dialogs (only QA records under QA regulator) | PASS (B) |
| Regulators F01-02 | Empty-submit validation, create, edit description, sector assignment shows only QA sector ticked, Retire with confirm | PASS (B) |
| Fees F01-06 | Fee type create/validation, fee 1.00 on QA category, missing/negative amount refused, edit, rule create, retire rule/fee/type | PASS (B) |
| | Fee rule and fee type Delete prompts, Cancel sends nothing (previously untested) | PASS (B) |
| Users F02-05 | Create QA employee | BLOCKED: creation always sends the "Portal access granted" notice (in-app + email to the new user and every Super Admin); cannot be switched off per account without a backend or global change |
| Roles F19-02 | Create QA-B1 Viewer with 6 view rights, empty-name validation, edit, set Inactive | PASS (B) |
| | Assign to QA account; allowed/refused screens | BLOCKED (no QA account) |
| Form Builder F01-03 | Draft create, sections, dropdown/text/number fields, required, show-when rule, save, reopen, refresh persistence | PASS (B) |
| | Excel import into pre-licence form | FAIL then FIXED + retested (B) |
| | Preview | PASS display only; preview does not run show-when rules or required checks (read-only by design) |
| | Publish | Not run (forbidden) |
| Workflow Designer F01-05/F01-04 | Empty-name validation, QA sector/sub-sector/category/service pick | PASS (B) after fix |
| | Create workflow | BLOCKED by backend defect D3 |
| | Steps, roles, routing, publish, set inactive | BLOCKED (no workflow could be created; publish also emails all admins) |
| Ordinary-role testing | All seven modules | BLOCKED (no safe QA account) |

## Defects
- D1 FIXED (FormBuilder.tsx): Excel import on non-returns forms demanded a sub-sector "for returns forms" and would create return templates. Now merges imported fields into the form being edited. Retested B.
- D2 FIXED (FormBuilder.tsx): imported fields arrived without row layout, so they were invisible and lost on save. Now laid out in rows. Retested B: imported fields kept after save + reload.
- D3 BACKEND, NOT FIXED: creating any workflow fails with `type "workflow_action_type[]" does not exist` (database function create_approval_workflow_with_steps). No workflow has been created since 2026-08-27. Needs a database function change; needs approval.
- D4 FIXED (WorkflowList.tsx): the Workflows page silently switched the selected regulator away from any regulator with no workflows, so a regulator's first workflow could never be created. Now keeps a regulator that has its own sectors. Retested B.
- D5 FIXED (RegulatorManagement.tsx): Retire showed "Deleted". Now "Regulator retired". Source-checked only (QA regulator already retired).
- D6 BACKEND, NOT FIXED: employee creation sends the primary-entity-user notice (create-web-user), so welcome communications cannot be suppressed. Needs a backend function change; needs approval.
- O1 observation: fee rule of type Calculation saves with no expression.
- O2 observation: Fee "Fee Configs" counter (123) is not regulator-scoped.

## QA records (final status)
| Record | ID | Final |
|---|---|---|
| QA-B1 Regulator (QAB1) | 7ddec9a7-2a4d-40ef-a87d-5c1ba7ec3ece | inactive (retired) |
| QA-B1 Sector | 44a3fe78-346a-4252-885b-cd6fac61f59d | inactive |
| QA-B1 Sub-Sector | 385f7e12-318b-42a6-ae90-68801ea59069 | inactive |
| QA-B1 Category Edited | 4d8f044c-2eab-48d1-8cbf-0602747f4aa3 | inactive |
| QA-B1 Service Edited | 3b49c07b-4e52-4eeb-a4f5-60047b474f35 | inactive |
| QA-B1 Fee Type | c60c908a-0379-4809-b6ec-3f88eadbda56 | retired |
| QA-B1 Fee Edited (1.00 XCD) | ef760be1-6c3e-4156-a5ae-5aba2473f651 | retired |
| QA-B1 Rule | 1f410a57-21dc-4398-8caa-7065298bb2df | retired |
| QA-B1 Viewer role | cd951a1a-404c-43af-86bc-67f805704cf0 | inactive, no users |
| QA-B1 Form (template + version 108562ba-17b4-4834-ad65-05a5e4d72bf5) | 46ee3ef9-9ffb-4e97-b1a1-c6c3e32cb796 | draft, retained (never published) |
No QA user or workflow was created.

## Regression (vs e52f66603)
Full offline suite 2,003/2,007; same four RBAC coverage failures as baseline. TypeScript passed. Changed-file lint equal to baseline. Build is run by the platform.

## Pending-issue follow-up (2026-11-27)
- **Workflow creation (F01-05/F01-04): BLOCKED.** Root cause confirmed: `approval_steps.allowed_actions` is jsonb and the type `workflow_action_type` no longer exists, but `create_approval_workflow_with_steps` still casts to `workflow_action_type[]`. A one-line fix plus a verbatim rollback is in `workflow-create-fix-approval.md`. Not executed.
- **Employee creation (F02-05/F19-02): DEFECT, BLOCKED.** `create-web-user` picks the event `entity.secondary_user_created` when `user_type === 'secondary'` and otherwise always picks `entity.primary_user_created`. Internal employees (`user_type: 'employee'`) therefore fire the licensee "Portal access granted" notice. This is not intentional: no employee event exists. Proposed change, not made: skip the entity dispatch when `user_type === 'employee'`. Primary and secondary licensee provisioning would be unchanged, and the employee credentials email (`send_email`) is unaffected. No sign-in path for the existing QA-style Licensing Supervisor account (yopmail) is authorised for this agent, so ordinary-role testing stays BLOCKED.
- **Fee O1: FIXED.** A Calculation-type rule now requires an expression, and the label shows `Expression *`. Fee rules are not evaluated by any calculation code, so an empty expression had no effect before. Source-verified.
- **Fee O2: NOT A DEFECT.** The Fee Configs counter equals the list rows, which are the active regulator's configurations plus global ones (`regulator_id IS NULL`), the same scope as the table. The rule counters (Calc/Exemption/Discount) count every rule regardless of regulator. Reported, not changed, because the list below them has the same scope.
- **Form renderer (F01-03): PASS (isolated).** `src/test/batch1FormRendererValidation.test.tsx` has 11 tests covering required fields, show-when visibility, require-when dependency, email/phone/min-max validation, imported fields with layout, invalid submission and legacy fields. Preview stays read-only, and the QA form is still an unpublished draft.
- **Regulator retire toast: source-verified, not browser-verified.**

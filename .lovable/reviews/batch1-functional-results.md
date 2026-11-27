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

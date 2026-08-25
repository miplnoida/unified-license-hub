# Manual Testing Guide (Excel) — Admin, Licensee/Applicant, Public

No code changes. The only output is a downloadable Excel workbook shared in chat.

## Workbook: `Manual_Testing_Guide_v1.xlsx`

Sheets:

1. **How to use** — purpose, environments (preview + published URL), how to record Pass/Fail, defect logging convention, and the reminder that test accounts and passwords are in the existing `Test_Users_Roles.xlsx`.
2. **Test accounts** — the login personas needed for the run (internal admin/supervisor/officer, licensee primary, licensee secondary, PPOC, applicant/pre-licensee, plus anonymous public), each with the panel it exercises.
3. **Public panel** — landing pages, service catalogue, journey choice (`/register`, `/register/applicant`, `/register/entity`), public complaint intake, public complaint tracking (reference + email verification), public registers/search, login, forgot password.
4. **Applicant & Licensee panel** — registration submission and resubmission, registration status, dashboard, applications (pre-licence and post-licence, entitlement gating), licences, returns (`/entity/returns`, `/entity/returns/dashboard`, filing, import, submit), payments, complaints, F&P declarations, correspondence/RFI responses, support centre, profile and forced password change, PPOC entity switching.
5. **Admin / regulator panel** — registration review and approvals, application queue and decisions, licence lifecycle actions, returns queue and review, prudential and conduct workspaces, complaints administration, enforcement, correspondence, operating structure and decision bodies, form builder and versioning, notifications and escalations, master/reference data, RBAC and role templates, support queue, audit logs, reporting.
6. **Negative & security tests** — entitlement failures (no licence, suspended licence), secondary user cannot submit, direct-URL access to admin routes as an external user, PPOC scope isolation, server-side rejection of unauthorised writes.
7. **Defect log** — ID, sheet/test ID, severity, description, steps to reproduce, expected vs actual, status, owner, date.

## Row format for every test sheet

`Test ID | Module | Screen / Route | Role to log in as | Preconditions | Step-by-step actions | Expected result | Pass / Fail | Actual result | Severity | Tester | Date`

Steps are written for a non-developer: exact route to open, exact menu item or button to click, exact field values to enter, and the exact expected message or state change.

## How content is derived

Routes and screens are read from `src/routes/*.tsx` and `src/pages/**` so every test points at a route that actually exists, and business rules for the expected results come from the enforcement already in place (licence entitlement, portal capabilities, maker-checker approvals, workflow statuses). Nothing is invented from a spec document.

## Formatting

Arial throughout, frozen header rows, autofilter, wrapped text on the step and expected columns, print-set column widths, colour-coded Pass/Fail data validation dropdowns, and a Summary block on **How to use** with formulas counting Pass/Fail/Not run per sheet. Written to `/mnt/documents/Manual_Testing_Guide_v1.xlsx` and shared as a chat artefact. Every page of the workbook is inspected before delivery. No application code, migrations or configuration are touched.

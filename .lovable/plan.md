# Functional Module Testing — Batch 1

## Priority reset
- Security remediation stops. SEC-01 Packages A, B, C and all other security proposals stay on hold. Completed fixes stay as they are.
- No new security assessments, SQL packages or broad audits.

## Scope: Batch 1 modules
Master Configuration, Regulatory Management, User Management, Roles and Permissions, Form Builder, Workflow Designer. Each module is matched to its workbook module, feature and test IDs from `OLRAS_Master_Certification.xlsx`. Any workbook feature that the 8-batch sequence leaves out is flagged so nothing is missed.

## Steps per module
1. List the real screens, routes and controls from existing code and earlier reviews, mapped to workbook IDs.
2. Sign in to the browser as the right role (super admin, admin, an officer with limited rights, an unauthorized user) and open every screen.
3. Check every button, filter, search, pagination, tab, export and navigation item, plus the validation and error messages on forms, with nothing saved.
4. Check unauthorized behaviour: hidden or blocked controls, direct links, refused saves.
5. Fix code-level defects I confirm, within scope, then retest in the browser and run focused tests.
6. Record a status for each feature: PASS, FAIL, FIXED AND RETESTED, BLOCKED or NOT TESTED. Evidence is labelled browser, mocked test or source review.

## Write actions (shared database)
No isolated database is available, so I will not save, create, edit, submit, approve or delete anything in the shared database. For each create/edit/approve action I will:
- test it with mocked tests where possible, and
- list the exact test record and action needing your approval (for example one clearly named test regulator, role, form draft or workflow draft), marked BLOCKED until you approve.

## Restrictions kept
No database, schema, grant, policy or backend-function changes; no deployment or publishing; no real emails, OTPs, notifications or payments; AML/CFT and its shared dependencies untouched; all approval holds kept; no new business rules or redesigns; no tests weakened. Defects that need database changes are reported separately with the exact dependency and proposed fix.

## Deliverable
A Batch 1 report in chat, per module: features identified, tested, passed, failed, fixed and retested, blocked and not tested, plus actual URLs, evidence, remaining issues and workbook IDs. It ends with the list of write tests awaiting approval. I stop before Batch 2.

## Technical details
- Playwright via shell against localhost:8080, signed in with `lovable auth-session`; screenshots go in /tmp/browser. Requests that write data (POST/PATCH/DELETE to the database) are blocked at the network layer so nothing is saved by accident.
- Workbook rows are read with pandas; the tracker goes in `.lovable/reviews/batch1-functional-results.md`.
- After fixes: TypeScript, focused Vitest runs, lint on changed files, and one commit.

## Approval conditions (added)
- Cover every feature and sub-feature in the six modules: modals, dropdowns, dependent fields, validation, settings, import/export, versioning and publishing.
- Use real screens and confirmed URLs. Test as ordinary roles and as admins, checking both allowed and blocked actions.
- In the browser, block all writes: data writes, RPC calls, backend functions, background requests and outside services. Anything that can't be isolated is marked BLOCKED.
- Create, edit, save, submit, approve, import and publish never get PASS from mocked tests or blocked requests alone.
- Fix confirmed code defects without changing business rules, then retest the fix and anything that depends on it.
- At the end, run the full Vitest suite, TypeScript, the production build and lint on changed files, and confirm there are no new regressions.
- Send one approval request for the remaining write tests, grouped by module. For each: record name, role, action, expected outcome, affected records and modules, side effects, and retention or cleanup. None runs until approved.
- SEC-01 A/B/C, pending database changes, AML/CFT and all holds stay unchanged. Confirm that syncing and preview updates trigger no deployment or database change.
- Share the consolidated report in chat, then stop before Batch 2.

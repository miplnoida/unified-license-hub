# Phase 1A — Complete pending Phase 1 activities

Scope: finish the remaining Phase 1 activities from the uploaded brief, then stop after a consolidated report. No Phase 2.

## Hard limits (whole phase)
- No database changes of any kind: schema, records, migrations, grants, RLS, functions or triggers. Read-only catalogue queries only.
- No backend function file edits or deployments, no publish, no real emails/OTPs/payments/provider calls, no scheduled jobs.
- No changes to approval holds (correction-save, report registers, Returns writes), AML/CFT code or shared AML code, or demo records (Rodney Bay and others).
- Frontend fixes only where the brief already approves them and the authorization rule already exists. No refactors or redesigns.
- Tests never weaken assertions or raise timeouts to get a pass.

## Steps
1. **Reliable baseline**: create isolated git worktrees in /tmp for `37467d92`, `63d64892e` and HEAD (working branch untouched). Install dependencies and run Vitest, TypeScript, lint and a production build in each, with network blocked. Record totals, pass/fail/skip, timeouts and exact failing names. Investigate the 4 timeouts by running them alone, serially and under load, then classify each as infrastructure, app behaviour or recent change.
2. **SEC-03 verification**: add mocked tests for Package A/B/C, loading, missing, unreadable, invalid value, retry, direct URL, sidebar/dashboard, essential nav, and settings refusing a guessed package. Search the code for any remaining Package C or default fallback. Run a mocked browser check with Playwright route interception, sending no writes.
3. **Five permission test failures** (User Access Request, My Institution, Payments, Board Pack, `supervisory_planning.view`): for each, record the test, file, expected vs actual permission, business rule, classification and backend enforcement. Fix only confirmed frontend defects. Anything else is BLOCKED.
4. **Auth/authorization review**: build a matrix covering route guards, sidebar, direct URL, applicant/pre-licensee, primary/secondary, membership, entity isolation, staff roles, regulator/sector scope, package and backend contracts. Columns: frontend, backend, gap, fix.
5. **DB investigations** (SEC-02/04/05/06/07/14/15/16/17/19): read live definitions and compare them with the repo. Update `.lovable/reviews/phase1-db-proposals.md` with root cause, objects, live vs repo, impact, proposed SQL, dependencies, risks, rollback SQL and acceptance tests. If something can't be inspected, I'll say so. Nothing gets executed.
6. **SEC-01 deep review**: per role, list direct, inherited and default privileges, public interfaces (registration, complaints intake, tracking), dependent functions/workers, and the risk of future tables picking up the same grants. Write a targeted remediation with rollback, not a blanket revoke. Nothing gets executed.
7. **Backend proposals** (SEC-09/10/11/12/13/18): write `.lovable/reviews/phase1-backend-proposals.md` with vulnerable code, callers, contract, illustrative diff, dependencies, tests, deployment sequence, rollback and post-deployment checks. Covers: SEC-09 using only existing scan states (clean-only release; gaps reported); SEC-13 endpoint-to-scope map from the existing catalogue; SEC-12 caller inventory with no bypass; SEC-10/18 delivery, retry and idempotency (whether atomic claiming is needed). The function files stay untouched.
8. **Foundation stability review** (Master Config, Regulatory, Users/Employees, Roles, Organisations, Workflow Designer, Form Builder, Package Config, Audit/Security): check for broken routes, missing guards, unhandled failures shown as empty lists, loading and import errors. Fix only confirmed in-scope frontend defects, each with a test.
9. **Workbook mapping**: map findings and fixes to real Module/Feature/Gap/Test/Journey IDs from `OLRAS_Master_Certification.xlsx` (I'll re-open it from uploads if it's available, otherwise report the limitation). Nothing is marked Verified.
10. **Final regression and safety**: full Vitest, TypeScript, lint, build, targeted auth and SEC-03 tests. A git diff audit confirms no edits to backend functions, migrations, AML, holds or deploy config. Commit.
11. **Consolidated report in chat** covering the 14 sections the brief asks for, with each check labelled as source, mocked or live. Then stop.

## Technical notes
- Worktrees go in `/tmp/baseline/<sha>` via `git worktree add --detach`. This is allowed: it doesn't switch branches, and I'll remove the worktree afterwards with `git worktree remove`. If git refuses, I'll use `git archive <sha> | tar -x` instead.
- Network is blocked through an unreachable Supabase URL in the test env plus a fetch guard in the test setup. Only the isolated copies are changed, never the project.
- New files: `src/test/subscriptionPackageScenarios.test.tsx` (SEC-03) and `.lovable/reviews/phase1-backend-proposals.md`, `phase1a-access-matrix.md`, `phase1a-foundation-review.md`, `phase1a-workbook-mapping.md`.

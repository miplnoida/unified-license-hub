# OLRAS Phase 1 — Baseline, Security and Stability

Scope is exactly the uploaded Phase 1 brief. No database changes, data writes, deployments, publishing, real messages, scheduled jobs, AML/CFT work, or changes to existing holds.

## Step 1 — Baseline (read-only)
- Record commit `45bfc71e…`, current build log, Vitest results (run with network to the shared database and providers blocked), TypeScript check, lint.
- Record deployed function versions where readable, migration-vs-live function drift (read-only catalogue queries), existing findings, holds and frozen modules.
- Pre-existing failures listed separately. If baseline cannot be established, stop and report.

## Step 2 — Access review
Read-only review of route guards, sidebar, direct URLs, membership, applicant/pre-licensee and Primary/Secondary limits, staff permissions, package gating, and each backend function's caller checks and service-role use. Code-fix only where the correct rule already exists; otherwise mark BLOCKED with a proposal.

## Step 3 — Known security findings (code fixes, one at a time, each with tests)
- SEC-03 package settings: loading/missing/unreadable must not fall back to Package C; hide gated modules until loaded.
- SEC-09 document-extract: require sign-in, check document access as the caller, refuse cross-entity, respect scan release status, no signed URL for unauthorised users.
- SEC-10 send-notification: authorised callers only (user permission or worker secret), recipients checked against business context, no unrelated log updates, provider failure never reported as sent.
- SEC-11 send-correspondence: caller must be able to read the source record via caller-scoped client before service-role sending.
- SEC-12 generate-return-analysis: permission + return-scope check; use stored return data, ignore caller-supplied figures; failures reported as failures.
- SEC-13 developer-api: enforce key scopes, reject invalid/expired/revoked keys, database errors returned as errors, not empty results.
- SEC-18 process-queue: never mark "delivered" without provider confirmation; accurate failed state; no duplicate sends on retry.
All provider calls mocked in tests. Function code changes are not deployed — deployment awaits your approval.

## Step 4 — Database concerns (investigation and written proposals only)
SEC-01, 02, 04, 05, 06, 07, 14, 15, 16, 17, 19: for each confirmed issue, root cause, affected objects, impact, exact SQL, dependencies, rollback and acceptance tests in `.lovable/reviews/phase1-db-proposals.md`. Nothing executed.

## Step 5 — Foundation stability review
Read-only pass over configuration, regulators, users/employees, roles, institutions, workflow, form builder, packages, audit. Fix only confirmed security/stability defects (e.g. errors shown as empty lists, broken imports, unguarded routes).

## Step 6–7 — Regression
Full Vitest suite, TypeScript, production build, safe read-only browser checks. Anything unsafe to run reported NOT TESTED / BLOCKED.

## Step 8 — Final report in chat
Sections A–F as specified (baseline, findings table, database work, regression, workbook mapping, safety declaration). No item marked Verified. Stop after Phase 1.

## Technical notes
- Tests for edge functions use extracted pure helpers plus mocked Supabase/provider clients.
- Each fix committed separately; any fix causing a new failure is reverted before continuing.

## Approval conditions (from your approval note)
- Order: baseline, access review, SEC-03, SEC-09, SEC-11, SEC-10, SEC-18, SEC-12, SEC-13, stability fixes, database proposals, full regression, report.
- Baseline uses the actual current commit; tests confirmed unable to reach the shared database or providers before running.
- Browser checks block every write request; screens with background writes, polling or audit logging are reported BLOCKED if they cannot be isolated. RPCs run only when confirmed read-only.
- SEC-03 adds loading, error and retry states; sign-in and essential navigation stay reachable.
- SEC-09/10/11/12/13: every caller listed first; existing contracts only — no new secrets, scopes, scan states or calculation methods. Missing contracts are reported, not invented.
- SEC-11 checks both record access and authority to send correspondence, plus recipient scope.
- SEC-18 separates provider acceptance from delivery; mocks cover success, failure, timeout and save failure; duplicate prevention needing database work goes to the proposals file.
- Shared code used by AML/CFT is checked and left unchanged if affected.
- Before committing, confirm that local commits do not deploy anything; if they would, stop and report.
- Final report uses your status labels (FIXED IN SOURCE, PENDING DEPLOYMENT, BLOCKED — DATABASE APPROVAL REQUIRED, etc.); backend fixes are never called live until deployed.

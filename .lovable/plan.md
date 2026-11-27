# Security Remediation — Implementation Batch 1

Scope follows the uploaded brief exactly. No SQL execution, no backend function edits/deploys, no publish, no AML/CFT changes, no demo data changes, all holds preserved.

## 1. SEC-01 — three separate SQL packages (prepare only)
- Re-read live grants (read-only) immediately before drafting.
- Split existing `.lovable/reviews/phase1a-sql/` proposal into:
  - **A** Revoke TRUNCATE from `anon`/`authenticated` on non-frozen public tables (priority).
  - **B** Revoke anonymous INSERT/UPDATE/DELETE where no anon write policy exists; keep public intake tables (complaint intake/tracking, registration, captcha etc.) listed explicitly.
  - **C** Fix `ALTER DEFAULT PRIVILEGES` for both table-owner roles.
- Each package file: exact SQL, rollback SQL, table count, direct vs inherited (PUBLIC) impact, public-service dependencies, AML/CFT freeze impact, pre/post checks, single-transaction + `lock_timeout` strategy.
- Output: `.lovable/reviews/sec01/package-{a,b,c}.md` (+ `.sql` / `rollback.sql`).

## 2. Foundation permission fixes (frontend only, existing permissions)
- Settings routes: gate by configured RBAC permissions while keeping existing super-admin authority.
- Master Configuration mutations, Workflow Designer create/edit, Form Builder create/edit/save/import: check permission in both the visible control and the action handler (not just `data-rbac`).
- Read-only access preserved. Any missing canonical permission reported as a blocker, not invented.

## 3. Foundation error-handling fixes
- Master Configuration, Regulatory Management, Role Management, Workflow Designer, Compliance Audit Logs: distinguish loading/empty/error, add retry, never treat failed permission/scope reads as empty, mark stale data on failed refresh. No redesign.

## 4. Permission decisions — proposals only
- Access-request review/decision with explicit authority + scope and independent approval; receipt issuance authority beyond view; institution users stay on Primary User/membership. Exact DB/backend proposals written to `.lovable/reviews/batch1-permission-proposals.md`, not executed.

## 5. Regression
- Targeted tests per fix (new tests where behaviour changes), then full offline Vitest, TypeScript, build, lint on changed files; compare to `e2e1017e2`. No weakened tests.

## 6. Report
Concise chat report: fixes, files, tests, remaining blockers, SEC-01 packages A/B/C for separate approval, recommended next batch. Commit; stop before any SQL or deployment.


# Read-Only Enterprise Audit

Produce one comprehensive, evidence-backed audit report of the Unified License Hub. No source files, migrations, edge functions, or data will be modified. Only read-only tools will be used.

## Deliverable

A single markdown document at:

```
docs/22_AUDIT_REPORT.md
```

Every finding will cite exact file paths, function/RPC names, and line numbers where possible, plus root cause, business impact, suggested fix (described only, no code changes), and a confidence rating (High / Medium / Low). Findings that require runtime access to fully verify will be labeled `runtime-verification-required`.

## Investigation Approach

Static review (repo files):
- `src/` — routes, pages, hooks, components, lib, platform, contexts
- `supabase/migrations/*.sql` — every migration in order, cross-checked for duplicates/conflicts
- `supabase/functions/*` — every Edge Function
- `src/test/*` — verify tests actually assert behavior (not swallowed)
- `docs/*` — existing standards used as baseline

Runtime read-only checks (allowed by the user):
- `supabase--linter` — RLS/config warnings
- `supabase--read_query` / `psql` — inventory of tables, RPCs, triggers, policies, indexes; detect orphan/unused objects; sample row counts
- `supabase--slow_queries` — top offenders from pg_stat_statements
- `security--run_security_scan` + `security--get_scan_results`
- `code--dependency_scan` — vulnerable/outdated deps
- `supabase--analytics_query` — recent DB / auth / edge error patterns
- Edge function inventory via `supabase functions` listing tools

No writes, no migrations, no data changes.

## Report Structure

```text
docs/22_AUDIT_REPORT.md
├─ 1. Executive Summary + Production-Readiness Scorecard (/10 per pillar)
├─ 2. Architecture Assessment
├─ 3. Database Audit
│    ├─ Migration integrity (missing/duplicate/conflicting)
│    ├─ Tables (orphan/unused, FK, cascades, constraints, indexes)
│    ├─ RPCs (existence, usage, duplicates, dead code, tx safety, concurrency)
│    ├─ Triggers, views, materialized views, generated columns
│    └─ RLS + GRANT coverage
├─ 4. Workflow Engine Audit (approval_steps, actions, transitions, SLA, assignment, escalation)
├─ 5. Frontend Audit (routing, guards, forms, validation, dead code, error handling)
├─ 6. Backend / Edge Function Audit (authz, validation, retries, secrets)
├─ 7. Security Audit (AuthN, AuthZ, RLS, storage, JWT, service role, injection/XSS/CSRF, secrets)
├─ 8. Module-by-Module Findings
│    Complaints · Licensing (pre/post/renewal/variation/surrender/cancellation/revocation/appeals)
│    Fit & Proper · Prudential · Market Conduct · Enforcement · Appeals · Coordination
│    AI Analysis · Consolidated Reports · Notifications · Reports/Dashboards · Audit Logs
├─ 9. Performance Audit (N+1, missing indexes, slow RPCs, payload sizes, renders)
├─ 10. Code-Quality & Dead-Code Inventory
├─ 11. Testing Audit (coverage + honesty — swallowed errors, over-mocking)
├─ 12. Regulatory / Domain Compliance Notes (BOJ/FSC-style expectations)
├─ 13. Findings Register — grouped by severity
│      Critical · High · Medium · Low  (with file, line, root cause, impact, fix hint, confidence)
├─ 14. Runtime-Verification-Required items (what could not be settled from static review)
└─ 15. Technical Debt & Production Risk Register
```

## Ground Rules

- No code changes. No file writes outside the single report at `docs/22_AUDIT_REPORT.md`.
- No hypothetical issues — every finding must cite concrete evidence in the repo or the read-only runtime queries.
- Every finding carries a confidence level. Static-only findings are labeled as such; anything needing live data is marked `runtime-verification-required`.
- If a conclusion is blocked (e.g., third-party service state), that is stated explicitly instead of guessed.

## Expected Runtime

Given ~240 tables, dozens of Edge Functions, hundreds of migrations, and many modules, this will consume a significant number of tool calls before the report is written. The report itself is expected to be long (tens of thousands of characters). No interim commits — the single audit doc is produced once at the end.

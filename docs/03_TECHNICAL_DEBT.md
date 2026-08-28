# 03 — Technical Debt Register

Priority: **P0** (blocks enterprise readiness) · **P1** (must fix before next EPIC) · **P2** (planned) · **P3** (nice to have)
Effort: **S** ≤1d · **M** 2–5d · **L** 1–2w · **XL** >2w

---

### TD-001 — No repository / service layer; Supabase leaks everywhere
- **Current**: 634 TS files; `rg "from '@/integrations/supabase/client'"` matches ~250+ files including components, hooks, `lib/*`.
- **Why a problem**: Impossible to mock for tests, no single place to enforce audit/telemetry/error mapping, RLS assumptions duplicated.
- **Risk**: High — every schema change ripples across dozens of files; refactors are fear-driven.
- **Recommended**: Introduce `features/<domain>/repositories/*.ts` — only place allowed to import supabase client. Domain services depend on repositories via interfaces.
- **Priority / Effort**: P0 / XL (phased per feature)
- **Affected**: all of `src/hooks`, `src/lib`, `src/components/**`

### TD-002 — `src/lib` is a god-folder (70 files, mixed responsibilities)
- **Current**: Pure utils, JSX helpers, Supabase services, domain rules coexist.
- **Why**: Violates SRP; grep-based navigation only; encourages more dumping.
- **Risk**: Medium — slows onboarding, invites duplication.
- **Recommended**: Split per §2 target folder structure.
- **P/E**: P1 / L
- **Affected**: `src/lib/**`

### TD-003 — No logging abstraction
- **Current**: `rg "console\." src` → hundreds of matches; some gated by `if (import.meta.env.DEV)` (see `Dashboard.tsx`), most not.
- **Why**: Cannot ship logs to sink, no correlation ID, PII risk.
- **Risk**: High (compliance).
- **Recommended**: `platform/logger` with levels + context; ESLint rule banning raw `console.*` outside logger.
- **P/E**: P0 / M
- **Affected**: entire `src/**`

### TD-004 — Edge function error contract inconsistent
- **Current**: Some EFs return HTTP 200 with `{error}` (per memory), others throw. Client-side handling is per-caller.
- **Why**: Duplicated error-parsing code; brittle UX; hard to reason about retries.
- **Risk**: High.
- **Recommended**: Standard `{ ok, data?, error?: { code, message, details? } }`; shared client wrapper `platform/http/invokeFn`.
- **P/E**: P0 / M
- **Affected**: `supabase/functions/**`, all callers.

### TD-005 — Audit tables fragmented; no unified audit facade
- **Current**: `audit_logs`, `compliance_audit_logs`, `conduct_triage_audit_events`, `return_audit_log`, `audit_export_jobs`, `report_logs`, `document_action_logs`, `conduct_evidence_access_log`, `security_event_logs`, `integration_logs`, `prudential_data_feed_logs`, `sla_escalation_dispatches`, `return_notifications_log`, `notification_dispatch_log`, `notification_digest_log`, `return_validation_run_log`.
- **Why**: No single "who did what to which entity" surface. Reports (see `report_logs` vs `audit_export_jobs` — earlier finding) don't roll up together.
- **Risk**: High — regulator audit demand cannot be satisfied without weeks of SQL.
- **Recommended**: Keep specialised tables, add `audit_events` unified view + `platform/audit.record({actor, action, entity, before, after, correlationId})`. Migrate writers over 3 EPICs.
- **P/E**: P0 / L
- **Affected**: All feature audit writers.

### TD-006 — Export/download paths bypass audit
- **Current** (per prior investigation): `SlaManager`, `UserManagement`, `BulkIntake`, `DocumentStore`, `LicenseDetail`, `ConductActions`, `ViewReturns`, `UploadReturns`, master-data dialogs, form-builder `FileImport`, attachment/document downloads → no entry in `audit_export_jobs` or `report_logs`.
- **Recommended**: Central `exportAudit.logExport()` wrapper used by every download util; ESLint rule to flag raw `XLSX.writeFile` / `saveAs` outside the wrapper.
- **P/E**: P0 / M
- **Affected**: ~15 modules.

### TD-007 — Two separate export audit sinks (report_logs vs audit_export_jobs)
- **Current**: Reports module writes `report_logs`; admin AuditExport reads `audit_export_jobs`; the "Data Export Log" report only sees `report_logs`.
- **Recommended**: Introduce `export_events` unified view or migrate to one table; keep specialised details.
- **P/E**: P1 / M

### TD-008 — Direct `supabase.from((table) as any)` casts
- **Current**: `src/lib/api.ts`, `usePermissions.ts` use `as any` to dodge generated types.
- **Why**: Loses type safety, hides schema drift.
- **Risk**: Medium.
- **Recommended**: Regenerate types after each migration; ban `as any` on supabase queries via ESLint (`no-restricted-syntax`).
- **P/E**: P1 / S

### TD-009 — Rule/expression evaluation duplicated
- **Current**: `safeEval.ts`, `booleanExpression.ts`, `applicationSufficiency.ts`, `sufficiency_rules` table, `field_conditions`, `delegation_rules`, `form_field_dependencies`, `return_validation_rules`, `conduct_triage_rules`, `conduct_monitoring_rules`, `fp_sector_decision_rules`.
- **Why**: Every module invents its own DSL — no shared evaluator, testing story, or admin UI convention.
- **Recommended**: `platform/rules` façade with pluggable evaluators; document DSL grammar.
- **P/E**: P1 / L

### TD-010 — Permission model split (system_role vs dynamic roles vs RLS)
- **Current**: `useUserDynamicPermissions` bypasses enforcement when user has no dynamic role ("legacy admins keep full access"). Client + server checks diverge.
- **Risk**: High (privilege escalation).
- **Recommended**: Enforce dynamic role mapping for every non-super-admin; write RLS-parity tests.
- **P/E**: P0 / M

### TD-011 — Contexts do too much / re-render cost
- **Current**: 5 nested providers (Site → Auth → Regulator → PPOC → ActiveSector). No memoisation audits documented.
- **Recommended**: Split state (rarely changing config) from ephemeral state (active sector); add render benchmarks.
- **P/E**: P2 / M

### TD-012 — Routing split across 5 files, no lazy consistency
- **Current**: `lazyWithRetry` exists but not applied uniformly.
- **Recommended**: Route standard doc (`13_ROUTE_STANDARD.md`) + audit.
- **P/E**: P1 / S

### TD-013 — Tests are flat, coverage unknown
- **Current**: ~70 vitest files under `src/test/`; no coverage gate in CI.
- **Recommended**: Mirror `features/` layout; require coverage on services + repositories; keep component tests smoke-only.
- **P/E**: P1 / M

### TD-014 — No API contract types shared with edge functions
- **Current**: EF request/response typed independently on both sides.
- **Recommended**: `packages/contracts` (or `src/platform/contracts/`) with zod schemas re-used by EFs (via import maps) and client.
- **P/E**: P1 / L

### TD-015 — Mock / demo data & TODOs
- **Action**: `rg -n "TODO|FIXME|MOCK|mock|placeholder|dummy|lorem" src supabase/functions` — build a live inventory and gate merges on "no new demo data" rule. (Full sweep deferred to EPIC 0.1.)
- **Known**: `src/data/sectorData.ts` deleted in F1-B.1 (zero importers); `PlaceholderPage.tsx` — expected.
- **P/E**: P1 / S (inventory) + M (removal)

### TD-016 — Naming inconsistencies
- **Current**: `licensee` vs `entity` vs `organisation`; `licence` vs `license`; `fit_and_proper` vs `fp_*` prefixes; `return_configs` vs `return_configurations` (root of last week's routing bug).
- **Risk**: Medium — schema confusion caused a production routing bug.
- **Recommended**: Naming glossary + migration plan for aliases.
- **P/E**: P1 / M

### TD-017 — No correlation ID / tracing
- **Recommended**: Generate `X-Correlation-Id` in UI, propagate through EF invocations and audit rows.
- **P/E**: P0 / M

### TD-018 — Secrets & config surface not centralised
- **Current**: `envValidation.ts` validates entry, but downstream code reads `import.meta.env.*` ad hoc.
- **Recommended**: `platform/config` typed getter; ESLint rule.
- **P/E**: P2 / S

### TD-019 — Documentation gap
- **Current**: `docs/` only contains QA notes and a demo guide. No architecture, coding, or contribution docs.
- **Recommended**: The 20 documents produced by this EPIC.
- **P/E**: P0 / M (this EPIC).

### TD-020 — Notification engine coverage untested
- **Current**: Central dispatcher exists (`dispatch-notification-event`), good. No matrix of events × channels × recipients documented.
- **Recommended**: Living matrix in `docs/notifications.md` extended.
- **P/E**: P1 / S

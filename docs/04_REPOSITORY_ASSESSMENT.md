# 04 — Repository Assessment & Health Score

## Metrics (Snapshot)

| Metric | Value |
|--------|-------|
| TS/TSX files under `src/` | 634 |
| Public tables (`public.*`) | 200+ |
| Edge functions | ~56 |
| Vitest files | ~70 |
| Contexts | 5 |
| Route files | 5 |
| `console.*` call sites | Hundreds (unabstracted) |
| Files importing supabase client directly | ~250+ |
| Distinct audit-style tables | 16 |
| Distinct rule/expression subsystems | 10+ |

## Health Score (1 = poor, 10 = excellent)

| Dimension | Score | Justification |
|-----------|:-:|---|
| **Architecture** | 4 | Solid provider/routing shell and DB-driven engines (workflow, forms, notifications). No service/repository boundary; `lib/` is a god-folder; layering is convention-only. |
| **Scalability** | 5 | Postgres + RLS scales fine at data layer; frontend risks re-render storms from 5 nested contexts; no code-splitting audit. |
| **Maintainability** | 4 | 634 files with weak module boundaries; naming inconsistencies (`return_configs` vs `return_configurations` caused a production bug); duplicated rule engines. |
| **Performance** | 6 | TanStack Query defaults sensible; Postgres FTS in use; N+1 fixes documented in memory. No perf budgets or profiling artefacts. |
| **Security** | 6 | RLS + `has_role` pattern correct; `SECURITY DEFINER` isolation good; edge fn error handling inconsistent; dynamic-role bypass ("legacy admins keep full access") is a latent hole; correlation/audit trace missing. |
| **Compliance** | 5 | Multiple audit tables exist but fragmented; export paths bypass audit (TD-006); no unified regulator-facing audit query. |
| **FRD Readiness** | 4 | Feature breadth is strong; no FRD traceability matrix; no requirement-to-test mapping. See `18_FRD_TRACEABILITY_STRATEGY.md`. |
| **Demo Readiness** | 7 | Modules render, workflows execute, dashboards populate. Known routing/UX defects have been patched. Demo guide exists in `docs/`. |
| **Production Readiness** | 4 | Missing: logging, telemetry, feature flags, correlation IDs, error contract, coverage gates, load tests, DR runbook. |

**Overall Weighted (equal weights): 5.0 / 10** → *Advanced Prototype nearing MVP*.

## What Works Well
1. Domain modelling in Postgres is mature and thoughtful (workflow engine, form builder, F&P, prudential).
2. Notification dispatch is centralised — a good template for other engines.
3. `AuthContext` + RLS story is coherent; `has_role` pattern is correctly used.
4. Route split by domain is a good starting shape for `features/` migration.
5. Tests exist for tricky invariants (workflow resolver, delegation expiry, dashboard drilldowns).

## What Blocks Enterprise Readiness
See `03_TECHNICAL_DEBT.md`. Highest impact:
- Missing service/repository layer (TD-001).
- No logging/error/telemetry cross-cutting (TD-003, TD-004, TD-017).
- Fragmented audit surface (TD-005, TD-006, TD-007).
- Dynamic-permission bypass (TD-010).
- `src/lib` decomposition (TD-002).

## Migration Path (Roadmap)

```text
EPIC 0 (this)   → Documentation + guardrails (no code moves)
EPIC 0.1        → Enforcement scaffolding:
                  - platform/logger, platform/errors, platform/http
                  - ESLint boundaries + no-supabase-outside-repos
                  - Correlation-ID plumbing
                  - Standard EF error contract (adopted per new fn)
EPIC 0.2        → Feature carve-out pilot: migrate `returns/` into features/
                  layout with services + repositories. Prove the model.
EPIC 0.3        → Audit unification: audit_events view + platform/audit facade.
EPIC 0.4        → Rules engine consolidation (platform/rules).
EPIC 0.5        → Test taxonomy + coverage gates (services 80%, repos 60%).
EPIC 1+         → Feature EPICs adopt the new layout by default.
```

### Dependencies
- EPIC 0.2 depends on 0.1 (logger/error/http).
- EPIC 0.3 depends on 0.1 (correlation ID).
- EPIC 0.4 can run in parallel with 0.3 after 0.1.

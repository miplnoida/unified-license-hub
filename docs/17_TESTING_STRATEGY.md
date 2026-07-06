# 17 — Testing Strategy

## Pyramid
| Layer | Tool | Target coverage | Notes |
|-------|------|:-:|-------|
| Unit — services | Vitest | 80% | Pure TS, in-memory repos |
| Unit — repositories (contract) | Vitest + supabase mock or test schema | 60% | Verifies query shape |
| Integration — RLS / RPCs | pgTAP or SQL smoke scripts | Critical paths | See `scripts/*-smoke.sql` |
| Hooks | React Testing Library | Key hooks only | Mock services |
| Components | RTL smoke | Render + a11y assertion | No deep interaction tests |
| E2E | Playwright (already available) | Critical journeys | Login, submit return, approve app |
| Security | Manual + `security--run_security_scan` | Every EPIC | Fix findings before merge |

## Current State
- ~70 vitest files, flat under `src/test/`.
- Good coverage of tricky invariants (workflow resolver, delegation expiry).
- No coverage threshold in CI.
- No E2E suite committed.

## Actions
1. Add `vitest --coverage` gate: overall 60%, services 80% (per feature migrated).
2. Reorganise tests to mirror `features/`.
3. Add Playwright E2E: login, submit-return, approve-application, F&P screening.
4. Wire security scan into CI (report-only initially, blocking after EPIC 0.1).

## Naming & Layout
```
features/returns/
  services/submitReturn.ts
  services/__tests__/submitReturn.test.ts
```

## Test Data
- No fixtures in production code; use factories in `test/factories/`.
- No real regulator data in fixtures; synthesise.

## Do Not
- Test framework internals (React, TanStack Query).
- Snapshot large components — snapshot only stable, small outputs.
- Rely on wall-clock — inject a clock into services.

# 01 — System Architecture

**EPIC 0 — Enterprise Assessment (Read-Only Blueprint)**
Project: BOJ / FSC Jamaica Unified SupTech Platform
Repo: `unified-license-hub`

---

## 1. High-Level Architecture (Current State)

```text
                    ┌──────────────────────────────────────────┐
                    │            Browser (React 18 SPA)        │
                    │  Vite • TypeScript • Tailwind • shadcn    │
                    │  TanStack Query • React Router • Contexts │
                    └───────────────┬──────────────────────────┘
                                    │ HTTPS (JWT)
                    ┌───────────────▼──────────────────────────┐
                    │      Lovable Cloud (Supabase Managed)    │
                    │  ┌────────────┐  ┌─────────────────────┐ │
                    │  │ PostgREST  │  │  Edge Functions     │ │
                    │  │  + RLS     │  │  (Deno, ~56 fns)    │ │
                    │  └─────┬──────┘  └──────────┬──────────┘ │
                    │        │                    │            │
                    │  ┌─────▼────────────────────▼──────────┐ │
                    │  │       Postgres (200+ tables)        │ │
                    │  │  RLS • SECURITY DEFINER RPCs •      │ │
                    │  │  Triggers • Audit tables            │ │
                    │  └─────────────────────────────────────┘ │
                    │  ┌─────────────┐  ┌──────────────────┐   │
                    │  │  Storage    │  │  Auth (GoTrue)   │   │
                    │  │  (buckets)  │  │  email + Google  │   │
                    │  └─────────────┘  └──────────────────┘   │
                    └──────────────────────────────────────────┘
                                    │
                    ┌───────────────▼──────────────────────────┐
                    │     External / AI Services (via EF)      │
                    │  Lovable AI Gateway • Email • SMS        │
                    └──────────────────────────────────────────┘
```

## 2. Layers Present

| Layer | Present | Notes |
|-------|---------|-------|
| Presentation (React components) | ✅ | 400+ components, shadcn-based |
| Routing | ✅ | Split into 5 route files under `src/routes` |
| Context (auth, regulator, sector, ppoc, settings) | ✅ | 5 providers |
| Query/Data (TanStack Query hooks) | ✅ | 49 hooks, inconsistent shape |
| Client "lib" helpers | ⚠️ | 70 files — mixes pure utils, domain services, DB calls |
| Service layer (domain services) | ❌ | Missing — logic embedded in components/hooks |
| Repository layer (DB adapters) | ❌ | Every hook calls `supabase.from(...)` directly |
| Edge functions (server logic) | ✅ | 56 functions — inconsistent error contract |
| Domain model (typed entities) | ⚠️ | Only Supabase generated `Database` types |
| Cross-cutting: logging | ❌ | `console.*` scattered, no logger abstraction |
| Cross-cutting: error handling | ⚠️ | ErrorBoundary present, no global handler |
| Cross-cutting: telemetry | ❌ | None |
| Audit platform | ⚠️ | Multiple parallel tables (`audit_logs`, `compliance_audit_logs`, `conduct_triage_audit_events`, `return_audit_log`, `audit_export_jobs`, `report_logs`) — no unified surface |
| Rule engine | ⚠️ | Ad-hoc (`safeEval`, `booleanExpression`, `sufficiency_rules`, `delegation_rules`, `field_conditions`) — not consolidated |
| Notification engine | ✅ | `dispatch-notification-event` EF is single entry point — good |
| Workflow engine | ✅ | DB-driven (`approval_workflows`, `workflow_instances`) with resolver RPCs |
| Form builder / renderer | ✅ | Normalized tables + JSONB fallback |

## 3. Target Architecture (Recommended)

```text
UI (dumb components)
  ↓
Feature modules (src/features/<domain>/…)
  ├── components/           presentation only
  ├── hooks/                UI-facing hooks — call services
  ├── services/             domain use-cases (pure TS, testable)
  ├── repositories/         Supabase adapters (only place that imports supabase client)
  ├── schemas/              zod schemas & typed entities
  └── index.ts              public API of module
  ↓
Cross-cutting (src/platform/)
  ├── logger/               structured logger (info/warn/error + context)
  ├── errors/               AppError hierarchy + toErrorResponse()
  ├── audit/                unified audit writer
  ├── notifications/        typed dispatch client
  ├── rules/                rule engine facade
  └── http/                 edge function invoke wrapper (auth, retry, error contract)
  ↓
Supabase (RLS + RPC + EF) — treated as an external system behind repositories
```

## 4. Boundary Rules (to be enforced by lint)

1. **Only** `src/**/repositories/**` may import `@/integrations/supabase/client`.
2. **Components** must not call Supabase; they consume hooks.
3. **Hooks** must not contain business rules; they call services.
4. **Services** must be pure TS (no React) — return typed results / throw `AppError`.
5. **Edge Functions** must return `{ ok: boolean, data?, error? }` with HTTP 200 for validation errors (see §15).

## 5. Deployment Topology

Single-tenant multi-regulator (BOJ + FSC) served from one Supabase project. Regulator scoping is enforced by:

- `RegulatorContext` (client-side filtering hint)
- `regulator_id` columns + RLS (server-side truth)

This is acceptable now but must be reviewed before onboarding a third regulator (see `20_NEXT_EPICS.md`).

## 6. Key Cross-Cutting Concerns Missing

| Concern | Gap |
|---------|-----|
| Correlation IDs | No request/trace ID propagated from UI → EF → DB audit |
| Feature flags | None — features toggled by presence of code |
| Config service | Env access scattered (`import.meta.env.*`) beyond `envValidation.ts` |
| API contract | Edge function shapes are ad-hoc, no shared types package |
| Background jobs | `job_queue` table exists but no documented worker contract |

See `03_TECHNICAL_DEBT.md` for issue-by-issue breakdown.

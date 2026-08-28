# 02 — Folder Structure

## Current

```text
src/
  App.tsx                     # Providers + routing shell
  main.tsx                    # Entry, env validation
  routes/                     # 5 route files (public/dashboard/admin/settings/returns)
  pages/                      # 30+ top-level + 20 sub-folders (by domain)
  components/                 # ~30 domain folders + ui/ (shadcn) + shared/
  hooks/                      # 49 files — mixed: query hooks, guards, feature hooks
  contexts/                   # AuthContext, RegulatorContext, PpocContext, ActiveSectorContext, SiteSettingsContext
  lib/                        # 70 files — utils + domain logic + DB helpers (BLOATED)
  integrations/supabase/      # auto-generated client + types (do not edit)
  types/                      # 4 files
  test/                       # ~70 vitest files (flat)
supabase/
  functions/                  # ~56 edge functions
  migrations/                 # timestamped SQL
docs/                         # sparse — no arch docs yet
scripts/                      # verify-hardening, smoke SQL
```

### Observations

1. `src/lib` is a dumping ground — mixes:
   - Pure utilities (`utils.ts`, `formatTaxonomyLabel.ts`, `safeEval.ts`)
   - Domain logic (`applicationSufficiency.ts`, `returnsRatios.ts`, `licenseValidity.ts`)
   - Supabase-calling services (`workflowService.ts`, `secureFileUpload.ts`, `formStorage.ts`, `registrationWorkflowClient.ts`)
   - UI helpers that import JSX (`licenseStatusBadge.tsx`)
2. `src/hooks` mixes generic infrastructure (`useAuditLog`, `useApiQueries`) with domain hooks (`useReturnsManagement`, `useMarketConduct`).
3. `pages/` folders mostly hold routed components; some contain deep sub-components — should live under `features/<domain>/components`.
4. `test/` is flat; hard to locate coverage per domain.
5. No `features/` or `modules/` boundary — every domain leaks into the shared `lib` and `hooks` folders.

## Target

```text
src/
  app/                        # entry, providers, router composition
    App.tsx
    main.tsx
    providers.tsx
  routes/                     # route trees only (keep as-is, thin)
  features/                   # domain modules — bounded contexts
    licensing/
    registration/
    fit-and-proper/
    prudential/
    market-conduct/
    complaints/
    inspections/
    investigations/
    enforcement/
    returns/
    dashboards/
    reports/
    workflows/
    forms/
    notifications/
    audit/
    admin/
  platform/                   # cross-cutting (was: parts of lib/, hooks/)
    logger/
    errors/
    http/                     # edge fn invoke wrapper
    audit/
    rules/
    notifications/
    permissions/
    auth/
  ui/                         # shadcn primitives (was: components/ui)
  shared/                     # cross-feature presentational components
  integrations/supabase/      # unchanged (generated)
  test/                       # mirror features/ layout
docs/                         # this EPIC's outputs live here
```

### Migration Rules
- Move files, never rewrite (EPIC 0 is read-only).
- Each feature exposes an `index.ts` barrel — no deep imports from outside.
- Introduce ESLint boundary rule (`eslint-plugin-boundaries`) to enforce layering.

See `11_SERVICE_LAYER_STRATEGY.md` for the service/repository split inside each feature.

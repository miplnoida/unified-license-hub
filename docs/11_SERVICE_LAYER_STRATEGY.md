# 11 — Service Layer Strategy

## Motivation
TD-001: business logic is currently embedded in hooks, components, and `src/lib`. Testing requires mocking Supabase directly; refactors are fragile.

## Layers
```text
Component  ──uses──▶  Hook (React/Query)  ──calls──▶  Service (pure TS)  ──uses──▶  Repository (Supabase adapter)
                                                    │
                                                    ├──uses──▶  platform/audit
                                                    ├──uses──▶  platform/notifications
                                                    ├──uses──▶  platform/logger
                                                    └──uses──▶  platform/rules
```

## Repository
- One file per aggregate: `returnsRepository.ts`, `applicationsRepository.ts`.
- Interface first (`IReturnsRepository`), Supabase implementation second.
- Returns domain entities (typed via zod).
- Throws `NotFoundError`, `PermissionDeniedError`, `RepositoryError`.
- Contains **no** business rules.

## Service
- Named per use case: `submitReturnService.execute(cmd)`.
- Pure function or small class with injected dependencies.
- Validates command with zod, orchestrates repositories, records audit, dispatches notifications.
- Returns `Result<T>` or throws typed `AppError`.

## Hook
- Thin: builds command, calls service via TanStack Query mutation/query, translates errors to toasts.
- No branching business logic beyond loading/error state.

## Testing
- Repositories: contract tests against a test schema (or mocked supabase client).
- Services: unit tests with in-memory repositories.
- Hooks: React Testing Library, mock services.
- Components: smoke tests only.

## Migration Order (proposed)
1. `returns` (recent bugs → highest ROI).
2. `notifications` (already partly abstracted).
3. `applications` (largest surface — do after model proven).
4. `fit-and-proper`, `prudential`, `market-conduct`, `complaints`, `enforcement`, `inspections` — parallel per team.
5. `forms`, `workflows`, `reports`, `admin` — last; they touch many features.

## Anti-patterns to Retire
- `supabase.from('x').select().eq(...)` inside a component.
- Business branches inside `useEffect`.
- Mutations that write to two tables without a service orchestrator.
- Direct inserts into audit tables.

# 06 — Coding Guidelines

## General
- Prefer composition over inheritance.
- Prefer pure functions in `services/` and `lib/` utilities.
- Guard clauses over nested `if`.
- One export per file for components and services; barrel via `index.ts`.

## TypeScript
- `strict: true`; no `any`, no non-null assertions except in tests.
- Domain types in `features/<f>/schemas/` (zod → inferred types).
- Never re-export Supabase `Database` types outside repositories; expose domain entities instead.

## React
- Functional components only.
- Hooks obey Rules of Hooks; custom hooks start with `use`.
- Avoid `useEffect` for derived state — use `useMemo` or move server-state to TanStack Query.
- Do not fetch in components — call a hook that calls a service.
- Suspense-friendly boundaries around routes.

## TanStack Query
- Query keys are arrays namespaced by feature: `['returns', 'byId', id]`.
- Mutations return a promise; UI feedback via `onSuccess/onError`.
- Cache invalidation lives in the mutation `onSuccess`, not in components.

## Supabase Access
- Only in repositories.
- Repositories return domain entities (no `Database['public']['Tables'][...]` leaked).
- Errors translated to `AppError` subclasses in repositories.

## Async
- Always `await` promises; never leave floating promises unless explicitly `.catch(logger.warn)`.
- Retries live in the http/repository layer, not in components.

## Style
- Prettier defaults; 100-char line limit.
- Import order: node → external → `@/platform/*` → `@/features/*` → relative.
- No default exports for utilities; default exports allowed for route components.

## Comments
- Explain **why**, not what. Link to ticket or ADR for non-obvious decisions.
- Public API of a service documented with TSDoc.

## Forbidden
- `eval`, `Function()`, `document.write`, `dangerouslySetInnerHTML` (except sanitised markdown).
- Storing tokens in `localStorage` outside Supabase's own storage key.
- Adding a new audit/log table without ADR approval (use the unified facade).
- Adding a new rule DSL without ADR approval.

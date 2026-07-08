# 05 — Enterprise Standards

Non-negotiable standards for all future EPICs.

## Language & Toolchain
- TypeScript strict mode; no new `any`, no `as any` on Supabase queries (TD-008).
- React 18 + Vite 5 + Tailwind v3 + shadcn — no framework swap.
- Node LTS in edge functions (Deno-managed).

## Module Boundaries
- Enforced by `eslint-plugin-boundaries`:
  - `ui` → may import `shared`, `ui`.
  - `features/*` → may import `shared`, `ui`, `platform`, own feature only.
  - `platform/*` → may import other `platform` and `integrations/supabase` (repositories only).
  - `integrations/supabase/client` → importable **only** from `features/*/repositories/**` and `platform/audit`, `platform/http`.

## Naming
- Files: `kebab-case.ts` for utilities, `PascalCase.tsx` for components, `useThing.ts` for hooks.
- Domain terms — single spelling (see glossary in `03_TECHNICAL_DEBT.md` TD-016).
- Table names: snake_case, singular for lookup, plural for records. **New** naming must go through the glossary owner.

## API / Edge Function Contract
```ts
type EFResult<T> =
  | { ok: true; data: T; correlationId: string }
  | { ok: false; error: { code: string; message: string; details?: unknown }; correlationId: string }
```
Return HTTP 200 for validation errors, 4xx only for auth/authz, 5xx only for unhandled infra failures.

## Audit
Every state-changing action goes through `platform/audit.record(...)`. Direct inserts to any `*_audit_*` table are forbidden outside `platform/audit/**`.

## Logging
Every service/repository/EF uses `platform/logger`. Raw `console.*` allowed only in `platform/logger/**` and test files.

## Errors
Throw typed `AppError` subclasses. UI surfaces via `errorToToast()`. Silent catches are forbidden — add explicit `logger.warn(...)`.

## Security
- RLS enabled on every `public.*` table with matching `GRANT`s (per project rules).
- No role checks on client without server enforcement.
- No secret in client bundle. All secrets via `secrets--add_secret`.
- Signed URLs ≤ 5 min; uploads ≤ 20 MB (per memory).

## Performance Budgets
- Route JS payload ≤ 250 KB gzipped (post code-split).
- List queries paginated; default 25 rows.
- Dashboard widgets ≤ 500 ms P95 warm.

## Accessibility
- Keyboard-navigable; visible focus rings; ARIA labels for icon buttons; WCAG 2.1 AA target.

## Documentation
- Every feature module ships a `README.md` (purpose, entities, services, hooks, events emitted, events consumed).
- Every EF ships a header docblock: purpose, request/response contract, side effects.

## Definition of Done (Applies to every EPIC)
1. Code passes lint + typecheck + tests + boundary lint.
2. New DB tables have `GRANT` + RLS + policies.
3. New endpoints follow error contract.
4. New writes go through audit facade.
5. New user-visible strings pass accessibility review.
6. Feature README + FRD traceability updated.
7. No new `console.*` outside logger.

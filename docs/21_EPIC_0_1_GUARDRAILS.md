# 21 — EPIC 0.1: Enterprise Guardrails (Implemented)

Status: **Delivered** — foundational platform layer only. No business
functionality was added, removed, or modified.

## What was implemented

### 1. `src/platform/logger`
Centralised structured logger with:
- Levels: `debug` (DEV-only), `info`, `warn`, `error`.
- Automatic PII scrubbing (`password`, `token`, `access_token`, `refresh_token`, `otp`, `secret`, `authorization`, `apikey`).
- `logger.scrub(obj)` helper for manual redaction.
- Stable JSON payload shape: `{ level, event, ts, ...context }`.

Usage:
```ts
import { logger } from "@/platform";
logger.info("return.submitted", { returnId, correlationId });
logger.error(err, { feature: "returns", correlationId });
```

### 2. `src/platform/errors`
Typed `AppError` hierarchy:
- `AppError`, `ValidationError`, `NotFoundError`, `PermissionDeniedError`,
  `ConflictError`, `RepositoryError`, `RemoteServiceError`, `UnexpectedError`.

Helpers:
- `errorToToast(err)` — user-safe string with optional correlation-ID suffix.
- `toAppError(err, opts?)` — normalise any thrown value into an `AppError`.

### 3. `src/platform/http/invokeFn`
Standard Edge Function wrapper:
```ts
const res = await invokeFn<Res, Req>("fn-name", body, { correlationId });
if (!res.ok) toast(errorToToast(res.error));
```
- Auto-generates a correlation ID if the caller doesn't supply one.
- Sends it as `x-correlation-id` header **and** `correlation_id` body field.
- Normalises responses into `EFResult<T>` (`{ ok, data | error, correlationId }`).
- Backward-compatible with legacy functions that don't yet emit the `{ ok, data }` envelope.

### 4. Correlation IDs
- `newCorrelationId()` — RFC-4122 UUID via `crypto.randomUUID()` with a safe fallback.
- Every `invokeFn` call carries one end-to-end. Edge Functions should read
  `x-correlation-id` (or `correlation_id` in the body) and echo it in logs +
  audit rows.

### 5. Layer-boundary guidance
See `docs/05_ENTERPRISE_STANDARDS.md` — direction is:
```
pages → features → platform → integrations
```
- `platform/*` MUST NOT import from `features/*` or `pages/*`.
- `features/*` MUST NOT import from another feature's internals — go through
  its `index.ts` barrel.
- `integrations/supabase/client` should only be touched by repositories or
  the platform layer.

Enforced initially by code review + this doc. A full
`eslint-plugin-boundaries` rule set will be introduced in a follow-up PR
(warning-only, per the roadmap).

### 6. CI quality baseline
`package.json` already exposes:
- `npm run lint`
- `npm run test`
- `npm run verify:hardening`

Guardrail unit tests live in `src/test/platformGuardrails.test.ts` and run as
part of `bun run test`.

## Migration notes for future EPICs

**All new code MUST**:
1. Use `logger` instead of `console.*`.
2. Throw `AppError` subclasses; never surface raw Postgres errors to the UI.
3. Invoke Edge Functions through `invokeFn` — never call `supabase.functions.invoke` directly in a feature.
4. Generate a correlation ID at the user-action origin (form submit,
   button click) and thread it through hooks → services → `invokeFn` →
   audit rows.
5. Import from `@/platform` (barrel) rather than deep paths.

**Existing modules** are intentionally left untouched. They will be migrated
feature-by-feature as part of EPIC 0.2 (Returns pilot) and subsequent
carve-outs.

## Files added

| File | Purpose |
| ---- | ------- |
| `src/platform/logger/index.ts` | Structured logger + PII scrub |
| `src/platform/errors/index.ts` | `AppError` hierarchy + `errorToToast` |
| `src/platform/http/invokeFn.ts` | Standard EF wrapper (`EFResult<T>`) |
| `src/platform/http/correlation.ts` | Correlation-ID helper + header const |
| `src/platform/index.ts` | Public barrel |
| `src/test/platformGuardrails.test.ts` | Unit tests for logger/errors/invokeFn |
| `docs/21_EPIC_0_1_GUARDRAILS.md` | This document |

## Exit criteria (met)
- ✅ Guardrail primitives available under `@/platform`.
- ✅ Standard EF contract + correlation propagation in place.
- ✅ Tests cover the happy path and error paths of `invokeFn`, error mapper, and logger scrub.
- ✅ No existing route, hook, or workflow was modified.

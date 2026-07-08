# 16 — Logging Standard

## Levels
- `debug` — dev only.
- `info` — significant business events (submitted, approved).
- `warn` — recoverable anomalies (retry, fallback taken).
- `error` — failures requiring investigation.

## Logger API
```ts
import { logger } from '@/platform/logger';

logger.info('return.submitted', {
  returnId, licenseeId, correlationId,
});
logger.error(err, { correlationId, feature: 'returns' });
```

## Rules
1. **No `console.*` outside `platform/logger/**`** — enforce with ESLint (`no-console`).
2. Every log includes `correlationId` when available.
3. Never log secrets, tokens, or full request bodies. Use `logger.scrub()` for objects that may contain PII.
4. Structured logs only — first arg is a stable string key, second is a context object.

## Correlation ID
- Generated at user action origin (`crypto.randomUUID()`).
- Attached to hooks/services/http calls; propagated to EF headers.
- Written to every audit row and every logger context.

## Sinks
- Dev: console with pretty printing.
- Prod: initially console (captured by Cloud logs); pluggable transport for future OpenTelemetry / Sentry.

## Edge Functions
- Deno EFs use the same abstraction (mirror in `supabase/functions/_shared/logger.ts`).
- Every EF logs entry + exit + duration.

## PII Scrubbing
- Keys automatically scrubbed: `password`, `token`, `access_token`, `refresh_token`, `otp`, `secret`, `email`, `phone`, `national_id`, `dob`.
- Add project-specific keys as encountered.

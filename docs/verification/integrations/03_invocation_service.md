# ADM-INT-001 — Group B: canonical invocation service + fallback governance

Verified this turn (`deno test --allow-all supabase/functions/tests/ supabase/functions/_shared/` — 6 + 26 passed, 0 failed).

## What now exists

| Concern | Implementation | Evidence |
| --- | --- | --- |
| Single entry point for all external calls | `invokeIntegration()` in `supabase/functions/_shared/integration/invoke.ts` | Modules pass only business intent: integration key, operation, payload, source module, business event, entity, actor, idempotency key. No URLs, credentials, retry or timeout logic is available to callers. |
| Centralised fallback governance | `decideFallback()` — pure, unit-tested | Reads `fallback_enabled`, `fallback_strategy`, `fallback_allowed_categories`, `fallback_approval_status` from the connection row. Callers may only *forbid* fallback, never grant it. |
| Provider decisions can never become fallback success | `BUSINESS_DECISION_CATEGORIES` (auth, authorization, validation, mapping, duplicate, compliance) | Test: "provider business decisions never fall back". An AML hit, sanctions match, declined payment or rejected signature reaches the flow as `success: false`, `executionMode: 'blocked'`. |
| Honest execution mode | `real` / `mock` / `fallback` / `blocked` on every result and every log row | `real` only when `integration_connections.provider_verified` is true; otherwise a working adapter against a controllable endpoint is labelled `mock`. |
| Fallback events + audit | `integration_record_fallback` RPC called for every non-success, with reason, category, correlation id, source entity, actor, and log row id | Blocked attempts are recorded too, so a refused fallback is auditable. |
| Recovery | First successful `real` call clears `fallback_since`, stamps `last_recovery_at` and resolves open fallback events, unless the connection's recovery policy is `manual` | `clearFallbackState()` |
| Log redaction | `supabase/functions/_shared/integration/redact.ts` | Logs store a *shape summary* only: sensitive keys → `[redacted]`, other scalars → type/length markers, depth 4 / 40 keys capped. Test asserts no PAN, password, national ID or base64 document content can reach a log row. |
| Idempotency key safety | `idempotencyFingerprint()` — SHA-256, 24 hex chars | Raw keys embed business identifiers, so only the stable fingerprint is persisted (`integration_logs.idempotency_fingerprint`). |
| Observability | `integration_logs` now carries `operation`, `execution_mode`, `fallback_reason`, `idempotency_fingerprint` alongside correlation id, byte sizes, retry attempt, error category, source module and business event | `logIntegration()` returns the row id so the governed mode can be stamped on the same row the provider attempt wrote. |

## Deliberate limits

- No business flow calls `invokeIntegration()` yet — rewiring registration/KYC, F&P AML + sanctions, payments, licence signing and registry publication is Group D. Until then every existing flow behaves exactly as before.
- Connections with `provider_verified = false` are **adapter verified, provider unverified**. They will not be reported as real-provider verified.

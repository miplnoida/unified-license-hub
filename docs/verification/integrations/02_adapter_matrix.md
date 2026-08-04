# ADM-INT-001 — Production Adapter Matrix (Group A, Phase 2)

Date: 2026-08-04
Code: `supabase/functions/_shared/connector/`
Tests: `supabase/functions/_shared/connector/connector_test.ts` — **12 passed, 0 failed**

## Framework

One execution path for every outbound call (`runtime.ts` → `executeConnector`):

```text
resolve connection (service-role RPC)
  -> enabled? endpoint? credential present?      -> fallback
  -> circuit breaker open + inside cool-off?     -> fallback
  -> adapter.buildRequest -> adapter.authenticate
  -> fetch with per-connection timeout + AbortController
  -> non-2xx: adapter.parseError -> category
       retryable? exponential backoff + full jitter, capped 60s, max retry_count+1
  -> 2xx: adapter.parseResponse (normalised shape, missing fields = mapping error)
  -> integration log row: correlation id, environment, request/response bytes,
     retry attempt, error category, source module, business event, idempotency key
  -> integration_record_outcome: health metrics + circuit state
```

`callIntegration()` in `index.ts` is the only entry point business modules use. They
never build provider requests, never read credentials, and never call `fetch` on a
provider.

**Fallback semantics.** `fallback: true` is returned for disabled / unconfigured /
circuit-open connections and for network, timeout and 5xx failures — the calling flow
runs its existing internal behaviour unchanged. Provider *rejections* (401/403/422 and
mapping failures) return `fallback: false` and must surface to the user; they are never
silently swallowed.

## Adapter matrix

| Adapter module | integration_key | Auth | Operations | Status |
|---|---|---|---|---|
| `government_registry.ts` | government_registry | API key header | verify_company, fetch_company, publish_licence, health | adapter verified, provider unverified |
| `aml_screening.ts` | aml_screening | Bearer | screen_individual, screen_entity, fetch_result, health | adapter verified, provider unverified |
| `sanctions_screening.ts` | sanctions_screening | Bearer | screen, fetch_result, health | adapter verified, provider unverified |
| `credit_bureau.ts` | credit_bureau | API key header | credit_report, score_only, health | adapter verified, provider unverified |
| `identity_verification.ts` | identity_verification | Bearer | verify_identity, verify_document, fetch_result, health | adapter verified, provider unverified |
| `payment_gateway.ts` | payment_gateway | Bearer | create_payment, capture_payment, fetch_payment, refund, health | adapter verified, provider unverified |
| `document_signing.ts` | document_signing | OAuth2 client-credentials + cached refresh | create_envelope, fetch_envelope, download_signed, void_envelope, health | adapter verified, provider unverified |
| `email_delivery.ts` | email_smtp | Bearer | send_email, fetch_status, health | real system (SMTP relay path already in production via the notification dispatcher) |
| `sms_provider.ts` | sms_provider | Bearer | send_sms, fetch_status, health | framework-ready, disabled until a provider is configured |
| `notification_provider.ts` | notification_provider | API key header | send_notification, fetch_status, health | adapter verified, provider unverified |
| `external_reporting.ts` | external_reporting | API key header | submit_return, submit_statistics, fetch_submission, health | adapter verified, provider unverified |
| `audit_export.ts` | audit_export | API key header | export_batch, fetch_batch, health | adapter verified, provider unverified |
| `generic_rest.ts` | platform_api, external_registry, ai_gateway | from connection auth_type | invoke, health | real systems (internally hosted) |

Each adapter is a standalone module implementing the same `ConnectorAdapter` contract,
so replacing a provider means editing one file — or, for endpoint/credential changes,
editing nothing at all.

## Test evidence

| Assertion | Result |
|---|---|
| Every registry adapter key resolves and declares a `health` operation | pass |
| Provider payload is normalised, not passed through raw | pass |
| Success writes a log row carrying correlation id, byte sizes, source module, retry attempt | pass |
| **Credential value never appears in the log row** | pass |
| 5xx retried exactly `retry_count + 1` times, then falls back | pass |
| 422 validation rejection: 1 attempt, no retry, no fallback, provider message preserved | pass |
| Payment adapter refuses to retry any provider rejection (incl. 429) | pass |
| Timeout categorised as `timeout` and allows fallback | pass |
| Disabled / no endpoint / no credential / open circuit short-circuit with **no provider call and no health mutation** | pass |
| Breaker admits traffic again after the cool-off window | pass |
| Credential resolved from the secret store by reference; missing reference yields none | pass |
| URL joining preserves base path segments and query params | pass |
| Backoff is exponential, jittered and capped at 60s | pass |

## Honest limits

- Ten of the thirteen adapters are proven against a stubbed provider, not a live one.
  They are **adapter verified, provider unverified** and will stay labelled that way in
  every report until sandbox credentials are supplied.
- No business flow calls these adapters yet — that is Group E. Nothing in the existing
  registration, F&P, payment, licensing or notification behaviour changed in this group.
- Retry here is in-request only. The durable retry queue and dead-letter queue are
  Group B.

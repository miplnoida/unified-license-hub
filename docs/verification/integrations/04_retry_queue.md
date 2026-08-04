# ADM-INT-001 — Durable retry queue (Group C)

Scope: items 10 and 11 of the Integration Manager brief. This report describes
what was built, what is proven by executable tests, and what is not yet true.

## Components

| Layer | Artefact |
| --- | --- |
| Schema | `public.integration_retry_queue`, `public.integration_dead_letter` |
| Enqueue | `public.integration_retry_enqueue(...)` |
| Claim | `public.integration_retry_claim(worker, batch, lease_seconds)` (`FOR UPDATE SKIP LOCKED`) |
| Outcome | `public.integration_retry_record_outcome(id, success, execution_mode, error_category, error_message)` |
| Operator | `public.integration_retry_now`, `public.integration_retry_cancel`, `public.integration_dead_letter_resolve` |
| Worker | `supabase/functions/integration-retry-worker/index.ts` (pg_cron, every minute) |
| Caller hook | `maybeEnqueueRetry()` inside `supabase/functions/_shared/integration/invoke.ts` |
| Admin UI | `src/components/settings/integrations/RetryQueuePanel.tsx` (tab on `/settings/integrations`) |

## Lifecycle

```text
queued ──claim──> processing ──failure(retryable, under cap)──> retry_scheduled ──> queued
                        │                                   
                        ├──success──> succeeded
                        ├──failure(cap exhausted / permanent)──> dead_letter ──> integration_dead_letter
                        └──operator──> cancelled
```

Backoff is exponential with jitter, capped per connection by
`integration_connections.max_retries + 1`. A lease that expires (worker died
mid-flight) is reclaimed by the next sweep rather than being stranded.

## Governance rules enforced in the queue, not in callers

1. **Business rejections are never enqueued.** `validation`, `auth`,
   `authorization`, `provider_business_rejection`, `decline`, `duplicate`,
   `compliance` and the adverse screening categories are refused by
   `integration_retry_enqueue` itself, so no caller can accidentally retry a
   provider decision until it flips.
2. **Idempotency identity is preserved.** The original idempotency key and its
   fingerprint travel with the queue row; the worker replays with the same key,
   so retries cannot create duplicate external records.
3. **Only the redacted request is stored.** The queue row holds the output of
   `redactPayload()` plus the list of redacted field names — never credentials,
   PAN, national IDs or KYC documents.
4. **Opt-in per call site.** `invokeIntegration({ retryQueue: true })`. Callers
   that must fail fast (interactive validation) stay unqueued.
5. **Operator actions are authorized and justified.** Retry Now / Cancel /
   Mark Resolved require the settings permission plus a justification string and
   write a `log_compliance_audit` row.

## Executable evidence

`deno test --allow-net --allow-env --allow-read supabase/functions/` — 9 passed, 0 failed.

`supabase/functions/tests/integration_retry_queue_test.ts` proves, against a stub
admin client:

| Test | Asserts |
| --- | --- |
| unregistered integration + retryQueue enqueues once with fingerprint | exactly one enqueue; original idempotency key forwarded; fingerprint present; stored payload contains no national ID; `nationalId` listed as redacted |
| no enqueue when the caller does not opt in | zero enqueue RPCs |
| unsupported operation is a validation rejection and is never enqueued | `errorCategory=validation`, `executionMode=blocked`, `retryQueueId=null`, zero enqueue RPCs |

`supabase/tests/integrations/400_retry_queue.sql` (pgTAP, 16 assertions) covers
the SQL side: enqueue refusal for `validation`/`compliance`, dedup by
fingerprint, attempt cap derivation, atomic claim, double-claim prevention,
stale-lease recovery, reschedule-with-backoff, dead-lettering at the cap, and
refusal of an unauthorized/unjustified manual retry.

## Honest limits

- The pgTAP file asserts behaviour but runs against the project database with
  the `postgres` role; the sandbox role used during development cannot execute
  the service-role-only queue functions, so those assertions were authored
  against the deployed schema and are gated in CI by file presence plus the
  existing pgTAP runner.
- No third-party provider credentials are configured for the sandbox
  integrations, so live drains in this environment resolve as
  `not_configured` → `fallback`. That is the honest execution mode, not
  external verification.

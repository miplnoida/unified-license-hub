# ADM-INT-001 — Dead-letter queue operations (Group C)

## What lands in the dead-letter queue

A queue item is dead-lettered when, and only when, it exhausts its per-connection
attempt cap (`integration_connections.max_retries + 1`) or the final attempt
returns a permanently non-retryable technical failure. Provider business
decisions never reach the queue at all (see `04_retry_queue.md`), so the DLQ is
strictly a list of *technical* failures a human must act on.

`public.integration_dead_letter` retains: integration key, operation, source
module, business event, source entity type/id, correlation id, idempotency key
and fingerprint, redacted request payload, redacted field list, attempt history,
last error category and message, `resolution_status`
(`open` / `retried` / `resolved` / `abandoned`), resolver, resolution note and
timestamps.

## Operator console

`/settings/integrations` → **Retry Queue** tab (`RetryQueuePanel.tsx`).

| Action | Backend | Guard |
| --- | --- | --- |
| View queue / DLQ with filters (status, integration, module) | table reads under RLS | settings read permission |
| Inspect redacted request + attempt history | table reads | settings read permission |
| Retry Now | `integration_retry_now(id, justification)` | settings edit permission + non-empty justification; **idempotency key unchanged** |
| Cancel | `integration_retry_cancel(id, justification)` | settings edit permission + justification |
| Mark Resolved / Abandoned | `integration_dead_letter_resolve(id, status, note)` | settings edit permission + note |
| Batch retry | repeated `integration_retry_now` with one shared justification | as above, per item |
| Export | client-side CSV of the redacted view | settings read permission |

Every operator action writes an immutable `public.log_compliance_audit` row with
actor, action, integration key, source entity, justification and timestamp.

## Deep links

Each row links to its source record (application / assessment / payment /
licence, by `source_entity_type` + `source_entity_id`), its integration
connection, its `integration_logs` entries by `correlation_id`, and its audit
trail.

## Recovery semantics

A retried DLQ item is re-enqueued with its **original** idempotency key and
fingerprint. Providers that honour idempotency therefore return the first
result instead of creating a second external record; providers that do not are
protected by the fingerprint dedup inside `integration_retry_enqueue`, which
reuses any still-open queue row rather than creating a parallel one.

`resolution_status` transitions are one-way out of `open`; a resolved item is
never silently re-opened by the worker.

## Honest limits

- Nothing in this layer makes an unconfigured provider real. DLQ rows produced
  in this environment carry `execution_mode = fallback` or `blocked` with
  `error_category = not_configured`, and the console displays that verbatim.
- Batch retry is sequential and bounded by the visible page; there is no
  unbounded "retry everything" action by design.

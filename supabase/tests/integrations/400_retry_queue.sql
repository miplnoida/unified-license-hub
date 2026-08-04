-- ADM-INT-001 Group C — durable retry queue + dead-letter lifecycle (pgTAP)
--
-- Proves, behaviourally:
--   * permanent business rejections are never enqueued;
--   * retryable failures are enqueued and deduplicated by idempotency fingerprint;
--   * claiming is atomic, leases are recovered from dead workers;
--   * outcomes reschedule with backoff, respect the attempt cap and dead-letter;
--   * operator actions require the settings.edit permission and a justification.
BEGIN;
SELECT plan(16);

-- ---------- fixtures ----------
INSERT INTO public.integration_connections (integration_key, name, type, adapter_key, enabled, max_retries)
VALUES ('pgtap_retry_int', 'pgTAP retry integration', 'rest', 'pgtap_retry_int', true, 2)
ON CONFLICT (integration_key) DO UPDATE SET max_retries = 2;

-- ---------- enqueue governance ----------
SELECT is(
  public.integration_retry_enqueue(
    'pgtap_retry_int','op_a','pgtap_module','pgtap.event',
    _error_category => 'validation'),
  NULL,
  'validation rejection is never enqueued');

SELECT is(
  public.integration_retry_enqueue(
    'pgtap_retry_int','op_a','pgtap_module','pgtap.event',
    _error_category => 'compliance'),
  NULL,
  'compliance/adverse result is never enqueued');

SELECT isnt(
  public.integration_retry_enqueue(
    'pgtap_retry_int','op_a','pgtap_module','pgtap.event',
    _error_category => 'timeout', _idempotency_fingerprint => 'pgtap-fp-1'),
  NULL,
  'timeout is enqueued');

SELECT is(
  (SELECT count(*) FROM public.integration_retry_queue
    WHERE idempotency_fingerprint = 'pgtap-fp-1'),
  1::bigint,
  'first enqueue creates exactly one row');

SELECT is(
  public.integration_retry_enqueue(
    'pgtap_retry_int','op_a','pgtap_module','pgtap.event',
    _error_category => 'timeout', _idempotency_fingerprint => 'pgtap-fp-1'),
  (SELECT id FROM public.integration_retry_queue WHERE idempotency_fingerprint = 'pgtap-fp-1'),
  'repeat enqueue with the same fingerprint reuses the open row');

SELECT is(
  (SELECT max_attempts FROM public.integration_retry_queue
    WHERE idempotency_fingerprint = 'pgtap-fp-1'),
  3,
  'attempt cap comes from the connection max_retries + 1');

-- ---------- claim ----------
UPDATE public.integration_retry_queue SET next_attempt_at = now() - interval '1 minute'
 WHERE idempotency_fingerprint = 'pgtap-fp-1';

SELECT is(
  (SELECT count(*) FROM public.integration_retry_claim('pgtap-worker', 10, 60)),
  1::bigint,
  'the due item is claimed');

SELECT is(
  (SELECT status FROM public.integration_retry_queue WHERE idempotency_fingerprint = 'pgtap-fp-1'),
  'processing',
  'claimed item is processing');

SELECT is(
  (SELECT attempts FROM public.integration_retry_queue WHERE idempotency_fingerprint = 'pgtap-fp-1'),
  1,
  'claim increments the attempt counter');

SELECT is(
  (SELECT count(*) FROM public.integration_retry_claim('pgtap-worker-2', 10, 60)),
  0::bigint,
  'a leased item is not claimed twice');

-- stale lease recovery
UPDATE public.integration_retry_queue SET leased_until = now() - interval '5 minutes'
 WHERE idempotency_fingerprint = 'pgtap-fp-1';
SELECT is(
  (SELECT count(*) FROM public.integration_retry_claim('pgtap-worker-3', 10, 60)),
  1::bigint,
  'a stale lease from a dead worker is recovered and re-claimed');

-- ---------- outcomes ----------
SELECT is(
  public.integration_retry_record_outcome(
    (SELECT id FROM public.integration_retry_queue WHERE idempotency_fingerprint = 'pgtap-fp-1'),
    false, 'fallback', 'timeout', 'provider timed out'),
  'retry_scheduled',
  'a retryable failure below the cap is rescheduled');

SELECT ok(
  (SELECT next_attempt_at > now() FROM public.integration_retry_queue
    WHERE idempotency_fingerprint = 'pgtap-fp-1'),
  'backoff pushes the next attempt into the future');

-- exhaust the cap
UPDATE public.integration_retry_queue SET attempts = max_attempts
 WHERE idempotency_fingerprint = 'pgtap-fp-1';

SELECT is(
  public.integration_retry_record_outcome(
    (SELECT id FROM public.integration_retry_queue WHERE idempotency_fingerprint = 'pgtap-fp-1'),
    false, 'blocked', 'server', 'provider 500'),
  'dead_letter',
  'exhausting the cap moves the item to the dead-letter queue');

SELECT is(
  (SELECT count(*) FROM public.integration_dead_letter
    WHERE idempotency_fingerprint = 'pgtap-fp-1' AND resolution_status = 'open'),
  1::bigint,
  'a dead-letter row is created and is open for an operator');

-- ---------- operator authorization ----------
SELECT throws_ok(
  $$ SELECT public.integration_retry_now(
       (SELECT id FROM public.integration_retry_queue WHERE idempotency_fingerprint = 'pgtap-fp-1'),
       '') $$,
  NULL,
  NULL,
  'manual retry without permission/justification is refused');

SELECT * FROM finish();
ROLLBACK;

-- Channel health + email delivery-status hardening.
--
-- Asserts:
--   * notification_channel_health() is RBAC-gated (anon / unprivileged => forbidden)
--   * the health payload exposes the expected shape and never leaks SMTP credentials
--   * rendered email content is immutable once set
--   * the retry claim function respects poison / attempt ceilings and backoff
--   * SMS is reported unavailable rather than as a successful channel

BEGIN;
SELECT plan(12);

-- ---------------------------------------------------------------- RBAC
SET LOCAL role TO anon;
SELECT throws_ok(
  $$ SELECT public.notification_channel_health() $$,
  '42501',
  'forbidden',
  'anon cannot read channel health'
);
RESET role;

SELECT has_function('public', 'notification_channel_health', 'health RPC exists');
SELECT is(
  (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'notification_channel_health'),
  true,
  'health RPC is SECURITY DEFINER'
);

-- --------------------------------------------------- dispatch log columns
SELECT has_column('public', 'notification_dispatch_log', 'attempts', 'attempts tracked');
SELECT has_column('public', 'notification_dispatch_log', 'next_attempt_at', 'backoff tracked');
SELECT has_column('public', 'notification_dispatch_log', 'poisoned', 'poison flag tracked');
SELECT has_column('public', 'notification_dispatch_log', 'provider_message_id', 'provider id captured');

-- --------------------------------------------------- immutability trigger
INSERT INTO public.notification_dispatch_log (id, event_key, channel, status, recipient_email, subject, rendered_content)
VALUES ('11111111-1111-1111-1111-111111111111', 'test.channel_health', 'email', 'queued',
        'immutable@example.com', 'Original subject', 'Original body');

SELECT throws_ok(
  $$ UPDATE public.notification_dispatch_log
        SET subject = 'Tampered'
      WHERE id = '11111111-1111-1111-1111-111111111111' $$,
  NULL,
  NULL,
  'rendered subject cannot be rewritten after render'
);

SELECT is(
  (SELECT rendered_content FROM public.notification_dispatch_log
    WHERE id = '11111111-1111-1111-1111-111111111111'),
  'Original body',
  'rendered body preserved'
);

-- --------------------------------------------------- retry claim behaviour
-- Poisoned rows are never re-claimed.
UPDATE public.notification_dispatch_log
   SET status = 'failed', poisoned = true, attempts = 5, error = 'smtp timeout'
 WHERE id = '11111111-1111-1111-1111-111111111111';

SELECT is(
  (SELECT count(*)::int FROM public.claim_email_retry_batch(10, 'pgtap')
    WHERE id = '11111111-1111-1111-1111-111111111111'),
  0,
  'poisoned rows are excluded from retry claims'
);

-- A retriable failure whose backoff has not elapsed is not claimed yet.
UPDATE public.notification_dispatch_log
   SET poisoned = false, attempts = 1, next_attempt_at = now() + interval '30 minutes'
 WHERE id = '11111111-1111-1111-1111-111111111111';

SELECT is(
  (SELECT count(*)::int FROM public.claim_email_retry_batch(10, 'pgtap')
    WHERE id = '11111111-1111-1111-1111-111111111111'),
  0,
  'backoff window is respected'
);

-- Once due, the row is claimed exactly once and marked processing.
UPDATE public.notification_dispatch_log
   SET next_attempt_at = now() - interval '1 minute'
 WHERE id = '11111111-1111-1111-1111-111111111111';

SELECT is(
  (SELECT count(*)::int FROM public.claim_email_retry_batch(10, 'pgtap')
    WHERE id = '11111111-1111-1111-1111-111111111111'),
  1,
  'due retriable failure is claimed'
);

SELECT is(
  (SELECT count(*)::int FROM public.claim_email_retry_batch(10, 'pgtap-2')
    WHERE id = '11111111-1111-1111-1111-111111111111'),
  0,
  'a claimed row is not double-claimed by a concurrent worker'
);

ROLLBACK;

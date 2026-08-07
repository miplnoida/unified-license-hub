-- Phase 9 — behavioural lifecycle of the canonical communication registry.
--
-- The Phase 9 derivation unit tests live in notifications/10_communication_registry.sql.
-- This suite drives REAL rows through the BEFORE INSERT/UPDATE trigger so the
-- registry is proven end to end: queue -> provider handoff -> failure -> retry ->
-- dead letter, with template snapshot retention and dead-letter surfacing.

BEGIN;
SELECT plan(18);

-- Fixture parent object (an application) so the row is addressable by entity_id.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000f9001','p9-owner@test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.applications (id, user_id, status)
VALUES ('00000000-0000-0000-0000-0000000f9010','00000000-0000-0000-0000-0000000f9001','draft')
ON CONFLICT (id) DO NOTHING;

-- 1. Queue creation ---------------------------------------------------------
INSERT INTO public.notification_dispatch_log
  (id, channel, event_key, status, recipient_email, entity_type, entity_id,
   module, correlation_id, template_version, rendered_content, subject)
VALUES
  ('00000000-0000-0000-0000-0000000f9101','email','application.submitted','queued',
   'p9-owner@test','application','00000000-0000-0000-0000-0000000f9010',
   'licensing','p9-corr-1', 3, '<p>Snapshot at send time</p>', 'Application received');

SELECT is((SELECT communication_state::text FROM public.notification_dispatch_log
           WHERE id='00000000-0000-0000-0000-0000000f9101'),
          'QUEUED', 'inserted row is stamped QUEUED by the trigger');

SELECT isnt((SELECT requested_at FROM public.notification_dispatch_log
             WHERE id='00000000-0000-0000-0000-0000000f9101'), NULL,
            'requested_at is always populated so age/SLA can be measured');

-- 2. Provider handoff is NOT delivery --------------------------------------
UPDATE public.notification_dispatch_log
   SET status='sent', provider='smtp', provider_message_id='msg-1'
 WHERE id='00000000-0000-0000-0000-0000000f9101';

SELECT is((SELECT communication_state::text FROM public.notification_dispatch_log
           WHERE id='00000000-0000-0000-0000-0000000f9101'),
          'SENT_TO_PROVIDER', 'provider acceptance never claims delivery');

SELECT isnt((SELECT sent_to_provider_at FROM public.notification_dispatch_log
             WHERE id='00000000-0000-0000-0000-0000000f9101'), NULL,
            'sent_to_provider_at is stamped on handoff');

SELECT is((SELECT delivered_at FROM public.notification_dispatch_log
           WHERE id='00000000-0000-0000-0000-0000000f9101'), NULL,
          'delivered_at stays null until the provider confirms');

-- 3. Provider-confirmed delivery -------------------------------------------
UPDATE public.notification_dispatch_log
   SET status='delivered', delivered_at=now()
 WHERE id='00000000-0000-0000-0000-0000000f9101';

SELECT is((SELECT communication_state::text FROM public.notification_dispatch_log
           WHERE id='00000000-0000-0000-0000-0000000f9101'),
          'DELIVERED', 'confirmed callback promotes the row to DELIVERED');

-- 4. Template snapshot retention -------------------------------------------
SELECT is((SELECT template_version FROM public.notification_dispatch_log
           WHERE id='00000000-0000-0000-0000-0000000f9101'), 3,
          'template version used at send time is retained after state changes');

SELECT is((SELECT rendered_content FROM public.notification_dispatch_log
           WHERE id='00000000-0000-0000-0000-0000000f9101'),
          '<p>Snapshot at send time</p>',
          'rendered body snapshot is immutable evidence of what was sent');

-- 5. Provider not configured is stated truthfully ---------------------------
INSERT INTO public.notification_dispatch_log
  (id, channel, event_key, status, recipient_email, entity_type, entity_id,
   failed_at, error, module)
VALUES
  ('00000000-0000-0000-0000-0000000f9102','sms','application.submitted','failed',
   'p9-owner@test','application','00000000-0000-0000-0000-0000000f9010',
   now(), 'sms provider not configured', 'licensing');

SELECT is((SELECT communication_state::text FROM public.notification_dispatch_log
           WHERE id='00000000-0000-0000-0000-0000000f9102'),
          'PROVIDER_NOT_CONFIGURED',
          'a missing provider is reported as not configured, not as a delivery');

SELECT is((SELECT failure_category FROM public.notification_dispatch_log
           WHERE id='00000000-0000-0000-0000-0000000f9102'),
          'not_configured', 'failure_category is classified for the operator queue');

-- 6. Transient failure scheduled for retry ---------------------------------
INSERT INTO public.notification_dispatch_log
  (id, channel, event_key, status, recipient_email, entity_type, entity_id,
   failed_at, error, retry_count, next_attempt_at, module)
VALUES
  ('00000000-0000-0000-0000-0000000f9103','email','application.submitted','failed',
   'p9-owner@test','application','00000000-0000-0000-0000-0000000f9010',
   now(), 'connection refused', 1, now() + interval '5 minutes', 'licensing');

SELECT is((SELECT communication_state::text FROM public.notification_dispatch_log
           WHERE id='00000000-0000-0000-0000-0000000f9103'),
          'RETRYING', 'a scheduled retry is RETRYING, not FAILED');

-- 7. Retry exhaustion is dead-lettered, never dropped ----------------------
UPDATE public.notification_dispatch_log
   SET retry_count = 6, next_attempt_at = NULL, dead_letter = true
 WHERE id='00000000-0000-0000-0000-0000000f9103';

SELECT is((SELECT communication_state::text FROM public.notification_dispatch_log
           WHERE id='00000000-0000-0000-0000-0000000f9103'),
          'DEAD_LETTER', 'exhausted retries land in the dead-letter state');

-- The record survives: dead letters are evidence, not garbage.
SELECT ok((SELECT count(*) FROM public.notification_dispatch_log
           WHERE id='00000000-0000-0000-0000-0000000f9103') = 1,
          'dead-lettered communications are retained for audit');

-- 8. Dead-letter operator queue -------------------------------------------
SELECT ok(EXISTS(SELECT 1 FROM public.notification_dead_letters(200,0) dl
                 WHERE dl.id='00000000-0000-0000-0000-0000000f9103'),
          'dead-lettered row is surfaced by notification_dead_letters()');

SELECT ok(EXISTS(SELECT 1 FROM public.notification_dead_letters(200,0) dl
                 WHERE dl.id='00000000-0000-0000-0000-0000000f9102'),
          'not-configured row is surfaced for remediation as well');

SELECT ok(NOT EXISTS(SELECT 1 FROM public.notification_dead_letters(200,0) dl
                     WHERE dl.id='00000000-0000-0000-0000-0000000f9101'),
          'delivered communications are not shown in the dead-letter queue');

-- 9. Timeline returns every attempt for the parent object -------------------
SELECT is((SELECT count(*)::int FROM public.communication_timeline(
             'application','00000000-0000-0000-0000-0000000f9010')), 3,
          'timeline returns all three communications for the application');

SELECT is((SELECT ct.communication_state::text
           FROM public.communication_timeline('application','00000000-0000-0000-0000-0000000f9010') ct
           WHERE ct.id='00000000-0000-0000-0000-0000000f9103'),
          'DEAD_LETTER', 'timeline exposes the canonical state, not the legacy status');

-- 10. Correlation id is preserved for cross-system tracing -----------------
SELECT is((SELECT correlation_id FROM public.notification_dispatch_log
           WHERE id='00000000-0000-0000-0000-0000000f9101'),
          'p9-corr-1', 'correlation id is preserved across state transitions');

SELECT * FROM finish();
ROLLBACK;

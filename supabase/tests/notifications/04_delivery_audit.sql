-- Phase 2 — delivery records and immutable audit events.
BEGIN;
SELECT plan(8);

-- delivery columns
SELECT has_column('public','notification_dispatch_log','notification_id','delivery links to notification');
SELECT has_column('public','notification_dispatch_log','provider','provider recorded');
SELECT has_column('public','notification_dispatch_log','delivered_at','delivered timestamp');
SELECT has_column('public','notification_dispatch_log','error_details','structured error details');

INSERT INTO public.notifications (id, user_id, title, message, type, channel, event_key, severity, category)
VALUES ('00000000-0000-0000-0000-0000000a0001','00000000-0000-0000-0000-0000000a0009',
        'Delivery test','Delivery test','info','in_app','phase2_delivery','medium','info');

-- delivery attempts are logged, including skips
SELECT ok(
  public.notification_record_delivery(
    _event_key := 'phase2_delivery',
    _channel := 'email',
    _status := 'sent',
    _notification_id := '00000000-0000-0000-0000-0000000a0001',
    _recipient_user_id := '00000000-0000-0000-0000-0000000a0009',
    _recipient_email := 'phase2@example.test',
    _provider := 'smtp',
    _subject := 'Delivery test'
  ) IS NOT NULL,
  'delivery attempt is recorded'
);

SELECT is(
  (SELECT count(*)::int FROM public.notification_dispatch_log
    WHERE notification_id = '00000000-0000-0000-0000-0000000a0001' AND status = 'sent' AND provider = 'smtp'),
  1,
  'delivery row carries channel, provider and status'
);

SELECT is(
  (SELECT count(*)::int FROM public.audit_logs
    WHERE entity_type = 'notification' AND action = 'NOTIFICATION_SENT'
      AND new_value->'notification_ids' @> '["00000000-0000-0000-0000-0000000a0001"]'::jsonb),
  1,
  'successful delivery produces a NOTIFICATION_SENT audit event'
);

-- dismissed notifications remain stored, and dismiss is audited
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a0009","role":"authenticated"}', true);

SELECT is(
  public.notification_dismiss(ARRAY['00000000-0000-0000-0000-0000000a0001']::uuid[], 'not relevant'),
  1,
  'dismiss RPC updates the recipient notification'
);
RESET ROLE;

SELECT ok(
  EXISTS (SELECT 1 FROM public.notifications
          WHERE id = '00000000-0000-0000-0000-0000000a0001'
            AND status = 'dismissed' AND dismissed_at IS NOT NULL)
  AND EXISTS (SELECT 1 FROM public.audit_logs
              WHERE entity_type = 'notification' AND action = 'NOTIFICATION_DISMISSED'
                AND entity_id = '00000000-0000-0000-0000-0000000a0001'),
  'dismissed notification remains stored and produces an audit record'
);

SELECT * FROM finish();
ROLLBACK;

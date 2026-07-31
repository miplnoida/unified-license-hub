-- Phase 2 — read / archive audit trail and audit action allow-list.
BEGIN;
SELECT plan(4);

INSERT INTO public.notifications (id, user_id, title, message, type, channel, event_key, severity, category)
VALUES ('00000000-0000-0000-0000-0000000a1001','00000000-0000-0000-0000-0000000a1009',
        'Read test','Read test','info','in_app','phase2_read','medium','info');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a1009","role":"authenticated"}', true);

SELECT is(
  public.notification_mark_read(ARRAY['00000000-0000-0000-0000-0000000a1001']::uuid[]),
  1,
  'mark-read updates the recipient notification'
);

SELECT ok(
  EXISTS (SELECT 1 FROM public.audit_logs
          WHERE entity_type = 'notification' AND action = 'NOTIFICATION_READ'
            AND entity_id = '00000000-0000-0000-0000-0000000a1001'),
  'read action produces an audit record'
);

SELECT is(
  public.notification_archive(ARRAY['00000000-0000-0000-0000-0000000a1001']::uuid[]),
  1,
  'archive RPC archives without deleting the record'
);
RESET ROLE;

SELECT throws_ok(
  $$ SELECT public.log_notification_audit('NOT_A_REAL_ACTION', ARRAY[]::uuid[]) $$,
  'P0001', NULL,
  'audit helper rejects actions outside the notification allow-list'
);

SELECT * FROM finish();
ROLLBACK;

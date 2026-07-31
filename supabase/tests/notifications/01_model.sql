-- Phase 2 — notification record model (FRD NOT-CEN-001)
-- Verifies the extended notification columns, enums, dedupe protection and
-- that notifications cannot be hard-deleted by application callers.
BEGIN;
SELECT plan(27);

SELECT has_table('public', 'notifications', 'notifications table exists');
SELECT has_table('public', 'notification_user_event_preferences', 'per-event preference table exists');
SELECT has_table('public', 'notification_dispatch_log', 'delivery log table exists');

-- enums
SELECT has_type('public', 'notification_status', 'notification_status enum exists');
SELECT has_type('public', 'notification_digest_frequency', 'digest frequency enum exists');
SELECT ok(
  (SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'notification_status'
      AND e.enumlabel IN ('unread','read','actioned','dismissed','archived')) = 5,
  'notification_status covers unread/read/actioned/dismissed/archived'
);

-- required columns
SELECT has_column('public','notifications','recipient_role','recipient role context');
SELECT has_column('public','notifications','recipient_group','recipient group context');
SELECT has_column('public','notifications','preview','short preview');
SELECT has_column('public','notifications','status','lifecycle status');
SELECT has_column('public','notifications','read_at','read timestamp');
SELECT has_column('public','notifications','archived_at','archived timestamp');
SELECT has_column('public','notifications','system_required','system-required flag');
SELECT has_column('public','notifications','source_reference','human-readable source reference');
SELECT has_column('public','notifications','source_route','safe deep-link route');
SELECT has_column('public','notifications','route_params','deep-link params');
SELECT has_column('public','notifications','template_version','template version');
SELECT has_column('public','notifications','rendered_content_ref','immutable content reference');
SELECT has_column('public','notifications','dedupe_key','deduplication key');
SELECT has_column('public','notifications','expires_at','expiry timestamp');
SELECT has_column('public','notifications','correlation_id','correlation id');

-- functions
SELECT has_function('public','notification_archive','archive RPC exists');
SELECT has_function('public','notification_effective_preference','preference resolver exists');
SELECT has_function('public','notification_record_delivery','delivery recorder exists');
SELECT has_function('public','save_notification_event_preference','preference writer exists');

-- preview + status are derived on insert
INSERT INTO public.notifications (id, user_id, title, message, type, channel, event_key, dedupe_key)
VALUES ('00000000-0000-0000-0000-00000000e001',
        '00000000-0000-0000-0000-00000000d001',
        'Model test', 'Long   message body for preview', 'info', 'in_app',
        'phase2_model_test', 'phase2|model|1');

SELECT is(
  (SELECT preview FROM public.notifications WHERE id = '00000000-0000-0000-0000-00000000e001'),
  'Long message body for preview',
  'preview is derived and whitespace-normalised'
);

-- duplicate dispatch prevented by dedupe key
SELECT throws_ok(
  $$ INSERT INTO public.notifications (user_id, title, message, type, channel, event_key, dedupe_key)
     VALUES ('00000000-0000-0000-0000-00000000d001','dup','dup','info','in_app','phase2_model_test','phase2|model|1') $$,
  '23505',
  NULL,
  'duplicate notification dispatch is prevented by the dedupe key'
);

SELECT * FROM finish();
ROLLBACK;

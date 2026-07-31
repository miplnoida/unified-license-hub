-- Phase 2 — notification RLS and field-level protection.
BEGIN;
SELECT plan(6);

-- Two recipients, one notification each.
INSERT INTO public.notifications (id, user_id, title, message, type, channel, event_key, severity, category)
VALUES
  ('00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-00000000c001','Mine','Mine','info','in_app','phase2_rls','high','alert'),
  ('00000000-0000-0000-0000-00000000f002','00000000-0000-0000-0000-00000000c002','Theirs','Theirs','info','in_app','phase2_rls','high','alert');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM public.notifications WHERE id = '00000000-0000-0000-0000-00000000f001'),
  1,
  'user can read their own notification'
);

SELECT is(
  (SELECT count(*)::int FROM public.notifications WHERE id = '00000000-0000-0000-0000-00000000f002'),
  0,
  'user cannot read another user''s notification'
);

-- permitted status transition
SELECT lives_ok(
  $$ UPDATE public.notifications SET read = true
     WHERE id = '00000000-0000-0000-0000-00000000f001' $$,
  'user may mark their own notification read'
);

-- protected fields
SELECT throws_ok(
  $$ UPDATE public.notifications SET severity = 'low'
     WHERE id = '00000000-0000-0000-0000-00000000f001' $$,
  'P0001',
  'notification_field_immutable',
  'user cannot change severity'
);

SELECT throws_ok(
  $$ UPDATE public.notifications SET message = 'tampered'
     WHERE id = '00000000-0000-0000-0000-00000000f001' $$,
  'P0001',
  'notification_field_immutable',
  'user cannot change notification content'
);

SELECT throws_ok(
  $$ DELETE FROM public.notifications WHERE id = '00000000-0000-0000-0000-00000000f001' $$,
  'P0001',
  'notifications_cannot_be_deleted',
  'user cannot hard-delete a notification'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;

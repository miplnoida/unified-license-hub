-- Escalation engine: RPCs + duplicate-active-kind guard.
BEGIN;
SELECT plan(3);

SELECT has_function('public','manual_escalate_complaint',
  ARRAY['uuid','text','text','text','text'],
  'manual_escalate_complaint exists');
SELECT has_function('public','dismiss_complaint_escalation', ARRAY['uuid','text'],
  'dismiss_complaint_escalation exists');

SELECT ok(
  EXISTS(SELECT 1 FROM pg_indexes
         WHERE indexname = 'uq_escalation_active_kind'),
  'unique-active-kind index exists'
);

SELECT * FROM finish();
ROLLBACK;

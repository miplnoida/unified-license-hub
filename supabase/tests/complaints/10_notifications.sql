BEGIN;
SELECT plan(3);
SELECT has_table('public','notification_outbox','outbox exists');
SELECT has_function('public','claim_notification_outbox', 'claim RPC exists');
SELECT has_function('public','reap_stuck_notification_outbox', 'reap RPC exists');
SELECT * FROM finish();
ROLLBACK;

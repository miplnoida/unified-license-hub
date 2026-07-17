BEGIN;
SELECT plan(1);
SELECT has_table('public','audit_logs','audit_logs exists');
SELECT * FROM finish();
ROLLBACK;

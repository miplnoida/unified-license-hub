BEGIN;
SELECT plan(2);
SELECT has_table('public', 'complaint_intake_rules', 'intake rules table exists');
SELECT has_column('public', 'complaint_intake_rules', 'rule_key', 'rule_key column exists');
SELECT * FROM finish();
ROLLBACK;

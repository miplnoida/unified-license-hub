BEGIN;
SELECT plan(2);
SELECT has_function('public','execute_complaint_workflow_action',
  'workflow action RPC exists');
SELECT has_function('public','get_complaint_tracking',
  'tracking RPC exists');
SELECT * FROM finish();
ROLLBACK;

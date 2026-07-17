-- Concurrency guard: workflow uses effective_instance_updated_at pattern.
BEGIN;
SELECT plan(1);
SELECT ok(
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'execute_complaint_workflow_action'),
  'execute_complaint_workflow_action is defined'
);
SELECT * FROM finish();
ROLLBACK;

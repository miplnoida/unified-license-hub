-- MC-03 / Market Conduct workflow convergence
-- Asserts the canonical complaint workflow definition, the retirement of the
-- historical 12-step workflow, and the governed workflow lifecycle contract.
BEGIN;
SELECT plan(22);

-- ---------------------------------------------------------------- definition
SELECT is(
  (SELECT count(*)::int FROM approval_workflows
    WHERE entity_type = 'complaint' AND is_active AND retired_at IS NULL),
  1,
  'exactly one active, non-retired complaint workflow exists'
);

SELECT is(
  (SELECT name FROM approval_workflows
    WHERE entity_type = 'complaint' AND is_active AND retired_at IS NULL),
  'Market Conduct — Consumer Complaint',
  'the active complaint workflow is the canonical Market Conduct workflow'
);

SELECT isnt(
  (SELECT current_published_version_id FROM approval_workflows
    WHERE name = 'Market Conduct — Consumer Complaint'),
  NULL,
  'canonical complaint workflow has a published version'
);

SELECT is(
  (SELECT count(*)::int FROM approval_steps s
    JOIN approval_workflows w ON w.id = s.workflow_id
    WHERE w.name = 'Market Conduct — Consumer Complaint'),
  8,
  'canonical workflow has exactly 8 business phases (no task-level steps)'
);

SELECT bag_eq(
  $$SELECT s.step_key FROM approval_steps s
      JOIN approval_workflows w ON w.id = s.workflow_id
     WHERE w.name = 'Market Conduct — Consumer Complaint'$$,
  $$VALUES ('mc_jurisdiction_assessment'),('mc_triage_review'),
           ('mc_investigation_setup'),('mc_investigation_casework'),
           ('mc_outcome_review'),('mc_closure_qa'),('mc_closed'),
           ('mc_referred_pending_outcome')$$,
  'phase keys match the canonical lifecycle'
);

SELECT is(
  (SELECT count(*)::int FROM approval_steps s
    JOIN approval_workflows w ON w.id = s.workflow_id
    WHERE w.name = 'Market Conduct — Consumer Complaint'
      AND s.approver_role_id IS NULL),
  0,
  'every phase has an approver role bound for routing'
);

-- --------------------------------------------------------------- retirement
SELECT isnt(
  (SELECT retired_at FROM approval_workflows WHERE name = 'Complaint Management Workflow'),
  NULL,
  'historical Complaint Management Workflow is retired'
);

SELECT is(
  (SELECT is_active FROM approval_workflows WHERE name = 'Complaint Management Workflow'),
  false,
  'retired workflow cannot be selected for new instances'
);

SELECT isnt(
  (SELECT retirement_reason FROM approval_workflows WHERE name = 'Complaint Management Workflow'),
  NULL,
  'retirement reason is recorded'
);

SELECT is(
  (SELECT count(*)::int FROM approval_steps s
    JOIN approval_workflows w ON w.id = s.workflow_id
    WHERE w.name = 'Complaint Management Workflow'),
  12,
  'retired workflow keeps its 12 historical steps unchanged'
);

SELECT ok(
  (SELECT count(*) FROM workflow_instances i
    JOIN approval_workflows w ON w.id = i.workflow_id
    WHERE w.name = 'Complaint Management Workflow') > 0,
  'historical instances of the retired workflow are preserved and readable'
);

-- ------------------------------------------------------- governed lifecycle
SELECT has_function('public', 'workflow_retire', ARRAY['uuid','text']);
SELECT has_function('public', 'workflow_hard_delete', ARRAY['uuid']);
SELECT is(
  (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='workflow_retire'),
  true,
  'workflow_retire is security definer'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.approval_workflows', 'DELETE'),
  'browser role cannot directly delete approval_workflows'
);

SELECT throws_ok(
  $$SELECT public.workflow_hard_delete(
      (SELECT id FROM approval_workflows WHERE name = 'Complaint Management Workflow'))$$,
  NULL,
  NULL,
  'hard delete of a workflow with history is rejected'
);

-- ------------------------------------------------- domain → workflow bridge
SELECT has_function('public', 'mc_complaint_workflow_sync', ARRAY['uuid','text']);
SELECT has_function('public', 'complaint_workflow_state', ARRAY['uuid']);
SELECT has_function('public', 'complaint_investigation_readiness', ARRAY['uuid']);

SELECT ok(
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'complaints' AND t.tgname LIKE 'mc_%_workflow') > 0,
  'complaint lifecycle trigger drives workflow progression server-side'
);

SELECT ok(
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'complaint_jurisdiction_assessments'
      AND t.tgname LIKE 'mc_%_workflow') > 0,
  'jurisdiction decision trigger drives workflow progression server-side'
);

SELECT ok(
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'complaint_investigation_plans'
      AND t.tgname LIKE 'mc_%_workflow') > 0,
  'plan approval trigger drives workflow progression server-side'
);

-- one canonical instance per complaint
SELECT is(
  (SELECT count(*)::int FROM (
     SELECT i.entity_id FROM workflow_instances i
       JOIN approval_workflows w ON w.id = i.workflow_id
      WHERE i.entity_type = 'complaint'
        AND w.name = 'Market Conduct — Consumer Complaint'
        AND i.status = 'active'
      GROUP BY i.entity_id HAVING count(*) > 1) dup),
  0,
  'no complaint holds two active canonical workflow instances'
);

SELECT finish();
ROLLBACK;

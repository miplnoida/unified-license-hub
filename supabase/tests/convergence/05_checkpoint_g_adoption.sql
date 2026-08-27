-- ============================================================
-- CHECKPOINT G — Module adoption of the canonical resolvers.
--
-- Proves that the active decision / work-allocation entrypoints in existing
-- modules consume the canonical gates, that adoption is compatibility-preserving
-- (OFF / no-rule = allow + REQUIRES_REVIEW), that ENFORCED denies, and that the
-- permanent governed-table privilege guardrail still holds.
-- ============================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(23);

-- ---------- G: gates exist with the canonical contract ----------
SELECT has_function('public', 'convergence_decision_gate',
  ARRAY['text','uuid','uuid','uuid','uuid','uuid','uuid','text'],
  'canonical decision-authority gate exists');
SELECT has_function('public', 'convergence_work_gate',
  ARRAY['text','uuid','uuid','uuid','text'],
  'canonical work-allocation gate exists');

SELECT ok((SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'convergence_decision_gate'),
          'decision gate is SECURITY DEFINER (observations are always recorded)');
SELECT ok((SELECT p.proconfig::text LIKE '%search_path%' FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'convergence_decision_gate'),
          'decision gate pins search_path');
SELECT ok((SELECT p.proconfig::text LIKE '%search_path%' FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'convergence_work_gate'),
          'work gate pins search_path');

SELECT ok(NOT has_function_privilege('anon',
            'public.convergence_decision_gate(text,uuid,uuid,uuid,uuid,uuid,uuid,text)', 'EXECUTE'),
          'anon cannot execute the decision gate');
SELECT ok(NOT has_function_privilege('anon',
            'public.convergence_work_gate(text,uuid,uuid,uuid,text)', 'EXECUTE'),
          'anon cannot execute the work gate');
SELECT ok(has_function_privilege('authenticated',
            'public.convergence_decision_gate(text,uuid,uuid,uuid,uuid,uuid,uuid,text)', 'EXECUTE'),
          'signed-in staff paths can execute the decision gate');
SELECT ok(has_function_privilege('authenticated',
            'public.convergence_work_gate(text,uuid,uuid,uuid,text)', 'EXECUTE'),
          'signed-in staff paths can execute the work gate');

-- ---------- G: adoption of the gates by existing module entrypoints ----------
CREATE TEMP TABLE adopted_targets(sig text, gate text) ON COMMIT DROP;
INSERT INTO adopted_targets(sig, gate) VALUES
  ('public.assign_complaint(uuid,uuid,timestamp with time zone)', 'convergence_work_gate'),
  ('public.assign_complaint(uuid,uuid,text,text)',                'convergence_work_gate'),
  ('public.conduct_attention_assign(uuid,uuid,uuid,date,text)',   'convergence_work_gate'),
  ('public.fp_appeal_decide(uuid,text,text)',                     'convergence_decision_gate'),
  ('public.compliance_return_review_decision(uuid,text,text)',    'convergence_decision_gate'),
  ('public.issue_decision_artifact(uuid,text,text,jsonb,text,uuid,text,text,jsonb,uuid,date,date)',
                                                                  'convergence_decision_gate');

SELECT is(
  (SELECT count(*)::int FROM adopted_targets t
     WHERE position(t.gate IN pg_get_functiondef(t.sig::regprocedure)) = 0),
  0,
  'ADOPTION: every targeted module entrypoint consumes its canonical gate');

SELECT is((SELECT count(*)::int FROM adopted_targets), 6,
  'ADOPTION: six active decision/work entrypoints are migrated in this pass');

-- Adoption must not have widened access to the adopted entrypoints.
SELECT is(
  (SELECT count(*)::int FROM adopted_targets t
     WHERE has_function_privilege('anon', t.sig, 'EXECUTE')),
  0,
  'ADOPTION: no adopted entrypoint became anon-executable');

-- Existing validations preserved: permission checks still present in bodies.
SELECT ok(position('has_complaint_perm' IN pg_get_functiondef('public.assign_complaint(uuid,uuid,text,text)'::regprocedure)) > 0,
          'COMPATIBILITY: complaint assignment keeps its existing RBAC check');
SELECT ok(position('enforce_permission' IN pg_get_functiondef('public.fp_appeal_decide(uuid,text,text)'::regprocedure)) > 0,
          'COMPATIBILITY: F&P appeal decision keeps its existing RBAC check');
SELECT ok(position('rationale' IN pg_get_functiondef('public.fp_appeal_decide(uuid,text,text)'::regprocedure)) > 0,
          'COMPATIBILITY: F&P appeal decision keeps its rationale validation');

-- ---------- G: resolver semantics relied on by adoption ----------
-- No configured rule = allow, flagged REQUIRES_REVIEW (no behaviour change).
SELECT is(
  (public.resolve_decision_authority(NULL, 'CONVERGENCE_G_UNCONFIGURED', NULL, NULL, NULL,
                                     NULL, NULL, NULL, 'cert-g', false) ->> 'allowed')::boolean,
  true,
  'SEMANTICS: unconfigured decision type does not block (compatibility preserved)');

SELECT ok(
  (public.resolve_decision_authority(NULL, 'CONVERGENCE_G_UNCONFIGURED', NULL, NULL, NULL,
                                     NULL, NULL, NULL, 'cert-g', false) -> 'reasons')::text
    LIKE '%REQUIRES_REVIEW%',
  'SEMANTICS: unconfigured decision type is flagged REQUIRES_REVIEW for H review');

-- OBSERVE_ONLY: records would_allow = false but still allows.
INSERT INTO public.decision_authority_rules(
  decision_type, required_module_key, required_permission_key, enforcement_mode, status,
  effective_from, notes)
VALUES ('CONVERGENCE_G_OBSERVE', 'fit_and_proper', 'approve', 'OBSERVE_ONLY', 'active', now(), 'cert-g');

SELECT is(
  (public.resolve_decision_authority(NULL, 'CONVERGENCE_G_OBSERVE', NULL, NULL, NULL,
                                     NULL, NULL, NULL, 'cert-g', false) ->> 'allowed')::boolean,
  true,
  'SEMANTICS: OBSERVE_ONLY never blocks the adopted path');
SELECT is(
  (public.resolve_decision_authority(NULL, 'CONVERGENCE_G_OBSERVE', NULL, NULL, NULL,
                                     NULL, NULL, NULL, 'cert-g', false) ->> 'would_allow')::boolean,
  false,
  'SEMANTICS: OBSERVE_ONLY still evaluates the actor and reports would_allow');

-- ENFORCED: denies an actor that cannot satisfy the rule.
INSERT INTO public.decision_authority_rules(
  decision_type, required_module_key, required_permission_key, enforcement_mode, status,
  effective_from, notes)
VALUES ('CONVERGENCE_G_ENFORCED', 'fit_and_proper', 'approve', 'ENFORCED', 'active', now(), 'cert-g');

SELECT is(
  (public.resolve_decision_authority(NULL, 'CONVERGENCE_G_ENFORCED', NULL, NULL, NULL,
                                     NULL, NULL, NULL, 'cert-g', false) ->> 'allowed')::boolean,
  false,
  'SEMANTICS: ENFORCED denies an actor without the required authority');

-- Observations are recorded when the gate asks for evidence.
SELECT lives_ok(
  $$SELECT public.resolve_decision_authority(NULL, 'CONVERGENCE_G_OBSERVE', NULL, NULL, NULL,
                                             NULL, NULL, NULL, 'cert-g-evidence', true)$$,
  'EVIDENCE: recording an observation succeeds from the adopted path');
SELECT ok(
  EXISTS (SELECT 1 FROM public.decision_authority_observations
           WHERE subject_reference = 'cert-g-evidence'
             AND decision_type = 'CONVERGENCE_G_OBSERVE'),
  'EVIDENCE: adopted decision attempts leave an append-only observation record');

-- ---------- Permanent guardrail (carried forward from C–F) ----------
SELECT is(
  (SELECT count(*)::int FROM (VALUES
      ('regulator_operating_scopes'),('decision_authority_rules'),('decision_authority_observations'),
      ('work_allocation_policies'),('regulatory_service_tasks'),('service_providers'),
      ('service_provider_members'),('provider_engagements'),('provider_work_packages'),
      ('provider_work_package_events')) AS g(name)
     WHERE has_table_privilege('anon', 'public.' || g.name, 'INSERT')
        OR has_table_privilege('anon', 'public.' || g.name, 'UPDATE')
        OR has_table_privilege('anon', 'public.' || g.name, 'DELETE')
        OR has_table_privilege('authenticated', 'public.' || g.name, 'INSERT')
        OR has_table_privilege('authenticated', 'public.' || g.name, 'UPDATE')
        OR has_table_privilege('authenticated', 'public.' || g.name, 'DELETE')),
  0,
  'GUARDRAIL: governed convergence tables still deny all direct anon/authenticated DML');

SELECT * FROM finish();
ROLLBACK;

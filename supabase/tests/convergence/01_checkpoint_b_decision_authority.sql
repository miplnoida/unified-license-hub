-- Checkpoint B — Generic regulatory authority & decision authority.
-- Positive + negative certification. Requires the privileged certification runner
-- (seeds configuration rows directly, then rolls back).
BEGIN;
SELECT plan(9);

-- Structure: operating scope must stay deployment-agnostic.
SELECT is(
  (SELECT count(*)::int FROM information_schema.columns
    WHERE table_schema='public' AND table_name='regulator_operating_scopes'
      AND column_name ~ 'island|country|department|committee_name'), 0,
  'operating scope carries no deployment-specific columns');

SELECT ok(
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='regulator_operating_scopes'
      AND column_name IN ('parent_scope_id','effective_from','effective_to')) = 3,
  'operating scope is hierarchical and effective-dated');

-- Resolver must not be reachable anonymously.
SELECT ok(
  NOT has_function_privilege('anon',
    'public.resolve_decision_authority(uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,boolean)', 'execute'),
  'decision authority resolver is not anonymous-executable');

DO $$
DECLARE
  _reg uuid; _fn uuid; _rule uuid; _res jsonb; _staff uuid;
BEGIN
  SELECT id INTO _reg FROM public.regulators LIMIT 1;
  SELECT id INTO _fn FROM public.regulatory_functions LIMIT 1;
  SELECT ur.user_id INTO _staff FROM public.user_roles ur
   WHERE public.is_internal_staff(ur.user_id)
     AND NOT public.has_permission(ur.user_id, '_pgtap_absent_module', 'approve')
   LIMIT 1;

  -- Unconfigured decision types preserve existing behaviour and flag review.
  _res := public.resolve_decision_authority(_staff, '_pgtap_unconfigured', _reg, _fn);
  PERFORM ok((_res->>'allowed')::boolean AND (_res->>'requires_review')::boolean
             AND _res->>'mode' = 'OFF',
    'unconfigured decision type preserves behaviour and is flagged REQUIRES_REVIEW');

  PERFORM ok(EXISTS (SELECT 1 FROM public.decision_authority_observations
                      WHERE decision_type='_pgtap_unconfigured' AND actor_id=_staff),
    'every authority evaluation is recorded in the observation register');

  -- OBSERVE_ONLY records the would-be denial without blocking.
  INSERT INTO public.decision_authority_rules(regulator_id, regulatory_function_id,
      decision_type, required_module_key, required_permission_key, enforcement_mode)
  VALUES (_reg, _fn, '_pgtap_decision', '_pgtap_absent_module', 'approve', 'OBSERVE_ONLY')
  RETURNING id INTO _rule;

  _res := public.resolve_decision_authority(_staff, '_pgtap_decision', _reg, _fn);
  PERFORM ok((_res->>'allowed')::boolean AND NOT (_res->>'would_allow')::boolean,
    'OBSERVE_ONLY observes the denial but does not change behaviour');

  -- ENFORCED denies the same actor.
  UPDATE public.decision_authority_rules SET enforcement_mode='ENFORCED' WHERE id=_rule;
  _res := public.resolve_decision_authority(_staff, '_pgtap_decision', _reg, _fn);
  PERFORM ok(NOT (_res->>'allowed')::boolean
             AND _res->'reasons' @> '["missing_permission:_pgtap_absent_module.approve"]',
    'ENFORCED mode denies an actor without the required permission');

  -- Non-staff identity can never hold decision authority.
  _res := public.resolve_decision_authority('00000000-0000-0000-0000-0000000000ff',
                                            '_pgtap_decision', _reg, _fn);
  PERFORM ok(NOT (_res->>'allowed')::boolean
             AND _res->'reasons' @> '["actor_not_internal_staff"]',
    'non-staff identity is denied decision authority');

  -- Authority configuration must never manufacture an RBAC permission.
  PERFORM ok(NOT public.has_permission(_staff, '_pgtap_absent_module', 'approve'),
    'decision authority rules never widen RBAC');
END$$;

SELECT * FROM finish();
ROLLBACK;

-- Checkpoint C — Small-regulator work model (allocation policy + coverage).
-- Requires the privileged certification runner. All fixtures roll back.
BEGIN;
SELECT plan(9);

SELECT ok(
  NOT has_function_privilege('anon',
    'public.work_allocation_can_take(uuid,uuid,uuid,uuid,uuid,uuid,uuid)', 'execute')
  AND NOT has_function_privilege('anon',
    'public.resolve_work_allocation_policy(uuid,uuid,uuid,uuid,uuid)', 'execute'),
  'work allocation resolvers are not anonymous-executable');

DO $$
DECLARE
  _reg uuid; _fn uuid; _officer uuid; _team uuid; _ent uuid; _res jsonb; _pol jsonb;
BEGIN
  SELECT id INTO _reg FROM public.regulators LIMIT 1;
  SELECT id INTO _fn FROM public.regulatory_functions LIMIT 1;
  SELECT ur.user_id INTO _officer FROM public.user_roles ur
   WHERE public.is_internal_staff(ur.user_id) LIMIT 1;
  -- An entity the officer does not already supervise, so REQUIRED can be proven.
  SELECT l.id INTO _ent FROM public.licensees l
   WHERE NOT EXISTS (SELECT 1 FROM public.entity_supervision_assignments a
                      WHERE a.entity_id = l.id AND a.status = 'active'
                        AND (a.lead_supervisor_user_id = _officer
                             OR a.alternate_supervisor_user_id = _officer))
   LIMIT 1;

  -- Unconfigured deployments keep today's behaviour.
  _pol := public.resolve_work_allocation_policy(_reg, _fn);
  PERFORM ok(_pol->>'source' = 'default'
             AND _pol->>'allocation_mode' = 'HYBRID'
             AND _pol->>'routing_mode' = 'MANUAL',
    'no configured policy preserves current manual/hybrid behaviour');
  PERFORM ok((_pol->>'allow_multi_function_officers')::boolean,
    'one officer may hold multiple regulatory functions by default');

  INSERT INTO public.regulatory_teams(regulator_id, regulatory_function_id, code, name, team_type, status)
    VALUES (_reg, _fn, '_PGTAP_POOL', 'pgTAP pool team', 'permanent', 'active')
    RETURNING id INTO _team;
  INSERT INTO public.regulatory_team_members(team_id, user_id, member_role, status)
    VALUES (_team, _officer, 'member', 'active');

  -- TEAM_POOL: pooled work needs team coverage only, not a named assignment.
  INSERT INTO public.work_allocation_policies(regulator_id, regulatory_function_id,
      allocation_mode, named_relationship_policy, routing_mode)
    VALUES (_reg, _fn, 'TEAM_POOL', 'OPTIONAL', 'CLAIM_FROM_POOL');
  _res := public.work_allocation_can_take(_officer, _reg, _fn);
  PERFORM ok((_res->>'can_take')::boolean AND (_res->>'team_coverage')::boolean,
    'TEAM_POOL: team member can take pooled work without a named assignment');
  PERFORM is(_res->>'routing_mode', 'CLAIM_FROM_POOL',
    'configured routing mode is returned to the caller');

  -- Negative: identity that is not internal staff.
  _res := public.work_allocation_can_take('00000000-0000-0000-0000-0000000000ff', _reg, _fn);
  PERFORM ok(NOT (_res->>'can_take')::boolean
             AND _res->'reasons' @> '["actor_not_internal_staff"]',
    'non-staff identity cannot take regulatory work');

  -- NAMED_ENTITY + REQUIRED: team coverage alone is not enough.
  UPDATE public.work_allocation_policies
     SET allocation_mode = 'NAMED_ENTITY', named_relationship_policy = 'REQUIRED'
   WHERE regulator_id = _reg AND regulatory_function_id = _fn;
  _res := public.work_allocation_can_take(_officer, _reg, _fn, _ent);
  PERFORM ok(NOT (_res->>'can_take')::boolean
             AND _res->'reasons' @> '["named_relationship_required"]',
    'REQUIRED named relationship blocks a non-owner despite team coverage');

  -- The canonical named register still governs ownership.
  INSERT INTO public.entity_supervision_assignments(entity_id, regulator_id,
      regulatory_function_id, team_id, lead_supervisor_user_id, status, is_primary, assignment_reason)
    VALUES (_ent, _reg, _fn, _team, _officer, 'active', true, 'pgTAP fixture');
  _res := public.work_allocation_can_take(_officer, _reg, _fn, _ent);
  PERFORM ok((_res->>'can_take')::boolean AND (_res->>'named_owner')::boolean,
    'named supervisor can take work for their own entity');

  -- Coverage is never authority.
  PERFORM is(_res->>'note', 'coverage only — not a permission or decision authority',
    'coverage result explicitly disclaims permission/decision authority');
END$$;

SELECT * FROM finish();
ROLLBACK;

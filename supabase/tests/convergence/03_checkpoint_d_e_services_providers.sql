-- Checkpoint D — Regulatory service + task execution model
-- Checkpoint E — External service provider security context
-- Requires the privileged certification runner. All fixtures roll back.
BEGIN;
SELECT plan(19);

-- Grant invariants: no direct DML from the browser on any convergence table.
SELECT ok(
  NOT has_table_privilege('anon', 'public.' || tbl, 'SELECT')
  AND has_table_privilege('authenticated', 'public.' || tbl, 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.' || tbl, 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.' || tbl, 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.' || tbl, 'DELETE'),
  tbl || ': read-only for signed-in users, no anonymous access')
FROM (VALUES
  ('regulator_operating_scopes'), ('decision_authority_rules'),
  ('decision_authority_observations'), ('work_allocation_policies'),
  ('regulatory_service_tasks'), ('service_providers'),
  ('service_provider_members'), ('provider_engagements'),
  ('provider_work_packages'), ('provider_work_package_events')
) AS t(tbl);

SELECT ok(
  NOT has_function_privilege('anon',
    'public.provider_work_package_transition(uuid,text,text,jsonb)', 'execute')
  AND NOT has_function_privilege('anon',
    'public.provider_can_access_work_package(uuid,uuid)', 'execute')
  AND NOT has_function_privilege('anon',
    'public.regulatory_service_task_execution(uuid)', 'execute'),
  'provider RPCs and resolvers are not anonymous-executable');

DO $$
DECLARE
  _svc uuid; _task uuid; _itask uuid; _prov uuid; _mem uuid; _eng uuid; _wp uuid;
  _ex jsonb; _res jsonb; _blocked boolean;
  _provider_user uuid := '00000000-0000-0000-0000-00000000aa01';
  _stranger uuid := '00000000-0000-0000-0000-0000000000ff';
BEGIN
  SELECT id INTO _svc FROM public.services LIMIT 1;

  INSERT INTO public.regulatory_service_tasks(service_id, code, name,
      execution_mode, requires_internal_acceptance, permitted_data)
    VALUES (_svc, '_PGTAP_EXT', 'pgTAP external task',
      'EXTERNAL_TASK_WITH_INTERNAL_ACCEPTANCE', true, '["financials"]')
    RETURNING id INTO _task;
  INSERT INTO public.regulatory_service_tasks(service_id, code, name, execution_mode)
    VALUES (_svc, '_PGTAP_INT', 'pgTAP internal task', 'INTERNAL_ONLY')
    RETURNING id INTO _itask;

  -- D: execution mode governs who works, never who decides.
  _ex := public.regulatory_service_task_execution(_task);
  PERFORM ok((_ex->>'may_be_outsourced')::boolean
             AND (_ex->>'requires_internal_acceptance')::boolean
             AND NOT (_ex->>'confers_decision_authority')::boolean,
    'external task is outsourceable, needs internal acceptance, confers no authority');

  _ex := public.regulatory_service_task_execution(_itask);
  PERFORM ok(NOT (_ex->>'may_be_outsourced')::boolean,
    'INTERNAL_ONLY task cannot be outsourced');

  _ex := public.regulatory_service_task_execution(gen_random_uuid());
  PERFORM ok(_ex->>'execution_mode' = 'INTERNAL_ONLY'
             AND NOT (_ex->>'may_be_outsourced')::boolean,
    'unconfigured task defaults to internal-only (existing behaviour preserved)');

  _blocked := false;
  BEGIN
    INSERT INTO public.regulatory_service_tasks(service_id, code, name,
        execution_mode, requires_internal_acceptance)
      VALUES (_svc, '_PGTAP_BAD', 'bad', 'CO_SOURCED', false);
  EXCEPTION WHEN check_violation THEN _blocked := true;
  END;
  PERFORM ok(_blocked, 'externally executable task cannot waive internal acceptance');

  -- E: provider fixtures.
  INSERT INTO public.service_providers(code, name, status)
    VALUES ('_PGTAP_PROV', 'pgTAP provider', 'active') RETURNING id INTO _prov;
  INSERT INTO public.service_provider_members(provider_id, user_id, member_role, status)
    VALUES (_prov, _provider_user, 'specialist', 'active') RETURNING id INTO _mem;
  INSERT INTO public.provider_engagements(provider_id, reference, nda_confirmed, status)
    VALUES (_prov, '_PGTAP_ENG', true, 'active') RETURNING id INTO _eng;
  INSERT INTO public.provider_work_packages(engagement_id, service_task_id, reference,
      subject_module, assigned_member_id, state, permitted_data)
    VALUES (_eng, _task, '_PGTAP_WP', 'applications', _mem, 'ASSIGNED', '["financials"]')
    RETURNING id INTO _wp;

  PERFORM ok(public.provider_can_access_work_package(_provider_user, _wp),
    'assigned provider member can access their own work package');
  PERFORM ok(NOT public.provider_can_access_work_package(_stranger, _wp),
    'unrelated identity cannot access a provider work package');

  UPDATE public.service_providers SET status = 'suspended' WHERE id = _prov;
  PERFORM ok(NOT public.provider_can_access_work_package(_provider_user, _wp),
    'suspending the provider organisation removes access');
  UPDATE public.service_providers SET status = 'active' WHERE id = _prov;

  UPDATE public.provider_engagements SET nda_confirmed = false WHERE id = _eng;
  PERFORM ok(NOT public.provider_can_access_work_package(_provider_user, _wp),
    'engagement without confirmed NDA has no access');
  UPDATE public.provider_engagements SET nda_confirmed = true WHERE id = _eng;

  UPDATE public.provider_engagements SET effective_to = now() - interval '1 day' WHERE id = _eng;
  PERFORM ok(NOT public.provider_can_access_work_package(_provider_user, _wp),
    'expired engagement has no access');
  UPDATE public.provider_engagements SET effective_to = NULL WHERE id = _eng;

  UPDATE public.provider_work_packages SET state = 'CLOSED' WHERE id = _wp;
  PERFORM ok(NOT public.provider_can_access_work_package(_provider_user, _wp),
    'closed work package is no longer visible to the provider');
  UPDATE public.provider_work_packages SET state = 'ASSIGNED' WHERE id = _wp;

  -- The state machine refuses actors with no engagement and no internal role.
  _res := public.provider_work_package_transition(_wp, 'submit', 'pgTAP');
  PERFORM is(_res->>'error', 'not_authorised',
    'actor without engagement or internal role cannot move a work package');
  PERFORM ok((SELECT state FROM public.provider_work_packages WHERE id = _wp) = 'ASSIGNED'
             AND NOT EXISTS (SELECT 1 FROM public.provider_work_package_events
                              WHERE work_package_id = _wp),
    'rejected transition changes no state and writes no event');

  PERFORM ok(NOT public.is_provider_member(_stranger)
             AND public.is_provider_member(_provider_user),
    'provider security context is distinct from staff and entity identities');
END$$;

SELECT * FROM finish();
ROLLBACK;

-- Capture REAL governed read-model payloads for the UI-METH frontend suite.
--
-- The UI tests must render what the server actually returns, not hand-written
-- literals. This script builds the same rolled-back regulator-scoped
-- configuration persona used by the METH-READ / PERSONA verifiers, calls every
-- read model as that signed-in persona, and prints one JSON document.
--
-- Run:
--   psql -qAt -f scripts/capture-methodology-read-model-fixtures.sql \
--     > src/test/fixtures/methodologyReadModels.json
--
-- The transaction always ROLLBACKs: no fixture regulator, role or assignment
-- survives, and no business record is created.

\set ON_ERROR_STOP on
\pset pager off
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.act_as(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE TEMP TABLE cap_actor(config_user uuid, regulator_id uuid);

DO $$
DECLARE _reg uuid; _mod uuid; _stReg uuid; _pView uuid; _pManage uuid; _role uuid; _u uuid;
BEGIN
  INSERT INTO public.regulators(name, code, status)
  VALUES ('ZZ FIXTURE CAPTURE Regulator','ZZCAPR','active') RETURNING id INTO _reg;
  SELECT id INTO _mod   FROM public.sec_modules WHERE key = 'aml_supervision';
  SELECT id INTO _stReg FROM public.sec_scope_types WHERE key = 'regulator';
  SELECT id INTO _pView   FROM public.sec_permissions WHERE module_id = _mod AND key = 'view';
  SELECT id INTO _pManage FROM public.sec_permissions WHERE module_id = _mod AND key = 'manage_config';

  SELECT u.id INTO _u FROM auth.users u
   WHERE NOT public.is_super_admin(u.id)
     AND NOT EXISTS (
       SELECT 1 FROM public.sec_user_roles ur
         JOIN public.sec_role_permissions rp ON rp.role_id = ur.role_id
         JOIN public.sec_permissions p ON p.id = rp.permission_id
         JOIN public.sec_modules m ON m.id = p.module_id
        WHERE ur.user_id = u.id AND m.key = 'aml_supervision')
   ORDER BY u.created_at, u.id LIMIT 1;

  INSERT INTO public.sec_roles(key,name,role_type,status)
  VALUES ('zz_capture_config','ZZ FIXTURE CAPTURE Configuration','internal','active') RETURNING id INTO _role;
  INSERT INTO public.sec_role_permissions(role_id, permission_id) VALUES (_role,_pView),(_role,_pManage);
  INSERT INTO public.sec_role_scopes(role_id, module_id, scope_type_id) VALUES (_role,_mod,_stReg);
  INSERT INTO public.sec_role_scope_values(role_scope_id, value_kind, value_id)
  SELECT rs.id,'regulator',_reg FROM public.sec_role_scopes rs
    JOIN public.sec_roles r ON r.id = rs.role_id WHERE r.key = 'zz_capture_config';
  INSERT INTO public.sec_user_roles(user_id, role_id, status) VALUES (_u,_role,'active');
  INSERT INTO cap_actor VALUES (_u,_reg);
END $$;

GRANT SELECT ON cap_actor TO authenticated;

SELECT jsonb_pretty(payload) FROM (
  WITH ids AS (
    SELECT
      (SELECT id FROM public.supervisory_methodology
        WHERE domain_code='AML_CFT' AND origin='MIPL_REFERENCE' AND status='DRAFT'
        ORDER BY version DESC LIMIT 1) AS ref,
      (SELECT id FROM public.supervisory_methodology
        WHERE domain_code='AML_CFT' AND status='ACTIVE'
        ORDER BY version DESC LIMIT 1) AS active
  ), act AS (SELECT pg_temp.act_as((SELECT config_user FROM cap_actor)) AS done)
  SELECT jsonb_build_object(
    'captured_at', now(),
    'methodology_id', (SELECT ref FROM ids),
    'baseline_id', (SELECT active FROM ids),
    'register', public.supervisory_methodology_register(NULL,NULL,NULL,NULL,NULL,NULL,NULL,'code','asc',25,0),
    'register_page2', public.supervisory_methodology_register(NULL,NULL,NULL,NULL,NULL,NULL,NULL,'code','asc',2,2),
    'register_options', public.supervisory_methodology_register_options(),
    'detail', public.supervisory_methodology_detail((SELECT ref FROM ids)),
    'dimensions', public.supervisory_methodology_dimension_list((SELECT ref FROM ids)),
    'questions', public.supervisory_methodology_question_register((SELECT ref FROM ids)),
    'question_detail', public.supervisory_methodology_question_detail(
      (SELECT q.id FROM public.supervisory_methodology_question q
        WHERE q.methodology_id=(SELECT ref FROM ids) AND q.question_code='IR-GEO-03' LIMIT 1)),
    'semantics', public.supervisory_methodology_semantic_register((SELECT ref FROM ids)),
    'facts', public.supervisory_methodology_fact_register((SELECT ref FROM ids)),
    'fact_detail', public.supervisory_methodology_fact_detail(
      (SELECT f.id FROM public.supervisory_methodology_fact_requirement f
        WHERE f.methodology_id=(SELECT ref FROM ids) ORDER BY f.fact_code LIMIT 1)),
    'parameters', public.supervisory_methodology_parameter_register((SELECT ref FROM ids)),
    'reference_decisions', public.supervisory_methodology_reference_decision_register((SELECT ref FROM ids)),
    'approvals', public.supervisory_methodology_approval_register((SELECT ref FROM ids)),
    'audit', public.supervisory_methodology_audit_register((SELECT ref FROM ids)),
    'compare', public.supervisory_methodology_compare((SELECT ref FROM ids), (SELECT active FROM ids)),
    'readiness', public.supervisory_methodology_review_readiness((SELECT ref FROM ids)),
    'capabilities', public.supervisory_methodology_action_capabilities((SELECT ref FROM ids)),
    'adoption_targets', public.supervisory_methodology_adoption_targets((SELECT ref FROM ids))
  ) AS payload FROM act
) s;

ROLLBACK;

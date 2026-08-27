-- ============================================================
-- CHECKPOINT G — Module adoption of the canonical resolvers.
--
-- Adoption is additive and compatibility-preserving:
--   * decision paths call the canonical decision-authority resolver, which
--     records an observation always and blocks only where an ENFORCED rule
--     denies the actor. Unconfigured deployments behave exactly as today.
--   * work-allocation paths call the canonical coverage resolver, which blocks
--     only where an active policy sets named_relationship_policy = 'REQUIRED'
--     and the actor is not covered. Everything else is observation only.
-- No RBAC, workflow or historic decision semantics are changed.
-- ============================================================

-- ---------- G1: canonical adoption gates ----------
CREATE OR REPLACE FUNCTION public.convergence_decision_gate(
  _decision_type text,
  _regulator_id uuid DEFAULT NULL,
  _regulatory_function_id uuid DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _sub_sector_id uuid DEFAULT NULL,
  _service_id uuid DEFAULT NULL,
  _subject_reference text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_res jsonb;
BEGIN
  v_res := public.resolve_decision_authority(
    auth.uid(), _decision_type, _regulator_id, _regulatory_function_id, _entity_id,
    _sector_id, _sub_sector_id, _service_id, _subject_reference, true);

  IF coalesce((v_res->>'mode'), 'OFF') = 'ENFORCED'
     AND coalesce((v_res->>'allowed')::boolean, true) IS FALSE THEN
    RAISE EXCEPTION 'decision authority denied for %: %', _decision_type, v_res->'reasons'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.convergence_work_gate(
  _module text,
  _regulator_id uuid DEFAULT NULL,
  _regulatory_function_id uuid DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _subject_reference text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_res jsonb;
  v_named text;
BEGIN
  v_res := public.work_allocation_can_take(
    v_uid, _regulator_id, _regulatory_function_id, _entity_id,
    NULL::uuid, NULL::uuid, NULL::uuid);

  SELECT wp.named_relationship_policy INTO v_named
    FROM public.work_allocation_policies wp
   WHERE wp.status = 'active'
     AND wp.effective_from <= now()
     AND (wp.effective_to IS NULL OR wp.effective_to > now())
     AND (wp.regulator_id IS NULL OR wp.regulator_id = _regulator_id)
     AND (wp.regulatory_function_id IS NULL OR wp.regulatory_function_id = _regulatory_function_id)
   ORDER BY (wp.regulatory_function_id IS NOT NULL)::int DESC,
            (wp.regulator_id IS NOT NULL)::int DESC,
            wp.effective_from DESC
   LIMIT 1;

  -- Observation is always recorded so adoption is auditable before enforcement.
  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'convergence.work_coverage_evaluated', _module,
          coalesce(_subject_reference, ''),
          jsonb_build_object('can_take', v_res->'can_take',
                             'named_relationship_policy', v_named,
                             'regulator_id', _regulator_id,
                             'entity_id', _entity_id,
                             'result', v_res));

  IF coalesce(v_named, 'OPTIONAL') = 'REQUIRED'
     AND coalesce((v_res->>'can_take')::boolean, true) IS FALSE THEN
    RAISE EXCEPTION 'work allocation denied for %: actor is not covered for this work', _module
      USING ERRCODE = '42501';
  END IF;

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.convergence_decision_gate(text,uuid,uuid,uuid,uuid,uuid,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.convergence_work_gate(text,uuid,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convergence_decision_gate(text,uuid,uuid,uuid,uuid,uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.convergence_work_gate(text,uuid,uuid,uuid,text) TO authenticated, service_role;

-- ---------- G2: adopt the gates in active module entrypoints ----------
-- Each target keeps its existing body verbatim; a single gate call is injected
-- immediately after the top-level BEGIN so behaviour is unchanged when nothing
-- is configured.
DO $adopt$
DECLARE
  t record;
  v_def text;
  v_new text;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('assign_complaint', 'uuid, uuid, timestamp with time zone',
       $inject$  PERFORM public.convergence_work_gate('complaint_management',
    (SELECT c.regulator_id FROM public.complaints c WHERE c.id = _id),
    NULL::uuid,
    (SELECT c.licensee_id FROM public.complaints c WHERE c.id = _id), _id::text);
$inject$),
      ('assign_complaint', 'uuid, uuid, text, text',
       $inject$  PERFORM public.convergence_work_gate('complaint_management',
    (SELECT c.regulator_id FROM public.complaints c WHERE c.id = _id),
    NULL::uuid,
    (SELECT c.licensee_id FROM public.complaints c WHERE c.id = _id), _id::text);
$inject$),
      ('conduct_attention_assign', 'uuid, uuid, uuid, date, text',
       $inject$  PERFORM public.convergence_work_gate('conduct_management',
    (SELECT a.regulator_id FROM public.conduct_attention_items a WHERE a.id = _id),
    NULL::uuid, NULL::uuid, _id::text);
$inject$),
      ('fp_appeal_decide', 'uuid, text, text',
       $inject$  PERFORM public.convergence_decision_gate('FP_APPEAL_DECISION',
    NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, _appeal_id::text);
$inject$),
      ('compliance_return_review_decision', 'uuid, text, text',
       $inject$  PERFORM public.convergence_decision_gate('RETURN_REVIEW_DECISION',
    NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, _return_id::text);
$inject$),
      ('issue_decision_artifact', 'uuid, text, text, jsonb, text, uuid, text, text, jsonb, uuid, date, date',
       $inject$  PERFORM public.convergence_decision_gate('LICENCE_DECISION_ARTEFACT',
    _issuing_regulator_id, NULL::uuid,
    (SELECT a.entity_id FROM public.applications a WHERE a.id = _application_id),
    NULL::uuid, NULL::uuid, NULL::uuid, _application_id::text);
$inject$)
    ) AS v(fn, args, inject)
  LOOP
    v_def := pg_get_functiondef(('public.' || t.fn || '(' || t.args || ')')::regprocedure);

    IF position('convergence_work_gate' in v_def) > 0
       OR position('convergence_decision_gate' in v_def) > 0 THEN
      CONTINUE; -- already adopted
    END IF;

    -- Inject after the FIRST top-level BEGIN only.
    v_new := regexp_replace(v_def, E'\\nBEGIN\\n', E'\nBEGIN\n' || t.inject, 'n');
    IF v_new = v_def THEN
      RAISE EXCEPTION 'adoption injection failed for %(%)', t.fn, t.args;
    END IF;
    EXECUTE v_new;
    RAISE NOTICE 'adopted canonical resolver in %(%)', t.fn, t.args;
  END LOOP;
END
$adopt$;
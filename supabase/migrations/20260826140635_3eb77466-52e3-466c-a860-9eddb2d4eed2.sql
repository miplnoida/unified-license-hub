-- =====================================================================
-- MC-08 (part 5) — institutional kill switch (global and per-module)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.ai_governance_kill_switches (
  scope_key       text PRIMARY KEY,                -- 'GLOBAL' or an owning module code
  scope_label     text NOT NULL,
  is_engaged      boolean NOT NULL DEFAULT false,
  engaged_at      timestamptz,
  engaged_by      uuid REFERENCES auth.users(id),
  engaged_reason  text,
  released_at     timestamptz,
  released_by     uuid REFERENCES auth.users(id),
  released_note   text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.ai_governance_kill_switches IS
 'Institutional AI stop control. When engaged, no AI assistance may be requested in scope. Regulatory records, deterministic rules and supervisory workflow are unaffected.';

GRANT SELECT ON public.ai_governance_kill_switches TO authenticated;
GRANT ALL ON public.ai_governance_kill_switches TO service_role;
ALTER TABLE public.ai_governance_kill_switches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_gov_kill_read ON public.ai_governance_kill_switches;
CREATE POLICY ai_gov_kill_read ON public.ai_governance_kill_switches
  FOR SELECT TO authenticated USING (public.ai_gov_can_read(auth.uid()));

INSERT INTO public.ai_governance_kill_switches (scope_key, scope_label)
VALUES ('GLOBAL', 'All AI assistance across the platform'),
       ('market_conduct', 'Market Conduct AI assistance')
ON CONFLICT (scope_key) DO NOTHING;

-- Engage / release, with mandatory reason and immediate effect.
CREATE OR REPLACE FUNCTION public.ai_governance_kill_switch_set(
  _scope_key text, _engage boolean, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _was boolean; _label text;
BEGIN
  _uid := public.ai_gov_require(ARRAY['approve']);
  IF COALESCE(btrim(COALESCE(_reason,'')),'') = '' THEN
    RAISE EXCEPTION 'reason_required: engaging or releasing the AI stop control requires a written reason'
      USING ERRCODE = '22023';
  END IF;

  SELECT is_engaged, scope_label INTO _was, _label
    FROM public.ai_governance_kill_switches WHERE scope_key = _scope_key FOR UPDATE;
  IF _label IS NULL THEN
    INSERT INTO public.ai_governance_kill_switches (scope_key, scope_label)
    VALUES (_scope_key, _scope_key) RETURNING is_engaged, scope_label INTO _was, _label;
  END IF;

  UPDATE public.ai_governance_kill_switches
     SET is_engaged = COALESCE(_engage, false),
         engaged_at = CASE WHEN _engage THEN now() ELSE engaged_at END,
         engaged_by = CASE WHEN _engage THEN _uid ELSE engaged_by END,
         engaged_reason = CASE WHEN _engage THEN btrim(_reason) ELSE engaged_reason END,
         released_at = CASE WHEN NOT _engage THEN now() ELSE NULL END,
         released_by = CASE WHEN NOT _engage THEN _uid ELSE NULL END,
         released_note = CASE WHEN NOT _engage THEN btrim(_reason) ELSE NULL END,
         updated_at = now()
   WHERE scope_key = _scope_key;

  PERFORM public.ai_gov_log_event('KILL_SWITCH', NULL, _scope_key,
    CASE WHEN _engage THEN 'KILL_SWITCH_ENGAGED' ELSE 'KILL_SWITCH_RELEASED' END,
    CASE WHEN _was THEN 'ENGAGED' ELSE 'RELEASED' END,
    CASE WHEN _engage THEN 'ENGAGED' ELSE 'RELEASED' END,
    _uid, _reason, jsonb_build_object('scope_label', _label));

  PERFORM public.log_compliance_audit_as_actor(_uid, 'OVERRIDE', 'ai_governance_kill_switch', NULL,
    jsonb_build_object('is_engaged', _was), jsonb_build_object('is_engaged', _engage, 'scope_key', _scope_key),
    _reason, NULL, NULL, NULL, jsonb_build_object('module','ai_management'));

  RETURN jsonb_build_object('scope_key', _scope_key, 'is_engaged', _engage,
    'effect', CASE WHEN _engage
      THEN 'AI assistance is stopped in this scope with immediate effect. Regulatory records, deterministic rules and supervisory workflow are unaffected.'
      ELSE 'AI assistance is available again in this scope.' END);
END $$;
REVOKE ALL ON FUNCTION public.ai_governance_kill_switch_set(text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_governance_kill_switch_set(text,boolean,text) TO authenticated, service_role;

-- Fold the stop control into the execution gate (checked before anything else).
CREATE OR REPLACE FUNCTION public.ai_gov_stop_active(_module text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_build_object('scope_key', scope_key, 'scope_label', scope_label,
                            'engaged_reason', engaged_reason, 'engaged_at', engaged_at)
    FROM public.ai_governance_kill_switches
   WHERE is_engaged AND scope_key IN ('GLOBAL', COALESCE(_module, '~none~'))
   ORDER BY (scope_key = 'GLOBAL') DESC
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.ai_governance_resolve_execution(
  _use_case_code text, _acting_user uuid, _requested_model text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uc public.conduct_ai_use_cases;
  _m  public.ai_governance_models;
  _i  public.ai_governance_instructions;
  _policy jsonb; _allowed_models text[]; _allowed_providers text[];
  _permitted boolean := false; _a text; _deny jsonb; _stop jsonb;
BEGIN
  _deny := jsonb_build_object('allowed', false);

  SELECT * INTO _uc FROM public.conduct_ai_use_cases WHERE code = _use_case_code;
  IF _uc.code IS NULL THEN
    RETURN _deny || jsonb_build_object('reason_code','USE_CASE_NOT_REGISTERED',
      'message','This AI capability is not registered in the AI use-case register.');
  END IF;

  -- 0. Institutional stop control overrides everything else.
  _stop := public.ai_gov_stop_active(_uc.owning_module);
  IF _stop IS NOT NULL THEN
    RETURN _deny || jsonb_build_object('reason_code','AI_STOPPED',
      'message','AI assistance has been stopped by the regulator. Regulatory records, deterministic rules and supervisory workflow remain fully available.',
      'stop_scope', _stop->>'scope_label', 'suspension_reason', _stop->>'engaged_reason');
  END IF;

  IF _uc.lifecycle_state = 'SUSPENDED' THEN
    RETURN _deny || jsonb_build_object('reason_code','USE_CASE_SUSPENDED',
      'message','AI assistance is currently suspended for this capability. The regulatory record and supervisory workflow remain available.',
      'suspension_reason', _uc.suspension_reason);
  END IF;
  IF _uc.lifecycle_state <> 'ACTIVE' OR _uc.is_enabled IS NOT TRUE THEN
    RETURN _deny || jsonb_build_object('reason_code','USE_CASE_NOT_APPROVED',
      'message','This AI capability is not approved for production use.',
      'lifecycle_state', _uc.lifecycle_state::text);
  END IF;
  IF _uc.effective_from IS NOT NULL AND _uc.effective_from > now() THEN
    RETURN _deny || jsonb_build_object('reason_code','USE_CASE_NOT_YET_EFFECTIVE',
      'message','This AI capability is not yet effective.');
  END IF;
  IF _uc.effective_to IS NOT NULL AND _uc.effective_to <= now() THEN
    RETURN _deny || jsonb_build_object('reason_code','USE_CASE_EXPIRED',
      'message','This AI capability is no longer effective.');
  END IF;
  IF _uc.workflow_mutation_allowed IS TRUE THEN
    RETURN _deny || jsonb_build_object('reason_code','MUTATION_POLICY_VIOLATION',
      'message','This capability is configured outside the advisory boundary and cannot execute.');
  END IF;

  IF _acting_user IS NULL THEN
    RETURN _deny || jsonb_build_object('reason_code','ROLE_NOT_PERMITTED','message','Authentication required.');
  END IF;
  IF public.is_super_admin(_acting_user) THEN
    _permitted := true;
  ELSE
    FOREACH _a IN ARRAY COALESCE(_uc.required_permission_actions, ARRAY['view']) LOOP
      IF public.has_permission(_acting_user, _uc.owning_module, _a) THEN _permitted := true; END IF;
    END LOOP;
  END IF;
  IF NOT _permitted THEN
    RETURN _deny || jsonb_build_object('reason_code','ROLE_NOT_PERMITTED',
      'message','Your role is not permitted to request this AI capability.');
  END IF;

  _policy := COALESCE(_uc.model_policy, '{}'::jsonb);
  SELECT COALESCE(array_agg(x), '{}') INTO _allowed_models
    FROM jsonb_array_elements_text(COALESCE(_policy->'allowed_models','[]'::jsonb)) x;
  SELECT COALESCE(array_agg(x), '{}') INTO _allowed_providers
    FROM jsonb_array_elements_text(COALESCE(_policy->'allowed_providers','[]'::jsonb)) x;

  IF _uc.approved_model_id IS NOT NULL THEN
    SELECT * INTO _m FROM public.ai_governance_models WHERE id = _uc.approved_model_id;
  ELSE
    SELECT * INTO _m FROM public.ai_governance_models
     WHERE technical_identifier = ANY(_allowed_models) AND provider = ANY(_allowed_providers)
     ORDER BY (lifecycle_state = 'ACTIVE') DESC, approved_at DESC NULLS LAST LIMIT 1;
  END IF;

  IF _m.id IS NULL THEN
    RETURN _deny || jsonb_build_object('reason_code','MODEL_NOT_APPROVED',
      'message','No approved AI model is registered for this capability.');
  END IF;
  IF _m.lifecycle_state = 'SUSPENDED' THEN
    RETURN _deny || jsonb_build_object('reason_code','MODEL_SUSPENDED',
      'message','AI assistance is currently suspended for this capability. The regulatory record and supervisory workflow remain available.',
      'suspension_reason', _m.suspension_reason);
  END IF;
  IF _m.lifecycle_state <> 'ACTIVE' THEN
    RETURN _deny || jsonb_build_object('reason_code','MODEL_NOT_APPROVED',
      'message','The AI model registered for this capability is not approved for production use.',
      'lifecycle_state', _m.lifecycle_state::text);
  END IF;
  IF array_length(_allowed_providers,1) IS NOT NULL AND NOT (_m.provider = ANY(_allowed_providers)) THEN
    RETURN _deny || jsonb_build_object('reason_code','PROVIDER_NOT_PERMITTED',
      'message','The registered provider is not permitted for this capability.');
  END IF;
  IF _requested_model IS NOT NULL AND _requested_model <> _m.technical_identifier THEN
    RETURN _deny || jsonb_build_object('reason_code','MODEL_NOT_PERMITTED',
      'message','The requested AI model is not the model approved for this capability.');
  END IF;

  IF _uc.approved_instruction_id IS NOT NULL THEN
    SELECT * INTO _i FROM public.ai_governance_instructions WHERE id = _uc.approved_instruction_id;
  ELSE
    SELECT * INTO _i FROM public.ai_governance_instructions
     WHERE template_code = _uc.prompt_template_code AND version = _uc.prompt_template_version LIMIT 1;
  END IF;

  IF _i.id IS NULL THEN
    RETURN _deny || jsonb_build_object('reason_code','INSTRUCTION_NOT_REGISTERED',
      'message','No governed instruction version is registered for this capability.');
  END IF;
  IF _i.lifecycle_state = 'SUSPENDED' THEN
    RETURN _deny || jsonb_build_object('reason_code','INSTRUCTION_SUSPENDED',
      'message','AI assistance is currently suspended for this capability. The regulatory record and supervisory workflow remain available.',
      'suspension_reason', _i.suspension_reason);
  END IF;
  IF _i.lifecycle_state <> 'ACTIVE' THEN
    RETURN _deny || jsonb_build_object('reason_code','INSTRUCTION_NOT_RELEASED',
      'message','The instruction version for this capability has not been released for production use.',
      'lifecycle_state', _i.lifecycle_state::text);
  END IF;

  RETURN jsonb_build_object(
    'allowed', true, 'reason_code', 'APPROVED',
    'use_case_code', _uc.code, 'use_case_version', _uc.use_case_version,
    'owning_module', _uc.owning_module, 'advisory_classification', _uc.advisory_classification,
    'human_review_required', _uc.human_review_required,
    'provider', _m.provider, 'model', _m.technical_identifier,
    'model_version', COALESCE(_m.model_version, _m.technical_identifier),
    'model_id', _m.id, 'model_display_name', _m.display_name,
    'instruction_id', _i.id, 'instruction_template_code', _i.template_code,
    'instruction_version', _i.version, 'instruction_body', _i.instruction_body,
    'required_caveats', _i.required_caveats, 'prohibited_behaviours', _i.prohibited_behaviours,
    'allowed_fact_scope', _i.allowed_fact_scope,
    'temperature_max', COALESCE((_policy->>'temperature_max')::numeric, 0.2),
    'external_data_allowed', COALESCE((_policy->>'external_data_allowed')::boolean, false),
    'limitation_policy', _uc.limitation_policy);
END $$;
REVOKE ALL ON FUNCTION public.ai_governance_resolve_execution(text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_governance_resolve_execution(text,uuid,text) TO authenticated, service_role;
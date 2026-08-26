-- =====================================================================
-- MC-08 (part 2) — governed AI operations: resolution, lifecycle,
-- suspension, assurance, exception + overview reads.
-- =====================================================================

-- Widen the MC-07.x read policies so AI governance and audit users can read
-- the canonical AI evidence without holding market-conduct supervision rights.
DROP POLICY IF EXISTS "Read conduct AI insights" ON public.conduct_ai_insights;
CREATE POLICY "Read conduct AI insights" ON public.conduct_ai_insights
  FOR SELECT TO authenticated USING (public.ai_gov_can_read(auth.uid()));
DROP POLICY IF EXISTS "Read conduct AI review history" ON public.conduct_ai_review_events;
CREATE POLICY "Read conduct AI review history" ON public.conduct_ai_review_events
  FOR SELECT TO authenticated USING (public.ai_gov_can_read(auth.uid()));
DROP POLICY IF EXISTS "Read conduct AI use cases" ON public.conduct_ai_use_cases;
CREATE POLICY "Read conduct AI use cases" ON public.conduct_ai_use_cases
  FOR SELECT TO authenticated USING (public.ai_gov_can_read(auth.uid()));

-- ---------------------------------------------------------- authority
CREATE OR REPLACE FUNCTION public.ai_gov_require(_actions text[])
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _a text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF public.is_super_admin(_uid) THEN RETURN _uid; END IF;
  FOREACH _a IN ARRAY _actions LOOP
    IF public.has_permission(_uid, 'ai_management', _a) THEN RETURN _uid; END IF;
  END LOOP;
  RAISE EXCEPTION 'not_authorized: ai_management.%', _actions[1] USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION public.ai_gov_require(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_gov_require(text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ai_gov_actor_role(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT r.name FROM public.user_dynamic_roles udr
       JOIN public.roles r ON r.id = udr.role_id
      WHERE udr.user_id = _uid ORDER BY udr.created_at LIMIT 1),
    (SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = _uid ORDER BY ur.role LIMIT 1),
    'unknown');
$$;
REVOKE ALL ON FUNCTION public.ai_gov_actor_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_gov_actor_role(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ai_gov_log_event(
  _object_type text, _object_id uuid, _object_code text, _event_type text,
  _from_state text, _to_state text, _actor_id uuid, _rationale text,
  _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.ai_governance_events
    (object_type, object_id, object_code, event_type, from_state, to_state,
     actor_id, actor_role, rationale, metadata)
  VALUES (_object_type, _object_id, _object_code, _event_type, _from_state, _to_state,
          _actor_id, public.ai_gov_actor_role(_actor_id), NULLIF(btrim(_rationale), ''),
          COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.ai_gov_log_event(text,uuid,text,text,text,text,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_gov_log_event(text,uuid,text,text,text,text,uuid,text,jsonb) TO service_role;

-- ================================================================
-- EXECUTION RESOLUTION — the authoritative fail-closed gate.
-- Service-role only: the acting user is supplied by the verified edge
-- function boundary, never by a browser.
-- ================================================================
CREATE OR REPLACE FUNCTION public.ai_governance_resolve_execution(
  _use_case_code text, _acting_user uuid, _requested_model text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uc public.conduct_ai_use_cases;
  _m  public.ai_governance_models;
  _i  public.ai_governance_instructions;
  _policy jsonb;
  _allowed_models text[];
  _allowed_providers text[];
  _permitted boolean := false;
  _a text;
  _deny jsonb;
BEGIN
  _deny := jsonb_build_object('allowed', false);

  SELECT * INTO _uc FROM public.conduct_ai_use_cases WHERE code = _use_case_code;
  IF _uc.code IS NULL THEN
    RETURN _deny || jsonb_build_object('reason_code','USE_CASE_NOT_REGISTERED',
      'message','This AI capability is not registered in the AI use-case register.');
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

  -- role authority for the acting user
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

  -- model resolution: governance register wins over any caller-supplied id
  _policy := COALESCE(_uc.model_policy, '{}'::jsonb);
  SELECT COALESCE(array_agg(x), '{}') INTO _allowed_models
    FROM jsonb_array_elements_text(COALESCE(_policy->'allowed_models','[]'::jsonb)) x;
  SELECT COALESCE(array_agg(x), '{}') INTO _allowed_providers
    FROM jsonb_array_elements_text(COALESCE(_policy->'allowed_providers','[]'::jsonb)) x;

  IF _uc.approved_model_id IS NOT NULL THEN
    SELECT * INTO _m FROM public.ai_governance_models WHERE id = _uc.approved_model_id;
  ELSE
    SELECT * INTO _m FROM public.ai_governance_models
     WHERE technical_identifier = ANY(_allowed_models)
       AND provider = ANY(_allowed_providers)
     ORDER BY (lifecycle_state = 'ACTIVE') DESC, approved_at DESC NULLS LAST
     LIMIT 1;
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
  -- A caller-supplied model is only ever validated, never trusted.
  IF _requested_model IS NOT NULL AND _requested_model <> _m.technical_identifier THEN
    RETURN _deny || jsonb_build_object('reason_code','MODEL_NOT_PERMITTED',
      'message','The requested AI model is not the model approved for this capability.');
  END IF;
  IF _m.external_data_capable IS TRUE AND COALESCE((_policy->>'external_data_allowed')::boolean, false) IS FALSE THEN
    -- capability is permitted, but external data must remain switched off
    NULL;
  END IF;

  -- instruction resolution
  IF _uc.approved_instruction_id IS NOT NULL THEN
    SELECT * INTO _i FROM public.ai_governance_instructions WHERE id = _uc.approved_instruction_id;
  ELSE
    SELECT * INTO _i FROM public.ai_governance_instructions
     WHERE template_code = _uc.prompt_template_code
       AND version = _uc.prompt_template_version
     LIMIT 1;
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
    'allowed', true,
    'reason_code', 'APPROVED',
    'use_case_code', _uc.code,
    'use_case_version', _uc.use_case_version,
    'owning_module', _uc.owning_module,
    'advisory_classification', _uc.advisory_classification,
    'human_review_required', _uc.human_review_required,
    'provider', _m.provider,
    'model', _m.technical_identifier,
    'model_version', COALESCE(_m.model_version, _m.technical_identifier),
    'model_id', _m.id,
    'model_display_name', _m.display_name,
    'instruction_id', _i.id,
    'instruction_template_code', _i.template_code,
    'instruction_version', _i.version,
    'instruction_body', _i.instruction_body,
    'required_caveats', _i.required_caveats,
    'prohibited_behaviours', _i.prohibited_behaviours,
    'allowed_fact_scope', _i.allowed_fact_scope,
    'temperature_max', COALESCE((_policy->>'temperature_max')::numeric, 0.2),
    'external_data_allowed', COALESCE((_policy->>'external_data_allowed')::boolean, false),
    'limitation_policy', _uc.limitation_policy
  );
END $$;
REVOKE ALL ON FUNCTION public.ai_governance_resolve_execution(text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_governance_resolve_execution(text,uuid,text) TO service_role;

-- ---------------------------------------------- attempt / activity record
CREATE OR REPLACE FUNCTION public.ai_governance_record_attempt(
  _use_case_code text, _entity_id uuid, _requested_by uuid, _outcome text,
  _reason_code text DEFAULT NULL, _detail text DEFAULT NULL,
  _provider text DEFAULT NULL, _model text DEFAULT NULL, _model_version text DEFAULT NULL,
  _instruction_template_code text DEFAULT NULL, _instruction_version text DEFAULT NULL,
  _snapshot_fingerprint text DEFAULT NULL, _window_start date DEFAULT NULL,
  _window_end date DEFAULT NULL, _latency_ms integer DEFAULT NULL,
  _insight_id uuid DEFAULT NULL, _requested_at timestamptz DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _module text;
BEGIN
  SELECT owning_module INTO _module FROM public.conduct_ai_use_cases WHERE code = _use_case_code;
  INSERT INTO public.ai_governance_activity_attempts
    (use_case_code, owning_module, entity_id, requested_by, requested_role, outcome, reason_code,
     detail, provider, model, model_version, instruction_template_code, instruction_version,
     snapshot_fingerprint, window_start, window_end, latency_ms, conduct_ai_insight_id,
     requested_at, completed_at, metadata)
  VALUES (_use_case_code, COALESCE(_module,'market_conduct'), _entity_id, _requested_by,
          public.ai_gov_actor_role(_requested_by), _outcome, _reason_code, left(COALESCE(_detail,''), 2000),
          _provider, _model, _model_version, _instruction_template_code, _instruction_version,
          _snapshot_fingerprint, _window_start, _window_end, _latency_ms, _insight_id,
          COALESCE(_requested_at, now()), now(), COALESCE(_metadata,'{}'::jsonb))
  RETURNING id INTO _id;

  PERFORM public.ai_gov_log_event(
    'AI_ACTIVITY', _id, _use_case_code,
    CASE _outcome WHEN 'SUCCESS' THEN 'GENERATION_COMPLETED' ELSE 'GENERATION_' || _outcome END,
    NULL, _outcome, _requested_by, _reason_code,
    jsonb_build_object('entity_id', _entity_id, 'insight_id', _insight_id,
                       'model', _model, 'instruction_version', _instruction_version));
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.ai_governance_record_attempt(text,uuid,uuid,text,text,text,text,text,text,text,text,text,date,date,integer,uuid,timestamptz,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_governance_record_attempt(text,uuid,uuid,text,text,text,text,text,text,text,text,text,date,date,integer,uuid,timestamptz,jsonb) TO service_role;
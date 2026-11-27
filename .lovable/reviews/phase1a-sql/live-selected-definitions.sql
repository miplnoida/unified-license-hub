CREATE OR REPLACE FUNCTION public.ai_governance_resolve_execution(_use_case_code text, _acting_user uuid, _requested_model text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;

CREATE OR REPLACE FUNCTION public.entity_license_entitlements(target_licensee_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(license_id uuid, licensee_id uuid, licensee_name text, license_number text, license_type text, status text, effective_status text, regulator_id uuid, sector_id uuid, sector_name text, sub_sector_id uuid, sub_sector_name text, category_id uuid, category_name text, issued_at timestamp with time zone, valid_until timestamp with time zone, grace_period_days integer, grace_ends_on date, in_grace_period boolean, is_eligible_for_new_activity boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF target_licensee_id IS NOT NULL
     AND NOT public.can_current_user_access_licensee(target_licensee_id, NULL)
     AND NOT public.is_super_admin(v_uid)
     AND NOT public.has_permission(v_uid, 'license_management', 'view') THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH scoped_entities AS (
    SELECT target_licensee_id AS id WHERE target_licensee_id IS NOT NULL
    UNION
    SELECT p.licensee_id FROM public.profiles p
     WHERE target_licensee_id IS NULL AND p.id = v_uid AND p.licensee_id IS NOT NULL
    UNION
    SELECT m.entity_id FROM public.entity_user_memberships m
     WHERE target_licensee_id IS NULL AND m.user_id = v_uid AND m.status = 'APPROVED'
    UNION
    SELECT l.id FROM public.licensees l
     WHERE target_licensee_id IS NULL AND l.applicant_id = v_uid
  ),
  candidate AS (
    -- licences linked to one of the caller's entities
    SELECT lic.*, e.id AS ent_id
      FROM public.licenses lic
      JOIN scoped_entities e ON e.id = lic.holder_id
    UNION
    SELECT lic.*, lse.id AS ent_id
      FROM public.licenses lic
      JOIN public.licensees lse ON lse.license_id = lic.id
      JOIN scoped_entities e ON e.id = lse.id
    UNION
    SELECT lic.*, el.entity_id AS ent_id
      FROM public.licenses lic
      JOIN public.entity_licenses el ON el.license_id = lic.id
      JOIN scoped_entities e ON e.id = el.entity_id
    UNION
    -- licences held personally by the caller (applicant that later got licensed)
    SELECT lic.*, NULL::uuid AS ent_id
      FROM public.licenses lic
     WHERE target_licensee_id IS NULL AND lic.holder_id = v_uid
    UNION
    SELECT lic.*, NULL::uuid AS ent_id
      FROM public.licenses lic
      JOIN public.applications a ON a.id = lic.application_id
     WHERE target_licensee_id IS NULL AND a.applicant_id = v_uid
  ),
  dedup AS (
    SELECT DISTINCT ON (c.id) c.*
      FROM candidate c
     ORDER BY c.id, c.ent_id NULLS LAST
  ),
  computed AS (
    SELECT d.*,
           lower(trim(COALESCE(d.status, ''))) AS norm_status,
           public.license_grace_days(d.sector_id, d.sub_sector_id, d.category_id) AS gdays
      FROM dedup d
  )
  SELECT
    c.id,
    c.ent_id,
    lse.name,
    c.license_number,
    c.license_type,
    c.status,
    CASE
      WHEN c.norm_status IN ('suspended','revoked','cancelled','canceled','inactive','expired') THEN c.norm_status
      WHEN c.valid_until IS NOT NULL
           AND CURRENT_DATE > (c.valid_until::date + c.gdays) THEN 'expired'
      WHEN c.valid_until IS NOT NULL AND CURRENT_DATE > c.valid_until::date THEN 'active_grace'
      WHEN c.norm_status IN ('active','approved','issued','valid','in_good_standing') THEN 'active'
      ELSE COALESCE(NULLIF(c.norm_status,''), 'pending')
    END::text,
    c.regulator_id,
    c.sector_id, s.name,
    c.sub_sector_id, ss.name,
    c.category_id, cat.name,
    c.issued_at,
    c.valid_until,
    c.gdays,
    CASE WHEN c.valid_until IS NOT NULL THEN (c.valid_until::date + c.gdays) ELSE NULL END,
    (c.valid_until IS NOT NULL
      AND CURRENT_DATE > c.valid_until::date
      AND CURRENT_DATE <= (c.valid_until::date + c.gdays)),
    (
      c.norm_status IN ('active','approved','issued','valid','in_good_standing')
      AND (c.valid_until IS NULL OR CURRENT_DATE <= (c.valid_until::date + c.gdays))
    )
    FROM computed c
    LEFT JOIN public.licensees lse ON lse.id = c.ent_id
    LEFT JOIN public.sectors s ON s.id = c.sector_id
    LEFT JOIN public.sub_sectors ss ON ss.id = c.sub_sector_id
    LEFT JOIN public.categories cat ON cat.id = c.category_id
   ORDER BY 20 DESC, c.issued_at DESC NULLS LAST;
END $function$
;

CREATE OR REPLACE FUNCTION public.can_act_on_specific_license(_license_id uuid, _licensee_id uuid DEFAULT NULL::uuid, _sector_id uuid DEFAULT NULL::uuid, _sub_sector_id uuid DEFAULT NULL::uuid, _category_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lic public.licenses;
BEGIN
  IF _license_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_lic FROM public.licenses WHERE id = _license_id;
  IF v_lic.id IS NULL THEN
    RETURN false;
  END IF;

  -- The licence must belong to the entity the caller claims to be acting for.
  IF _licensee_id IS NOT NULL AND v_lic.holder_id IS DISTINCT FROM _licensee_id THEN
    RETURN false;
  END IF;

  -- Supplied taxonomy must match the licence exactly (no widening by tampering).
  IF _sector_id IS NOT NULL AND v_lic.sector_id IS DISTINCT FROM _sector_id THEN
    RETURN false;
  END IF;
  IF _sub_sector_id IS NOT NULL AND v_lic.sub_sector_id IS NOT NULL
     AND v_lic.sub_sector_id IS DISTINCT FROM _sub_sector_id THEN
    RETURN false;
  END IF;
  IF _category_id IS NOT NULL AND v_lic.category_id IS NOT NULL
     AND v_lic.category_id IS DISTINCT FROM _category_id THEN
    RETURN false;
  END IF;

  -- Caller access + licence eligibility, via the single canonical resolver.
  RETURN EXISTS (
    SELECT 1
      FROM public.entity_license_entitlements(v_lic.holder_id) e
     WHERE e.license_id = v_lic.id
       AND e.is_eligible_for_new_activity
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.review_prudential_action_response(_action_id uuid, _decision text, _notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid();
        _a public.prudential_actions;
        _has_resp boolean;
        _new_status text;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHENTICATED');
  END IF;
  IF _decision NOT IN ('accepted','rejected') THEN
    RETURN jsonb_build_object('error','Decision must be accepted or rejected','code','VALIDATION');
  END IF;
  IF _notes IS NULL OR length(trim(_notes)) < 5 THEN
    RETURN jsonb_build_object('error','Review notes of at least 5 characters are required','code','VALIDATION');
  END IF;
  SELECT * INTO _a FROM public.prudential_actions WHERE id = _action_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Action not found','code','NOT_FOUND');
  END IF;
  IF NOT (public.is_super_admin(_uid)
          OR public.has_permission(_uid,'prudential_supervision','workflow_action')
          OR public.has_permission(_uid,'prudential_supervision','edit')
          OR public.has_permission(_uid,'prudential_supervision','manage_remediation')) THEN
    RETURN jsonb_build_object('error','You are not permitted to review supervisory actions','code','FORBIDDEN');
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.prudential_action_responses r
                  WHERE r.action_id = _action_id AND r.kind = 'entity_response') INTO _has_resp;
  IF NOT _has_resp THEN
    RETURN jsonb_build_object('error','There is no entity response to review','code','NO_RESPONSE');
  END IF;

  _new_status := CASE WHEN _decision = 'accepted' THEN 'completed' ELSE 'in_progress' END;

  INSERT INTO public.prudential_action_responses(action_id, kind, narrative, decision, submitted_by)
  VALUES (_action_id, 'supervisor_review', trim(_notes), _decision, _uid);

  UPDATE public.prudential_actions
     SET review_status = _decision,
         review_notes = trim(_notes),
         reviewed_by = _uid,
         reviewed_at = now(),
         status = _new_status,
         completion_notes = CASE WHEN _decision = 'accepted' THEN trim(_notes) ELSE completion_notes END,
         closed_at = CASE WHEN _decision = 'accepted' THEN now() ELSE closed_at END,
         closed_by = CASE WHEN _decision = 'accepted' THEN _uid ELSE closed_by END,
         progress_percent = CASE WHEN _decision = 'accepted' THEN 100 ELSE progress_percent END,
         updated_at = now()
   WHERE id = _action_id;

  INSERT INTO public.prudential_action_events(action_id, event_type, from_status, to_status, actor_id, reason)
  VALUES (_action_id, 'supervisor_review_' || _decision, _a.status, _new_status, _uid, trim(_notes));

  RETURN jsonb_build_object('ok', true, 'status', _new_status, 'review_status', _decision);
END $function$
;

CREATE OR REPLACE FUNCTION public.application_draft_save(_application_id uuid, _data jsonb, _license_type text DEFAULT NULL::text, _regulator_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_app public.applications;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: You must be signed in to save an application.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_app FROM public.applications WHERE id = _application_id;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND: Application % does not exist.', _application_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR v_app.applicant_id = v_uid
    OR public.has_permission(v_uid, 'application_management', 'edit')
    OR EXISTS (
      SELECT 1 FROM public.entity_user_memberships m
       WHERE m.user_id = v_uid AND m.status = 'APPROVED'
         AND m.entity_id = v_app.entity_id
    )
  ) THEN
    RAISE EXCEPTION 'APPLICATION_EDIT_FORBIDDEN: You do not have permission to edit this application.'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(v_app.status, 'draft') NOT IN (
    'draft', 'in_progress', 'returned', 'info_requested', 'query_raised',
    'resubmission_required', 'pending_payment'
  ) AND NOT public.is_super_admin(v_uid)
    AND NOT public.has_permission(v_uid, 'application_management', 'edit') THEN
    RAISE EXCEPTION 'APPLICATION_NOT_EDITABLE: This application is not currently open for editing.'
      USING ERRCODE = '42501';
  END IF;

  -- Submitted applications advanced by the workflow keep 'in_progress';
  -- they are under regulator review and closed to applicant edits.
  IF v_app.status IN ('in_progress','submitted') AND v_app.submitted_at IS NOT NULL
     AND NOT public.is_super_admin(v_uid)
     AND NOT public.has_permission(v_uid, 'application_management', 'edit') THEN
    RAISE EXCEPTION 'APPLICATION_UNDER_REVIEW: This application is under regulator review and cannot be edited.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.applications
     SET data = COALESCE(_data, data),
         license_type = COALESCE(NULLIF(trim(COALESCE(_license_type, '')), ''), license_type),
         regulator_id = COALESCE(_regulator_id, regulator_id),
         updated_at = now()
   WHERE id = _application_id;

  RETURN jsonb_build_object('success', true, 'application_id', _application_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ai_governance_surface_gate(_code text, _acting_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := COALESCE(_acting_user, auth.uid());
  _s public.ai_governance_surfaces;
  _m public.ai_governance_models;
  _stop record;
  _deny text; _reason text; _scope text;
BEGIN
  SELECT * INTO _s FROM public.ai_governance_surfaces WHERE code = _code;
  IF _s.code IS NULL THEN
    _reason := 'CAPABILITY_NOT_REGISTERED';
    _deny := 'This AI capability is not registered for governance, so no AI request was made.';
  ELSE
    SELECT * INTO _stop FROM public.ai_governance_kill_switches
      WHERE is_engaged AND scope_key IN ('GLOBAL', _s.owning_module)
      ORDER BY CASE WHEN scope_key = 'GLOBAL' THEN 0 ELSE 1 END LIMIT 1;
    IF _stop.scope_key IS NOT NULL THEN
      _reason := 'AI_STOPPED'; _scope := _stop.scope_key;
      _deny := 'AI assistance is currently stopped by the regulator. Regulatory records, deterministic rule outcomes and supervisory workflows are unaffected.';
    ELSIF _s.lifecycle_state <> 'ACTIVE' THEN
      _reason := 'CAPABILITY_NOT_APPROVED';
      _deny := 'This AI capability is not approved for use at present.';
    ELSIF _uid IS NULL THEN
      _reason := 'NOT_AUTHENTICATED'; _deny := 'Authentication is required.';
    ELSIF NOT (public.is_super_admin(_uid)
               OR public.has_permission(_uid, _s.owning_module, 'view')
               OR public.has_permission(_uid, 'ai_management', 'view')) THEN
      _reason := 'ROLE_NOT_PERMITTED';
      _deny := 'You do not have rights to request AI assistance for this area.';
    ELSE
      SELECT * INTO _m FROM public.ai_governance_models WHERE id = _s.approved_model_id;
      IF _m.id IS NULL OR _m.lifecycle_state <> 'ACTIVE' THEN
        _reason := 'MODEL_NOT_APPROVED';
        _deny := 'No approved model is bound to this AI capability.';
      END IF;
    END IF;
  END IF;

  IF _reason IS NOT NULL THEN
    INSERT INTO public.ai_governance_events
      (object_type, object_code, event_type, actor_id, actor_role, rationale, metadata)
    VALUES ('SURFACE', _code, 'EXECUTION_REFUSED', _uid,
            CASE WHEN _uid IS NULL THEN 'unknown' ELSE public.ai_gov_actor_role(_uid) END,
            _deny, jsonb_build_object('reason_code', _reason, 'stop_scope', _scope));
    RETURN jsonb_build_object('allowed', false, 'reason_code', _reason, 'message', _deny,
                              'stop_scope', _scope,
                              'governance_note', 'The regulatory record, deterministic rule outcomes and supervisory workflow are unaffected.');
  END IF;

  RETURN jsonb_build_object(
    'allowed', true, 'code', _s.code, 'owning_module', _s.owning_module,
    'provider', _m.provider, 'model', _m.technical_identifier,
    'model_version', COALESCE(_m.model_version, _m.technical_identifier),
    'external_data_allowed', _m.external_data_capable,
    'human_review_required', true);
END $function$
;

CREATE OR REPLACE FUNCTION public.create_application_draft(_license_type text, _data jsonb DEFAULT '{}'::jsonb, _regulator_id uuid DEFAULT NULL::uuid)
 RETURNS applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_application public.applications;
  v_entity_id uuid;
  v_is_post boolean;
  v_is_staff boolean;
  v_license_id uuid := NULLIF(_data->>'license_id','')::uuid;
  v_claimed_entity uuid := NULLIF(_data->>'licensee_id','')::uuid;
  v_license_holder uuid;
  v_service_id text := NULLIF(_data->>'service_id','');
  v_applicability text;
  v_existing uuid;
  v_reg_id uuid := NULLIF(_data->>'registration_id','')::uuid;
  v_handoff record;
  v_ctx record;
  v_data jsonb := COALESCE(_data, '{}'::jsonb);
  v_regulator uuid := _regulator_id;
  v_trusted boolean := COALESCE(current_setting('app.workflow_mutation_context', true), '') = 'trusted';
  v_open_statuses text[] := ARRAY[
    'draft','in_progress','resubmission_requested','resubmission_required',
    'query_raised','returned_for_correction','info_requested'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: You must be signed in to create an application draft.'
      USING ERRCODE = '42501';
  END IF;

  v_is_staff := public.is_super_admin(v_uid)
                OR public.has_permission(v_uid, 'application_management', 'create');

  IF NOT (
    v_is_staff
    OR public.has_role(v_uid, 'applicant'::public.app_role)
    OR public.has_role(v_uid, 'pre_licensee'::public.app_role)
    OR public.has_role(v_uid, 'licensee_primary'::public.app_role)
    OR public.has_role(v_uid, 'licensee_secondary'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'APPLICATION_CREATE_FORBIDDEN: You do not have permission to create an application draft.'
      USING ERRCODE = '42501';
  END IF;

  SELECT m.entity_id INTO v_entity_id
    FROM public.entity_user_memberships m
    JOIN public.licensees l ON l.id = m.entity_id
   WHERE m.user_id = v_uid AND m.status = 'APPROVED' AND l.merged_into_entity_id IS NULL
   ORDER BY m.approved_at DESC NULLS LAST
   LIMIT 1;

  IF v_entity_id IS NULL THEN
    SELECT p.licensee_id INTO v_entity_id
      FROM public.profiles p JOIN public.licensees l ON l.id = p.licensee_id
     WHERE p.id = v_uid AND l.merged_into_entity_id IS NULL;
  END IF;

  IF v_entity_id IS NULL THEN
    SELECT l.id INTO v_entity_id
      FROM public.licensees l
     WHERE l.applicant_id = v_uid AND l.merged_into_entity_id IS NULL
     ORDER BY l.created_at
     LIMIT 1;
  END IF;

  v_is_post := (v_service_id IS NOT NULL)
               OR lower(COALESCE(_data->>'type','')) = 'post_license'
               OR v_license_id IS NOT NULL;

  IF v_is_post THEN
    v_applicability := public.post_license_service_applicability(
      NULLIF(v_service_id,'')::uuid, v_license_id
    );

    IF v_applicability <> 'OK' THEN
      RAISE EXCEPTION '%: %',
        v_applicability, public.post_license_applicability_message(v_applicability)
        USING ERRCODE = CASE
          WHEN v_applicability IN ('LICENSE_REQUIRED','LICENSE_NOT_FOUND',
                                   'POST_LICENSE_SERVICE_REQUIRED',
                                   'POST_LICENSE_SERVICE_NOT_FOUND') THEN '22023'
          ELSE '42501'
        END;
    END IF;

    SELECT * INTO v_ctx
      FROM public.resolve_post_license_intake_context(v_license_id, v_service_id::uuid);
    IF v_ctx.entity_id IS NULL THEN
      RAISE EXCEPTION 'LICENSE_NOT_FOUND: The selected licence could not be found.'
        USING ERRCODE = '22023';
    END IF;
    v_license_holder := v_ctx.entity_id;

    IF v_claimed_entity IS NOT NULL AND v_claimed_entity IS DISTINCT FROM v_license_holder THEN
      RAISE EXCEPTION 'LICENSE_ENTITY_MISMATCH: The selected licence does not belong to the selected entity.'
        USING ERRCODE = '42501';
    END IF;
    v_entity_id := v_license_holder;

    v_data := v_data || jsonb_build_object(
      'type', 'post_license',
      'license_id', v_license_id,
      'service_id', v_service_id,
      'licensee_id', v_entity_id,
      'sector_id', v_ctx.sector_id,
      'sub_sector_id', v_ctx.sub_sector_id,
      'category_id', v_ctx.category_id
    );
    v_regulator := COALESCE(v_regulator, v_ctx.regulator_id);

    IF NOT v_is_staff THEN
      IF NOT public.can_act_on_specific_license(v_license_id, v_license_holder, NULL, NULL, NULL)
         AND NOT COALESCE((
           v_data->>'is_renewal' = 'true'
           AND v_data->>'renewal_of_license_id' = v_license_id::text
           AND public.post_license_service_applicability(v_service_id::uuid, v_license_id) = 'OK'
           AND EXISTS (SELECT 1 FROM public.services s WHERE s.id = v_service_id::uuid AND s.name = 'Renew')
           AND EXISTS (
             SELECT 1 FROM public.licensees e
             WHERE e.id = v_license_holder AND e.merged_into_entity_id IS NULL
               AND (e.applicant_id = v_uid
                    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.licensee_id = e.id)
                    OR EXISTS (SELECT 1 FROM public.entity_user_memberships m WHERE m.user_id = v_uid AND m.entity_id = e.id AND m.status = 'APPROVED')
                    OR public.can_current_user_access_licensee(e.id, v_ctx.sector_id))
           )
           AND EXISTS (
             SELECT 1 FROM public.licenses l WHERE l.id = v_license_id
               AND lower(trim(l.status)) IN ('active','approved','issued','valid','in_good_standing','expired')
               AND l.valid_until IS NOT NULL
               AND CURRENT_DATE > l.valid_until::date + public.license_grace_days(l.sector_id,l.sub_sector_id,l.category_id)
           )
         ), false) THEN
        RAISE EXCEPTION 'LICENSE_ENTITLEMENT_REQUIRED: Post-licence services are only available for a licence that is approved, issued and in good standing for this sector.'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended('post_license_request:' || v_license_id::text || ':' || v_service_id, 0)
    );

    SELECT a.id INTO v_existing
      FROM public.applications a
     WHERE COALESCE(a.data->>'license_id','') = v_license_id::text
       AND COALESCE(a.data->>'service_id','') = v_service_id
       AND a.status = ANY (public.post_license_open_statuses())
     ORDER BY a.created_at
     LIMIT 1;

    IF v_existing IS NOT NULL THEN
      RAISE EXCEPTION 'DUPLICATE_POST_LICENSE_REQUEST: %', v_existing
        USING ERRCODE = 'unique_violation',
              HINT = v_existing::text;
    END IF;
  ELSE
    IF NOT v_trusted THEN
      IF v_reg_id IS NULL THEN
        SELECT h.registration_id INTO v_reg_id
          FROM public.registration_licensing_handoffs h
          JOIN public.registrations r ON r.id = h.registration_id
         WHERE r.user_id = v_uid AND lower(r.status) = 'approved'
         ORDER BY h.created_at DESC
         LIMIT 1;
      END IF;

      IF v_reg_id IS NULL THEN
        RAISE EXCEPTION 'REGISTRATION_HANDOFF_REQUIRED: A new licence application requires an approved registration handoff.'
          USING ERRCODE = '42501';
      END IF;

      SELECT h.*, r.status AS reg_status, r.user_id AS reg_user
        INTO v_handoff
        FROM public.registration_licensing_handoffs h
        JOIN public.registrations r ON r.id = h.registration_id
       WHERE h.registration_id = v_reg_id
       ORDER BY h.created_at DESC
       LIMIT 1;

      IF NOT FOUND OR lower(COALESCE(v_handoff.reg_status,'')) <> 'approved' THEN
        RAISE EXCEPTION 'REGISTRATION_HANDOFF_REQUIRED: A new licence application requires an approved registration handoff.'
          USING ERRCODE = '42501';
      END IF;

      IF NOT v_is_staff AND v_handoff.reg_user IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'REGISTRATION_HANDOFF_FORBIDDEN: This registration handoff does not belong to you.'
          USING ERRCODE = '42501';
      END IF;

      -- Resume ONLY an application that is still open for editing. A withdrawn,
      -- rejected, cancelled, approved or already-submitted attempt is left
      -- untouched and a new attempt is created and linked below.
      SELECT a.* INTO v_application
        FROM public.registration_licensing_handoffs h
        JOIN public.applications a ON a.id = h.application_id
       WHERE h.registration_id = v_reg_id
         AND lower(COALESCE(a.status,'draft')) = ANY (v_open_statuses)
       ORDER BY a.updated_at DESC NULLS LAST, a.created_at DESC
       LIMIT 1;

      IF FOUND THEN
        RETURN v_application;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.applications (
    applicant_id, license_type, status, data, regulator_id, entity_id
  )
  VALUES (
    v_uid,
    COALESCE(NULLIF(trim(_license_type), ''), 'Application'),
    'draft',
    v_data || CASE WHEN v_reg_id IS NOT NULL
      THEN jsonb_build_object('registration_id', v_reg_id) ELSE '{}'::jsonb END,
    v_regulator,
    v_entity_id
  )
  RETURNING * INTO v_application;

  IF NOT v_is_post AND v_reg_id IS NOT NULL THEN
    INSERT INTO public.registration_licensing_handoffs
      (registration_id, application_id, registration_reference, detail)
    SELECT v_reg_id, v_application.id, r.registration_reference,
           jsonb_build_object('license_type', v_application.license_type,
                              'source', 'create_application_draft')
      FROM public.registrations r
     WHERE r.id = v_reg_id
    ON CONFLICT (registration_id, application_id) DO NOTHING;
  END IF;

  RETURN v_application;
END $function$
;

CREATE OR REPLACE FUNCTION public.has_portal_capability(_user_id uuid, _entity_id uuid, _area portal_area, _capability text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_module text;
  v_action text;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id AND NOT public.is_internal_staff_user(auth.uid()) THEN
    RETURN false;
  END IF;
  IF public.is_internal_staff_user(_user_id) OR public.has_role(_user_id, 'super_admin'::app_role) THEN
    RETURN true;
  END IF;

  v_module := CASE _area
    WHEN 'licensing'        THEN 'licensing'
    WHEN 'returns'          THEN 'returns_management'
    WHEN 'complaints'       THEN 'complaint_management'
    WHEN 'fp_declarations'  THEN 'fit_and_proper'
  END;

  v_action := CASE _capability
    WHEN 'can_submit'                  THEN 'submit'
    WHEN 'can_submit_returns'          THEN 'submit'
    WHEN 'can_submit_complaints'       THEN 'submit'
    WHEN 'can_submit_fp_declarations'  THEN 'submit'
    WHEN 'can_upload_documents'        THEN 'upload_documents'
    WHEN 'can_view_status'             THEN 'view_status'
    WHEN 'can_respond_rfi'             THEN 'respond_rfi'
    ELSE _capability
  END;

  RETURN public.sec_has_permission(_user_id, v_module, v_action);
END;
$function$
;
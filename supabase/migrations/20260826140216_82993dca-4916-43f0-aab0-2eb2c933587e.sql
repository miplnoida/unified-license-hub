-- =====================================================================
-- MC-08 (part 3) — governance lifecycle, suspension, assurance workflow
-- =====================================================================

CREATE OR REPLACE FUNCTION public.ai_gov_transition_allowed(_from public.ai_gov_lifecycle, _to public.ai_gov_lifecycle)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (_from, _to) IN (
    ('DRAFT','TESTING'), ('DRAFT','ACTIVE'), ('DRAFT','RETIRED'),
    ('TESTING','ACTIVE'), ('TESTING','DRAFT'), ('TESTING','RETIRED'),
    ('ACTIVE','SUSPENDED'), ('ACTIVE','RETIRED'),
    ('SUSPENDED','ACTIVE'), ('SUSPENDED','RETIRED')
  );
$$;

-- Governed state change for a use case, model or instruction version.
CREATE OR REPLACE FUNCTION public.ai_governance_transition(
  _object_type text, _object_key text, _to_state text, _rationale text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid; _from public.ai_gov_lifecycle; _to public.ai_gov_lifecycle;
  _id uuid; _code text; _creator uuid; _needs_checker boolean;
BEGIN
  IF _object_type NOT IN ('USE_CASE','MODEL','INSTRUCTION') THEN
    RAISE EXCEPTION 'unsupported_object_type: %', _object_type USING ERRCODE = '22023';
  END IF;
  BEGIN
    _to := _to_state::public.ai_gov_lifecycle;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'unsupported_state: %', _to_state USING ERRCODE = '22023';
  END;

  _uid := public.ai_gov_require(ARRAY['approve']);

  IF _object_type = 'USE_CASE' THEN
    SELECT lifecycle_state, code, created_by INTO _from, _code, _creator
      FROM public.conduct_ai_use_cases WHERE code = _object_key FOR UPDATE;
  ELSIF _object_type = 'MODEL' THEN
    SELECT lifecycle_state, display_name, created_by, id INTO _from, _code, _creator, _id
      FROM public.ai_governance_models WHERE id = _object_key::uuid FOR UPDATE;
  ELSE
    SELECT lifecycle_state, template_code || ' ' || version, created_by, id INTO _from, _code, _creator, _id
      FROM public.ai_governance_instructions WHERE id = _object_key::uuid FOR UPDATE;
  END IF;

  IF _from IS NULL THEN
    RAISE EXCEPTION 'governance_object_not_found: % %', _object_type, _object_key USING ERRCODE = 'P0002';
  END IF;
  IF _from = _to THEN
    RAISE EXCEPTION 'no_state_change: already %', _to USING ERRCODE = '22023';
  END IF;
  IF NOT public.ai_gov_transition_allowed(_from, _to) THEN
    RAISE EXCEPTION 'transition_not_permitted: % -> %', _from, _to USING ERRCODE = '22023';
  END IF;
  IF _to IN ('SUSPENDED','RETIRED') AND COALESCE(btrim(_rationale),'') = '' THEN
    RAISE EXCEPTION 'rationale_required: % requires a written reason', _to USING ERRCODE = '22023';
  END IF;

  -- separation of duties: whoever authored the configuration may not be the
  -- person who releases it into production.
  _needs_checker := (_to = 'ACTIVE' AND _from IN ('DRAFT','TESTING'));
  IF _needs_checker AND _creator IS NOT NULL AND _creator = _uid AND NOT public.is_super_admin(_uid) THEN
    RAISE EXCEPTION 'separation_of_duties: the author of this AI configuration cannot approve it for production'
      USING ERRCODE = '42501';
  END IF;

  IF _object_type = 'USE_CASE' THEN
    UPDATE public.conduct_ai_use_cases
       SET lifecycle_state = _to,
           is_enabled = (_to = 'ACTIVE'),
           approved_at = CASE WHEN _to = 'ACTIVE' AND _from <> 'SUSPENDED' THEN now() ELSE approved_at END,
           approved_by = CASE WHEN _to = 'ACTIVE' AND _from <> 'SUSPENDED' THEN _uid ELSE approved_by END,
           effective_from = CASE WHEN _to = 'ACTIVE' AND effective_from IS NULL THEN now() ELSE effective_from END,
           suspended_at = CASE WHEN _to = 'SUSPENDED' THEN now() WHEN _to = 'ACTIVE' THEN NULL ELSE suspended_at END,
           suspended_by = CASE WHEN _to = 'SUSPENDED' THEN _uid WHEN _to = 'ACTIVE' THEN NULL ELSE suspended_by END,
           suspension_reason = CASE WHEN _to = 'SUSPENDED' THEN btrim(_rationale) WHEN _to = 'ACTIVE' THEN NULL ELSE suspension_reason END,
           updated_at = now()
     WHERE code = _object_key;
  ELSIF _object_type = 'MODEL' THEN
    UPDATE public.ai_governance_models
       SET lifecycle_state = _to,
           approved_at = CASE WHEN _to = 'ACTIVE' AND approved_at IS NULL THEN now() ELSE approved_at END,
           approved_by = CASE WHEN _to = 'ACTIVE' AND approved_by IS NULL THEN _uid ELSE approved_by END,
           effective_from = CASE WHEN _to = 'ACTIVE' AND effective_from IS NULL THEN now() ELSE effective_from END,
           retired_at = CASE WHEN _to = 'RETIRED' THEN now() ELSE retired_at END,
           suspended_at = CASE WHEN _to = 'SUSPENDED' THEN now() WHEN _to = 'ACTIVE' THEN NULL ELSE suspended_at END,
           suspended_by = CASE WHEN _to = 'SUSPENDED' THEN _uid WHEN _to = 'ACTIVE' THEN NULL ELSE suspended_by END,
           suspension_reason = CASE WHEN _to = 'SUSPENDED' THEN btrim(_rationale) WHEN _to = 'ACTIVE' THEN NULL ELSE suspension_reason END,
           updated_at = now()
     WHERE id = _object_key::uuid;
  ELSE
    UPDATE public.ai_governance_instructions
       SET lifecycle_state = _to,
           released_at = CASE WHEN _to = 'ACTIVE' AND released_at IS NULL THEN now() ELSE released_at END,
           released_by = CASE WHEN _to = 'ACTIVE' AND released_by IS NULL THEN _uid ELSE released_by END,
           effective_from = CASE WHEN _to = 'ACTIVE' AND effective_from IS NULL THEN now() ELSE effective_from END,
           suspended_at = CASE WHEN _to = 'SUSPENDED' THEN now() WHEN _to = 'ACTIVE' THEN NULL ELSE suspended_at END,
           suspended_by = CASE WHEN _to = 'SUSPENDED' THEN _uid WHEN _to = 'ACTIVE' THEN NULL ELSE suspended_by END,
           suspension_reason = CASE WHEN _to = 'SUSPENDED' THEN btrim(_rationale) WHEN _to = 'ACTIVE' THEN NULL ELSE suspension_reason END,
           updated_at = now()
     WHERE id = _object_key::uuid;
  END IF;

  PERFORM public.ai_gov_log_event(
    _object_type, _id, COALESCE(_code, _object_key),
    CASE _to WHEN 'SUSPENDED' THEN 'SUSPENDED'
             WHEN 'RETIRED' THEN 'RETIRED'
             WHEN 'ACTIVE' THEN CASE WHEN _from = 'SUSPENDED' THEN 'REACTIVATED' ELSE 'APPROVED_FOR_PRODUCTION' END
             ELSE 'STATE_CHANGED' END,
    _from::text, _to::text, _uid, _rationale, jsonb_build_object('object_key', _object_key));

  PERFORM public.log_compliance_audit_as_actor(
    _uid,
    CASE WHEN _to = 'ACTIVE' THEN 'APPROVE' ELSE 'UPDATE' END,
    'ai_governance_' || lower(_object_type), _id,
    jsonb_build_object('lifecycle_state', _from::text),
    jsonb_build_object('lifecycle_state', _to::text, 'object_key', _object_key),
    _rationale, NULL, NULL, NULL, jsonb_build_object('module','ai_management'));

  RETURN jsonb_build_object('object_type', _object_type, 'object_key', _object_key,
                            'from_state', _from::text, 'to_state', _to::text, 'actor_id', _uid);
END $$;
REVOKE ALL ON FUNCTION public.ai_governance_transition(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_governance_transition(text,text,text,text) TO authenticated, service_role;

-- ------------------------------------------------ configuration authoring
CREATE OR REPLACE FUNCTION public.ai_governance_model_save(
  _id uuid, _provider text, _technical_identifier text, _model_key text, _display_name text,
  _regulatory_purpose text, _model_version text DEFAULT NULL, _known_limitations text DEFAULT NULL,
  _data_handling_class text DEFAULT 'INTERNAL_REGULATORY_FACTS',
  _external_data_capable boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _out uuid; _state public.ai_gov_lifecycle;
BEGIN
  _uid := public.ai_gov_require(ARRAY['create','edit']);
  IF _id IS NULL THEN
    INSERT INTO public.ai_governance_models
      (provider, model_key, technical_identifier, model_version, display_name, regulatory_purpose,
       known_limitations, data_handling_class, external_data_capable, lifecycle_state, created_by)
    VALUES (_provider, _model_key, _technical_identifier, NULLIF(btrim(COALESCE(_model_version,'')),''),
            _display_name, _regulatory_purpose, _known_limitations,
            _data_handling_class, COALESCE(_external_data_capable,false), 'DRAFT', _uid)
    RETURNING id INTO _out;
    PERFORM public.ai_gov_log_event('MODEL', _out, _display_name, 'CREATED', NULL, 'DRAFT', _uid, NULL, '{}'::jsonb);
  ELSE
    SELECT lifecycle_state INTO _state FROM public.ai_governance_models WHERE id = _id;
    IF _state IS NULL THEN RAISE EXCEPTION 'model_not_found' USING ERRCODE = 'P0002'; END IF;
    IF _state NOT IN ('DRAFT','TESTING') THEN
      RAISE EXCEPTION 'immutable_released_configuration: register a new model entry instead of editing a % model', _state
        USING ERRCODE = '42501';
    END IF;
    UPDATE public.ai_governance_models
       SET provider = _provider, model_key = _model_key, technical_identifier = _technical_identifier,
           model_version = NULLIF(btrim(COALESCE(_model_version,'')),''), display_name = _display_name,
           regulatory_purpose = _regulatory_purpose, known_limitations = _known_limitations,
           data_handling_class = _data_handling_class,
           external_data_capable = COALESCE(_external_data_capable,false), updated_at = now()
     WHERE id = _id;
    _out := _id;
    PERFORM public.ai_gov_log_event('MODEL', _out, _display_name, 'UPDATED', _state::text, _state::text, _uid, NULL, '{}'::jsonb);
  END IF;
  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.ai_governance_model_save(uuid,text,text,text,text,text,text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_governance_model_save(uuid,text,text,text,text,text,text,text,text,boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ai_governance_instruction_save(
  _id uuid, _template_code text, _version text, _title text, _purpose text,
  _use_case_code text DEFAULT NULL, _instruction_body text DEFAULT NULL,
  _allowed_fact_scope text DEFAULT 'conduct_360_snapshot',
  _prohibited_behaviours text[] DEFAULT '{}', _required_caveats text[] DEFAULT '{}',
  _citation_expectation text DEFAULT NULL, _confidence_expectation text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _out uuid; _state public.ai_gov_lifecycle;
BEGIN
  _uid := public.ai_gov_require(ARRAY['create','edit']);
  IF _id IS NULL THEN
    INSERT INTO public.ai_governance_instructions
      (template_code, version, title, purpose, use_case_code, instruction_body, allowed_fact_scope,
       prohibited_behaviours, required_caveats,
       citation_expectation, confidence_expectation, lifecycle_state, created_by)
    VALUES (_template_code, _version, _title, _purpose, _use_case_code, _instruction_body,
            COALESCE(_allowed_fact_scope,'conduct_360_snapshot'),
            COALESCE(_prohibited_behaviours,'{}'), COALESCE(_required_caveats,'{}'),
            COALESCE(_citation_expectation,'Every material statement must cite a supplied source reference.'),
            COALESCE(_confidence_expectation,'Confidence, uncertainty and limitations must be stated explicitly.'),
            'DRAFT', _uid)
    RETURNING id INTO _out;
    PERFORM public.ai_gov_log_event('INSTRUCTION', _out, _template_code || ' ' || _version, 'CREATED', NULL, 'DRAFT', _uid, NULL, '{}'::jsonb);
  ELSE
    SELECT lifecycle_state INTO _state FROM public.ai_governance_instructions WHERE id = _id;
    IF _state IS NULL THEN RAISE EXCEPTION 'instruction_not_found' USING ERRCODE = 'P0002'; END IF;
    IF _state NOT IN ('DRAFT','TESTING') THEN
      RAISE EXCEPTION 'immutable_released_instruction: release a new version instead of editing a % version', _state
        USING ERRCODE = '42501';
    END IF;
    UPDATE public.ai_governance_instructions
       SET template_code = _template_code, version = _version, title = _title, purpose = _purpose,
           use_case_code = _use_case_code, instruction_body = _instruction_body,
           allowed_fact_scope = COALESCE(_allowed_fact_scope,'conduct_360_snapshot'),
           prohibited_behaviours = COALESCE(_prohibited_behaviours,'{}'),
           required_caveats = COALESCE(_required_caveats,'{}'),
           citation_expectation = COALESCE(_citation_expectation, citation_expectation),
           confidence_expectation = COALESCE(_confidence_expectation, confidence_expectation),
           updated_at = now()
     WHERE id = _id;
    _out := _id;
    PERFORM public.ai_gov_log_event('INSTRUCTION', _out, _template_code || ' ' || _version, 'UPDATED', _state::text, _state::text, _uid, NULL, '{}'::jsonb);
  END IF;
  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.ai_governance_instruction_save(uuid,text,text,text,text,text,text,text,text[],text[],text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_governance_instruction_save(uuid,text,text,text,text,text,text,text,text[],text[],text,text) TO authenticated, service_role;

-- Bind an approved model / released instruction to a use case (governed).
CREATE OR REPLACE FUNCTION public.ai_governance_use_case_bind(
  _use_case_code text, _model_id uuid DEFAULT NULL, _instruction_id uuid DEFAULT NULL,
  _rationale text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _ms public.ai_gov_lifecycle; _is public.ai_gov_lifecycle; _before jsonb;
BEGIN
  _uid := public.ai_gov_require(ARRAY['approve']);
  SELECT jsonb_build_object('model_id', approved_model_id, 'instruction_id', approved_instruction_id)
    INTO _before FROM public.conduct_ai_use_cases WHERE code = _use_case_code;
  IF _before IS NULL THEN RAISE EXCEPTION 'use_case_not_found' USING ERRCODE = 'P0002'; END IF;

  IF _model_id IS NOT NULL THEN
    SELECT lifecycle_state INTO _ms FROM public.ai_governance_models WHERE id = _model_id;
    IF _ms IS DISTINCT FROM 'ACTIVE' THEN
      RAISE EXCEPTION 'model_not_approved: only an approved model can be bound to a use case' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF _instruction_id IS NOT NULL THEN
    SELECT lifecycle_state INTO _is FROM public.ai_governance_instructions WHERE id = _instruction_id;
    IF _is IS DISTINCT FROM 'ACTIVE' THEN
      RAISE EXCEPTION 'instruction_not_released: only a released instruction version can be bound' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.conduct_ai_use_cases
     SET approved_model_id = COALESCE(_model_id, approved_model_id),
         approved_instruction_id = COALESCE(_instruction_id, approved_instruction_id),
         prompt_template_code = COALESCE((SELECT template_code FROM public.ai_governance_instructions WHERE id = _instruction_id), prompt_template_code),
         prompt_template_version = COALESCE((SELECT version FROM public.ai_governance_instructions WHERE id = _instruction_id), prompt_template_version),
         use_case_version = use_case_version + 1,
         updated_at = now()
   WHERE code = _use_case_code;

  PERFORM public.ai_gov_log_event('USE_CASE', NULL, _use_case_code, 'CONFIGURATION_BOUND', NULL, NULL, _uid, _rationale,
    jsonb_build_object('before', _before, 'model_id', _model_id, 'instruction_id', _instruction_id));
  RETURN jsonb_build_object('use_case_code', _use_case_code, 'model_id', _model_id, 'instruction_id', _instruction_id);
END $$;
REVOKE ALL ON FUNCTION public.ai_governance_use_case_bind(text,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_governance_use_case_bind(text,uuid,uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ai_governance_thresholds_save(
  _unreviewed_hours integer, _low_confidence_below numeric,
  _high_modification_rate numeric, _high_rejection_rate numeric, _min_volume_for_analysis integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _before jsonb;
BEGIN
  _uid := public.ai_gov_require(ARRAY['edit','approve']);
  SELECT to_jsonb(t) INTO _before FROM public.ai_governance_thresholds t WHERE id;
  UPDATE public.ai_governance_thresholds
     SET unreviewed_hours = GREATEST(1, _unreviewed_hours),
         low_confidence_below = LEAST(1, GREATEST(0, _low_confidence_below)),
         high_modification_rate = LEAST(1, GREATEST(0, _high_modification_rate)),
         high_rejection_rate = LEAST(1, GREATEST(0, _high_rejection_rate)),
         min_volume_for_analysis = GREATEST(1, _min_volume_for_analysis),
         updated_by = _uid, updated_at = now()
   WHERE id;
  PERFORM public.ai_gov_log_event('THRESHOLDS', NULL, 'ai_governance_thresholds', 'UPDATED', NULL, NULL, _uid, NULL,
    jsonb_build_object('before', _before));
  RETURN (SELECT to_jsonb(t) FROM public.ai_governance_thresholds t WHERE id);
END $$;
REVOKE ALL ON FUNCTION public.ai_governance_thresholds_save(integer,numeric,numeric,numeric,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_governance_thresholds_save(integer,numeric,numeric,numeric,integer) TO authenticated, service_role;

-- ------------------------------------------------------ assurance review
CREATE OR REPLACE FUNCTION public.ai_assurance_review_create(_insight_id uuid, _notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _id uuid; _uc text; _ref text;
BEGIN
  _uid := public.ai_gov_require(ARRAY['assure','approve']);
  SELECT use_case_code INTO _uc FROM public.conduct_ai_insights WHERE id = _insight_id;
  IF _uc IS NULL THEN RAISE EXCEPTION 'insight_not_found' USING ERRCODE = 'P0002'; END IF;
  _ref := 'AIA-' || to_char(now(), 'YYYY') || '-' || lpad((
    (SELECT count(*) + 1 FROM public.ai_assurance_reviews
      WHERE created_at >= date_trunc('year', now())))::text, 5, '0');
  INSERT INTO public.ai_assurance_reviews (reference, conduct_ai_insight_id, use_case_code, reviewer_id, notes)
  VALUES (_ref, _insight_id, _uc, _uid, NULLIF(btrim(COALESCE(_notes,'')),''))
  RETURNING id INTO _id;
  PERFORM public.ai_gov_log_event('ASSURANCE_REVIEW', _id, _ref, 'ASSURANCE_REVIEW_CREATED', NULL, 'IN_PROGRESS', _uid, NULL,
    jsonb_build_object('insight_id', _insight_id, 'use_case_code', _uc));
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.ai_assurance_review_create(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_assurance_review_create(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ai_assurance_assess(
  _review_id uuid, _criterion_code text, _assessment text, _comment text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _id uuid; _status text;
BEGIN
  _uid := public.ai_gov_require(ARRAY['assure','approve']);
  IF _assessment NOT IN ('SATISFACTORY','OBSERVATION','IMPROVEMENT_REQUIRED','CONTROL_FAILURE','NOT_APPLICABLE') THEN
    RAISE EXCEPTION 'unsupported_assessment: %', _assessment USING ERRCODE = '22023';
  END IF;
  SELECT status INTO _status FROM public.ai_assurance_reviews WHERE id = _review_id;
  IF _status IS NULL THEN RAISE EXCEPTION 'assurance_review_not_found' USING ERRCODE = 'P0002'; END IF;
  IF _status = 'CLOSED' THEN RAISE EXCEPTION 'assurance_review_closed' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.ai_assurance_criteria_assessments (review_id, criterion_code, assessment, comment, assessed_by)
  VALUES (_review_id, _criterion_code, _assessment, NULLIF(btrim(COALESCE(_comment,'')),''), _uid)
  ON CONFLICT (review_id, criterion_code)
  DO UPDATE SET assessment = EXCLUDED.assessment, comment = EXCLUDED.comment, assessed_by = EXCLUDED.assessed_by
  RETURNING id INTO _id;

  PERFORM public.ai_gov_log_event('ASSURANCE_REVIEW', _review_id, _criterion_code, 'ASSURANCE_FINDING_RECORDED', NULL, _assessment, _uid, _comment, '{}'::jsonb);
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.ai_assurance_assess(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_assurance_assess(uuid,text,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ai_assurance_remediation_set(
  _review_id uuid, _action text, _owner uuid, _due_date date, _status text, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _before text;
BEGIN
  _uid := public.ai_gov_require(ARRAY['assure','approve']);
  IF _status IS NOT NULL AND _status NOT IN ('OPEN','IN_PROGRESS','COMPLETED','NOT_REQUIRED') THEN
    RAISE EXCEPTION 'unsupported_remediation_status: %', _status USING ERRCODE = '22023';
  END IF;
  SELECT remediation_status INTO _before FROM public.ai_assurance_reviews WHERE id = _review_id;
  UPDATE public.ai_assurance_reviews
     SET remediation_action = _action, remediation_owner = _owner, remediation_due_date = _due_date,
         remediation_status = _status, notes = COALESCE(NULLIF(btrim(COALESCE(_note,'')),''), notes),
         updated_at = now()
   WHERE id = _review_id;
  PERFORM public.ai_gov_log_event('ASSURANCE_REVIEW', _review_id, NULL, 'REMEDIATION_STATUS_CHANGED', _before, _status, _uid, _note, '{}'::jsonb);
  RETURN jsonb_build_object('review_id', _review_id, 'remediation_status', _status);
END $$;
REVOKE ALL ON FUNCTION public.ai_assurance_remediation_set(uuid,text,uuid,date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_assurance_remediation_set(uuid,text,uuid,date,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ai_assurance_review_conclude(
  _review_id uuid, _conclusion text, _closure_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _status text;
BEGIN
  _uid := public.ai_gov_require(ARRAY['assure','approve']);
  IF _conclusion NOT IN ('SATISFACTORY','OBSERVATION','IMPROVEMENT_REQUIRED','CONTROL_FAILURE') THEN
    RAISE EXCEPTION 'unsupported_conclusion: %', _conclusion USING ERRCODE = '22023';
  END IF;
  IF COALESCE(btrim(COALESCE(_closure_note,'')),'') = '' THEN
    RAISE EXCEPTION 'closure_note_required: an assurance conclusion requires a written basis' USING ERRCODE = '22023';
  END IF;
  SELECT status INTO _status FROM public.ai_assurance_reviews WHERE id = _review_id;
  IF _status IS NULL THEN RAISE EXCEPTION 'assurance_review_not_found' USING ERRCODE = 'P0002'; END IF;
  IF _status = 'CLOSED' THEN RAISE EXCEPTION 'assurance_review_closed' USING ERRCODE = '22023'; END IF;

  UPDATE public.ai_assurance_reviews
     SET status = 'CLOSED', conclusion = _conclusion, closure_note = btrim(_closure_note),
         closed_at = now(), closed_by = _uid, updated_at = now()
   WHERE id = _review_id;

  PERFORM public.ai_gov_log_event('ASSURANCE_REVIEW', _review_id, _conclusion, 'ASSURANCE_REVIEW_CLOSED', _status, 'CLOSED', _uid, _closure_note, '{}'::jsonb);
  PERFORM public.log_compliance_audit_as_actor(_uid, 'APPROVE', 'ai_assurance_review', _review_id,
    jsonb_build_object('status', _status), jsonb_build_object('status','CLOSED','conclusion',_conclusion),
    _closure_note, NULL, NULL, NULL, jsonb_build_object('module','ai_management'));
  RETURN jsonb_build_object('review_id', _review_id, 'status','CLOSED','conclusion',_conclusion,
                            'ai_evidence_unchanged', true);
END $$;
REVOKE ALL ON FUNCTION public.ai_assurance_review_conclude(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_assurance_review_conclude(uuid,text,text) TO authenticated, service_role;
-- MC-08 certification defect (root cause fix): the governed AI operations passed
-- an untyped action and a uuid object id to the audit helper, whose signature
-- takes an enum action and a text object id. Every lifecycle transition, stop
-- control change and assurance conclusion failed when writing its audit entry.
-- The earlier compatibility overload made the call ambiguous, so it is removed
-- and the three call sites are cast explicitly instead.
DROP FUNCTION IF EXISTS public.log_compliance_audit_as_actor(uuid, text, text, uuid, jsonb, jsonb, text, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.ai_assurance_review_conclude(_review_id uuid, _conclusion text, _closure_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  PERFORM public.log_compliance_audit_as_actor(_uid, 'APPROVE'::public.compliance_audit_action, 'ai_assurance_review', _review_id::text,
    jsonb_build_object('status', _status), jsonb_build_object('status','CLOSED','conclusion',_conclusion),
    _closure_note, NULL, NULL, NULL, jsonb_build_object('module','ai_management'));
  RETURN jsonb_build_object('review_id', _review_id, 'status','CLOSED','conclusion',_conclusion,
                            'ai_evidence_unchanged', true);
END $function$;

CREATE OR REPLACE FUNCTION public.ai_governance_kill_switch_set(_scope_key text, _engage boolean, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  PERFORM public.log_compliance_audit_as_actor(_uid, 'OVERRIDE'::public.compliance_audit_action, 'ai_governance_kill_switch', NULL::text,
    jsonb_build_object('is_engaged', _was), jsonb_build_object('is_engaged', _engage, 'scope_key', _scope_key),
    _reason, NULL, NULL, NULL, jsonb_build_object('module','ai_management'));

  RETURN jsonb_build_object('scope_key', _scope_key, 'is_engaged', _engage,
    'effect', CASE WHEN _engage
      THEN 'AI assistance is stopped in this scope with immediate effect. Regulatory records, deterministic rules and supervisory workflow are unaffected.'
      ELSE 'AI assistance is available again in this scope.' END);
END $function$;

CREATE OR REPLACE FUNCTION public.ai_governance_transition(_object_type text, _object_key text, _to_state text, _rationale text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    (CASE WHEN _to = 'ACTIVE' THEN 'APPROVE' ELSE 'UPDATE' END)::public.compliance_audit_action,
    'ai_governance_' || lower(_object_type), _id::text,
    jsonb_build_object('lifecycle_state', _from::text),
    jsonb_build_object('lifecycle_state', _to::text, 'object_key', _object_key),
    _rationale, NULL, NULL, NULL, jsonb_build_object('module','ai_management'));

  RETURN jsonb_build_object('object_type', _object_type, 'object_key', _object_key,
                            'from_state', _from::text, 'to_state', _to::text, 'actor_id', _uid);
END $function$;
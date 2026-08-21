-- ============================================================
-- Governed resolution + mandatory audit + admin read models
-- ============================================================

CREATE OR REPLACE FUNCTION public.onboarding_resolve_entity(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_raw jsonb;
  v_cands jsonb := '[]'::jsonb;
  c jsonb;
  v_entity uuid;
  v_token text;
  v_uid uuid := auth.uid();
  v_journey text := COALESCE(NULLIF(_payload->>'journey_type',''), 'ENTITY_FIRST');
  v_channel text := COALESCE(NULLIF(_payload->>'source_channel',''), 'PUBLIC_REGISTRATION');
  v_event uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;

  IF btrim(COALESCE(_payload->>'legal_name','')) = '' THEN
    PERFORM public.onboarding_log_identification_event(
      v_uid, v_journey, v_channel, _payload, 'VALIDATION_FAILURE',
      NULL, NULL, '[]'::jsonb, NULL, 'legal_name is required');
    RAISE EXCEPTION 'legal_name is required' USING ERRCODE='22023';
  END IF;

  BEGIN
    v_raw := public.entity_resolve_identity(_payload);
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.onboarding_log_identification_event(
      v_uid, v_journey, v_channel, _payload, 'SYSTEM_ERROR',
      NULL, NULL, '[]'::jsonb, NULL, SQLERRM);
    RAISE;
  END;

  INSERT INTO public.onboarding_journey_state (user_id, stage, intended_journey, intended_route, context)
  VALUES (v_uid, 'ENTITY_IDENTIFICATION',
          COALESCE(NULLIF(_payload->>'intended_journey',''), v_journey), NULLIF(_payload->>'intended_route',''),
          jsonb_build_object('legal_name', _payload->>'legal_name', 'journey_type', v_journey))
  ON CONFLICT (user_id) DO UPDATE
    SET stage = CASE WHEN public.onboarding_journey_state.stage IN ('AUTHORITY_GRANTED','APPLICATION','COMPLETE')
                     THEN public.onboarding_journey_state.stage ELSE 'ENTITY_IDENTIFICATION' END,
        intended_journey = COALESCE(NULLIF(EXCLUDED.intended_journey,''), public.onboarding_journey_state.intended_journey),
        intended_route = COALESCE(NULLIF(EXCLUDED.intended_route,''), public.onboarding_journey_state.intended_route),
        context = public.onboarding_journey_state.context || EXCLUDED.context;

  v_event := public.onboarding_log_identification_event(
    v_uid, v_journey, v_channel, _payload, COALESCE(v_raw->>'outcome','NO_MATCH'),
    NULLIF(v_raw->>'entity_id','')::uuid, NULLIF(v_raw->>'case_id','')::uuid,
    COALESCE(v_raw->'candidates','[]'::jsonb), v_raw->>'match_basis', NULL);

  IF (v_raw->>'outcome') = 'EXACT_MATCH' THEN
    v_entity := (v_raw->>'entity_id')::uuid;
    v_token := public.onboarding_issue_token('membership_target', v_entity, NULL,
                 jsonb_build_object('match_basis', v_raw->>'match_basis', 'identification_event_id', v_event));
    RETURN jsonb_build_object(
      'outcome', 'EXACT_MATCH',
      'match_basis', v_raw->>'match_basis',
      'event_reference', (SELECT event_reference FROM public.entity_identity_resolution_events WHERE id = v_event),
      'membership_target_token', v_token,
      'entity_display', jsonb_build_object(
          'legal_name', COALESCE(v_raw->'entity'->>'legal_name', v_raw->'entity'->>'name'),
          'status', v_raw->'entity'->>'status'),
      'candidates', '[]'::jsonb);
  END IF;

  FOR c IN SELECT jsonb_array_elements(COALESCE(v_raw->'candidates','[]'::jsonb)) LOOP
    v_cands := v_cands || jsonb_build_array(jsonb_build_object(
      'candidate_token', public.onboarding_issue_token('candidate',
          NULLIF(c->>'entity_id','')::uuid, NULLIF(v_raw->>'case_id','')::uuid,
          jsonb_build_object('identification_event_id', v_event)),
      'legal_name', c->>'legal_name',
      'match_score', c->'match_score',
      'match_basis', c->>'match_basis'));
  END LOOP;

  RETURN jsonb_build_object(
    'outcome', v_raw->>'outcome',
    'case_reference', v_raw->>'case_number',
    'event_reference', (SELECT event_reference FROM public.entity_identity_resolution_events WHERE id = v_event),
    'resolution_token', public.onboarding_issue_token('resolution', NULL,
        NULLIF(v_raw->>'case_id','')::uuid, _payload || jsonb_build_object('identification_event_id', v_event)),
    'candidates', v_cands);
END $function$;

-- Follow-up: provisioning a provisional entity
CREATE OR REPLACE FUNCTION public.onboarding_provision_from_token(_resolution_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r public.onboarding_resolution_tokens; v_res jsonb; v_entity uuid; v_event uuid;
BEGIN
  r := public.onboarding_redeem_token(_resolution_token, ARRAY['resolution']);
  v_res := public.wb_onboarding_provision_entity(r.payload || jsonb_build_object('case_id', r.case_id));
  v_entity := (v_res->>'entity_id')::uuid;
  UPDATE public.onboarding_resolution_tokens SET consumed_at = now() WHERE id = r.id;

  v_event := NULLIF(r.payload->>'identification_event_id','')::uuid;
  PERFORM public.onboarding_record_follow_up('PROVISIONS_NEW_ENTITY',
    jsonb_build_object('entity_id', v_entity), v_event, auth.uid());
  PERFORM public.onboarding_record_journey_event(auth.uid(), 'PROVISIONAL_ENTITY_CREATED', 'ENTITY_FIRST',
    v_entity, NULL, v_event, jsonb_build_object('legal_name', r.payload->>'legal_name'));

  RETURN jsonb_build_object(
    'membership_target_token', public.onboarding_issue_token('membership_target', v_entity, r.case_id,
        jsonb_build_object('identification_event_id', v_event)),
    'entity_display', jsonb_build_object('legal_name', r.payload->>'legal_name'));
END $function$;

-- Follow-up: membership / authority request
CREATE OR REPLACE FUNCTION public.onboarding_request_membership_by_token(_token text, _membership_role_key text, _authority_evidence_reference text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r public.onboarding_resolution_tokens; v_membership uuid; v_status text; v_stage text; v_route text; v_event uuid; v_primary boolean;
BEGIN
  r := public.onboarding_redeem_token(_token, ARRAY['membership_target','candidate']);
  IF r.entity_id IS NULL THEN RAISE EXCEPTION 'This reference has no entity to link' USING ERRCODE='22023'; END IF;

  v_membership := public.entity_membership_request(r.entity_id, _membership_role_key, _authority_evidence_reference);
  SELECT status INTO v_status FROM public.entity_user_memberships WHERE id = v_membership;

  v_stage := CASE WHEN v_status = 'APPROVED' THEN 'AUTHORITY_GRANTED' ELSE 'AUTHORITY_PENDING' END;

  UPDATE public.onboarding_journey_state
     SET stage = v_stage, entity_id = r.entity_id, membership_id = v_membership
   WHERE user_id = auth.uid()
   RETURNING intended_route INTO v_route;

  IF NOT FOUND THEN
    INSERT INTO public.onboarding_journey_state (user_id, stage, entity_id, membership_id)
    VALUES (auth.uid(), v_stage, r.entity_id, v_membership)
    RETURNING intended_route INTO v_route;
  END IF;

  UPDATE public.onboarding_resolution_tokens SET consumed_at = now() WHERE id = r.id;

  v_event := NULLIF(r.payload->>'identification_event_id','')::uuid;
  IF r.token_kind = 'candidate' THEN
    PERFORM public.onboarding_record_follow_up('SELECTS_CANDIDATE', jsonb_build_object('entity_id', r.entity_id), v_event, auth.uid());
  END IF;
  PERFORM public.onboarding_record_follow_up('REQUESTS_MEMBERSHIP',
    jsonb_build_object('membership_id', v_membership, 'role_key', _membership_role_key, 'status', v_status), v_event, auth.uid());
  PERFORM public.onboarding_record_journey_event(auth.uid(), 'MEMBERSHIP_REQUESTED', NULL, r.entity_id, NULL, v_event,
    jsonb_build_object('membership_id', v_membership, 'role_key', _membership_role_key));
  IF v_status = 'APPROVED' THEN
    PERFORM public.onboarding_record_journey_event(auth.uid(), 'MEMBERSHIP_APPROVED', NULL, r.entity_id, NULL, v_event,
      jsonb_build_object('membership_id', v_membership));
  END IF;

  SELECT COALESCE(is_primary_representative,false) INTO v_primary
    FROM public.entity_membership_roles WHERE key = _membership_role_key;
  IF COALESCE(v_primary,false) AND EXISTS (SELECT 1 FROM public.onboarding_alert_rules WHERE rule_key='PRIMARY_REPRESENTATIVE_REQUEST' AND is_active) THEN
    INSERT INTO public.onboarding_alert_signals (rule_key, severity, user_id, identification_event_id, subject_name, detail)
    VALUES ('PRIMARY_REPRESENTATIVE_REQUEST','high', auth.uid(), v_event, NULL,
            jsonb_build_object('entity_id', r.entity_id, 'role_key', _membership_role_key));
  END IF;

  RETURN jsonb_build_object(
    'membership_status', v_status,
    'authority_sufficient', v_status = 'APPROVED',
    'stage', v_stage,
    'resume_route', COALESCE(v_route, CASE WHEN v_status = 'APPROVED' THEN '/applications/new' ELSE '/register/authority-pending' END));
END $function$;

-- T. FORM_FIRST resolution at submission / review
CREATE OR REPLACE FUNCTION public.onboarding_form_first_resolve(_registration_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  reg public.registrations;
  v_payload jsonb;
  v_raw jsonb;
  v_event uuid;
  v_entity uuid;
  v_case uuid;
  v_status text;
  v_prov jsonb;
  v_existing public.registration_entity_bindings;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO reg FROM public.registrations WHERE id = _registration_id;
  IF reg.id IS NULL THEN RAISE EXCEPTION 'Registration not found' USING ERRCODE='22023'; END IF;
  IF reg.user_id <> auth.uid() AND NOT (public.is_internal_staff(auth.uid()) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_existing FROM public.registration_entity_bindings WHERE registration_id = _registration_id;
  IF v_existing.id IS NOT NULL AND v_existing.entity_id IS NOT NULL THEN
    RETURN jsonb_build_object('outcome','ALREADY_BOUND','entity_bound',true,'binding_status',v_existing.binding_status);
  END IF;

  v_payload := jsonb_build_object(
    'legal_name', reg.applicant_name,
    'identifiers', COALESCE(reg.entity_specific_data->'identifiers','[]'::jsonb),
    'license_number', NULLIF(reg.entity_specific_data->>'license_number',''),
    'sector_id', reg.sector_id::text,
    'journey_type', 'FORM_FIRST');

  BEGIN
    v_raw := public.entity_resolve_identity(v_payload);
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.onboarding_log_identification_event(
      reg.user_id, 'FORM_FIRST', 'PUBLIC_REGISTRATION', v_payload, 'SYSTEM_ERROR', NULL, NULL, '[]'::jsonb, NULL, SQLERRM);
    RAISE;
  END;

  v_entity := NULLIF(v_raw->>'entity_id','')::uuid;
  v_case := NULLIF(v_raw->>'case_id','')::uuid;

  v_event := public.onboarding_log_identification_event(
    reg.user_id, 'FORM_FIRST', 'PUBLIC_REGISTRATION', v_payload, COALESCE(v_raw->>'outcome','NO_MATCH'),
    v_entity, v_case, COALESCE(v_raw->'candidates','[]'::jsonb), v_raw->>'match_basis', NULL);

  IF (v_raw->>'outcome') = 'EXACT_MATCH' THEN
    v_status := 'BOUND_EXISTING';
  ELSIF (v_raw->>'outcome') = 'POSSIBLE_MATCH' THEN
    v_status := 'PENDING_RESOLUTION';
  ELSE
    v_prov := public.wb_onboarding_provision_entity(v_payload || jsonb_build_object('case_id', v_case));
    v_entity := (v_prov->>'entity_id')::uuid;
    v_status := 'BOUND_PROVISIONAL';
    PERFORM public.onboarding_record_journey_event(reg.user_id, 'PROVISIONAL_ENTITY_CREATED', 'FORM_FIRST',
      v_entity, _registration_id, v_event, jsonb_build_object('legal_name', reg.applicant_name));
  END IF;

  INSERT INTO public.registration_entity_bindings
    (registration_id, entity_id, resolution_case_id, identification_event_id, binding_status, bound_at)
  VALUES (_registration_id, v_entity, v_case, v_event, v_status,
          CASE WHEN v_entity IS NOT NULL THEN now() END)
  ON CONFLICT (registration_id) DO UPDATE
    SET entity_id = COALESCE(EXCLUDED.entity_id, public.registration_entity_bindings.entity_id),
        resolution_case_id = COALESCE(EXCLUDED.resolution_case_id, public.registration_entity_bindings.resolution_case_id),
        identification_event_id = EXCLUDED.identification_event_id,
        binding_status = EXCLUDED.binding_status,
        bound_at = COALESCE(EXCLUDED.bound_at, public.registration_entity_bindings.bound_at),
        updated_at = now();

  PERFORM public.onboarding_record_follow_up(
    CASE WHEN v_status = 'PENDING_RESOLUTION' THEN 'CONTINUE_FORM_FIRST' ELSE 'CONTINUES_APPLICATION' END,
    jsonb_build_object('registration_id', _registration_id, 'binding_status', v_status), v_event, reg.user_id);

  RETURN jsonb_build_object(
    'outcome', v_raw->>'outcome',
    'binding_status', v_status,
    'entity_bound', v_entity IS NOT NULL,
    'case_reference', v_raw->>'case_number',
    'event_reference', (SELECT event_reference FROM public.entity_identity_resolution_events WHERE id = v_event));
END $function$;

GRANT EXECUTE ON FUNCTION public.onboarding_form_first_resolve(uuid) TO authenticated;

-- ---------- Admin read models ----------
CREATE OR REPLACE FUNCTION public.onboarding_identification_activity(
  _filters jsonb DEFAULT '{}'::jsonb, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS TABLE (
  id uuid, event_reference text, occurred_at timestamptz, user_id uuid, user_email text,
  journey_type text, source_channel text, searched_legal_name text, identifier_type text,
  identifier_value_masked text, licence_number_masked text, resolution_outcome text,
  matched_entity_id uuid, matched_entity_name text, candidate_count integer,
  highest_match_score numeric, match_basis text, follow_up_action text, follow_up_at timestamptz,
  resolution_case_id uuid, resolution_case_number text, failure_reason text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.onboarding_can_view_audit(auth.uid()) THEN
    RAISE EXCEPTION 'Not permitted to read onboarding audit activity' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT e.id, e.event_reference, e.occurred_at, e.user_id,
         COALESCE(p.email, plu.email) AS user_email,
         e.journey_type, e.source_channel, e.searched_legal_name, e.identifier_type,
         e.identifier_value_masked, e.licence_number_masked, e.resolution_outcome,
         e.matched_entity_id, l.company_name, e.candidate_count,
         e.highest_match_score, e.match_basis, e.follow_up_action, e.follow_up_at,
         e.resolution_case_id, rc.case_number, e.failure_reason
    FROM public.entity_identity_resolution_events e
    LEFT JOIN public.profiles p ON p.id = e.user_id
    LEFT JOIN public.pre_license_users plu ON plu.id = e.user_id
    LEFT JOIN public.licensees l ON l.id = e.matched_entity_id
    LEFT JOIN public.entity_resolution_cases rc ON rc.id = e.resolution_case_id
   WHERE (_filters->>'from' IS NULL OR e.occurred_at >= (_filters->>'from')::timestamptz)
     AND (_filters->>'to' IS NULL OR e.occurred_at <= (_filters->>'to')::timestamptz)
     AND (NULLIF(_filters->>'journey_type','') IS NULL OR e.journey_type = _filters->>'journey_type')
     AND (NULLIF(_filters->>'outcome','') IS NULL OR e.resolution_outcome = _filters->>'outcome')
     AND (NULLIF(_filters->>'follow_up_action','') IS NULL OR e.follow_up_action = _filters->>'follow_up_action')
     AND (NULLIF(_filters->>'regulator_id','') IS NULL OR e.regulator_id = (_filters->>'regulator_id')::uuid)
     AND (NULLIF(_filters->>'resolution_case_id','') IS NULL OR e.resolution_case_id = (_filters->>'resolution_case_id')::uuid)
     AND (NULLIF(_filters->>'organisation','') IS NULL OR e.searched_legal_name ILIKE '%' || (_filters->>'organisation') || '%'
          OR e.normalized_legal_name = upper(regexp_replace(_filters->>'organisation','[^A-Za-z0-9]','','g')))
     AND (NULLIF(_filters->>'user','') IS NULL
          OR COALESCE(p.email, plu.email) ILIKE '%' || (_filters->>'user') || '%')
   ORDER BY e.occurred_at DESC
   LIMIT GREATEST(COALESCE(_limit,50),1) OFFSET GREATEST(COALESCE(_offset,0),0);
END $function$;

CREATE OR REPLACE FUNCTION public.onboarding_identification_activity_counts(_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT public.onboarding_can_view_audit(auth.uid()) THEN
    RAISE EXCEPTION 'Not permitted to read onboarding audit activity' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'total', count(*),
    'exact_match', count(*) FILTER (WHERE resolution_outcome='EXACT_MATCH'),
    'possible_match', count(*) FILTER (WHERE resolution_outcome='POSSIBLE_MATCH'),
    'no_match', count(*) FILTER (WHERE resolution_outcome='NO_MATCH'),
    'failures', count(*) FILTER (WHERE resolution_outcome IN ('SYSTEM_ERROR','ERROR','VALIDATION_FAILURE','PROVIDER_UNAVAILABLE')),
    'open_signals', (SELECT count(*) FROM public.onboarding_alert_signals WHERE status='open'))
    INTO v
  FROM public.onboarding_identification_activity(_filters, 100000, 0);
  RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public.registration_journey_register(_filters jsonb DEFAULT '{}'::jsonb, _limit integer DEFAULT 100, _offset integer DEFAULT 0)
RETURNS TABLE (
  user_id uuid, user_email text, journey_type text, stage text, entity_id uuid, entity_name text,
  membership_status text, last_event_at timestamptz, event_count bigint, latest_stage text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.onboarding_can_view_audit(auth.uid()) THEN
    RAISE EXCEPTION 'Not permitted to read onboarding journeys' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT js.user_id,
         COALESCE(p.email, plu.email),
         COALESCE(js.intended_journey, js.context->>'journey_type'),
         js.stage, js.entity_id, l.company_name,
         m.status, GREATEST(js.updated_at, COALESCE(max(ev.occurred_at), js.updated_at)),
         count(ev.id), max(ev.stage)
    FROM public.onboarding_journey_state js
    LEFT JOIN public.profiles p ON p.id = js.user_id
    LEFT JOIN public.pre_license_users plu ON plu.id = js.user_id
    LEFT JOIN public.licensees l ON l.id = js.entity_id
    LEFT JOIN public.entity_user_memberships m ON m.id = js.membership_id
    LEFT JOIN public.registration_journey_events ev ON ev.user_id = js.user_id
   WHERE (NULLIF(_filters->>'user','') IS NULL OR COALESCE(p.email, plu.email) ILIKE '%' || (_filters->>'user') || '%')
     AND (NULLIF(_filters->>'stage','') IS NULL OR js.stage = _filters->>'stage')
     AND (NULLIF(_filters->>'journey_type','') IS NULL OR COALESCE(js.intended_journey, js.context->>'journey_type') = _filters->>'journey_type')
   GROUP BY js.user_id, p.email, plu.email, js.intended_journey, js.context, js.stage, js.entity_id, l.company_name, m.status, js.updated_at
   ORDER BY GREATEST(js.updated_at, COALESCE(max(ev.occurred_at), js.updated_at)) DESC
   LIMIT GREATEST(COALESCE(_limit,100),1) OFFSET GREATEST(COALESCE(_offset,0),0);
END $function$;

CREATE OR REPLACE FUNCTION public.onboarding_user_journey_events(_user_id uuid)
RETURNS TABLE (event_reference text, occurred_at timestamptz, stage text, journey_type text, entity_id uuid, detail jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF _user_id <> auth.uid() AND NOT public.onboarding_can_view_audit(auth.uid()) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT e.event_reference, e.occurred_at, e.stage, e.journey_type, e.entity_id, e.detail
    FROM public.registration_journey_events e
   WHERE e.user_id = _user_id
   ORDER BY e.occurred_at DESC LIMIT 500;
END $function$;

CREATE OR REPLACE FUNCTION public.entity_onboarding_activity(_entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT public.onboarding_can_view_audit(auth.uid()) THEN
    RAISE EXCEPTION 'Not permitted to read onboarding activity' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'identity_matches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'event_reference', e.event_reference, 'occurred_at', e.occurred_at,
        'searched_legal_name', e.searched_legal_name, 'outcome', e.resolution_outcome,
        'match_basis', e.match_basis, 'journey_type', e.journey_type,
        'user_email', COALESCE(p.email, plu.email), 'follow_up_action', e.follow_up_action)
        ORDER BY e.occurred_at DESC)
      FROM public.entity_identity_resolution_events e
      LEFT JOIN public.profiles p ON p.id = e.user_id
      LEFT JOIN public.pre_license_users plu ON plu.id = e.user_id
      WHERE e.matched_entity_id = _entity_id OR _entity_id = ANY(e.candidate_entity_ids)), '[]'::jsonb),
    'membership_requests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'status', m.status, 'requested_at', m.requested_at, 'approved_at', m.approved_at,
        'user_email', COALESCE(p.email, plu.email), 'role', r.label) ORDER BY m.requested_at DESC)
      FROM public.entity_user_memberships m
      LEFT JOIN public.entity_membership_roles r ON r.id = m.membership_role_id
      LEFT JOIN public.profiles p ON p.id = m.user_id
      LEFT JOIN public.pre_license_users plu ON plu.id = m.user_id
      WHERE m.entity_id = _entity_id), '[]'::jsonb),
    'resolution_cases', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'case_number', c.case_number, 'status', c.status,
        'outcome', c.outcome, 'subject_name', c.subject_name, 'created_at', c.created_at) ORDER BY c.created_at DESC)
      FROM public.entity_resolution_cases c WHERE c.resolved_entity_id = _entity_id), '[]'::jsonb))
  INTO v;
  RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public.onboarding_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT (public.onboarding_can_view_audit(auth.uid()) OR public.is_internal_staff(auth.uid()) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'journeys_active', (SELECT count(*) FROM public.onboarding_journey_state WHERE stage NOT IN ('COMPLETE')),
    'identification_events_7d', (SELECT count(*) FROM public.entity_identity_resolution_events WHERE occurred_at > now() - interval '7 days'),
    'resolution_cases_open', (SELECT count(*) FROM public.entity_resolution_cases WHERE status NOT IN ('RESOLVED','CLOSED','resolved','closed')),
    'access_requests_pending', (SELECT count(*) FROM public.entity_user_memberships WHERE status IN ('REQUESTED','VERIFIED','PENDING')),
    'open_signals', (SELECT count(*) FROM public.onboarding_alert_signals WHERE status='open'))
  INTO v;
  RETURN v;
END $function$;

GRANT EXECUTE ON FUNCTION public.onboarding_identification_activity(jsonb,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onboarding_identification_activity_counts(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registration_journey_register(jsonb,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onboarding_user_journey_events(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_onboarding_activity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onboarding_overview() TO authenticated;
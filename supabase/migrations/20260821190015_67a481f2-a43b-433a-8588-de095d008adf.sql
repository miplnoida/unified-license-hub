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
         e.matched_entity_id, l.name, e.candidate_count,
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
         js.stage, js.entity_id, l.name,
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
   GROUP BY js.user_id, p.email, plu.email, js.intended_journey, js.context, js.stage, js.entity_id, l.name, m.status, js.updated_at
   ORDER BY GREATEST(js.updated_at, COALESCE(max(ev.occurred_at), js.updated_at)) DESC
   LIMIT GREATEST(COALESCE(_limit,100),1) OFFSET GREATEST(COALESCE(_offset,0),0);
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
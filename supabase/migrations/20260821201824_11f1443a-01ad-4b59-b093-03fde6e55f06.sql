CREATE OR REPLACE FUNCTION public.entity_resolution_case_view(_case_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); c public.entity_resolution_cases; b public.registration_entity_bindings;
BEGIN
  IF uid IS NULL OR NOT public.sec_has_permission(uid,'entity_resolution','view') THEN
    RAISE EXCEPTION 'entity_resolution.view required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO c FROM public.entity_resolution_cases WHERE id = _case_id;
  IF c.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO b FROM public.registration_entity_bindings WHERE resolution_case_id = _case_id;

  RETURN jsonb_build_object(
    'detail', jsonb_build_object(
      'id', c.id, 'case_number', c.case_number, 'status', c.status, 'outcome', c.outcome,
      'subject_name', c.subject_name, 'subject_identifiers', c.subject_identifiers,
      'provider_status', c.provider_status, 'authority_mode', c.authority_mode,
      'requires_maker_checker', public.entity_resolution_requires_maker_checker(_case_id),
      'application_id', c.application_id,
      'resolved_entity_id', c.resolved_entity_id,
      'resolved_entity_name', (SELECT COALESCE(o.legal_name, l.name) FROM public.licensees l
                                 LEFT JOIN public.organizations o ON o.party_id = l.party_id
                                WHERE l.id = c.resolved_entity_id),
      'decision_notes', c.decision_notes,
      'requested_at', c.requested_at, 'resolved_at', c.resolved_at,
      'resolved_by', c.resolved_by,
      'resolved_by_name', (SELECT COALESCE(full_name, email) FROM public.profiles WHERE id = c.resolved_by),
      'recommended_action', c.recommended_action,
      'recommended_entity_id', c.recommended_entity_id,
      'recommended_entity_name', (SELECT COALESCE(o.legal_name, l.name) FROM public.licensees l
                                    LEFT JOIN public.organizations o ON o.party_id = l.party_id
                                   WHERE l.id = c.recommended_entity_id),
      'recommended_by', c.recommended_by,
      'recommended_by_name', (SELECT COALESCE(full_name, email) FROM public.profiles WHERE id = c.recommended_by),
      'recommended_at', c.recommended_at, 'recommendation_notes', c.recommendation_notes,
      'escalated_by', c.escalated_by,
      'escalated_by_name', (SELECT COALESCE(full_name, email) FROM public.profiles WHERE id = c.escalated_by),
      'escalated_at', c.escalated_at, 'escalation_reason', c.escalation_reason,
      'supervisor_decision', c.supervisor_decision, 'supervisor_notes', c.supervisor_notes,
      'supervisor_decided_by', c.supervisor_decided_by,
      'supervisor_decided_by_name', (SELECT COALESCE(full_name, email) FROM public.profiles WHERE id = c.supervisor_decided_by),
      'supervisor_decided_at', c.supervisor_decided_at,
      'approved_by', c.approved_by, 'approved_at', c.approved_at
    ),
    'journey', jsonb_build_object(
      'journey_type', COALESCE(c.subject_payload->>'journey_type',
                               CASE WHEN b.registration_id IS NOT NULL THEN 'FORM_FIRST' ELSE 'ENTITY_FIRST' END),
      'registration_id', b.registration_id,
      'registration_reference', (SELECT registration_reference FROM public.registrations WHERE id = b.registration_id),
      'binding_status', b.binding_status,
      'applicant_name', (SELECT applicant_name FROM public.registrations WHERE id = b.registration_id),
      'applicant_email', (SELECT email FROM public.registrations WHERE id = b.registration_id),
      'sector_name', (SELECT s.name FROM public.registrations r JOIN public.sectors s ON s.id = r.sector_id WHERE r.id = b.registration_id),
      'initiated_at', COALESCE((SELECT created_at FROM public.registrations WHERE id = b.registration_id), c.requested_at)
    ),
    'candidates', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', mc.id, 'entity_id', mc.entity_id,
        'entity_name', COALESCE(o.legal_name, l.name),
        'lifecycle', COALESCE((SELECT ls.label FROM public.lifecycle_stages ls WHERE ls.id = l.lifecycle_stage_id), l.status),
        'licence_numbers', COALESCE((SELECT jsonb_agg(lic.license_number)
                                       FROM public.entity_licenses el
                                       JOIN public.licenses lic ON lic.id = el.license_id
                                      WHERE el.entity_id = mc.entity_id), '[]'::jsonb),
        'match_score', mc.match_score, 'match_basis', mc.match_basis,
        'signals', mc.signals, 'is_selected', mc.is_selected)
        ORDER BY mc.match_score DESC)
      FROM public.entity_match_candidates mc
      LEFT JOIN public.licensees l ON l.id = mc.entity_id
      LEFT JOIN public.organizations o ON o.party_id = l.party_id
      WHERE mc.case_id = _case_id), '[]'::jsonb),
    'events', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'event_type', e.event_type, 'created_at', e.created_at,
        'actor_id', e.actor_id,
        'actor_name', (SELECT COALESCE(full_name, email) FROM public.profiles WHERE id = e.actor_id),
        'detail', e.detail) ORDER BY e.created_at DESC)
      FROM public.entity_resolution_events e WHERE e.case_id = _case_id), '[]'::jsonb)
  );
END $function$;
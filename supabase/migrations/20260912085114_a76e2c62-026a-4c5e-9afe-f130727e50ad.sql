-- PCOMP-R2E: the SLA policy read model referenced a non-existent column
-- (sla_escalation_dispatches.created_at) and therefore failed at runtime as soon
-- as a governed deadline existed. Corrected to the canonical dispatched_at
-- column. Nothing else changes: same authority, same permissions, read only.
CREATE OR REPLACE FUNCTION public.supervisory_response_sla_view(_entity_id uuid, _domain_code text DEFAULT 'AML_CFT'::text, _assessment_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _d text := upper(COALESCE(NULLIF(_domain_code,''),'AML_CFT'));
        _view jsonb; _src jsonb; _aid uuid; _rating text; _exp jsonb := '[]'::jsonb;
        _m jsonb; _e jsonb; _obl jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);

  _view   := public.supervisory_consequence_view(_entity_id, _d, _assessment_id);
  _src    := _view->'source';
  _aid    := COALESCE(_assessment_id, NULLIF(_src->'assessment'->>'id','')::uuid);
  _rating := _src->>'current_rating';

  FOR _m IN SELECT x FROM jsonb_array_elements(public.supervisory_response_policy_action_map()) x LOOP
    _e := public.supervisory_sla_policy_internal(_aid, _m->>'policy_action', _rating);
    _exp := _exp || jsonb_build_object(
      'action', _m->>'policy_action',
      'label', _m->>'label',
      'status', _e->>'status',
      'governed', (_e->>'governed')::boolean,
      'reason_code', _e->>'reason_code',
      'reason', _e->>'reason',
      'rule_code', _e->'rule'->>'rule_code',
      'stage', _e->'rule'->>'stage',
      'duration_days', NULLIF(_e->'rule'->>'duration_days','')::numeric,
      'calendar_mode', _e->'rule'->>'calendar_mode',
      'pause_permitted', COALESCE((_e->'rule'->>'pause_permitted')::boolean,false),
      'pause_reasons', COALESCE(_e->'rule'->'pause_reasons','[]'::jsonb),
      'warning_percentage', NULLIF(_e->'rule'->>'warning_percentage','')::numeric,
      'escalation_tier_profile', _e->'rule'->>'escalation_tier_profile',
      'breach_severity', _e->'rule'->>'breach_severity',
      'policy_note', _e->'rule'->>'policy_note',
      'policy', _e->'policy',
      'policy_profile', _e->'policy_profile');
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'obligation_id', o.id, 'decision_id', o.decision_id,
           'action_type', o.action_type, 'stage_name', o.stage_name,
           'sla_policy_basis_status', o.sla_policy_basis_status,
           'sla_policy_reason_code', o.sla_policy_reason_code,
           'sla_policy_code', o.sla_policy_code,
           'sla_policy_version', o.sla_policy_version,
           'sla_policy_rule_code', o.sla_policy_rule_code,
           'sla_duration_days', o.sla_duration_days,
           'sla_calendar_mode', o.sla_calendar_mode,
           'calendar_resolution', o.calendar_resolution,
           'pause_permitted', o.pause_permitted,
           'pause_reasons', o.pause_reasons,
           'breach_severity', o.breach_severity,
           'escalation_tier_profile', o.escalation_tier_profile,
           'due_at', o.due_at, 'outcome', o.outcome, 'closed_at', o.closed_at,
           'recorded_at', o.created_at,
           'stage', CASE WHEN s.id IS NULL THEN NULL::jsonb ELSE jsonb_build_object(
             'stage_instance_id', s.id, 'state', s.state, 'started_at', s.started_at,
             'due_at', s.due_at, 'paused_at', s.paused_at, 'pause_seconds', s.pause_seconds,
             'breached_at', s.breached_at, 'completed_at', s.completed_at,
             'sla_hours', s.sla_hours, 'sla_source', s.sla_source,
             'first_breach_notified_at', s.first_breach_notified_at) END,
           'escalations', COALESCE((
             SELECT jsonb_agg(jsonb_build_object('tier', x.tier, 'dispatched_at', x.dispatched_at,
                                                 'recipients', x.recipients) ORDER BY x.tier)
               FROM public.sla_escalation_dispatches x
              WHERE x.workflow_instance_id = o.obligation_key), '[]'::jsonb))
         ORDER BY o.created_at DESC), '[]'::jsonb)
    INTO _obl
    FROM public.supervisory_response_sla_obligation o
    LEFT JOIN public.sla_stage_instances s ON s.id = o.stage_instance_id
   WHERE o.entity_id = _entity_id AND o.domain_code = _d;

  RETURN jsonb_build_object(
    'entity_id', _entity_id, 'domain_code', _d,
    'assessment_id', _aid, 'source_rating', _rating,
    'expectations', _exp,
    'obligations', _obl,
    'timing_authority','SLA_POLICY',
    'engine','PLATFORM_SLA_STAGE_ENGINE',
    'automation','Deadlines, holds, breaches and escalation are recorded by the platform SLA engine. No supervisory action, finding or enforcement case is ever created or closed automatically.');
END $function$;
CREATE OR REPLACE FUNCTION public.escalation_rules_list()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.enforce_permission('escalation_management', 'view');
  RETURN (
    SELECT coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object(
             'active_escalations',
             (SELECT count(*) FROM public.escalations e
               WHERE e.rule_id = r.id AND e.status NOT IN ('resolved','closed'))
           ) ORDER BY r.source_module, r.name), '[]'::jsonb)
    FROM public.escalation_rules r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.escalation_rule_save(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid := nullif(_payload->>'id','')::uuid;
BEGIN
  PERFORM public.enforce_permission('escalation_management', 'configure');

  IF coalesce(btrim(_payload->>'name'), '') = '' THEN
    RAISE EXCEPTION 'rule_name_required';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.escalation_rules (
      name, description, source_module, escalation_type, default_severity,
      initial_recipient_role,
      tier1_recipient_role, tier1_ack_threshold_minutes, tier1_template_id, tier1_channels,
      tier2_recipient_role, tier2_ack_threshold_minutes, tier2_template_id, tier2_channels,
      tier3_recipient_role, tier3_ack_threshold_minutes, tier3_template_id, tier3_channels,
      resolution_threshold_minutes, pause_on_acknowledgement, business_hours_only,
      business_calendar_profile_id, create_task, create_case, is_active, created_by, updated_by)
    VALUES (
      btrim(_payload->>'name'), nullif(_payload->>'description',''),
      _payload->>'source_module', (_payload->>'escalation_type')::public.escalation_type,
      coalesce(nullif(_payload->>'default_severity','')::public.escalation_severity, 'medium'),
      _payload->>'initial_recipient_role',
      nullif(_payload->>'tier1_recipient_role',''), nullif(_payload->>'tier1_ack_threshold_minutes','')::int,
      nullif(_payload->>'tier1_template_id','')::uuid,
      coalesce((SELECT array_agg(v::text) FROM jsonb_array_elements_text(coalesce(_payload->'tier1_channels','[]'::jsonb)) v), ARRAY['in_app','email']),
      nullif(_payload->>'tier2_recipient_role',''), nullif(_payload->>'tier2_ack_threshold_minutes','')::int,
      nullif(_payload->>'tier2_template_id','')::uuid,
      coalesce((SELECT array_agg(v::text) FROM jsonb_array_elements_text(coalesce(_payload->'tier2_channels','[]'::jsonb)) v), ARRAY['in_app','email']),
      nullif(_payload->>'tier3_recipient_role',''), nullif(_payload->>'tier3_ack_threshold_minutes','')::int,
      nullif(_payload->>'tier3_template_id','')::uuid,
      coalesce((SELECT array_agg(v::text) FROM jsonb_array_elements_text(coalesce(_payload->'tier3_channels','[]'::jsonb)) v), ARRAY['in_app','email']),
      nullif(_payload->>'resolution_threshold_minutes','')::int,
      coalesce((_payload->>'pause_on_acknowledgement')::boolean, true),
      coalesce((_payload->>'business_hours_only')::boolean, false),
      nullif(_payload->>'business_calendar_profile_id','')::uuid,
      coalesce((_payload->>'create_task')::boolean, false),
      coalesce((_payload->>'create_case')::boolean, false),
      coalesce((_payload->>'is_active')::boolean, true),
      auth.uid(), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.escalation_rules SET
      name = coalesce(btrim(_payload->>'name'), name),
      description = coalesce(nullif(_payload->>'description',''), description),
      default_severity = coalesce(nullif(_payload->>'default_severity','')::public.escalation_severity, default_severity),
      initial_recipient_role = coalesce(nullif(_payload->>'initial_recipient_role',''), initial_recipient_role),
      tier1_recipient_role = nullif(_payload->>'tier1_recipient_role',''),
      tier1_ack_threshold_minutes = nullif(_payload->>'tier1_ack_threshold_minutes','')::int,
      tier1_template_id = nullif(_payload->>'tier1_template_id','')::uuid,
      tier1_channels = coalesce((SELECT array_agg(v::text) FROM jsonb_array_elements_text(_payload->'tier1_channels') v), tier1_channels),
      tier2_recipient_role = nullif(_payload->>'tier2_recipient_role',''),
      tier2_ack_threshold_minutes = nullif(_payload->>'tier2_ack_threshold_minutes','')::int,
      tier2_template_id = nullif(_payload->>'tier2_template_id','')::uuid,
      tier2_channels = coalesce((SELECT array_agg(v::text) FROM jsonb_array_elements_text(_payload->'tier2_channels') v), tier2_channels),
      tier3_recipient_role = nullif(_payload->>'tier3_recipient_role',''),
      tier3_ack_threshold_minutes = nullif(_payload->>'tier3_ack_threshold_minutes','')::int,
      tier3_template_id = nullif(_payload->>'tier3_template_id','')::uuid,
      tier3_channels = coalesce((SELECT array_agg(v::text) FROM jsonb_array_elements_text(_payload->'tier3_channels') v), tier3_channels),
      resolution_threshold_minutes = nullif(_payload->>'resolution_threshold_minutes','')::int,
      pause_on_acknowledgement = coalesce((_payload->>'pause_on_acknowledgement')::boolean, pause_on_acknowledgement),
      business_hours_only = coalesce((_payload->>'business_hours_only')::boolean, business_hours_only),
      business_calendar_profile_id = nullif(_payload->>'business_calendar_profile_id','')::uuid,
      create_task = coalesce((_payload->>'create_task')::boolean, create_task),
      create_case = coalesce((_payload->>'create_case')::boolean, create_case),
      is_active = coalesce((_payload->>'is_active')::boolean, is_active),
      updated_by = auth.uid(),
      updated_at = now()
    WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'rule_not_found'; END IF;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.escalation_rule_preview(_rule_id uuid, _from timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r public.escalation_rules; v_out jsonb := '[]'::jsonb; t integer; cfg jsonb; v_at timestamptz;
BEGIN
  PERFORM public.enforce_permission('escalation_management', 'view');
  SELECT * INTO r FROM public.escalation_rules WHERE id = _rule_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'rule_not_found'; END IF;

  v_at := _from;
  FOR t IN 0..3 LOOP
    cfg := public.escalation_tier_config(_rule_id, t);
    IF cfg IS NULL OR coalesce(cfg->>'role','') = '' THEN CONTINUE; END IF;
    v_out := v_out || jsonb_build_object(
      'tier', t,
      'recipient_role', cfg->>'role',
      'channels', cfg->'channels',
      'notified_at', v_at,
      'acknowledge_by', public.escalation_deadline(_rule_id, v_at, (cfg->>'threshold')::int));
    v_at := coalesce(public.escalation_deadline(_rule_id, v_at, (cfg->>'threshold')::int), v_at);
  END LOOP;

  RETURN jsonb_build_object(
    'rule', to_jsonb(r),
    'tiers', v_out,
    'resolve_by', public.escalation_deadline(_rule_id, _from, r.resolution_threshold_minutes));
END;
$$;

REVOKE ALL ON FUNCTION public.escalation_rules_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.escalation_rule_save(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.escalation_rule_preview(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escalation_rules_list() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.escalation_rule_save(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.escalation_rule_preview(uuid, timestamptz) TO authenticated, service_role;

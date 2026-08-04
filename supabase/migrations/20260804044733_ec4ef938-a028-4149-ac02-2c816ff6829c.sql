CREATE OR REPLACE FUNCTION public.engine_rule_validate_payload(_payload jsonb, _rule_id uuid DEFAULT NULL)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  errs text[] := '{}';
  v_type text := _payload->>'rule_type';
  v_conditions jsonb := coalesce(_payload->'conditions','{}'::jsonb);
  v_actions jsonb := coalesce(_payload->'actions','[]'::jsonb);
  preds jsonb; p jsonb; act jsonb; wf uuid; sid uuid; idx int := 0;
  valid_ops text[] := ARRAY['gt','gte','lt','lte','eq','neq','between','in','not_in','contains','changed_by_pct','trend_up','trend_down'];
  valid_periods text[] := ARRAY['daily','weekly','monthly','quarterly','half_yearly','annual','rolling'];
BEGIN
  IF coalesce(btrim(_payload->>'name'),'') = '' THEN
    errs := array_append(errs, 'Rule name is required.');
  END IF;

  IF coalesce(btrim(_payload->>'rule_code'),'') <> '' AND EXISTS (
       SELECT 1 FROM public.engine_rules r
        WHERE lower(r.rule_code) = lower(btrim(_payload->>'rule_code'))
          AND (_rule_id IS NULL OR r.id <> _rule_id)) THEN
    errs := array_append(errs, 'Rule code is already used by another rule.');
  END IF;

  IF coalesce(btrim(_payload->>'module'),'') = '' THEN
    errs := array_append(errs, 'Module is required.');
  END IF;

  IF v_type IS NULL OR v_type NOT IN ('threshold','trend','peer_comparison','pattern_detection',
        'cross_field_validation','routing','sla','condition_monitoring','recurrence','scheduling',
        'macro_overlay','group_contagion') THEN
    errs := array_append(errs, 'Unsupported rule type.');
  END IF;

  IF coalesce(nullif(_payload->>'severity',''),'medium') NOT IN ('low','medium','high','critical') THEN
    errs := array_append(errs, 'Invalid severity.');
  END IF;

  IF jsonb_typeof(v_conditions) <> 'object' THEN
    errs := array_append(errs, 'Condition data is malformed.');
  ELSE
    preds := coalesce(v_conditions->'predicates','[]'::jsonb);
    IF jsonb_typeof(preds) <> 'array' THEN
      errs := array_append(errs, 'Condition data is malformed.');
    ELSIF jsonb_array_length(preds) = 0 THEN
      errs := array_append(errs, 'At least one condition is required.');
    ELSE
      FOR p IN SELECT * FROM jsonb_array_elements(preds) LOOP
        IF jsonb_typeof(p) <> 'object' THEN
          errs := array_append(errs, 'Condition data is malformed.');
          CONTINUE;
        END IF;
        IF coalesce(btrim(p->>'metric'),'') = '' THEN
          errs := array_append(errs, 'Every condition requires a metric.');
        END IF;
        IF coalesce(btrim(p->>'operator'),'') = '' OR NOT (p->>'operator' = ANY(valid_ops)) THEN
          errs := array_append(errs, format('Invalid operator "%s".', coalesce(p->>'operator','(empty)')));
        END IF;
        IF coalesce(btrim(p->>'value'),'') = '' THEN
          errs := array_append(errs, 'Every condition requires a threshold value.');
        ELSIF (p->>'operator') = ANY(ARRAY['gt','gte','lt','lte','eq','neq','changed_by_pct'])
              AND (p->>'value') !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
          errs := array_append(errs, 'Threshold value must be numeric for this operator.');
        END IF;
      END LOOP;
    END IF;

    IF nullif(v_conditions->>'period','') IS NOT NULL
       AND NOT ((v_conditions->>'period') = ANY(valid_periods)) THEN
      errs := array_append(errs, 'Invalid reporting period.');
    END IF;
    IF nullif(v_conditions->>'window_days','') IS NOT NULL THEN
      IF (v_conditions->>'window_days') !~ '^[0-9]+$' THEN
        errs := array_append(errs, 'Time window must be a positive number of days.');
      ELSIF v_type = 'pattern_detection' AND (v_conditions->>'window_days')::int < 7 THEN
        errs := array_append(errs, 'Pattern detection time window must be at least 7 days.');
      END IF;
    ELSIF v_type = 'pattern_detection' THEN
      errs := array_append(errs, 'Pattern detection time window must be at least 7 days.');
    END IF;

    IF jsonb_typeof(coalesce(v_conditions->'sector_ids','[]'::jsonb)) <> 'array' THEN
      errs := array_append(errs, 'Sector scope is malformed.');
    ELSE
      IF v_type IN ('threshold','trend','peer_comparison','macro_overlay','group_contagion')
         AND jsonb_array_length(coalesce(v_conditions->'sector_ids','[]'::jsonb)) = 0 THEN
        errs := array_append(errs, 'Sector scope is required for threshold and early-warning rules.');
      END IF;
      FOR p IN SELECT to_jsonb(t) FROM jsonb_array_elements_text(coalesce(v_conditions->'sector_ids','[]'::jsonb)) t LOOP
        BEGIN
          sid := (p #>> '{}')::uuid;
        EXCEPTION WHEN others THEN
          sid := NULL;
        END;
        IF sid IS NULL OR NOT EXISTS (SELECT 1 FROM public.sectors s WHERE s.id = sid) THEN
          errs := array_append(errs, 'Selected sector no longer exists.');
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF jsonb_typeof(v_actions) <> 'array' THEN
    errs := array_append(errs, 'Action data is malformed.');
  ELSIF jsonb_array_length(v_actions) = 0 THEN
    errs := array_append(errs, 'At least one action on trigger is required.');
  ELSE
    FOR act IN SELECT * FROM jsonb_array_elements(v_actions) LOOP
      idx := idx + 1;
      IF jsonb_typeof(act) <> 'object' OR coalesce(btrim(act->>'type'),'') = '' THEN
        errs := array_append(errs, format('Action %s is malformed.', idx));
        CONTINUE;
      END IF;
      IF act->>'type' = 'initiate_workflow' THEN
        wf := nullif(act->>'workflow_id','')::uuid;
        IF wf IS NULL THEN
          errs := array_append(errs, format('Action %s (Initiate Workflow) requires a workflow.', idx));
        ELSIF NOT EXISTS (SELECT 1 FROM public.approval_workflows w
                           WHERE w.id = wf AND w.current_published_version_id IS NOT NULL) THEN
          errs := array_append(errs, format('Action %s references a workflow that is not published.', idx));
        END IF;
      END IF;
      IF act->>'type' = 'generate_alert' AND coalesce(btrim(act->>'template'),'') = '' THEN
        errs := array_append(errs, format('Action %s (Generate Alert) requires alert text.', idx));
      END IF;
      IF act->>'type' = 'send_notification' THEN
        IF coalesce(btrim(act->>'event_key'),'') = '' THEN
          errs := array_append(errs, format('Action %s (Send Notification) requires a notification event.', idx));
        ELSIF NOT EXISTS (SELECT 1 FROM public.notification_event_configs c
                           WHERE c.event_key = act->>'event_key') THEN
          errs := array_append(errs, format('Action %s references an unknown notification event.', idx));
        END IF;
      END IF;
      IF act->>'type' = 'create_task' THEN
        IF coalesce(btrim(act->>'assigned_role'),'') = '' THEN
          errs := array_append(errs, format('Action %s (Create Task) requires an assigned role.', idx));
        ELSIF NOT EXISTS (
          SELECT 1 FROM public.roles r
           WHERE r.name = act->>'assigned_role'
              OR coalesce(r.system_role::text,'') = act->>'assigned_role') THEN
          errs := array_append(errs, format('Action %s references an unknown role.', idx));
        END IF;
        IF nullif(act->>'due_days','') IS NOT NULL AND (act->>'due_days') !~ '^[0-9]+$' THEN
          errs := array_append(errs, format('Action %s has an invalid due-day value.', idx));
        END IF;
      END IF;
      IF act->>'type' = 'raise_escalation' THEN
        IF coalesce(btrim(act->>'escalation_type'),'') = '' THEN
          errs := array_append(errs, format('Action %s (Raise Escalation) requires an escalation type.', idx));
        END IF;
        IF nullif(act->>'severity','') IS NOT NULL
           AND NOT ((act->>'severity') = ANY(ARRAY['low','medium','high','critical'])) THEN
          errs := array_append(errs, format('Action %s has an invalid escalation severity.', idx));
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF nullif(_payload->>'suppression_days','') IS NOT NULL
     AND ((_payload->>'suppression_days') !~ '^-?[0-9]+$' OR (_payload->>'suppression_days')::int < 0) THEN
    errs := array_append(errs, 'Suppression window cannot be negative.');
  END IF;

  IF nullif(_payload->>'effective_from','') IS NOT NULL AND nullif(_payload->>'effective_to','') IS NOT NULL
     AND (_payload->>'effective_to')::date < (_payload->>'effective_from')::date THEN
    errs := array_append(errs, 'Expiry date cannot be earlier than the effective date.');
  END IF;

  IF NOT public.engine_rule_owner_is_valid(nullif(_payload->>'owner_user_id','')::uuid) THEN
    errs := array_append(errs, 'Rule owner must be an authorised internal user.');
  END IF;

  IF coalesce(nullif(_payload->>'on_action_failure',''),'continue') NOT IN ('continue','stop') THEN
    errs := array_append(errs, 'Invalid action failure policy.');
  END IF;

  RETURN errs;
END; $function$;

-- ============ Phase B/C/H/K: Rule Engine governance hardening ============

ALTER TABLE public.engine_rules
  ADD COLUMN IF NOT EXISTS active_version integer,
  ADD COLUMN IF NOT EXISTS activation_note text,
  ADD COLUMN IF NOT EXISTS on_action_failure text NOT NULL DEFAULT 'continue';

ALTER TABLE public.engine_rules DROP CONSTRAINT IF EXISTS engine_rules_on_action_failure_chk;
ALTER TABLE public.engine_rules
  ADD CONSTRAINT engine_rules_on_action_failure_chk CHECK (on_action_failure IN ('continue','stop'));

UPDATE public.engine_rules SET active_version = version WHERE status = 'active' AND active_version IS NULL;

ALTER TABLE public.engine_rule_executions
  ADD COLUMN IF NOT EXISTS correlation_id uuid,
  ADD COLUMN IF NOT EXISTS source_event_id text,
  ADD COLUMN IF NOT EXISTS entity_key text,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS error text;

ALTER TABLE public.engine_rule_alerts
  ADD COLUMN IF NOT EXISTS version integer,
  ADD COLUMN IF NOT EXISTS correlation_id uuid,
  ADD COLUMN IF NOT EXISTS source_event_id text,
  ADD COLUMN IF NOT EXISTS action_index integer,
  ADD COLUMN IF NOT EXISTS assigned_to uuid;

ALTER TABLE public.engine_rule_tasks
  ADD COLUMN IF NOT EXISTS version integer,
  ADD COLUMN IF NOT EXISTS correlation_id uuid,
  ADD COLUMN IF NOT EXISTS source_event_id text,
  ADD COLUMN IF NOT EXISTS action_index integer,
  ADD COLUMN IF NOT EXISTS assigned_to uuid;

CREATE UNIQUE INDEX IF NOT EXISTS engine_rule_executions_idem
  ON public.engine_rule_executions (rule_id, version, coalesce(entity_key,'-'), source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS engine_rule_alerts_idem
  ON public.engine_rule_alerts (rule_id, version, coalesce(entity_id::text,'-'), source_event_id, action_index)
  WHERE source_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS engine_rule_tasks_idem
  ON public.engine_rule_tasks (rule_id, version, coalesce(entity_id::text,'-'), source_event_id, action_index)
  WHERE source_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.engine_rule_action_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.engine_rule_executions(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.engine_rules(id) ON DELETE CASCADE,
  version integer NOT NULL,
  action_index integer NOT NULL,
  action_type text NOT NULL,
  status text NOT NULL DEFAULT 'succeeded',
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engine_rule_action_results_status_chk CHECK (status IN ('succeeded','failed','skipped')),
  CONSTRAINT engine_rule_action_results_uniq UNIQUE (execution_id, action_index)
);

GRANT SELECT ON public.engine_rule_action_results TO authenticated;
GRANT ALL ON public.engine_rule_action_results TO service_role;
ALTER TABLE public.engine_rule_action_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engine_rule_action_results_read ON public.engine_rule_action_results;
CREATE POLICY engine_rule_action_results_read
  ON public.engine_rule_action_results FOR SELECT TO authenticated
  USING (public.can_view_rule_engine());

CREATE OR REPLACE FUNCTION public.engine_rule_is_executable(_rule_id uuid, _as_of date DEFAULT current_date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.engine_rules r
    WHERE r.id = _rule_id
      AND r.status = 'active'
      AND (r.effective_from IS NULL OR r.effective_from <= _as_of)
      AND (r.effective_to   IS NULL OR r.effective_to   >= _as_of)
  );
$$;

CREATE OR REPLACE FUNCTION public.engine_rule_lifecycle_state(_status text, _from date, _to date, _as_of date DEFAULT current_date)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN _status <> 'active' THEN _status
    WHEN _to IS NOT NULL AND _to < _as_of THEN 'expired'
    WHEN _from IS NOT NULL AND _from > _as_of THEN 'scheduled'
    ELSE 'active'
  END;
$$;

CREATE OR REPLACE FUNCTION public.engine_rule_owner_candidates()
RETURNS TABLE(user_id uuid, full_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id,
         coalesce(nullif(btrim(p.full_name),''), p.email) AS full_name,
         p.email
    FROM public.profiles p
   WHERE public.can_view_rule_engine()
     AND NOT public.has_external_role(p.id)
     AND coalesce(p.status,'active') = 'active'
   ORDER BY 2
$$;

GRANT EXECUTE ON FUNCTION public.engine_rule_owner_candidates() TO authenticated;

CREATE OR REPLACE FUNCTION public.engine_rule_owner_is_valid(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user_id IS NULL OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id AND NOT public.has_external_role(p.id)
  );
$$;

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
  IF coalesce(btrim(_payload->>'name'),'') = '' THEN errs := errs || 'Rule name is required.'; END IF;

  IF coalesce(btrim(_payload->>'rule_code'),'') <> '' AND EXISTS (
       SELECT 1 FROM public.engine_rules r
        WHERE lower(r.rule_code) = lower(btrim(_payload->>'rule_code'))
          AND (_rule_id IS NULL OR r.id <> _rule_id)) THEN
    errs := errs || 'Rule code is already used by another rule.';
  END IF;

  IF coalesce(btrim(_payload->>'module'),'') = '' THEN errs := errs || 'Module is required.'; END IF;

  IF v_type IS NULL OR v_type NOT IN ('threshold','trend','peer_comparison','pattern_detection',
        'cross_field_validation','routing','sla','condition_monitoring','recurrence','scheduling',
        'macro_overlay','group_contagion') THEN
    errs := errs || 'Unsupported rule type.';
  END IF;

  IF coalesce(nullif(_payload->>'severity',''),'medium') NOT IN ('low','medium','high','critical') THEN
    errs := errs || 'Invalid severity.';
  END IF;

  IF jsonb_typeof(v_conditions) <> 'object' THEN
    errs := errs || 'Condition data is malformed.';
  ELSE
    preds := coalesce(v_conditions->'predicates','[]'::jsonb);
    IF jsonb_typeof(preds) <> 'array' THEN
      errs := errs || 'Condition data is malformed.';
    ELSIF jsonb_array_length(preds) = 0 THEN
      errs := errs || 'At least one condition is required.';
    ELSE
      FOR p IN SELECT * FROM jsonb_array_elements(preds) LOOP
        IF jsonb_typeof(p) <> 'object' THEN
          errs := errs || 'Condition data is malformed.';
          CONTINUE;
        END IF;
        IF coalesce(btrim(p->>'metric'),'') = '' THEN
          errs := errs || 'Every condition requires a metric.';
        END IF;
        IF coalesce(btrim(p->>'operator'),'') = '' OR NOT (p->>'operator' = ANY(valid_ops)) THEN
          errs := errs || format('Invalid operator "%s".', coalesce(p->>'operator','(empty)'));
        END IF;
        IF coalesce(btrim(p->>'value'),'') = '' THEN
          errs := errs || 'Every condition requires a threshold value.';
        ELSIF (p->>'operator') = ANY(ARRAY['gt','gte','lt','lte','eq','neq','changed_by_pct'])
              AND (p->>'value') !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
          errs := errs || 'Threshold value must be numeric for this operator.';
        END IF;
      END LOOP;
    END IF;

    IF nullif(v_conditions->>'period','') IS NOT NULL
       AND NOT ((v_conditions->>'period') = ANY(valid_periods)) THEN
      errs := errs || 'Invalid reporting period.';
    END IF;
    IF nullif(v_conditions->>'window_days','') IS NOT NULL THEN
      IF (v_conditions->>'window_days') !~ '^[0-9]+$' THEN
        errs := errs || 'Time window must be a positive number of days.';
      ELSIF v_type = 'pattern_detection' AND (v_conditions->>'window_days')::int < 7 THEN
        errs := errs || 'Pattern detection time window must be at least 7 days.';
      END IF;
    ELSIF v_type = 'pattern_detection' THEN
      errs := errs || 'Pattern detection time window must be at least 7 days.';
    END IF;

    IF jsonb_typeof(coalesce(v_conditions->'sector_ids','[]'::jsonb)) <> 'array' THEN
      errs := errs || 'Sector scope is malformed.';
    ELSE
      IF v_type IN ('threshold','trend','peer_comparison','macro_overlay','group_contagion')
         AND jsonb_array_length(coalesce(v_conditions->'sector_ids','[]'::jsonb)) = 0 THEN
        errs := errs || 'Sector scope is required for threshold and early-warning rules.';
      END IF;
      FOR p IN SELECT to_jsonb(t) FROM jsonb_array_elements_text(coalesce(v_conditions->'sector_ids','[]'::jsonb)) t LOOP
        BEGIN
          sid := (p #>> '{}')::uuid;
        EXCEPTION WHEN others THEN
          sid := NULL;
        END;
        IF sid IS NULL OR NOT EXISTS (SELECT 1 FROM public.sectors s WHERE s.id = sid) THEN
          errs := errs || 'Selected sector no longer exists.';
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF jsonb_typeof(v_actions) <> 'array' THEN
    errs := errs || 'Action data is malformed.';
  ELSIF jsonb_array_length(v_actions) = 0 THEN
    errs := errs || 'At least one action on trigger is required.';
  ELSE
    FOR act IN SELECT * FROM jsonb_array_elements(v_actions) LOOP
      idx := idx + 1;
      IF jsonb_typeof(act) <> 'object' OR coalesce(btrim(act->>'type'),'') = '' THEN
        errs := errs || format('Action %s is malformed.', idx);
        CONTINUE;
      END IF;
      IF act->>'type' = 'initiate_workflow' THEN
        wf := nullif(act->>'workflow_id','')::uuid;
        IF wf IS NULL THEN
          errs := errs || format('Action %s (Initiate Workflow) requires a workflow.', idx);
        ELSIF NOT EXISTS (SELECT 1 FROM public.approval_workflows w
                           WHERE w.id = wf AND w.current_published_version_id IS NOT NULL) THEN
          errs := errs || format('Action %s references a workflow that is not published.', idx);
        END IF;
      END IF;
      IF act->>'type' = 'generate_alert' AND coalesce(btrim(act->>'template'),'') = '' THEN
        errs := errs || format('Action %s (Generate Alert) requires alert text.', idx);
      END IF;
      IF act->>'type' = 'send_notification' THEN
        IF coalesce(btrim(act->>'event_key'),'') = '' THEN
          errs := errs || format('Action %s (Send Notification) requires a notification event.', idx);
        ELSIF NOT EXISTS (SELECT 1 FROM public.notification_event_configs c
                           WHERE c.event_key = act->>'event_key') THEN
          errs := errs || format('Action %s references an unknown notification event.', idx);
        END IF;
      END IF;
      IF act->>'type' = 'create_task' THEN
        IF coalesce(btrim(act->>'assigned_role'),'') = '' THEN
          errs := errs || format('Action %s (Create Task) requires an assigned role.', idx);
        ELSIF NOT EXISTS (
          SELECT 1 FROM public.roles r
           WHERE r.name = act->>'assigned_role'
              OR coalesce(r.system_role::text,'') = act->>'assigned_role') THEN
          errs := errs || format('Action %s references an unknown role.', idx);
        END IF;
        IF nullif(act->>'due_days','') IS NOT NULL AND (act->>'due_days') !~ '^[0-9]+$' THEN
          errs := errs || format('Action %s has an invalid due-day value.', idx);
        END IF;
      END IF;
      IF act->>'type' = 'raise_escalation' THEN
        IF coalesce(btrim(act->>'escalation_type'),'') = '' THEN
          errs := errs || format('Action %s (Raise Escalation) requires an escalation type.', idx);
        END IF;
        IF nullif(act->>'severity','') IS NOT NULL
           AND NOT ((act->>'severity') = ANY(ARRAY['low','medium','high','critical'])) THEN
          errs := errs || format('Action %s has an invalid escalation severity.', idx);
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF nullif(_payload->>'suppression_days','') IS NOT NULL
     AND ((_payload->>'suppression_days') !~ '^-?[0-9]+$' OR (_payload->>'suppression_days')::int < 0) THEN
    errs := errs || 'Suppression window cannot be negative.';
  END IF;

  IF nullif(_payload->>'effective_from','') IS NOT NULL AND nullif(_payload->>'effective_to','') IS NOT NULL
     AND (_payload->>'effective_to')::date < (_payload->>'effective_from')::date THEN
    errs := errs || 'Expiry date cannot be earlier than the effective date.';
  END IF;

  IF NOT public.engine_rule_owner_is_valid(nullif(_payload->>'owner_user_id','')::uuid) THEN
    errs := errs || 'Rule owner must be an authorised internal user.';
  END IF;

  IF coalesce(nullif(_payload->>'on_action_failure',''),'continue') NOT IN ('continue','stop') THEN
    errs := errs || 'Invalid action failure policy.';
  END IF;

  RETURN errs;
END; $function$;

CREATE OR REPLACE FUNCTION public.engine_rules_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.rule_code IS DISTINCT FROM OLD.rule_code THEN
    RAISE EXCEPTION 'rule_code_immutable';
  END IF;

  IF OLD.status = 'active' AND NEW.status = 'active' AND NEW.version = OLD.version THEN
    IF NEW.conditions IS DISTINCT FROM OLD.conditions
       OR NEW.actions IS DISTINCT FROM OLD.actions
       OR NEW.rule_type IS DISTINCT FROM OLD.rule_type
       OR NEW.severity IS DISTINCT FROM OLD.severity
       OR NEW.suppression_days IS DISTINCT FROM OLD.suppression_days
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.effective_to IS DISTINCT FROM OLD.effective_to
       OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
       OR NEW.on_action_failure IS DISTINCT FROM OLD.on_action_failure THEN
      RAISE EXCEPTION 'active_rule_requires_new_version'
        USING ERRCODE = '42501',
              HINT = 'Editing an active rule must create a new draft version.';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.engine_rule_save(_payload jsonb, _rule_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_errs text[];
  v_id uuid := _rule_id;
  v_row public.engine_rules;
  v_before jsonb;
  v_type text := _payload->>'rule_type';
  v_new_version boolean := false;
  v_material boolean := false;
  v_note text := nullif(btrim(_payload->>'version_note'),'');
  v_intent text := coalesce(_payload->>'intent','draft');
BEGIN
  IF NOT public.can_manage_rule_engine(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_errs := public.engine_rule_validate_payload(_payload, v_id);

  IF coalesce(btrim(_payload->>'name'),'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'errors', to_jsonb(ARRAY['Rule name is required.']));
  END IF;
  IF v_intent <> 'draft' AND array_length(v_errs,1) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'errors', to_jsonb(v_errs));
  END IF;
  IF NOT public.engine_rule_owner_is_valid(nullif(_payload->>'owner_user_id','')::uuid) THEN
    RETURN jsonb_build_object('ok', false, 'errors',
      to_jsonb(ARRAY['Rule owner must be an authorised internal user.']));
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.engine_rules (
      name, description, rule_type, module, sub_module, tags, severity,
      conditions, actions, suppression_days, owner_user_id, effective_from, effective_to,
      on_action_failure, created_by, updated_by
    ) VALUES (
      btrim(_payload->>'name'), nullif(_payload->>'description',''), v_type,
      coalesce(nullif(_payload->>'module',''),'general'), nullif(_payload->>'sub_module',''),
      coalesce((SELECT array_agg(t::text) FROM jsonb_array_elements_text(coalesce(_payload->'tags','[]'::jsonb)) t), '{}'),
      coalesce(nullif(_payload->>'severity',''),'medium'),
      coalesce(_payload->'conditions','{}'::jsonb), coalesce(_payload->'actions','[]'::jsonb),
      coalesce((_payload->>'suppression_days')::int, 0),
      nullif(_payload->>'owner_user_id','')::uuid,
      nullif(_payload->>'effective_from','')::date,
      nullif(_payload->>'effective_to','')::date,
      coalesce(nullif(_payload->>'on_action_failure',''),'continue'),
      auth.uid(), auth.uid()
    ) RETURNING * INTO v_row;

    INSERT INTO public.engine_rule_versions (rule_id, version, snapshot, note, created_by)
    VALUES (v_row.id, v_row.version, to_jsonb(v_row), coalesce(v_note,'initial draft'), auth.uid())
    ON CONFLICT (rule_id, version) DO NOTHING;

    PERFORM public.create_audit_log(auth.uid(), 'ADMIN_RULE_CREATED', 'engine_rule', v_row.id::text, NULL,
      jsonb_build_object('rule', to_jsonb(v_row), 'rule_code', v_row.rule_code,
                         'rule_family','shared_engine','version', v_row.version));
  ELSE
    SELECT to_jsonb(r) INTO v_before FROM public.engine_rules r WHERE r.id = v_id;
    IF v_before IS NULL THEN RAISE EXCEPTION 'rule_not_found'; END IF;
    SELECT * INTO v_row FROM public.engine_rules WHERE id = v_id;

    v_material := (
      coalesce(_payload->'conditions','{}'::jsonb) IS DISTINCT FROM v_row.conditions
      OR coalesce(_payload->'actions','[]'::jsonb) IS DISTINCT FROM v_row.actions
      OR coalesce(nullif(_payload->>'severity',''),'medium') IS DISTINCT FROM v_row.severity
      OR nullif(_payload->>'owner_user_id','')::uuid IS DISTINCT FROM v_row.owner_user_id
      OR nullif(_payload->>'effective_from','')::date IS DISTINCT FROM v_row.effective_from
      OR nullif(_payload->>'effective_to','')::date IS DISTINCT FROM v_row.effective_to
      OR coalesce((_payload->>'suppression_days')::int,0) IS DISTINCT FROM v_row.suppression_days
    );

    IF v_material AND v_note IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'errors',
        to_jsonb(ARRAY['A version note is required when conditions, actions, severity, owner, effective dates or suppression change.']));
    END IF;

    v_new_version := (v_row.status = 'active') OR v_material;

    INSERT INTO public.engine_rule_versions (rule_id, version, snapshot, note, created_by)
    VALUES (v_row.id, v_row.version, to_jsonb(v_row), 'superseded', auth.uid())
    ON CONFLICT (rule_id, version) DO NOTHING;

    UPDATE public.engine_rules SET
      name = btrim(_payload->>'name'),
      description = nullif(_payload->>'description',''),
      rule_type = v_type,
      module = coalesce(nullif(_payload->>'module',''), module),
      sub_module = nullif(_payload->>'sub_module',''),
      tags = coalesce((SELECT array_agg(t::text) FROM jsonb_array_elements_text(coalesce(_payload->'tags','[]'::jsonb)) t), '{}'),
      severity = coalesce(nullif(_payload->>'severity',''),'medium'),
      conditions = coalesce(_payload->'conditions','{}'::jsonb),
      actions = coalesce(_payload->'actions','[]'::jsonb),
      suppression_days = coalesce((_payload->>'suppression_days')::int, 0),
      owner_user_id = nullif(_payload->>'owner_user_id','')::uuid,
      effective_from = nullif(_payload->>'effective_from','')::date,
      effective_to = nullif(_payload->>'effective_to','')::date,
      on_action_failure = coalesce(nullif(_payload->>'on_action_failure',''),'continue'),
      version = CASE WHEN v_new_version THEN version + 1 ELSE version END,
      status = CASE WHEN v_new_version THEN 'draft' ELSE status END,
      updated_by = auth.uid(),
      updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;

    IF v_new_version THEN
      INSERT INTO public.engine_rule_versions (rule_id, version, snapshot, note, created_by)
      VALUES (v_row.id, v_row.version, to_jsonb(v_row), coalesce(v_note,'draft revision'), auth.uid())
      ON CONFLICT (rule_id, version) DO NOTHING;
    END IF;

    PERFORM public.create_audit_log(auth.uid(), 'ADMIN_RULE_UPDATED', 'engine_rule', v_row.id::text,
      v_before,
      jsonb_build_object('rule', to_jsonb(v_row), 'rule_code', v_row.rule_code,
                         'rule_family','shared_engine', 'version', v_row.version,
                         'justification', v_note, 'new_version', v_new_version));

    IF (v_before->>'owner_user_id') IS DISTINCT FROM v_row.owner_user_id::text THEN
      PERFORM public.create_audit_log(auth.uid(), 'ADMIN_RULE_OWNER_CHANGED', 'engine_rule', v_row.id::text,
        jsonb_build_object('owner_user_id', v_before->>'owner_user_id'),
        jsonb_build_object('owner_user_id', v_row.owner_user_id, 'rule_code', v_row.rule_code,
                           'version', v_row.version, 'justification', v_note));
    END IF;

    IF (v_before->>'effective_from') IS DISTINCT FROM v_row.effective_from::text
       OR (v_before->>'effective_to') IS DISTINCT FROM v_row.effective_to::text THEN
      PERFORM public.create_audit_log(auth.uid(), 'ADMIN_RULE_EFFECTIVE_DATES_CHANGED', 'engine_rule', v_row.id::text,
        jsonb_build_object('effective_from', v_before->>'effective_from', 'effective_to', v_before->>'effective_to'),
        jsonb_build_object('effective_from', v_row.effective_from, 'effective_to', v_row.effective_to,
                           'rule_code', v_row.rule_code, 'version', v_row.version, 'justification', v_note));
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'rule', to_jsonb(v_row),
                            'new_version', v_new_version, 'warnings', to_jsonb(v_errs));
END; $function$;

DROP FUNCTION IF EXISTS public.engine_rule_activate(uuid);

CREATE OR REPLACE FUNCTION public.engine_rule_activate(_rule_id uuid, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_row public.engine_rules; v_before jsonb; v_errs text[]; v_test boolean;
BEGIN
  IF NOT public.can_activate_rule_engine(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT to_jsonb(r) INTO v_before FROM public.engine_rules r WHERE r.id = _rule_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'rule_not_found'; END IF;
  SELECT * INTO v_row FROM public.engine_rules WHERE id = _rule_id;

  v_errs := public.engine_rule_validate_payload(v_before, _rule_id);
  IF array_length(v_errs,1) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'errors', to_jsonb(v_errs));
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.engine_rule_tests t
    WHERE t.rule_id = _rule_id AND t.version = v_row.version AND t.passed
  ) INTO v_test;
  IF NOT v_test THEN
    RETURN jsonb_build_object('ok', false, 'errors',
      to_jsonb(ARRAY['This rule version must pass a sandbox test before it can be activated.']));
  END IF;

  UPDATE public.engine_rules
     SET status = 'active', active_version = version, activated_at = now(), activated_by = auth.uid(),
         activation_note = nullif(btrim(_note),''), deactivation_reason = NULL, updated_by = auth.uid()
   WHERE id = _rule_id RETURNING * INTO v_row;

  INSERT INTO public.engine_rule_versions (rule_id, version, snapshot, note, created_by)
  VALUES (v_row.id, v_row.version, to_jsonb(v_row), coalesce(nullif(btrim(_note),''),'activated'), auth.uid())
  ON CONFLICT (rule_id, version) DO NOTHING;

  PERFORM public.create_audit_log(auth.uid(), 'ADMIN_RULE_ACTIVATED', 'engine_rule', v_row.id::text, v_before,
    jsonb_build_object('rule', to_jsonb(v_row), 'rule_code', v_row.rule_code, 'rule_family','shared_engine',
                       'version', v_row.version, 'justification', nullif(btrim(_note),'')));
  PERFORM public.notification_enqueue_event('admin_rule_activated', 'engine_rule', v_row.id,
    jsonb_build_object('rule_code', v_row.rule_code, 'rule_name', v_row.name, 'module', v_row.module));

  RETURN jsonb_build_object('ok', true, 'rule', to_jsonb(v_row));
END; $function$;

CREATE OR REPLACE FUNCTION public.engine_rule_deactivate(_rule_id uuid, _justification text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_row public.engine_rules; v_open int; v_before jsonb;
BEGIN
  IF NOT public.can_deactivate_rule_engine(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF coalesce(btrim(_justification),'') = '' THEN RAISE EXCEPTION 'justification_required'; END IF;

  SELECT to_jsonb(r) INTO v_before FROM public.engine_rules r WHERE r.id = _rule_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'rule_not_found'; END IF;

  UPDATE public.engine_rules
     SET status = 'inactive', active_version = NULL,
         deactivation_reason = btrim(_justification), updated_by = auth.uid()
   WHERE id = _rule_id RETURNING * INTO v_row;

  SELECT count(*) INTO v_open FROM public.engine_rule_alerts WHERE rule_id = _rule_id AND status = 'open';

  PERFORM public.create_audit_log(auth.uid(), 'ADMIN_RULE_DEACTIVATED', 'engine_rule', v_row.id::text,
    v_before, jsonb_build_object('status','inactive','rule_code', v_row.rule_code,
      'rule_family','shared_engine','version', v_row.version,
      'justification', btrim(_justification), 'open_alerts_retained', v_open));

  RETURN jsonb_build_object('ok', true, 'rule', to_jsonb(v_row), 'open_alerts_retained', v_open);
END; $function$;

CREATE OR REPLACE FUNCTION public.engine_rule_restore_version(_rule_id uuid, _version integer, _note text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_snap jsonb; v_row public.engine_rules; v_before jsonb;
BEGIN
  IF NOT public.can_manage_rule_engine(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT snapshot INTO v_snap FROM public.engine_rule_versions
   WHERE rule_id = _rule_id AND version = _version;
  IF v_snap IS NULL THEN RAISE EXCEPTION 'version_not_found'; END IF;

  SELECT to_jsonb(r) INTO v_before FROM public.engine_rules r WHERE r.id = _rule_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'rule_not_found'; END IF;

  INSERT INTO public.engine_rule_versions (rule_id, version, snapshot, note, created_by)
  SELECT _rule_id, (v_before->>'version')::int, v_before, 'superseded', auth.uid()
  ON CONFLICT (rule_id, version) DO NOTHING;

  UPDATE public.engine_rules SET
    name = v_snap->>'name',
    description = nullif(v_snap->>'description',''),
    rule_type = v_snap->>'rule_type',
    module = coalesce(nullif(v_snap->>'module',''), module),
    sub_module = nullif(v_snap->>'sub_module',''),
    severity = coalesce(nullif(v_snap->>'severity',''),'medium'),
    conditions = coalesce(v_snap->'conditions','{}'::jsonb),
    actions = coalesce(v_snap->'actions','[]'::jsonb),
    suppression_days = coalesce((v_snap->>'suppression_days')::int, 0),
    effective_from = nullif(v_snap->>'effective_from','')::date,
    effective_to = nullif(v_snap->>'effective_to','')::date,
    on_action_failure = coalesce(nullif(v_snap->>'on_action_failure',''),'continue'),
    version = version + 1,
    status = 'draft',
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = _rule_id
  RETURNING * INTO v_row;

  INSERT INTO public.engine_rule_versions (rule_id, version, snapshot, note, created_by)
  VALUES (v_row.id, v_row.version, to_jsonb(v_row),
          coalesce(nullif(btrim(_note),''), 'restored from v' || _version), auth.uid());

  PERFORM public.create_audit_log(auth.uid(), 'ADMIN_RULE_VERSION_RESTORED', 'engine_rule',
    v_row.id::text, v_before,
    jsonb_build_object('rule', to_jsonb(v_row), 'rule_code', v_row.rule_code,
      'rule_family','shared_engine','version', v_row.version,
      'restored_from_version', _version, 'justification', nullif(btrim(_note),'')));

  RETURN jsonb_build_object('ok', true, 'rule', to_jsonb(v_row));
END; $function$;

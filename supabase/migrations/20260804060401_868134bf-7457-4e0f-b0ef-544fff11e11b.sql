-- =====================================================================
-- Shared decision helpers (single source of truth for runtime + tester)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.complaint_intake_decide(
  _variant text,
  _regulator_id uuid,
  _payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_variant text := lower(coalesce(_variant,'internal'));
  v_rules public.complaint_intake_rules%ROWTYPE;
  v_subject text := btrim(coalesce(_payload->>'subject',''));
  v_desc    text := btrim(coalesce(_payload->>'description',''));
  v_email   text := NULLIF(_payload->>'email','');
  v_anon boolean := coalesce((_payload->>'anonymous')::boolean, false);
  v_vuln boolean := coalesce((_payload->>'vulnerability_indicator')::boolean, false);
  v_vuln_notes text := NULLIF(_payload->>'vulnerability_notes','');
  v_vuln_cat text := NULLIF(_payload->>'vulnerability_category','');
  v_sev text;
  v_prio text;
  v_intake text := NULLIF(_payload->>'intake_source','');
  v_errors jsonb := '[]'::jsonb;
  v_field text;
BEGIN
  -- Load rules (regulator-scoped first, then default)
  SELECT * INTO v_rules FROM public.complaint_intake_rules
   WHERE variant = v_variant
     AND (regulator_id = _regulator_id OR (regulator_id IS NULL))
   ORDER BY regulator_id NULLS LAST
   LIMIT 1;

  IF v_rules.id IS NULL THEN
    -- Fallback rule set — subject + description only
    v_rules.required_fields := ARRAY['subject','description'];
    v_rules.allow_anonymous := (v_variant = 'public');
  END IF;

  -- External variants cannot set severity/priority
  IF v_variant IN ('public','licensee') THEN
    v_sev := 'low';
    v_prio := 'p3';
  ELSE
    v_sev := coalesce(NULLIF(_payload->>'severity',''),'medium');
    v_prio := coalesce(NULLIF(_payload->>'priority',''),'p3');
    IF v_sev NOT IN ('low','medium','high','critical') THEN
      v_errors := v_errors || jsonb_build_object('code','invalid','field','severity','message','Invalid severity');
    END IF;
  END IF;

  -- Structural / required field validation
  IF v_subject = '' OR length(v_subject) < 3 THEN
    v_errors := v_errors || jsonb_build_object('code','required','field','subject','message','Subject is required (min 3 chars)');
  END IF;
  IF v_desc = '' OR length(v_desc) < 10 THEN
    v_errors := v_errors || jsonb_build_object('code','required','field','description','message','Description is required (min 10 chars)');
  END IF;

  FOREACH v_field IN ARRAY coalesce(v_rules.required_fields, ARRAY[]::text[]) LOOP
    IF v_field IN ('subject','description') THEN CONTINUE; END IF;  -- checked above
    IF NULLIF(_payload->>v_field,'') IS NULL THEN
      v_errors := v_errors || jsonb_build_object('code','required','field',v_field,'message',v_field||' is required');
    END IF;
  END LOOP;

  -- Vulnerability consistency
  IF v_vuln AND v_vuln_notes IS NULL AND v_vuln_cat IS NULL THEN
    v_errors := v_errors || jsonb_build_object('code','required','field','vulnerability_notes','message','Provide vulnerability notes or category when marked vulnerable');
  END IF;

  -- Anonymous rule for public variant
  IF v_variant = 'public' AND v_anon = false AND v_email IS NULL THEN
    v_errors := v_errors || jsonb_build_object('code','required','field','email','message','Email required unless anonymous is checked');
  END IF;
  IF v_variant = 'public' AND v_anon = true AND NOT coalesce(v_rules.allow_anonymous, true) THEN
    v_errors := v_errors || jsonb_build_object('code','forbidden','field','anonymous','message','Anonymous submission is not permitted');
  END IF;

  IF v_intake IS NULL THEN
    v_intake := CASE v_variant
      WHEN 'public'   THEN 'consumer_portal'
      WHEN 'licensee' THEN 'licensee_portal'
      WHEN 'internal' THEN 'internal'
      WHEN 'staff'    THEN 'staff_intake'
    END;
  END IF;

  RETURN jsonb_build_object(
    'variant', v_variant,
    'rule_id', v_rules.id,
    'required_fields', to_jsonb(coalesce(v_rules.required_fields, ARRAY[]::text[])),
    'allow_anonymous', coalesce(v_rules.allow_anonymous, true),
    'max_attachments', v_rules.max_attachments,
    'severity', v_sev,
    'priority', v_prio,
    'intake_source', v_intake,
    'errors', v_errors
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.complaint_intake_decide(text, uuid, jsonb) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.correspondence_route_decide(
  _category text,
  _channel text,
  _subject text,
  _priority text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rule public.correspondence_routing_rules%ROWTYPE;
  v_priority text := COALESCE(_priority, 'normal');
  v_sla integer := 5;
BEGIN
  SELECT * INTO v_rule FROM public.correspondence_routing_rules r
  WHERE r.is_active
    AND (
      (r.match_type = 'category' AND lower(r.match_value) = lower(COALESCE(_category,'')))
      OR (r.match_type = 'channel' AND lower(r.match_value) = lower(COALESCE(_channel,'')))
      OR (r.match_type = 'subject' AND COALESCE(_subject,'') ILIKE '%' || r.match_value || '%')
      OR (r.match_type = 'priority' AND lower(r.match_value) = lower(v_priority))
    )
  ORDER BY r.sort_order ASC LIMIT 1;

  IF v_rule.id IS NOT NULL THEN
    v_sla := v_rule.sla_days;
    IF _priority IS NULL THEN v_priority := v_rule.priority; END IF;
  END IF;

  RETURN jsonb_build_object(
    'matched', (v_rule.id IS NOT NULL),
    'rule_id', v_rule.id,
    'rule_name', v_rule.name,
    'match_type', v_rule.match_type,
    'match_value', v_rule.match_value,
    'sort_order', v_rule.sort_order,
    'priority', v_priority,
    'sla_days', v_sla,
    'assign_unit', v_rule.assign_unit,
    'assign_officer', v_rule.assign_officer,
    'allow_manual_override', v_rule.allow_manual_override,
    'status', CASE WHEN v_rule.id IS NOT NULL THEN 'assigned' ELSE 'received' END
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.correspondence_route_decide(text, text, text, text) TO authenticated, service_role;

-- =====================================================================
-- Runtime paths now delegate to the shared helpers
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_complaint(_variant text, _payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_variant text := lower(coalesce(_variant,'internal'));
  v_is_internal boolean;
  v_regulator uuid := NULLIF(_payload->>'regulator_id','')::uuid;
  v_licensee uuid := NULLIF(_payload->>'licensee_id','')::uuid;
  v_subject text := btrim(coalesce(_payload->>'subject',''));
  v_desc    text := btrim(coalesce(_payload->>'description',''));
  v_email   text := NULLIF(_payload->>'email','');
  v_type_id uuid := NULLIF(_payload->>'complaint_type_id','')::uuid;
  v_sev text;
  v_prio text;
  v_intake text := NULLIF(_payload->>'intake_source','');
  v_anon boolean := coalesce((_payload->>'anonymous')::boolean, false);
  v_vuln boolean := coalesce((_payload->>'vulnerability_indicator')::boolean, false);
  v_vuln_notes text := NULLIF(_payload->>'vulnerability_notes','');
  v_vuln_cat text := NULLIF(_payload->>'vulnerability_category','');
  v_workflow_id uuid;
  v_workflow_version uuid;
  v_first_step uuid;
  v_first_step_key text;
  v_id uuid;
  v_wi_id uuid;
  v_errors jsonb := '[]'::jsonb;
  v_row jsonb;
  v_decision jsonb;
BEGIN
  -- Variant validation
  IF v_variant NOT IN ('public','licensee','internal','staff') THEN
    RAISE EXCEPTION 'Invalid variant: %', v_variant USING ERRCODE='22023';
  END IF;

  -- Auth policy per variant
  IF v_variant IN ('licensee','internal','staff') AND v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501';
  END IF;

  -- Rule resolution + validation (single source of truth: public.complaint_intake_decide)
  v_decision := public.complaint_intake_decide(v_variant, v_regulator, _payload);
  v_sev    := v_decision->>'severity';
  v_prio   := v_decision->>'priority';
  v_errors := COALESCE(v_decision->'errors', '[]'::jsonb);
  IF NOT v_vuln THEN
    v_vuln_notes := NULL; v_vuln_cat := NULL;
  END IF;

  IF jsonb_array_length(v_errors) > 0 THEN
    RAISE EXCEPTION 'validation_failed'
      USING ERRCODE = '22023', DETAIL = v_errors::text, HINT = 'complaint_validation';
  END IF;

  -- Determine intake_source default
  v_is_internal := (v_variant IN ('internal','staff'));
  IF v_intake IS NULL THEN
    v_intake := v_decision->>'intake_source';
  END IF;

  -- Insert the complaint
  INSERT INTO public.complaints (
    complainant_id, subject, description, email, severity, priority, status,
    intake_source, internal_created_by, complaint_type_id, licensee_id, regulator_id,
    vulnerability_indicator, vulnerability_notes
  ) VALUES (
    CASE WHEN v_variant IN ('public') AND v_anon THEN NULL
         WHEN v_is_internal THEN NULL
         ELSE v_uid END,
    v_subject, v_desc,
    COALESCE(v_email, CASE WHEN v_uid IS NOT NULL THEN (SELECT email FROM auth.users WHERE id=v_uid) END),
    v_sev, v_prio, 'submitted',
    v_intake,
    CASE WHEN v_is_internal THEN v_uid END,
    v_type_id, v_licensee, v_regulator,
    v_vuln, v_vuln_notes
  ) RETURNING id INTO v_id;

  -- Start the workflow (best-effort — if no active version, complaint still created)
  SELECT id INTO v_workflow_id FROM public.approval_workflows
    WHERE lower(name) LIKE '%complaint%' ORDER BY created_at LIMIT 1;

  IF v_workflow_id IS NOT NULL THEN
    SELECT id INTO v_workflow_version FROM public.approval_workflow_versions
      WHERE workflow_id = v_workflow_id AND status='published'
      ORDER BY version_number DESC LIMIT 1;

    SELECT id, step_key INTO v_first_step, v_first_step_key FROM public.approval_steps
      WHERE workflow_id = v_workflow_id
      ORDER BY step_order ASC NULLS LAST LIMIT 1;

    IF v_workflow_version IS NOT NULL THEN
      INSERT INTO public.workflow_instances (
        workflow_id, workflow_version_id, entity_type, entity_id,
        current_step_id, current_step_key, status
      ) VALUES (
        v_workflow_id, v_workflow_version, 'complaint', v_id,
        v_first_step, v_first_step_key, 'active'
      )
      ON CONFLICT (entity_id, entity_type) WHERE status = ANY (ARRAY['active','paused']) DO NOTHING
      RETURNING id INTO v_wi_id;
    END IF;
  END IF;

  -- Audit
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'complaint.created', 'complaint', v_id,
    jsonb_build_object('variant', v_variant, 'intake_source', v_intake, 'workflow_instance_id', v_wi_id));

  -- Notification outbox (best-effort dedupe via existing unique index)
  BEGIN
    INSERT INTO public.notification_outbox (event_key, entity_type, entity_id, channel, payload)
    VALUES ('complaint.created','complaint',v_id,'in_app',
      jsonb_build_object('variant',v_variant,'complaint_id',v_id));
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  SELECT to_jsonb(c.*) INTO v_row FROM public.complaints c WHERE c.id = v_id;
  RETURN jsonb_build_object(
    'id', v_id,
    'complaint_number', v_row->>'complaint_number',
    'workflow_instance_id', v_wi_id,
    'complaint', v_row
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_correspondence_thread(_subject text, _summary text, _sender_name text, _sender_org text DEFAULT NULL::text, _sender_email text DEFAULT NULL::text, _channel text DEFAULT 'email'::text, _category text DEFAULT 'General'::text, _priority text DEFAULT NULL::text, _licensee_id uuid DEFAULT NULL::uuid, _tags text[] DEFAULT '{}'::text[], _body text DEFAULT NULL::text, _thread_type text DEFAULT 'general_correspondence'::text, _source_type text DEFAULT NULL::text, _source_id uuid DEFAULT NULL::uuid, _source_reference text DEFAULT NULL::text, _is_entity_facing boolean DEFAULT true, _participants jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_staff boolean;
  v_licensee uuid := _licensee_id;
  v_rule public.correspondence_routing_rules%ROWTYPE;
  v_priority text := COALESCE(_priority, 'normal');
  v_sla integer := 5;
  v_id uuid;
  v_actor text;
  v_entity_facing boolean := COALESCE(_is_entity_facing, true);
  v_module text;
  v_p jsonb;
  v_route jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  v_staff := public.is_internal_staff(v_user);
  IF NOT v_staff THEN
    v_licensee := public.user_licensee_id(v_user);
    IF v_licensee IS NULL THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;
  END IF;
  IF _thread_type = 'internal_discussion' THEN v_entity_facing := false; END IF;
  IF _thread_type NOT IN ('general_correspondence', 'internal_discussion')
     AND _source_id IS NULL AND _source_reference IS NULL THEN
    RAISE EXCEPTION 'linked_case_required';
  END IF;
  IF _source_id IS NOT NULL AND NOT public.correspondence_case_readable(_source_type, _source_id, v_user) THEN
    RAISE EXCEPTION 'case_not_accessible' USING ERRCODE = '42501';
  END IF;
  v_actor := public.correspondence_actor_label(v_user);
  v_module := public.correspondence_module_for(_source_type, _category, _thread_type);

  -- Routing decision (single source of truth: public.correspondence_route_decide)
  v_route := public.correspondence_route_decide(_category, _channel, _subject, v_priority);
  IF COALESCE((v_route->>'matched')::boolean, false) THEN
    SELECT * INTO v_rule FROM public.correspondence_routing_rules
     WHERE id = (v_route->>'rule_id')::uuid;
    v_sla := COALESCE((v_route->>'sla_days')::int, v_sla);
    IF _priority IS NULL THEN v_priority := COALESCE(v_route->>'priority', v_priority); END IF;
  END IF;

  INSERT INTO public.correspondence_threads (
    subject, summary, sender_name, sender_org, sender_email, channel, category,
    priority, licensee_id, tags, sla_days, sla_hours, due_at, retention_expires_at,
    assigned_unit, assigned_officer, status, created_by,
    thread_type, thread_state, source_type, source_id, source_reference,
    is_entity_facing, last_message_at, module
  ) VALUES (
    _subject, _summary, _sender_name, _sender_org, _sender_email, _channel, _category,
    v_priority, v_licensee, COALESCE(_tags, '{}'), v_sla, v_sla * 24,
    now() + (v_sla || ' days')::interval, now() + interval '7 years',
    v_rule.assign_unit, v_rule.assign_officer,
    CASE WHEN v_rule.id IS NOT NULL THEN 'assigned' ELSE 'received' END,
    v_user,
    COALESCE(_thread_type, 'general_correspondence'), 'open',
    _source_type, _source_id, _source_reference, v_entity_facing, now(), v_module
  ) RETURNING id INTO v_id;

  INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail, visible_to_licensee)
  VALUES (v_id, v_user, v_actor, CASE WHEN v_staff THEN 'Staff' ELSE 'Licensee' END,
          'THREAD_CREATED',
          'Type: ' || COALESCE(_thread_type, 'general_correspondence') || ' · Module: ' || v_module || ' · Channel: ' || _channel,
          v_entity_facing);

  IF v_rule.id IS NOT NULL THEN
    INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail, visible_to_licensee)
    VALUES (v_id, v_user, 'Routing Engine', 'System', 'THREAD_STATUS_CHANGED',
            'Routed to ' || v_rule.assign_unit || COALESCE(' -> ' || v_rule.assign_officer, '') || ' (rule: ' || v_rule.name || ')', false);
  END IF;

  INSERT INTO public.correspondence_thread_participants (thread_id, user_id, party_type, display_name, party_role, last_read_at, is_internal)
  VALUES (v_id, v_user, CASE WHEN v_staff THEN 'officer' ELSE 'entity' END, v_actor,
          CASE WHEN v_staff THEN 'Officer' ELSE 'Entity' END, now(), v_staff)
  ON CONFLICT (thread_id, user_id) DO NOTHING;

  IF _participants IS NOT NULL THEN
    FOR v_p IN SELECT * FROM jsonb_array_elements(_participants) LOOP
      INSERT INTO public.correspondence_thread_participants (thread_id, user_id, party_type, display_name, party_role, is_internal)
      VALUES (v_id,
              NULLIF(v_p->>'user_id', '')::uuid,
              COALESCE(v_p->>'party_type', 'officer'),
              COALESCE(v_p->>'display_name', 'Participant'),
              v_p->>'party_role',
              COALESCE((v_p->>'is_internal')::boolean,
                       CASE WHEN NULLIF(v_p->>'user_id','') IS NOT NULL
                            THEN public.is_internal_staff((v_p->>'user_id')::uuid) ELSE false END))
      ON CONFLICT (thread_id, user_id) DO NOTHING;
    END LOOP;
  END IF;

  IF _body IS NOT NULL AND length(TRIM(_body)) > 0 THEN
    INSERT INTO public.correspondence_messages (
      thread_id, direction, channel, subject, body, author_id, author_name, author_role,
      message_kind, delivery_status, is_internal_note
    ) VALUES (
      v_id, CASE WHEN v_staff THEN 'outbound' ELSE 'inbound' END, _channel, _subject, _body, v_user,
      COALESCE(_sender_name, v_actor),
      CASE WHEN v_staff THEN 'Staff' ELSE 'Licensee' END,
      CASE WHEN NOT v_entity_facing THEN 'internal'
           WHEN v_staff THEN 'external_outbound' ELSE 'external_inbound' END,
      'sent',
      NOT v_entity_facing
    );
  END IF;

  RETURN v_id;
END;
$function$;

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
  v_crc_id uuid := NULLIF(_payload->>'conduct_risk_category_id','')::uuid;
  v_product_id uuid := NULLIF(_payload->>'product_id','')::uuid;
  v_channel_id uuid := NULLIF(_payload->>'channel_id','')::uuid;
  v_customer_type text := NULLIF(_payload->>'customer_type','');
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

  -- Ignore unknown customer types rather than failing intake
  IF v_customer_type IS NOT NULL
     AND lower(v_customer_type) NOT IN ('retail','sme','corporate','vulnerable','other') THEN
    v_customer_type := NULL;
  ELSIF v_customer_type IS NOT NULL THEN
    v_customer_type := lower(v_customer_type);
  END IF;

  -- Only keep reference ids that exist (defensive: stale client caches)
  IF v_crc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.conduct_risk_categories WHERE id = v_crc_id) THEN
    v_crc_id := NULL;
  END IF;
  IF v_product_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.conduct_products WHERE id = v_product_id) THEN
    v_product_id := NULL;
  END IF;
  IF v_channel_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.conduct_channels WHERE id = v_channel_id) THEN
    v_channel_id := NULL;
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
    conduct_risk_category_id, product_id, channel_id, customer_type,
    vulnerability_indicator, vulnerability_notes, vulnerability_category
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
    v_crc_id, v_product_id, v_channel_id, v_customer_type,
    v_vuln, v_vuln_notes, v_vuln_cat
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

CREATE OR REPLACE FUNCTION public.get_complaint_current_assignees(_complaint_ids uuid[])
 RETURNS TABLE(complaint_id uuid, step_role text, user_id uuid, full_name text, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_internal_role(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH inst AS (
    SELECT wi.entity_id AS complaint_id, wi.current_step_id
    FROM public.workflow_instances wi
    WHERE wi.entity_type = 'complaint'
      AND wi.entity_id = ANY(_complaint_ids)
      AND wi.status IN ('active', 'paused')
  ),
  step AS (
    SELECT i.complaint_id,
           s.id AS step_id,
           s.approver_role::text AS approver_role,
           s.approver_type,
           s.approver_config
    FROM inst i
    JOIN public.approval_steps s ON s.id = i.current_step_id
  ),
  specific_users AS (
    SELECT st.complaint_id, st.approver_role, (u::uuid) AS user_id
    FROM step st, jsonb_array_elements_text(COALESCE(st.approver_config->'user_ids', '[]'::jsonb)) AS u
    WHERE st.approver_type = 'specific_users'
  ),
  role_users AS (
    SELECT st.complaint_id, st.approver_role, ur.user_id
    FROM step st
    JOIN public.user_roles ur ON ur.role::text = st.approver_role
    WHERE st.approver_type = 'role_based_user' AND st.approver_role IS NOT NULL
  ),
  all_users AS (
    SELECT * FROM specific_users
    UNION
    SELECT * FROM role_users
  )
  SELECT au.complaint_id, au.approver_role, au.user_id, p.full_name, p.email
  FROM all_users au
  LEFT JOIN public.profiles p ON p.id = au.user_id;
END;
$function$;
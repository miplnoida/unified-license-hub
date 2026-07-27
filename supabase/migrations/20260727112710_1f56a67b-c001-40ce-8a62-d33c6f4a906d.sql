CREATE OR REPLACE FUNCTION public.get_public_complaint_tracking(p_reference text, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_c record;
  v_status record;
  v_timeline jsonb;
  v_steps jsonb := '[]'::jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_corr jsonb := '[]'::jsonb;
  v_details jsonb;
  v_investigation jsonb;
  v_is_owner boolean := false;
  v_wi record;
  v_current_order int;
  v_tasks_total int := 0;
  v_tasks_done int := 0;
BEGIN
  IF p_reference IS NULL OR length(trim(p_reference)) < 4 THEN
    RETURN jsonb_build_object('found', false, 'error', 'REFERENCE_REQUIRED');
  END IF;

  SELECT * INTO v_c
    FROM public.complaints
   WHERE complaint_number = trim(p_reference)
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  v_is_owner := auth.uid() IS NOT NULL AND v_c.complainant_id = auth.uid();

  IF NOT v_is_owner AND v_c.email IS NOT NULL AND btrim(v_c.email) <> '' THEN
    IF p_email IS NULL OR lower(btrim(p_email)) <> lower(btrim(v_c.email)) THEN
      RETURN jsonb_build_object('found', false, 'error', 'CONTACT_MISMATCH');
    END IF;
  END IF;

  SELECT public_label, public_description, is_terminal
    INTO v_status
    FROM public.complaint_status_catalogue
   WHERE code = v_c.status;

  -- Redacted timeline from workflow history
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.event_at), '[]'::jsonb)
    INTO v_timeline
    FROM (
      SELECT
        aa.created_at AS event_at,
        COALESCE(cs.public_label, 'Progress update') AS label,
        COALESCE(cs.public_description, 'Your complaint has been updated.') AS description
      FROM public.workflow_instances wi
      JOIN public.approval_actions aa ON aa.workflow_instance_id = wi.id
      LEFT JOIN public.complaint_status_catalogue cs
        ON cs.code = COALESCE(aa.action_type, aa.action)
      WHERE wi.entity_type = 'complaint' AND wi.entity_id = v_c.id
      ORDER BY aa.created_at
    ) t;

  -- Latest workflow instance for the complaint
  SELECT wi.id, wi.workflow_id, wi.current_step_key, wi.current_step_id, wi.status
    INTO v_wi
    FROM public.workflow_instances wi
   WHERE wi.entity_type = 'complaint' AND wi.entity_id = v_c.id
   ORDER BY wi.created_at DESC
   LIMIT 1;

  IF v_wi.id IS NOT NULL THEN
    SELECT s.step_order INTO v_current_order
      FROM public.approval_steps s
     WHERE s.workflow_id = v_wi.workflow_id
       AND (s.id = v_wi.current_step_id OR s.step_key = v_wi.current_step_key)
     LIMIT 1;

    SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'order')::int), '[]'::jsonb)
      INTO v_steps
      FROM (
        SELECT jsonb_build_object(
                 'key', COALESCE(s.step_key, s.id::text),
                 'label', COALESCE(NULLIF(s.public_label, ''), s.name),
                 'order', s.step_order,
                 'is_current', (v_current_order IS NOT NULL AND s.step_order = v_current_order),
                 'is_complete', (v_current_order IS NOT NULL AND s.step_order < v_current_order)
                                OR (v_wi.status = 'completed'),
                 'is_terminal', COALESCE(s.is_terminal, false)
               ) AS x
          FROM public.approval_steps s
         WHERE s.workflow_id = v_wi.workflow_id
           AND COALESCE(s.complainant_visible, true)
      ) q;

    SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'at')), '[]'::jsonb)
      INTO v_actions
      FROM (
        SELECT jsonb_build_object(
                 'at', aa.created_at,
                 'action', COALESCE(cs.public_label,
                             initcap(replace(COALESCE(aa.action_type, aa.action, 'update'), '_', ' '))),
                 'step', COALESCE(NULLIF(s.public_label, ''), s.name)
               ) AS x
          FROM public.approval_actions aa
          LEFT JOIN public.approval_steps s ON s.id = aa.step_id
          LEFT JOIN public.complaint_status_catalogue cs
            ON cs.code = COALESCE(aa.action_type, aa.action)
         WHERE aa.workflow_instance_id = v_wi.id
      ) q;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE status = 'completed')
    INTO v_tasks_total, v_tasks_done
    FROM public.complaint_investigation_tasks
   WHERE complaint_id = v_c.id;

  v_investigation := jsonb_build_object(
    'started', v_tasks_total > 0 OR v_c.investigator_id IS NOT NULL,
    'tasks_total', v_tasks_total,
    'tasks_completed', v_tasks_done,
    'findings', CASE WHEN v_c.resolved_at IS NOT NULL OR v_c.closed_at IS NOT NULL
                     THEN NULLIF(btrim(COALESCE(v_c.findings, '')), '') END,
    'outcome', CASE WHEN v_c.resolved_at IS NOT NULL OR v_c.closed_at IS NOT NULL
                    THEN NULLIF(btrim(COALESCE(v_c.resolution, '')), '') END,
    'closure_reason', CASE WHEN v_c.closed_at IS NOT NULL
                           THEN NULLIF(btrim(COALESCE(v_c.closure_reason, '')), '') END
  );

  SELECT jsonb_build_object(
           'description', v_c.description,
           'type', (SELECT name FROM public.complaint_types WHERE id = v_c.complaint_type_id),
           'channel', (SELECT name FROM public.conduct_channels WHERE id = v_c.channel_id),
           'product', (SELECT name FROM public.conduct_products WHERE id = v_c.product_id),
           'entity', (SELECT name FROM public.licensees WHERE id = v_c.licensee_id),
           'acknowledged_at', v_c.acknowledged_at,
           'intake_source', v_c.intake_source
         )
    INTO v_details;

  IF v_is_owner THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'at', cc.created_at, 'subject', cc.subject, 'body', cc.body
           ) ORDER BY cc.created_at DESC), '[]'::jsonb)
      INTO v_corr
      FROM public.complaint_correspondence cc
     WHERE cc.complaint_id = v_c.id
       AND lower(COALESCE(cc.direction, 'outbound')) = 'outbound';
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'is_owner', v_is_owner,
    'reference', v_c.complaint_number,
    'subject', v_c.subject,
    'submitted_at', v_c.created_at,
    'updated_at', v_c.updated_at,
    'resolved_at', v_c.resolved_at,
    'closed_at', v_c.closed_at,
    'status', jsonb_build_object(
      'label', COALESCE(v_status.public_label, 'In progress'),
      'description', COALESCE(v_status.public_description, ''),
      'terminal', COALESCE(v_status.is_terminal, false)
    ),
    'details', v_details,
    'steps', v_steps,
    'actions', v_actions,
    'investigation', v_investigation,
    'correspondence', v_corr,
    'timeline', COALESCE(v_timeline, '[]'::jsonb)
  );
END;
$function$;
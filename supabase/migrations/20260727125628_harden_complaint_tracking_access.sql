CREATE OR REPLACE FUNCTION public.get_public_complaint_tracking(p_reference text, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_c record;
  v_status record;
  v_timeline jsonb := '[]'::jsonb;
  v_steps jsonb := '[]'::jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_corr jsonb := '[]'::jsonb;
  v_details jsonb;
  v_investigation jsonb;
  v_is_owner boolean := false;
  v_caller uuid;
  v_caller_email text;
  v_allowed boolean := false;
  v_wi record;
  v_current_order int;
  v_status_key text;
  v_status_order int;
  v_effective_order int;
  v_terminal boolean := false;
  v_tasks_total int := 0;
  v_tasks_done int := 0;
  v_inv_status text;
  v_synth jsonb := '[]'::jsonb;
  v_branch_keys text[] := ARRAY['enforcement','notice_issued','response_received','payment','appeal','withdrawn'];
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

  v_caller := auth.uid();
  IF v_caller IS NOT NULL THEN
    SELECT lower(btrim(u.email)) INTO v_caller_email FROM auth.users u WHERE u.id = v_caller;
  END IF;

  v_is_owner := v_caller IS NOT NULL AND v_c.complainant_id = v_caller;

  v_allowed := v_is_owner
    OR (v_caller_email IS NOT NULL AND v_c.email IS NOT NULL
        AND lower(btrim(v_c.email)) = v_caller_email)
    OR (p_email IS NOT NULL AND v_c.email IS NOT NULL AND btrim(v_c.email) <> ''
        AND lower(btrim(p_email)) = lower(btrim(v_c.email)))
    OR (v_caller IS NOT NULL AND public.has_complaint_perm(v_caller, 'view'));

  IF NOT v_allowed THEN
    RETURN jsonb_build_object('found', false, 'error', 'CONTACT_MISMATCH');
  END IF;

  SELECT public_label, public_description, is_terminal
    INTO v_status
    FROM public.complaint_status_catalogue
   WHERE code = v_c.status;

  v_terminal := v_c.status IN ('resolved','closed','rejected','duplicate')
                OR v_c.closed_at IS NOT NULL;

  -- Public, plain-English history built from audit events (whitelisted) plus
  -- any workflow actions. Nothing internal (notes, assignments, actors) leaks.
  WITH audit_events AS (
    SELECT
      a.created_at AS event_at,
      CASE lower(a.action)
        WHEN 'complaint_created' THEN 'Complaint received'
        WHEN 'complaint.created' THEN 'Complaint received'
        WHEN 'licensee_linked' THEN 'Matched to the firm concerned'
        WHEN 'complaint.investigation_started' THEN 'Review started'
        WHEN 'complaint_under_investigation' THEN 'Review started'
        WHEN 'complaint.task_created' THEN 'Review activity progressed'
        WHEN 'complaint.task_in_progress' THEN 'Review activity progressed'
        WHEN 'complaint.task_completed' THEN 'Review activity progressed'
        WHEN 'complaint.severity_set' THEN 'Complaint assessed'
        WHEN 'complaint_triage_retry' THEN 'Complaint assessed'
        WHEN 'rule_override' THEN 'Complaint assessed'
        WHEN 'complaint.escalated_to_enforcement' THEN 'Referred for enforcement'
        WHEN 'complaint.resolved' THEN 'Resolution reached'
        WHEN 'complaint_resolved' THEN 'Resolution reached'
        WHEN 'complaint_closed' THEN 'Complaint closed'
        WHEN 'complaint.closed' THEN 'Complaint closed'
        WHEN 'complaint_rejected' THEN 'Complaint not accepted'
        ELSE NULL
      END AS label,
      CASE lower(a.action)
        WHEN 'complaint_created' THEN 'We received your complaint and issued your reference number.'
        WHEN 'complaint.created' THEN 'We received your complaint and issued your reference number.'
        WHEN 'licensee_linked' THEN 'Your complaint was matched to the firm it concerns.'
        WHEN 'complaint.investigation_started' THEN 'A review of your complaint has begun.'
        WHEN 'complaint_under_investigation' THEN 'A review of your complaint has begun.'
        WHEN 'complaint.task_created' THEN 'Our team is working through the review activities.'
        WHEN 'complaint.task_in_progress' THEN 'Our team is working through the review activities.'
        WHEN 'complaint.task_completed' THEN 'A review activity was completed.'
        WHEN 'complaint.severity_set' THEN 'Your complaint was assessed and prioritised.'
        WHEN 'complaint_triage_retry' THEN 'Your complaint was assessed and prioritised.'
        WHEN 'rule_override' THEN 'Your complaint was assessed and prioritised.'
        WHEN 'complaint.escalated_to_enforcement' THEN 'Your complaint was referred for enforcement action.'
        WHEN 'complaint.resolved' THEN 'A resolution has been reached for your complaint.'
        WHEN 'complaint_resolved' THEN 'A resolution has been reached for your complaint.'
        WHEN 'complaint_closed' THEN 'Your complaint file has been closed.'
        WHEN 'complaint.closed' THEN 'Your complaint file has been closed.'
        WHEN 'complaint_rejected' THEN 'Your complaint was not accepted for investigation.'
        ELSE NULL
      END AS description,
      CASE WHEN lower(a.action) IN (
        'complaint_created','complaint.created',
        'complaint.investigation_started','complaint_under_investigation',
        'complaint.escalated_to_enforcement',
        'complaint.resolved','complaint_resolved',
        'complaint_closed','complaint.closed','complaint_rejected'
      ) THEN true ELSE false END AS is_decision
    FROM public.audit_logs a
   WHERE a.entity_type IN ('complaint','complaints')
     AND a.entity_id::text = v_c.id::text
  ),
  wf_events AS (
    SELECT
      aa.created_at AS event_at,
      COALESCE(cs.public_label,
        initcap(replace(COALESCE(aa.action_type, aa.action, 'update'), '_', ' '))) AS label,
      COALESCE(cs.public_description, 'Your complaint has been updated.') AS description,
      false AS is_decision
    FROM public.workflow_instances wi
    JOIN public.approval_actions aa ON aa.workflow_instance_id = wi.id
    LEFT JOIN public.complaint_status_catalogue cs
      ON cs.code = COALESCE(aa.action_type, aa.action)
    WHERE wi.entity_type = 'complaint' AND wi.entity_id::text = v_c.id::text
  ),
  -- Lifecycle milestones from the complaint record itself, so a resolved or
  -- closed complaint always shows those dates even when no audit row exists.
  synth AS (
    SELECT * FROM (
      VALUES
        (v_c.created_at, 'Complaint received',
         'We received your complaint and issued your reference number.', true),
        (v_c.resolved_at, 'Resolution reached',
         'A resolution has been reached for your complaint.', true),
        (v_c.closed_at,
         CASE WHEN v_c.status = 'rejected' THEN 'Complaint not accepted' ELSE 'Complaint closed' END,
         CASE WHEN v_c.status = 'rejected'
              THEN 'Your complaint was not accepted for investigation.'
              ELSE 'Your complaint file has been closed.' END, true)
    ) AS t(event_at, label, description, is_decision)
    WHERE t.event_at IS NOT NULL
  ),
  combined AS (
    SELECT * FROM audit_events WHERE label IS NOT NULL
    UNION ALL
    SELECT * FROM wf_events
    UNION ALL
    SELECT s.* FROM synth s
    WHERE NOT EXISTS (
      SELECT 1 FROM audit_events ae WHERE ae.label = s.label
    )
  ),
  merged AS (
    SELECT DISTINCT ON (label, date_trunc('second', event_at))
           event_at, label, description, is_decision
      FROM combined
     ORDER BY label, date_trunc('second', event_at), event_at
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'event_at', m.event_at, 'label', m.label, 'description', m.description
    ) ORDER BY m.event_at), '[]'::jsonb),
    COALESCE(jsonb_agg(jsonb_build_object(
      'at', m.event_at, 'action', m.label, 'step', m.description
    ) ORDER BY m.event_at) FILTER (WHERE m.is_decision), '[]'::jsonb)
  INTO v_timeline, v_actions
  FROM merged m;

  -- Latest workflow instance for the complaint (progress steps)
  SELECT wi.id, wi.workflow_id, wi.current_step_key, wi.current_step_id, wi.status
    INTO v_wi
    FROM public.workflow_instances wi
   WHERE wi.entity_type = 'complaint' AND wi.entity_id::text = v_c.id::text
   ORDER BY wi.created_at DESC
   LIMIT 1;

  IF v_wi.id IS NOT NULL THEN
    SELECT s.step_order INTO v_current_order
      FROM public.approval_steps s
     WHERE s.workflow_id = v_wi.workflow_id
       AND (s.id = v_wi.current_step_id OR s.step_key = v_wi.current_step_key)
     LIMIT 1;
  END IF;

  -- Milestone derived from the complaint's own status: the workflow instance
  -- can be stale (no current step), but the complaint status is authoritative.
  v_status_key := CASE v_c.status
    WHEN 'submitted' THEN 'triage'
    WHEN 'under_investigation' THEN 'investigation'
    WHEN 'resolved' THEN 'resolved'
    WHEN 'closed' THEN 'closed'
    WHEN 'rejected' THEN 'closed'
    WHEN 'duplicate' THEN 'closed'
    ELSE 'filed'
  END;

  IF v_wi.id IS NOT NULL THEN
    SELECT s.step_order INTO v_status_order
      FROM public.approval_steps s
     WHERE s.workflow_id = v_wi.workflow_id AND s.step_key = v_status_key
     LIMIT 1;

    v_effective_order := GREATEST(COALESCE(v_status_order, 0), COALESCE(v_current_order, 0));

    SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'order')::int), '[]'::jsonb)
      INTO v_steps
      FROM (
        SELECT jsonb_build_object(
                 'key', COALESCE(s.step_key, s.id::text),
                 'label', COALESCE(NULLIF(btrim(s.public_label), ''),
                                   NULLIF(btrim(s.name), ''),
                                   initcap(replace(COALESCE(s.step_key, 'step'), '_', ' '))),
                 'order', s.step_order,
                 'is_current', (NOT v_terminal
                                AND v_effective_order > 0
                                AND s.step_order = v_effective_order
                                AND COALESCE(v_wi.status, '') <> 'completed'),
                 'is_complete', (v_effective_order > 0 AND s.step_order < v_effective_order)
                                OR (v_terminal AND s.step_order <= v_effective_order)
                                OR (v_wi.status = 'completed'),
                 'is_terminal', COALESCE(s.is_terminal, false)
               ) AS x
          FROM public.approval_steps s
         WHERE s.workflow_id = v_wi.workflow_id
           AND COALESCE(s.complainant_visible, true)
           -- Branch-only stages are hidden unless the workflow actually reached them.
           AND (NOT (s.step_key = ANY (v_branch_keys))
                OR COALESCE(v_current_order, 0) >= s.step_order)
           -- Never advertise terminal outcomes the complaint did not take.
           AND (NOT COALESCE(s.is_terminal, false)
                OR NOT v_terminal
                OR s.step_key = v_status_key)
      ) q;
  ELSE
    -- No workflow instance: synthesise a simple milestone list from the status.
    v_status_order := CASE v_status_key
      WHEN 'filed' THEN 10 WHEN 'triage' THEN 20
      WHEN 'investigation' THEN 30 WHEN 'resolved' THEN 90 ELSE 95 END;
    v_effective_order := v_status_order;

    SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'order')::int), '[]'::jsonb)
      INTO v_steps
      FROM (
        SELECT jsonb_build_object(
                 'key', t.key,
                 'label', t.label,
                 'order', t.ord,
                 'is_current', (NOT v_terminal AND t.ord = v_effective_order),
                 'is_complete', t.ord < v_effective_order OR (v_terminal AND t.ord <= v_effective_order),
                 'is_terminal', t.ord >= 90
               ) AS x
          FROM (VALUES
                  ('filed','Complaint received',10),
                  ('triage','Assessment',20),
                  ('investigation','Review',30),
                  ('resolved','Resolved',90),
                  ('closed','Closed',95)
               ) AS t(key,label,ord)
         WHERE t.ord < 90
            OR (v_status_key = 'resolved' AND t.ord = 90)
            OR (v_status_key = 'closed' AND t.ord = 95)
      ) q;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE status = 'completed')
    INTO v_tasks_total, v_tasks_done
    FROM public.complaint_investigation_tasks
   WHERE complaint_id = v_c.id;

  v_inv_status := CASE
    WHEN v_c.resolved_at IS NOT NULL OR v_c.closed_at IS NOT NULL THEN 'Completed'
    WHEN v_c.status = 'under_investigation'
      OR v_c.investigator_id IS NOT NULL
      OR v_tasks_total > 0 THEN 'In progress'
    ELSE 'Not yet started'
  END;

  v_investigation := jsonb_build_object(
    'started', v_inv_status <> 'Not yet started',
    'status_label', v_inv_status,
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
      'terminal', COALESCE(v_status.is_terminal, v_terminal)
    ),
    'details', v_details,
    'steps', v_steps,
    'actions', v_actions,
    'investigation', v_investigation,
    'correspondence', v_corr,
    'timeline', COALESCE(v_timeline, '[]'::jsonb)
  );
END;
$function$


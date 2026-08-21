-- EPR-05 — canonical application case state, work queue and case read model

CREATE OR REPLACE VIEW public.v_application_case_state
WITH (security_invoker = true) AS
WITH base AS (
  SELECT a.id,
         a.application_number,
         a.applicant_id,
         a.entity_id,
         a.license_type,
         a.status,
         a.regulator_id,
         a.submitted_at,
         a.created_at,
         a.updated_at,
         a.priority,
         a.priority_reason,
         a.priority_set_at,
         a.priority_set_by,
         a.assigned_to,
         a.sufficiency_status,
         a.approved_at,
         a.rejected_at,
         a.cancelled_at,
         a.data,
         wi.id AS workflow_instance_id,
         wi.workflow_id,
         wi.started_at AS workflow_started_at,
         wi.paused_at,
         wi.resumed_at,
         wi.total_pause_seconds,
         wi.assigned_role,
         wi.status AS workflow_status,
         st.id AS current_step_id,
         st.name AS current_step_name,
         st.step_order AS current_step_order,
         st.is_terminal AS current_step_is_terminal,
         st.sla_hours AS current_step_sla_hours,
         st.sla_warning_threshold_percent,
         public.application_open_rfi_count(a.id) AS open_rfi_count,
         public.application_rfi_pauses_sla(a.id) AS rfi_pauses_sla,
         (SELECT count(*)::int FROM public.licenses l WHERE l.application_id = a.id) AS license_count,
         (SELECT l.id FROM public.licenses l WHERE l.application_id = a.id LIMIT 1) AS license_id
    FROM public.applications a
    LEFT JOIN public.workflow_instances wi
           ON wi.entity_type = 'application' AND wi.entity_id = a.id
          AND wi.status IN ('active', 'paused')
    LEFT JOIN public.approval_steps st ON st.id = wi.current_step_id
), derived AS (
  SELECT b.*,
         coalesce(public.app_actor_display_name(b.applicant_id), 'Unknown') AS applicant_name,
         public.app_applicant_org_name(b.applicant_id) AS applicant_org,
         public.app_actor_display_name(b.assigned_to) AS owner_name,
         (SELECT lic.name FROM public.licensees lic WHERE lic.id = b.entity_id) AS entity_name,
         CASE WHEN coalesce(b.data->>'application_category', '') = 'post_license'
                OR (b.data ? 'licensee_id') THEN 'POST_LICENCE' ELSE 'PRE_LICENCE' END AS application_category,
         coalesce(b.current_step_sla_hours::numeric, public.licensing_default_sla_hours()) AS sla_hours,
         coalesce(b.workflow_started_at, b.submitted_at) AS sla_started_at,
         (b.status IN ('approved', 'rejected', 'withdrawn', 'cancelled')) AS is_terminal
    FROM base b
), timed AS (
  SELECT d.*,
         CASE WHEN d.sla_started_at IS NOT NULL AND d.sla_hours IS NOT NULL AND d.sla_hours > 0
              THEN d.sla_started_at
                   + (d.sla_hours * interval '1 hour')
                   + (coalesce(d.total_pause_seconds, 0) * interval '1 second')
         END AS sla_due_at,
         (d.paused_at IS NOT NULL AND d.resumed_at IS NULL) OR coalesce(d.rfi_pauses_sla, false) AS sla_paused
    FROM derived d
), staged AS (
  SELECT t.*,
         CASE
           WHEN t.status = 'draft' THEN 'PREPARATION'
           WHEN t.status = 'approved' AND t.license_count > 0 THEN 'CLOSED'
           WHEN t.status = 'approved' THEN 'AUTHORISATION'
           WHEN t.status IN ('rejected', 'withdrawn', 'cancelled') THEN 'CLOSED'
           WHEN t.open_rfi_count > 0
             OR t.status IN ('query_raised', 'resubmission_requested', 'info_requested',
                             'returned_for_correction', 'awaiting_applicant') THEN 'AWAITING_APPLICANT'
           WHEN coalesce(t.current_step_is_terminal, false) THEN 'DECISION'
           WHEN t.status = 'submitted' AND t.sufficiency_status IS NULL THEN 'SUBMITTED_INTAKE'
           WHEN coalesce(t.sufficiency_status, 'pending') IN ('pending', 'in_progress') THEN 'SUFFICIENCY_REVIEW'
           ELSE 'REGULATORY_REVIEW'
         END AS stage,
         CASE
           WHEN t.is_terminal THEN NULL
           WHEN t.status = 'draft' THEN 'applicant'
           WHEN t.open_rfi_count > 0
             OR t.status IN ('query_raised', 'resubmission_requested', 'info_requested',
                             'returned_for_correction', 'awaiting_applicant') THEN 'applicant'
           ELSE 'regulator'
         END AS waiting_on,
         CASE
           WHEN t.is_terminal OR t.sla_due_at IS NULL THEN 'unknown'
           WHEN t.sla_paused THEN 'paused'
           WHEN now() > t.sla_due_at THEN 'breached'
           WHEN now() > t.sla_due_at - (t.sla_hours
                * (100 - coalesce(t.sla_warning_threshold_percent, 80)) / 100.0) * interval '1 hour'
             THEN 'due_soon'
           ELSE 'on_track'
         END AS sla_state
    FROM timed t
)
SELECT s.id,
       s.application_number,
       s.applicant_id,
       s.applicant_name,
       s.applicant_org,
       s.entity_id,
       s.entity_name,
       s.application_category,
       s.license_type,
       s.regulator_id,
       s.stage,
       replace(initcap(replace(s.stage, '_', ' ')), 'Rfi', 'RFI') AS stage_label,
       s.status,
       initcap(replace(s.status, '_', ' ')) AS status_label,
       s.assigned_to AS owner_user_id,
       s.owner_name,
       s.assigned_role AS team,
       CASE
         WHEN s.priority_set_at IS NOT NULL OR nullif(btrim(coalesce(s.priority_reason, '')), '') IS NOT NULL
           THEN CASE s.priority WHEN 1 THEN 'critical' WHEN 2 THEN 'high' WHEN 4 THEN 'low'
                                WHEN 5 THEN 'deferred' ELSE 'medium' END
         WHEN s.sla_state = 'breached' THEN 'critical'
         WHEN s.sla_state = 'due_soon' THEN 'high'
         WHEN s.waiting_on = 'applicant' THEN 'low'
         ELSE 'medium'
       END AS priority,
       CASE
         WHEN s.priority_set_at IS NOT NULL OR nullif(btrim(coalesce(s.priority_reason, '')), '') IS NOT NULL
           THEN coalesce(nullif(btrim(coalesce(s.priority_reason, '')), ''), 'Set by officer')
         WHEN s.sla_state = 'breached' THEN 'Service level breached'
         WHEN s.sla_state = 'due_soon' THEN 'Service level due soon'
         WHEN s.waiting_on = 'applicant' THEN 'Waiting on applicant'
         ELSE 'Normal'
       END AS priority_reason,
       CASE
         WHEN s.priority_set_at IS NOT NULL OR nullif(btrim(coalesce(s.priority_reason, '')), '') IS NOT NULL
           THEN 'MANUAL_OVERRIDE'
         WHEN s.sla_state IN ('breached', 'due_soon') THEN 'SLA'
         WHEN s.waiting_on = 'applicant' THEN 'WORKFLOW'
         ELSE 'NORMAL'
       END AS priority_source,
       s.priority AS manual_priority,
       s.sla_due_at,
       s.sla_state,
       s.sla_hours,
       s.waiting_on,
       s.sufficiency_status,
       s.open_rfi_count,
       s.workflow_instance_id,
       s.workflow_id,
       s.current_step_id,
       s.current_step_name,
       s.current_step_order,
       s.current_step_is_terminal,
       s.license_id,
       s.license_count,
       s.is_terminal,
       s.submitted_at,
       s.created_at,
       greatest(s.updated_at, coalesce(s.submitted_at, s.created_at)) AS last_activity_at,
       '/applications/' || s.id AS canonical_href
  FROM staged s;

GRANT SELECT ON public.v_application_case_state TO authenticated;

-- Next action guidance (server-owned; the browser only renders it)
CREATE OR REPLACE FUNCTION public.application_next_action(_stage text, _audience text DEFAULT 'internal')
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _audience = 'external' THEN CASE _stage
      WHEN 'PREPARATION' THEN jsonb_build_object('code', 'COMPLETE_APPLICATION', 'label', 'Complete and submit your application', 'permission', NULL)
      WHEN 'AWAITING_APPLICANT' THEN jsonb_build_object('code', 'RESPOND_RFI', 'label', 'Respond to the information request', 'permission', NULL)
      WHEN 'AUTHORISATION' THEN jsonb_build_object('code', 'AWAIT_LICENCE', 'label', 'Approved — licence being issued', 'permission', NULL)
      WHEN 'CLOSED' THEN jsonb_build_object('code', 'NONE', 'label', 'No action required', 'permission', NULL)
      ELSE jsonb_build_object('code', 'AWAIT_REVIEW', 'label', 'Await regulator review', 'permission', NULL)
    END
    ELSE CASE _stage
      WHEN 'PREPARATION' THEN jsonb_build_object('code', 'AWAIT_SUBMISSION', 'label', 'Awaiting applicant submission', 'permission', NULL)
      WHEN 'SUBMITTED_INTAKE' THEN jsonb_build_object('code', 'TRIAGE', 'label', 'Triage and assign the application', 'permission', 'application_management.update')
      WHEN 'SUFFICIENCY_REVIEW' THEN jsonb_build_object('code', 'EVALUATE_SUFFICIENCY', 'label', 'Run the sufficiency evaluation', 'permission', 'application_management.review')
      WHEN 'AWAITING_APPLICANT' THEN jsonb_build_object('code', 'AWAIT_APPLICANT', 'label', 'Awaiting applicant response to information request', 'permission', NULL)
      WHEN 'REGULATORY_REVIEW' THEN jsonb_build_object('code', 'COMPLETE_REVIEW', 'label', 'Complete the current review step', 'permission', 'application_management.review')
      WHEN 'DECISION' THEN jsonb_build_object('code', 'RECORD_DECISION', 'label', 'Record the authorisation decision', 'permission', 'application_management.approve')
      WHEN 'AUTHORISATION' THEN jsonb_build_object('code', 'ISSUE_LICENCE', 'label', 'Complete licence issuance handoff', 'permission', 'license_management.create')
      ELSE jsonb_build_object('code', 'NONE', 'label', 'No action required', 'permission', NULL)
    END
  END;
$$;

GRANT EXECUTE ON FUNCTION public.application_next_action(text, text) TO authenticated;

-- Canonical application work queue (RLS-scoped, server paged/filtered/counted)
CREATE OR REPLACE FUNCTION public.application_work_queue(
  _stages text[] DEFAULT NULL,
  _statuses text[] DEFAULT NULL,
  _sla_states text[] DEFAULT NULL,
  _waiting_on text DEFAULT NULL,
  _categories text[] DEFAULT NULL,
  _license_type text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _assigned_to uuid DEFAULT NULL,
  _unassigned boolean DEFAULT false,
  _priorities text[] DEFAULT NULL,
  _submitted_from timestamptz DEFAULT NULL,
  _submitted_to timestamptz DEFAULT NULL,
  _search text DEFAULT NULL,
  _include_closed boolean DEFAULT false,
  _include_drafts boolean DEFAULT false,
  _sort text DEFAULT 'priority',
  _limit integer DEFAULT 25,
  _offset integer DEFAULT 0
) RETURNS TABLE(
  application_id uuid, application_number text, applicant_id uuid, applicant_name text,
  entity_id uuid, entity_name text, application_category text, license_type text,
  stage text, stage_label text, status text, status_label text,
  owner_user_id uuid, owner_name text, team text,
  priority text, priority_reason text, priority_source text,
  sla_due_at timestamptz, sla_state text, waiting_on text,
  blocker_count integer, blockers jsonb,
  next_action_code text, next_action_label text, next_action_permission text, next_action_href text,
  submitted_at timestamptz, last_activity_at timestamptz,
  current_workflow_step text, canonical_href text, total_count bigint
) LANGUAGE sql STABLE SET search_path = public AS $$
  WITH scoped AS (
    SELECT v.* FROM public.v_application_case_state v
     WHERE (_include_closed OR NOT v.is_terminal)
       AND (_include_drafts OR v.status <> 'draft')
       AND (_stages IS NULL OR v.stage = ANY(_stages))
       AND (_statuses IS NULL OR v.status = ANY(_statuses))
       AND (_sla_states IS NULL OR v.sla_state = ANY(_sla_states))
       AND (_waiting_on IS NULL OR v.waiting_on = _waiting_on)
       AND (_categories IS NULL OR v.application_category = ANY(_categories))
       AND (_license_type IS NULL OR v.license_type ILIKE '%' || _license_type || '%')
       AND (_entity_id IS NULL OR v.entity_id = _entity_id)
       AND (_regulator_id IS NULL OR v.regulator_id = _regulator_id)
       AND (_sector_id IS NULL OR EXISTS (
             SELECT 1 FROM public.applications a WHERE a.id = v.id
              AND (a.data->>'sector_id' = _sector_id::text
                OR a.data->>'resolved_sector_id' = _sector_id::text)))
       AND (_assigned_to IS NULL OR v.owner_user_id = _assigned_to)
       AND (NOT _unassigned OR v.owner_user_id IS NULL)
       AND (_priorities IS NULL OR v.priority = ANY(_priorities))
       AND (_submitted_from IS NULL OR v.submitted_at >= _submitted_from)
       AND (_submitted_to IS NULL OR v.submitted_at <= _submitted_to)
       AND (_search IS NULL OR btrim(_search) = '' OR
            v.application_number ILIKE '%' || btrim(_search) || '%' OR
            coalesce(v.applicant_name, '') ILIKE '%' || btrim(_search) || '%' OR
            coalesce(v.entity_name, '') ILIKE '%' || btrim(_search) || '%' OR
            coalesce(v.license_type, '') ILIKE '%' || btrim(_search) || '%')
  ), counted AS (SELECT count(*) AS n FROM scoped)
  SELECT s.id, s.application_number, s.applicant_id,
         CASE WHEN s.applicant_org IS NOT NULL AND s.applicant_org <> s.applicant_name
              THEN s.applicant_name || ' (' || s.applicant_org || ')' ELSE s.applicant_name END,
         s.entity_id, s.entity_name, s.application_category, s.license_type,
         s.stage, s.stage_label, s.status, s.status_label,
         s.owner_user_id, s.owner_name, s.team,
         s.priority, s.priority_reason, s.priority_source,
         s.sla_due_at, s.sla_state, s.waiting_on,
         jsonb_array_length(b.blockers)::int, b.blockers,
         na->>'code', na->>'label', na->>'permission', s.canonical_href,
         s.submitted_at, s.last_activity_at, s.current_step_name, s.canonical_href, counted.n
    FROM scoped s
    CROSS JOIN counted
    CROSS JOIN LATERAL (SELECT public.application_blockers(s.id) AS blockers) b
    CROSS JOIN LATERAL (SELECT public.application_next_action(s.stage, 'internal') AS na) n(na)
   ORDER BY
     CASE WHEN _sort = 'priority' THEN
       CASE s.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END
       ELSE NULL END NULLS LAST,
     CASE WHEN _sort = 'sla' THEN
       CASE s.sla_state WHEN 'breached' THEN 0 WHEN 'due_soon' THEN 1 WHEN 'on_track' THEN 2 ELSE 3 END
       ELSE NULL END NULLS LAST,
     CASE WHEN _sort = 'submitted_asc' THEN coalesce(s.submitted_at, s.created_at) ELSE NULL END ASC NULLS LAST,
     CASE WHEN _sort = 'submitted_desc' THEN coalesce(s.submitted_at, s.created_at) ELSE NULL END DESC NULLS LAST,
     CASE WHEN _sort = 'applicant' THEN s.applicant_name ELSE NULL END ASC NULLS LAST,
     CASE WHEN _sort = 'app_number' THEN s.application_number ELSE NULL END ASC NULLS LAST,
     s.sla_due_at NULLS LAST, coalesce(s.submitted_at, s.created_at) DESC
   LIMIT greatest(1, least(coalesce(_limit, 25), 200)) OFFSET greatest(0, coalesce(_offset, 0));
$$;

CREATE OR REPLACE FUNCTION public.application_work_queue_counts(
  _regulator_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH scoped AS (
    SELECT v.* FROM public.v_application_case_state v
     WHERE v.status <> 'draft'
       AND (_regulator_id IS NULL OR v.regulator_id = _regulator_id)
       AND (_sector_id IS NULL OR EXISTS (
             SELECT 1 FROM public.applications a WHERE a.id = v.id
              AND (a.data->>'sector_id' = _sector_id::text
                OR a.data->>'resolved_sector_id' = _sector_id::text)))
  )
  SELECT jsonb_build_object(
    'total_open', count(*) FILTER (WHERE NOT is_terminal),
    'awaiting_triage', count(*) FILTER (WHERE stage = 'SUBMITTED_INTAKE'),
    'sufficiency_review', count(*) FILTER (WHERE stage = 'SUFFICIENCY_REVIEW'),
    'under_review', count(*) FILTER (WHERE stage = 'REGULATORY_REVIEW'),
    'awaiting_applicant', count(*) FILTER (WHERE stage = 'AWAITING_APPLICANT'),
    'decision_ready', count(*) FILTER (WHERE stage = 'DECISION'),
    'authorisation', count(*) FILTER (WHERE stage = 'AUTHORISATION'),
    'breached', count(*) FILTER (WHERE sla_state = 'breached' AND NOT is_terminal),
    'due_soon', count(*) FILTER (WHERE sla_state = 'due_soon' AND NOT is_terminal),
    'unassigned', count(*) FILTER (WHERE owner_user_id IS NULL AND NOT is_terminal),
    'closed', count(*) FILTER (WHERE is_terminal),
    'by_stage', coalesce((SELECT jsonb_object_agg(stage, n) FROM
        (SELECT stage, count(*) n FROM scoped WHERE NOT is_terminal GROUP BY stage) q), '{}'::jsonb),
    'by_priority', coalesce((SELECT jsonb_object_agg(priority, n) FROM
        (SELECT priority, count(*) n FROM scoped WHERE NOT is_terminal GROUP BY priority) q), '{}'::jsonb)
  ) FROM scoped;
$$;

GRANT EXECUTE ON FUNCTION public.application_work_queue(text[], text[], text[], text, text[], text, uuid, uuid, uuid, uuid, boolean, text[], timestamptz, timestamptz, text, boolean, boolean, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.application_work_queue_counts(uuid, uuid) TO authenticated;
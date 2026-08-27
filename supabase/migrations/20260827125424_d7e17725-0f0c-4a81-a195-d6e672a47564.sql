-- 1. Drop the stale lowercase check constraint
ALTER TABLE public.complaint_investigation_tasks
  DROP CONSTRAINT IF EXISTS complaint_investigation_tasks_status_check;

-- 2. Normalise any existing rows to the canonical uppercase states
UPDATE public.complaint_investigation_tasks
   SET status = CASE upper(btrim(coalesce(status,'')))
                  WHEN 'PENDING' THEN 'NOT_STARTED'
                  WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'
                  WHEN 'BLOCKED' THEN 'BLOCKED'
                  WHEN 'COMPLETED' THEN 'COMPLETED'
                  WHEN 'CANCELLED' THEN 'CANCELLED'
                  WHEN 'NOT_STARTED' THEN 'NOT_STARTED'
                  ELSE 'NOT_STARTED'
                END
 WHERE status IS NULL
    OR status NOT IN ('NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED');

-- 3. Canonical default
ALTER TABLE public.complaint_investigation_tasks
  ALTER COLUMN status SET DEFAULT 'NOT_STARTED';

-- 4. Re-add the constraint on the canonical set
ALTER TABLE public.complaint_investigation_tasks
  ADD CONSTRAINT complaint_investigation_tasks_status_check
  CHECK (status IN ('NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED'));

-- 5a. Legacy create RPC writes the canonical initial state
CREATE OR REPLACE FUNCTION public.complaint_task_create(_complaint_id uuid, _title text, _description text DEFAULT NULL, _due_date date DEFAULT NULL, _owner_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _id uuid; _after jsonb;
BEGIN
  _uid := public.conduct_require('complaint_management','edit');
  IF coalesce(length(btrim(_title)),0) = 0 THEN
    RAISE EXCEPTION 'Please describe the work item' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.complaints WHERE id=_complaint_id) THEN
    RAISE EXCEPTION 'Complaint not found' USING ERRCODE='P0002';
  END IF;
  INSERT INTO public.complaint_investigation_tasks
    (complaint_id, title, description, due_date, owner_id, created_by, status)
  VALUES (_complaint_id, btrim(_title), nullif(btrim(coalesce(_description,'')),''),
          _due_date, coalesce(_owner_id,_uid), _uid, 'NOT_STARTED')
  RETURNING id INTO _id;
  SELECT to_jsonb(t) INTO _after FROM public.complaint_investigation_tasks t WHERE t.id=_id;
  PERFORM public.log_compliance_audit('CREATE','complaint_investigation_task',_id,NULL,_after,NULL);
  RETURN _after;
END; $$;

-- 5b. Legacy status RPC normalises input and writes canonical states
CREATE OR REPLACE FUNCTION public.complaint_task_set_status(_task_id uuid, _status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _before jsonb; _after jsonb; _s text;
BEGIN
  _uid := public.conduct_require('complaint_management','edit');
  _s := upper(btrim(coalesce(_status,'')));
  IF _s = 'PENDING' THEN _s := 'NOT_STARTED'; END IF;
  IF _s NOT IN ('NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED') THEN
    RAISE EXCEPTION 'Unsupported work item status: %', _status USING ERRCODE='22023';
  END IF;
  SELECT to_jsonb(t) INTO _before FROM public.complaint_investigation_tasks t WHERE t.id=_task_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Work item not found' USING ERRCODE='P0002'; END IF;
  UPDATE public.complaint_investigation_tasks SET
    status = _s,
    completed_at = CASE WHEN _s='COMPLETED' THEN now() ELSE NULL END,
    completed_by = CASE WHEN _s='COMPLETED' THEN _uid ELSE NULL END,
    updated_at = now()
  WHERE id=_task_id RETURNING to_jsonb(complaint_investigation_tasks) INTO _after;
  PERFORM public.log_compliance_audit('UPDATE','complaint_investigation_task',_task_id,_before,_after,NULL);
  RETURN _after;
END; $$;

-- 5c. Personal work queue: exclude completed and cancelled work items
CREATE OR REPLACE FUNCTION public.my_work_queue(_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lim integer := LEAST(GREATEST(coalesce(_limit,25), 1), 100);
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED');
  END IF;

  -- Provider identities only ever see their own scoped work packages.
  IF NOT public.is_internal_staff(v_uid) THEN
    IF NOT public.is_provider_member(v_uid) THEN
      RETURN jsonb_build_object('items','[]'::jsonb,'counts','{}'::jsonb,
        'context','none','read_model','my_work_queue','is_authoritative_source',false);
    END IF;
    SELECT coalesce(jsonb_agg(x ORDER BY x->>'due_at' NULLS LAST),'[]'::jsonb) INTO v_items
      FROM (SELECT jsonb_build_object('source','provider_work_package','id', w.id,
                     'reference', w.reference, 'title', coalesce(t.name, w.subject_module),
                     'status', w.state, 'due_at', w.due_at,
                     'route', '/provider/work-packages/' || w.id) x
              FROM public.provider_work_packages w
              LEFT JOIN public.regulatory_service_tasks t ON t.id = w.service_task_id
             WHERE public.provider_can_access_work_package(v_uid, w.id)
             ORDER BY w.due_at NULLS LAST LIMIT v_lim) s;
    RETURN jsonb_build_object('items', v_items,
      'counts', jsonb_build_object('provider_work_packages', jsonb_array_length(v_items)),
      'context','provider','read_model','my_work_queue','is_authoritative_source',false);
  END IF;

  SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO v_items FROM (
    SELECT jsonb_build_object('source','application','id', a.id, 'reference', a.application_number,
             'title', a.license_type, 'status', a.status, 'due_at', NULL,
             'priority', a.priority, 'route', '/licensing/applications/' || a.id) x,
           a.updated_at AS ord
      FROM public.applications a
     WHERE a.assigned_to = v_uid AND a.status NOT IN ('draft','approved','rejected','cancelled')
     ORDER BY a.updated_at DESC LIMIT v_lim
  ) s;

  v_items := v_items || (
    SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
      SELECT jsonb_build_object('source','complaint','id', c.id, 'reference', c.complaint_number,
               'title', c.subject, 'status', c.status, 'due_at', c.sla_due_at,
               'priority', c.priority, 'route', '/complaints/' || c.id) x
        FROM public.complaints c
       WHERE c.investigator_id = v_uid AND c.closed_at IS NULL
       ORDER BY c.sla_due_at NULLS LAST LIMIT v_lim) s);

  v_items := v_items || (
    SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
      SELECT jsonb_build_object('source','complaint_task','id', t.id, 'reference', NULL,
               'title', t.title, 'status', t.status, 'due_at', t.due_date,
               'priority', t.priority, 'route', '/complaints/' || t.complaint_id) x
        FROM public.complaint_investigation_tasks t
       WHERE t.owner_id = v_uid AND upper(t.status) NOT IN ('COMPLETED','CANCELLED')
       ORDER BY t.due_date NULLS LAST LIMIT v_lim) s);

  v_items := v_items || (
    SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
      SELECT jsonb_build_object('source','conduct_attention','id', ai.id, 'reference', ai.reference,
               'title', ai.title, 'status', ai.status, 'due_at', ai.target_review_date,
               'priority', coalesce(ai.confirmed_priority, ai.calculated_priority),
               'route', '/conduct/attention/' || ai.id) x
        FROM public.conduct_attention_items ai
       WHERE ai.owner_id = v_uid AND ai.closed_at IS NULL
       ORDER BY ai.target_review_date NULLS LAST LIMIT v_lim) s);

  v_items := v_items || (
    SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
      SELECT jsonb_build_object('source','conduct_intervention','id', iv.id, 'reference', iv.reference,
               'title', iv.title, 'status', iv.status, 'due_at', iv.planned_end,
               'priority', NULL, 'route', '/conduct/interventions/' || iv.id) x
        FROM public.conduct_interventions iv
       WHERE iv.owner_id = v_uid AND iv.completed_at IS NULL
       ORDER BY iv.planned_end NULLS LAST LIMIT v_lim) s);

  v_items := v_items || (
    SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
      SELECT jsonb_build_object('source','provider_work_package','id', w.id, 'reference', w.reference,
               'title', 'Provider submission awaiting internal acceptance', 'status', w.state,
               'due_at', w.due_at, 'priority', NULL,
               'route', '/admin/people-access?provider_package=' || w.id) x
        FROM public.provider_work_packages w
       WHERE w.state IN ('SUBMITTED','INTERNAL_REVIEW')
       ORDER BY w.submitted_at DESC NULLS LAST LIMIT v_lim) s);

  RETURN jsonb_build_object(
    'items', v_items,
    'counts', (SELECT coalesce(jsonb_object_agg(src, n),'{}'::jsonb)
                 FROM (SELECT it->>'source' AS src, count(*) AS n
                         FROM jsonb_array_elements(v_items) it GROUP BY 1) c),
    'context','internal',
    'read_model','my_work_queue',
    'is_authoritative_source', false);
END;
$function$;
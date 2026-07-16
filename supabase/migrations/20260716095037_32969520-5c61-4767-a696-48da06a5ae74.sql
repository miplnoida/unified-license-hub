
-- Complaints Module: Backend aggregation RPC + optimistic-concurrency overloads

-- 1. Dashboard aggregation RPC — replaces client-side count scans
CREATE OR REPLACE FUNCTION public.complaints_dashboard_counts(_scope jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_internal boolean;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  v_is_internal := public.has_complaint_perm(v_uid,'view_all') OR public.has_complaint_perm(v_uid,'triage');
  IF NOT v_is_internal THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501'; END IF;

  WITH scope AS (
    SELECT c.*, public.complaint_sla_status(c.created_at,c.sla_due_at,c.sla_days,c.resolved_at) AS sla_status
      FROM public.complaints c
     WHERE (NULLIF(_scope->>'regulator_id','') IS NULL OR c.regulator_id = (_scope->>'regulator_id')::uuid)
       AND (NULLIF(_scope->>'licensee_id','') IS NULL OR c.licensee_id = (_scope->>'licensee_id')::uuid)
       AND (NULLIF(_scope->>'date_from','') IS NULL OR c.created_at >= (_scope->>'date_from')::timestamptz)
       AND (NULLIF(_scope->>'date_to','')   IS NULL OR c.created_at <= (_scope->>'date_to')::timestamptz)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM scope),
    'open',  (SELECT count(*) FROM scope WHERE status NOT IN ('closed','resolved')),
    'critical', (SELECT count(*) FROM scope WHERE severity = 'critical'),
    'under_investigation', (SELECT count(*) FROM scope WHERE status = 'under_investigation'),
    'closed', (SELECT count(*) FROM scope WHERE status IN ('closed','resolved')),
    'breached', (SELECT count(*) FROM scope WHERE sla_status = 'breached'),
    'by_licensee', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('licensee_id',licensee_id,'count',cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (SELECT licensee_id, count(*) cnt FROM scope WHERE licensee_id IS NOT NULL GROUP BY licensee_id LIMIT 20) s
    ),
    'trend', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d::text, 'count', cnt) ORDER BY d), '[]'::jsonb)
        FROM (
          SELECT date_trunc('day', created_at)::date d, count(*) cnt
            FROM scope
           WHERE created_at >= now() - interval '90 days'
           GROUP BY 1
        ) s
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complaints_dashboard_counts(jsonb) TO authenticated;

-- 2. Optimistic-concurrency overloads for existing mutation RPCs.
--    Original 2-arg / 3-arg signatures kept for backward compatibility.

CREATE OR REPLACE FUNCTION public.start_complaint_investigation(
  _id uuid, _expected_updated_at timestamptz
)
RETURNS public.complaints
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  before_row public.complaints%ROWTYPE;
  after_row  public.complaints%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT public.has_complaint_perm(actor, 'investigate') THEN
    RAISE EXCEPTION 'permission denied: complaint_management.investigate' USING ERRCODE='42501';
  END IF;
  PERFORM public._assert_complaint_fresh(_id, _expected_updated_at);
  SELECT * INTO before_row FROM public.complaints WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'complaint not found' USING ERRCODE='P0002'; END IF;
  IF before_row.status NOT IN ('submitted','under_investigation') THEN
    RAISE EXCEPTION 'invalid transition from % to under_investigation', before_row.status USING ERRCODE='22023';
  END IF;

  UPDATE public.complaints
     SET status = 'under_investigation',
         investigator_id = COALESCE(investigator_id, actor),
         acknowledged_at = COALESCE(acknowledged_at, now()),
         updated_at = now()
   WHERE id = _id
  RETURNING * INTO after_row;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (actor, 'complaint.investigation_started', 'complaint', _id,
          jsonb_build_object('status', before_row.status),
          jsonb_build_object('status', after_row.status, 'investigator_id', after_row.investigator_id));
  RETURN after_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.start_complaint_investigation(uuid, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_complaint(
  _id uuid, _resolution text, _expected_updated_at timestamptz
)
RETURNS public.complaints
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  before_row public.complaints%ROWTYPE;
  after_row  public.complaints%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT public.has_complaint_perm(actor, 'resolve') THEN
    RAISE EXCEPTION 'permission denied: complaint_management.resolve' USING ERRCODE='42501';
  END IF;
  IF _resolution IS NULL OR length(btrim(_resolution)) < 5 THEN
    RAISE EXCEPTION 'resolution notes required (min 5 chars)' USING ERRCODE='22023';
  END IF;
  PERFORM public._assert_complaint_fresh(_id, _expected_updated_at);
  SELECT * INTO before_row FROM public.complaints WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'complaint not found' USING ERRCODE='P0002'; END IF;
  IF before_row.status NOT IN ('submitted','under_investigation','resolved') THEN
    RAISE EXCEPTION 'invalid transition from % to resolved', before_row.status USING ERRCODE='22023';
  END IF;

  UPDATE public.complaints
     SET status = 'resolved',
         resolution = btrim(_resolution),
         resolved_at = COALESCE(resolved_at, now()),
         updated_at = now()
   WHERE id = _id
  RETURNING * INTO after_row;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (actor, 'complaint.resolved', 'complaint', _id,
          jsonb_build_object('status', before_row.status),
          jsonb_build_object('status', after_row.status, 'resolution', after_row.resolution));
  RETURN after_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_complaint(uuid, text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_complaint_severity(
  _id uuid, _severity text, _reason text, _expected_updated_at timestamptz
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_current text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF _severity NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION 'Invalid severity: %', _severity USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_complaint_perm(v_uid, 'triage') AND NOT public.has_complaint_perm(v_uid, 'investigate') THEN
    RAISE EXCEPTION 'Not permitted to change severity' USING ERRCODE = '42501';
  END IF;
  PERFORM public._assert_complaint_fresh(_id, _expected_updated_at);
  SELECT severity INTO v_current FROM public.complaints WHERE id = _id;
  IF v_current IS NULL THEN RAISE EXCEPTION 'Complaint not found' USING ERRCODE = 'P0002'; END IF;
  IF v_current = _severity THEN RETURN; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'Severity override reason (min 5 chars) is required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.complaints
     SET severity = _severity,
         severity_override_reason = _reason,
         severity_overridden_by = v_uid,
         severity_overridden_at = now(),
         updated_at = now()
   WHERE id = _id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'complaint.severity_updated', 'complaint', _id,
          jsonb_build_object('from', v_current, 'to', _severity, 'reason', _reason));
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_complaint_severity(uuid, text, text, timestamptz) TO authenticated;

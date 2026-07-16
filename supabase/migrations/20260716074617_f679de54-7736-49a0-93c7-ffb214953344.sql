
-- Part 1: schema + core RPCs (list, analytics, severity, classify, close reason)

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid,
  ADD COLUMN IF NOT EXISTS closure_reason text,
  ADD COLUMN IF NOT EXISTS closure_category text,
  ADD COLUMN IF NOT EXISTS severity_override_reason text,
  ADD COLUMN IF NOT EXISTS severity_overridden_by uuid,
  ADD COLUMN IF NOT EXISTS severity_overridden_at timestamptz;

UPDATE public.complaints
   SET closed_at = COALESCE(closed_at, resolved_at, updated_at)
 WHERE status = 'closed' AND closed_at IS NULL;

CREATE OR REPLACE FUNCTION public.complaint_sla_status(
  _created_at timestamptz,
  _sla_due_at timestamptz,
  _sla_days integer,
  _resolved_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  due timestamptz;
  ms_left double precision;
  days_left double precision;
BEGIN
  due := _sla_due_at;
  IF due IS NULL AND _created_at IS NOT NULL AND _sla_days IS NOT NULL THEN
    due := _created_at + make_interval(days => _sla_days);
  END IF;
  IF _resolved_at IS NOT NULL THEN
    IF due IS NOT NULL AND _resolved_at > due THEN
      RETURN 'breached';
    END IF;
    RETURN 'resolved';
  END IF;
  IF due IS NULL THEN RETURN 'unknown'; END IF;
  ms_left := EXTRACT(EPOCH FROM (due - now())) * 1000;
  IF ms_left < 0 THEN RETURN 'breached'; END IF;
  days_left := ms_left / 86400000.0;
  IF days_left <= 2 THEN RETURN 'at_risk'; END IF;
  IF _sla_days IS NOT NULL AND _sla_days > 0 AND (days_left / _sla_days) <= 0.25 THEN
    RETURN 'at_risk';
  END IF;
  RETURN 'on_track';
END;
$$;

CREATE OR REPLACE FUNCTION public.update_complaint_severity(
  _id uuid, _severity text, _reason text DEFAULT NULL
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

CREATE OR REPLACE FUNCTION public.classify_complaint(_id uuid, _payload jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_sev text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_complaint_perm(v_uid, 'triage') THEN
    RAISE EXCEPTION 'Not permitted to triage complaints' USING ERRCODE = '42501';
  END IF;
  v_sev := NULLIF(_payload->>'severity','');
  IF v_sev IS NOT NULL AND v_sev NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION 'Invalid severity' USING ERRCODE = '22023';
  END IF;
  UPDATE public.complaints
     SET conduct_risk_category_id = NULLIF(_payload->>'conduct_risk_category_id','')::uuid,
         product_id               = NULLIF(_payload->>'product_id','')::uuid,
         channel_id               = NULLIF(_payload->>'channel_id','')::uuid,
         customer_type            = NULLIF(_payload->>'customer_type',''),
         vulnerability_indicator  = COALESCE((_payload->>'vulnerability_indicator')::boolean, false),
         vulnerability_notes      = NULLIF(_payload->>'vulnerability_notes',''),
         priority                 = NULLIF(_payload->>'priority',''),
         severity                 = COALESCE(v_sev, severity),
         sla_days                 = NULLIF(_payload->>'sla_days','')::int,
         assigned_team            = NULLIF(_payload->>'assigned_team',''),
         triage_source            = COALESCE(NULLIF(_payload->>'triage_source',''), triage_source),
         triage_override_status   = COALESCE(NULLIF(_payload->>'triage_override_status',''), triage_override_status),
         updated_at = now()
   WHERE id = _id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'complaint.classification_updated', 'complaint', _id, _payload);
END;
$$;

DROP FUNCTION IF EXISTS public.close_complaint(uuid, text);
CREATE OR REPLACE FUNCTION public.close_complaint(_id uuid, _reason text, _category text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_complaint_perm(v_uid, 'close') THEN
    RAISE EXCEPTION 'Not permitted to close complaints' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'Closure reason (min 5 chars) is required' USING ERRCODE = '22023';
  END IF;
  SELECT status INTO v_status FROM public.complaints WHERE id = _id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Complaint not found' USING ERRCODE = 'P0002'; END IF;
  IF v_status = 'closed' THEN RETURN; END IF;
  UPDATE public.complaints
     SET status='closed', closed_at=now(), closed_by=v_uid,
         closure_reason=_reason, closure_category=_category, updated_at=now()
   WHERE id = _id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'complaint.closed', 'complaint', _id,
          jsonb_build_object('reason',_reason,'category',_category,'from_status',v_status));
END;
$$;

CREATE OR REPLACE FUNCTION public.list_complaints(
  _filters jsonb DEFAULT '{}'::jsonb,
  _sort text DEFAULT 'created_at.desc',
  _page int DEFAULT 1,
  _page_size int DEFAULT 25,
  _search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_offset int; v_limit int; v_sort_col text; v_sort_dir text;
  v_total bigint; v_rows jsonb; v_is_internal boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  v_is_internal := public.has_complaint_perm(v_uid,'view_all') OR public.has_complaint_perm(v_uid,'triage');
  v_limit := LEAST(GREATEST(COALESCE(_page_size,25),1),200);
  v_offset := GREATEST((COALESCE(_page,1)-1)*v_limit, 0);
  v_sort_col := split_part(_sort,'.',1);
  v_sort_dir := LOWER(COALESCE(NULLIF(split_part(_sort,'.',2),''),'desc'));
  IF v_sort_col NOT IN ('created_at','updated_at','severity','status','sla_due_at','complaint_number','priority') THEN
    v_sort_col := 'created_at';
  END IF;
  IF v_sort_dir NOT IN ('asc','desc') THEN v_sort_dir := 'desc'; END IF;

  WITH filtered AS (
    SELECT c.* FROM public.complaints c
     WHERE (v_is_internal OR c.complainant_id = v_uid)
       AND (NULLIF(_filters->>'status','') IS NULL
            OR (_filters->>'status'='open' AND c.status IN ('submitted','under_investigation'))
            OR c.status = _filters->>'status')
       AND (NULLIF(_filters->>'severity','') IS NULL OR c.severity = _filters->>'severity')
       AND (NULLIF(_filters->>'priority','') IS NULL OR c.priority = _filters->>'priority')
       AND (NULLIF(_filters->>'complaint_type_id','') IS NULL OR c.complaint_type_id = (_filters->>'complaint_type_id')::uuid)
       AND (NULLIF(_filters->>'product_id','') IS NULL OR c.product_id = (_filters->>'product_id')::uuid)
       AND (NULLIF(_filters->>'channel_id','') IS NULL OR c.channel_id = (_filters->>'channel_id')::uuid)
       AND (NULLIF(_filters->>'conduct_risk_category_id','') IS NULL OR c.conduct_risk_category_id = (_filters->>'conduct_risk_category_id')::uuid)
       AND (NULLIF(_filters->>'assigned_team','') IS NULL OR c.assigned_team = _filters->>'assigned_team')
       AND (NULLIF(_filters->>'intake_source','') IS NULL OR c.intake_source = _filters->>'intake_source')
       AND (NULLIF(_filters->>'triage_override_status','') IS NULL OR c.triage_override_status = _filters->>'triage_override_status')
       AND (NULLIF(_filters->>'vulnerability_indicator','') IS NULL OR c.vulnerability_indicator = (_filters->>'vulnerability_indicator')::boolean)
       AND (NULLIF(_filters->>'licensee_id','') IS NULL OR c.licensee_id = (_filters->>'licensee_id')::uuid)
       AND (NULLIF(_filters->>'regulator_id','') IS NULL OR c.regulator_id = (_filters->>'regulator_id')::uuid)
       AND (NULLIF(_filters->>'date_from','') IS NULL OR c.created_at >= (_filters->>'date_from')::timestamptz)
       AND (NULLIF(_filters->>'date_to','')   IS NULL OR c.created_at <= (_filters->>'date_to')::timestamptz)
       AND (NULLIF(_filters->>'sla','') IS NULL
            OR public.complaint_sla_status(c.created_at,c.sla_due_at,c.sla_days,c.resolved_at) = _filters->>'sla')
       AND (NULLIF(_search,'') IS NULL
            OR c.complaint_number ILIKE '%'||_search||'%'
            OR c.subject ILIKE '%'||_search||'%'
            OR c.description ILIKE '%'||_search||'%'
            OR COALESCE(c.email,'') ILIKE '%'||_search||'%')
  ), paged AS (
    SELECT f.*, public.complaint_sla_status(f.created_at,f.sla_due_at,f.sla_days,f.resolved_at) AS sla_status
      FROM filtered f
     ORDER BY
       CASE WHEN v_sort_col='created_at' AND v_sort_dir='asc'  THEN f.created_at END ASC NULLS LAST,
       CASE WHEN v_sort_col='created_at' AND v_sort_dir='desc' THEN f.created_at END DESC NULLS LAST,
       CASE WHEN v_sort_col='updated_at' AND v_sort_dir='asc'  THEN f.updated_at END ASC NULLS LAST,
       CASE WHEN v_sort_col='updated_at' AND v_sort_dir='desc' THEN f.updated_at END DESC NULLS LAST,
       CASE WHEN v_sort_col='severity'   AND v_sort_dir='asc'  THEN f.severity   END ASC NULLS LAST,
       CASE WHEN v_sort_col='severity'   AND v_sort_dir='desc' THEN f.severity   END DESC NULLS LAST,
       CASE WHEN v_sort_col='status'     AND v_sort_dir='asc'  THEN f.status     END ASC NULLS LAST,
       CASE WHEN v_sort_col='status'     AND v_sort_dir='desc' THEN f.status     END DESC NULLS LAST,
       CASE WHEN v_sort_col='sla_due_at' AND v_sort_dir='asc'  THEN f.sla_due_at END ASC NULLS LAST,
       CASE WHEN v_sort_col='sla_due_at' AND v_sort_dir='desc' THEN f.sla_due_at END DESC NULLS LAST,
       CASE WHEN v_sort_col='complaint_number' AND v_sort_dir='asc'  THEN f.complaint_number END ASC NULLS LAST,
       CASE WHEN v_sort_col='complaint_number' AND v_sort_dir='desc' THEN f.complaint_number END DESC NULLS LAST,
       CASE WHEN v_sort_col='priority'   AND v_sort_dir='asc'  THEN f.priority END ASC NULLS LAST,
       CASE WHEN v_sort_col='priority'   AND v_sort_dir='desc' THEN f.priority END DESC NULLS LAST
     LIMIT v_limit OFFSET v_offset
  )
  SELECT (SELECT count(*) FROM filtered), COALESCE(jsonb_agg(to_jsonb(p.*)), '[]'::jsonb)
    INTO v_total, v_rows FROM paged p;

  RETURN jsonb_build_object('total',v_total,'page',GREATEST(_page,1),'page_size',v_limit,'rows',v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.complaints_analytics(_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_is_internal boolean; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  v_is_internal := public.has_complaint_perm(v_uid,'view_all') OR public.has_complaint_perm(v_uid,'triage');
  IF NOT v_is_internal THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501'; END IF;

  WITH scope AS (
    SELECT c.*, public.complaint_sla_status(c.created_at,c.sla_due_at,c.sla_days,c.resolved_at) AS sla_status
      FROM public.complaints c
     WHERE (NULLIF(_filters->>'date_from','') IS NULL OR c.created_at >= (_filters->>'date_from')::timestamptz)
       AND (NULLIF(_filters->>'date_to','')   IS NULL OR c.created_at <= (_filters->>'date_to')::timestamptz)
       AND (NULLIF(_filters->>'regulator_id','') IS NULL OR c.regulator_id = (_filters->>'regulator_id')::uuid)
       AND (NULLIF(_filters->>'severity','') IS NULL OR c.severity = _filters->>'severity')
       AND (NULLIF(_filters->>'complaint_type_id','') IS NULL OR c.complaint_type_id = (_filters->>'complaint_type_id')::uuid)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM scope),
    'open', (SELECT count(*) FROM scope WHERE status IN ('submitted','under_investigation')),
    'resolved_or_closed', (SELECT count(*) FROM scope WHERE status IN ('resolved','closed')),
    'avg_resolve_hours', (SELECT COALESCE(ROUND(EXTRACT(EPOCH FROM AVG(resolved_at-created_at))/3600.0,1),0) FROM scope WHERE resolved_at IS NOT NULL),
    'breached', (SELECT count(*) FROM scope WHERE sla_status='breached'),
    'at_risk',  (SELECT count(*) FROM scope WHERE sla_status='at_risk'),
    'on_track', (SELECT count(*) FROM scope WHERE sla_status='on_track'),
    'by_status',   (SELECT COALESCE(jsonb_object_agg(status,cnt),'{}'::jsonb) FROM (SELECT status,count(*) cnt FROM scope GROUP BY status) s),
    'by_severity', (SELECT COALESCE(jsonb_object_agg(severity,cnt),'{}'::jsonb) FROM (SELECT severity,count(*) cnt FROM scope GROUP BY severity) s),
    'by_type', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('type_id',complaint_type_id,'name',name,'count',cnt) ORDER BY cnt DESC),'[]'::jsonb)
        FROM (SELECT s.complaint_type_id,t.name,count(*) cnt FROM scope s LEFT JOIN public.complaint_types t ON t.id=s.complaint_type_id GROUP BY s.complaint_type_id,t.name) x
    ),
    'trend', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('day',day,'count',cnt) ORDER BY day),'[]'::jsonb)
        FROM (SELECT date_trunc('day',created_at)::date AS day,count(*) cnt FROM scope GROUP BY 1) d
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

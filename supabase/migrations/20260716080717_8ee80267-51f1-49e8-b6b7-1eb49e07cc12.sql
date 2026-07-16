
-- Complaints module Phase 3: canonical intake, aggregated stats, banners, optimistic concurrency.

-- Optimistic concurrency helper
CREATE OR REPLACE FUNCTION public._assert_complaint_fresh(_id uuid, _expected timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_current timestamptz;
BEGIN
  IF _expected IS NULL THEN RETURN; END IF;
  SELECT updated_at INTO v_current FROM public.complaints WHERE id = _id;
  IF v_current IS NULL THEN RAISE EXCEPTION 'Complaint not found' USING ERRCODE = 'P0002'; END IF;
  -- 1s tolerance for pgbouncer clock drift
  IF v_current > _expected + interval '1 second' THEN
    RAISE EXCEPTION 'complaint_stale: Complaint was modified by another user. Please reload.' USING ERRCODE = '40001';
  END IF;
END; $$;

-- Add concurrency-aware close (overload keeps old callers working, but sets latest def)
CREATE OR REPLACE FUNCTION public.close_complaint(
  _id uuid, _reason text, _category text DEFAULT NULL, _expected_updated_at timestamptz DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_complaint_perm(v_uid, 'close') THEN
    RAISE EXCEPTION 'Not permitted to close complaints' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'Closure reason (min 5 chars) is required' USING ERRCODE = '22023';
  END IF;
  IF _category IS NULL OR length(trim(_category)) = 0 THEN
    RAISE EXCEPTION 'Closure category is required' USING ERRCODE = '22023';
  END IF;
  PERFORM public._assert_complaint_fresh(_id, _expected_updated_at);
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
END; $$;

-- Get single complaint with sla_status
CREATE OR REPLACE FUNCTION public.get_complaint(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_row jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  SELECT to_jsonb(c.*) || jsonb_build_object(
           'sla_status', public.complaint_sla_status(c.created_at,c.sla_due_at,c.sla_days,c.resolved_at))
    INTO v_row
    FROM public.complaints c
   WHERE c.id = _id
     AND (public.has_complaint_perm(v_uid,'view_all') OR public.has_complaint_perm(v_uid,'triage')
          OR c.complainant_id = v_uid);
  IF v_row IS NULL THEN RAISE EXCEPTION 'Complaint not found or access denied' USING ERRCODE = 'P0002'; END IF;
  RETURN v_row;
END; $$;

-- Canonical create_complaint - single intake path
CREATE OR REPLACE FUNCTION public.create_complaint(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_internal boolean;
  v_id uuid;
  v_subject text := trim(COALESCE(_payload->>'subject',''));
  v_desc text := trim(COALESCE(_payload->>'description',''));
  v_email text := NULLIF(_payload->>'email','');
  v_sev text := COALESCE(NULLIF(_payload->>'severity',''),'medium');
  v_intake text := COALESCE(NULLIF(_payload->>'intake_source',''),'consumer_portal');
  v_type_id uuid := NULLIF(_payload->>'complaint_type_id','')::uuid;
  v_licensee uuid := NULLIF(_payload->>'licensee_id','')::uuid;
  v_row jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF v_subject = '' OR v_desc = '' THEN
    RAISE EXCEPTION 'Subject and description are required' USING ERRCODE = '22023';
  END IF;
  IF v_sev NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION 'Invalid severity' USING ERRCODE = '22023';
  END IF;
  v_is_internal := public.has_complaint_perm(v_uid,'view_all') OR public.has_complaint_perm(v_uid,'triage');

  INSERT INTO public.complaints (
    complainant_id, subject, description, email, severity, priority, status,
    intake_source, internal_created_by, complaint_type_id, licensee_id
  ) VALUES (
    CASE WHEN v_is_internal AND v_intake IN ('internal','staff_intake') THEN NULL ELSE v_uid END,
    v_subject, v_desc, COALESCE(v_email,(SELECT email FROM auth.users WHERE id=v_uid)),
    v_sev, COALESCE(NULLIF(_payload->>'priority',''),'p3'), 'submitted',
    v_intake,
    CASE WHEN v_is_internal AND v_intake IN ('internal','staff_intake') THEN v_uid ELSE NULL END,
    v_type_id, v_licensee
  ) RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'complaint.created', 'complaint', v_id, jsonb_build_object('intake_source',v_intake));

  SELECT to_jsonb(c.*) INTO v_row FROM public.complaints c WHERE c.id = v_id;
  RETURN v_row;
END; $$;

-- Status transition
CREATE OR REPLACE FUNCTION public.transition_complaint_status(
  _id uuid, _new_status text, _reason text DEFAULT NULL, _expected_updated_at timestamptz DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_current text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF _new_status NOT IN ('submitted','under_investigation','resolved','closed') THEN
    RAISE EXCEPTION 'Invalid status' USING ERRCODE = '22023';
  END IF;
  IF NOT (public.has_complaint_perm(v_uid,'triage') OR public.has_complaint_perm(v_uid,'investigate') OR public.has_complaint_perm(v_uid,'close')) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  PERFORM public._assert_complaint_fresh(_id, _expected_updated_at);
  SELECT status INTO v_current FROM public.complaints WHERE id = _id;
  IF v_current IS NULL THEN RAISE EXCEPTION 'Complaint not found' USING ERRCODE = 'P0002'; END IF;
  IF v_current = _new_status THEN RETURN; END IF;
  UPDATE public.complaints SET status = _new_status, updated_at = now() WHERE id = _id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'complaint.status_changed','complaint',_id,
          jsonb_build_object('from',v_current,'to',_new_status,'reason',_reason));
END; $$;

-- Assignment
CREATE OR REPLACE FUNCTION public.assign_complaint(
  _id uuid, _assignee uuid, _expected_updated_at timestamptz DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_prev uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_complaint_perm(v_uid,'triage') THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  PERFORM public._assert_complaint_fresh(_id, _expected_updated_at);
  SELECT investigator_id INTO v_prev FROM public.complaints WHERE id = _id;
  UPDATE public.complaints SET investigator_id = _assignee, updated_at = now() WHERE id = _id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid,'complaint.assigned','complaint',_id, jsonb_build_object('from',v_prev,'to',_assignee));
END; $$;

-- Wrap triage retry so callers don't hit the edge function directly
CREATE OR REPLACE FUNCTION public.retry_complaint_triage(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_complaint_perm(v_uid,'triage') THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  -- Mark for reprocessing; the edge function scheduler picks these up.
  UPDATE public.complaints
     SET triage_source = 'manual_retry', updated_at = now()
   WHERE id = _id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid,'complaint.triage_retry_requested','complaint',_id, '{}'::jsonb);
END; $$;

-- Aggregated Escalation Hub stats
CREATE OR REPLACE FUNCTION public.escalation_hub_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF NOT (public.has_complaint_perm(v_uid,'triage') OR public.has_complaint_perm(v_uid,'view_all') OR public.has_complaint_perm(v_uid,'escalate')) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'pending', (SELECT count(*) FROM public.complaint_escalation_cases WHERE status='pending'),
    'critical', (SELECT count(*) FROM public.complaint_escalation_cases WHERE severity='critical'),
    'escalated', (SELECT count(*) FROM public.complaint_escalation_cases WHERE status='escalated'),
    'active_rules', (SELECT count(*) FROM public.complaint_escalation_rules WHERE enabled=true),
    'total_rules', (SELECT count(*) FROM public.complaint_escalation_rules)
  );
END; $$;

-- Duplicate Hub stats
CREATE OR REPLACE FUNCTION public.duplicate_hub_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF NOT (public.has_complaint_perm(v_uid,'triage') OR public.has_complaint_perm(v_uid,'view_all')) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'pending', (SELECT count(*) FROM public.complaint_duplicate_pairs WHERE status='pending'),
    'linked', (SELECT count(*) FROM public.complaint_duplicate_pairs WHERE status='linked'),
    'merged', (SELECT count(*) FROM public.complaint_duplicate_pairs WHERE status='merged'),
    'dismissed', (SELECT count(*) FROM public.complaint_duplicate_pairs WHERE status='dismissed'),
    'active_rules', (SELECT count(*) FROM public.complaint_duplicate_rules WHERE enabled=true),
    'total_rules', (SELECT count(*) FROM public.complaint_duplicate_rules)
  );
END; $$;

-- Banner counts (permission-checked, small payloads)
CREATE OR REPLACE FUNCTION public.pending_escalation_count()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_n int;
BEGIN
  IF v_uid IS NULL THEN RETURN 0; END IF;
  IF NOT (public.has_complaint_perm(v_uid,'triage') OR public.has_complaint_perm(v_uid,'view_all') OR public.has_complaint_perm(v_uid,'escalate')) THEN RETURN 0; END IF;
  SELECT count(*) INTO v_n FROM public.complaint_escalation_cases WHERE status='pending';
  RETURN COALESCE(v_n,0);
END; $$;

CREATE OR REPLACE FUNCTION public.pending_duplicate_count()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_n int;
BEGIN
  IF v_uid IS NULL THEN RETURN 0; END IF;
  IF NOT (public.has_complaint_perm(v_uid,'triage') OR public.has_complaint_perm(v_uid,'view_all')) THEN RETURN 0; END IF;
  SELECT count(*) INTO v_n FROM public.complaint_duplicate_pairs WHERE status='pending';
  RETURN COALESCE(v_n,0);
END; $$;

-- Simulate escalation rule fire count against current open complaints
CREATE OR REPLACE FUNCTION public.simulate_escalation_rule(_criterion text, _thresholds jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_total int; v_fire int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF NOT (public.has_complaint_perm(v_uid,'triage') OR public.has_complaint_perm(v_uid,'escalate')) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_total FROM public.complaints WHERE status IN ('submitted','under_investigation');
  IF _criterion = 'harm' THEN
    SELECT count(*) INTO v_fire FROM public.complaints
     WHERE status IN ('submitted','under_investigation')
       AND (CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END)
         >= (CASE _thresholds->>'minSeverity' WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END);
  ELSIF _criterion = 'age' THEN
    SELECT count(*) INTO v_fire FROM public.complaints
     WHERE status IN ('submitted','under_investigation')
       AND floor(EXTRACT(EPOCH FROM (now() - created_at))/86400) >= COALESCE((_thresholds->>'maxAgeDays')::int, 999999);
  ELSIF _criterion = 'recurrence' THEN
    SELECT count(*) INTO v_fire FROM public.complaints
     WHERE status IN ('submitted','under_investigation')
       AND COALESCE(repeat_complaint_count,0) >= COALESCE((_thresholds->>'minRepeats')::int, 999999);
  ELSIF _criterion = 'volume' THEN
    SELECT count(*) INTO v_fire FROM public.complaints c
     WHERE status IN ('submitted','under_investigation')
       AND c.licensee_id IS NOT NULL
       AND (SELECT count(*) FROM public.complaints x
             WHERE x.licensee_id = c.licensee_id
               AND x.created_at >= now() - make_interval(days => COALESCE((_thresholds->>'windowDays')::int,30)))
           >= COALESCE((_thresholds->>'minCount')::int, 999999);
  ELSE
    v_fire := 0;
  END IF;
  RETURN jsonb_build_object('total_open', COALESCE(v_total,0), 'fire_count', COALESCE(v_fire,0));
END; $$;

-- Duplicate clusters (member groupings)
CREATE TABLE IF NOT EXISTS public.complaint_duplicate_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension text NOT NULL,
  cluster_key text NOT NULL,
  member_ids uuid[] NOT NULL DEFAULT '{}',
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dimension, cluster_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_duplicate_clusters TO authenticated;
GRANT ALL ON public.complaint_duplicate_clusters TO service_role;
ALTER TABLE public.complaint_duplicate_clusters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dup_clusters_read" ON public.complaint_duplicate_clusters;
CREATE POLICY "dup_clusters_read" ON public.complaint_duplicate_clusters FOR SELECT TO authenticated
  USING (public.has_complaint_perm(auth.uid(),'triage') OR public.has_complaint_perm(auth.uid(),'view_all'));
DROP POLICY IF EXISTS "dup_clusters_write" ON public.complaint_duplicate_clusters;
CREATE POLICY "dup_clusters_write" ON public.complaint_duplicate_clusters FOR ALL TO authenticated
  USING (public.has_complaint_perm(auth.uid(),'triage'))
  WITH CHECK (public.has_complaint_perm(auth.uid(),'triage'));
DROP TRIGGER IF EXISTS trg_dup_clusters_updated ON public.complaint_duplicate_clusters;
CREATE TRIGGER trg_dup_clusters_updated BEFORE UPDATE ON public.complaint_duplicate_clusters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.list_duplicate_clusters(_dimension text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF NOT (public.has_complaint_perm(v_uid,'triage') OR public.has_complaint_perm(v_uid,'view_all')) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(c.*) ORDER BY array_length(c.member_ids,1) DESC NULLS LAST), '[]'::jsonb)
    INTO v_rows FROM public.complaint_duplicate_clusters c
   WHERE _dimension IS NULL OR c.dimension = _dimension;
  RETURN v_rows;
END; $$;

-- Indexes for pagination performance
CREATE INDEX IF NOT EXISTS idx_complaints_regulator_status_created ON public.complaints (regulator_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_investigator_status ON public.complaints (investigator_id, status);

GRANT EXECUTE ON FUNCTION public.close_complaint(uuid,text,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_complaint_status(uuid,text,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_complaint(uuid,uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retry_complaint_triage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_complaint(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_complaint(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.escalation_hub_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_hub_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pending_escalation_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pending_duplicate_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.simulate_escalation_rule(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_duplicate_clusters(text) TO authenticated;

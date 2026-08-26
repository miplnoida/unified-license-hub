
CREATE OR REPLACE FUNCTION public.complaint_investigation_gate(_complaint_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE c public.complaints; a public.complaint_jurisdiction_assessments;
        v_blockers text[] := '{}'; v_scope text;
BEGIN
  SELECT * INTO c FROM public.complaints WHERE id = _complaint_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Complaint not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO a FROM public.complaint_jurisdiction_assessments WHERE complaint_id = _complaint_id;

  IF a.id IS NULL OR a.status <> 'DECIDED' THEN
    v_blockers := v_blockers || ARRAY['Jurisdiction assessment is not yet decided'];
  ELSIF a.decision_outcome NOT IN ('ACCEPTED','PARTIALLY_ACCEPTED') THEN
    v_blockers := v_blockers || ARRAY['Jurisdiction outcome does not place this complaint within our role'];
  END IF;

  IF coalesce(c.triage_confirmation_status,'') NOT IN ('CONFIRMED','OVERRIDDEN') THEN
    v_blockers := v_blockers || ARRAY['Supervisory triage has not been confirmed'];
  END IF;

  v_scope := CASE WHEN a.decision_outcome = 'PARTIALLY_ACCEPTED' THEN 'PARTIAL'
                  WHEN a.decision_outcome = 'ACCEPTED' THEN 'FULL' ELSE NULL END;

  RETURN jsonb_build_object(
    'ok', array_length(v_blockers,1) IS NULL,
    'blockers', to_jsonb(v_blockers),
    'jurisdiction_status', a.status,
    'jurisdiction_outcome', a.decision_outcome,
    'triage_confirmation_status', c.triage_confirmation_status,
    'investigation_scope', v_scope);
END; $function$;

CREATE OR REPLACE FUNCTION public.complaint_investigation_readiness(_complaint_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.complaints; g jsonb; v_blockers text[] := '{}'; p public.complaint_investigation_plans;
        v_alleg int; v_unassessed int; v_open_rfi int; v_open_rep int; v_tasks int;
BEGIN
  PERFORM public.mc03_guard(_complaint_id,'view');
  SELECT * INTO c FROM public.complaints WHERE id=_complaint_id;
  g := public.complaint_investigation_gate(_complaint_id);
  IF NOT (g->>'ok')::boolean THEN
    v_blockers := v_blockers || ARRAY(SELECT jsonb_array_elements_text(g->'blockers'));
  END IF;
  IF c.status <> 'under_investigation' THEN
    v_blockers := v_blockers || ARRAY['The investigation has not been opened'];
  END IF;
  SELECT * INTO p FROM public.complaint_investigation_plans WHERE complaint_id=_complaint_id AND is_current;
  IF p.id IS NULL THEN v_blockers := v_blockers || ARRAY['No current investigation plan exists'];
  ELSIF p.status = 'DRAFT' THEN v_blockers := v_blockers || ARRAY['The investigation plan is still in draft'];
  END IF;

  SELECT count(*) FILTER (WHERE jurisdiction_scope <> 'OUT_OF_SCOPE'),
         count(*) FILTER (WHERE jurisdiction_scope <> 'OUT_OF_SCOPE' AND assessment_outcome IS NULL)
    INTO v_alleg, v_unassessed
    FROM public.complaint_allegations WHERE complaint_id=_complaint_id;
  IF coalesce(v_alleg,0) = 0 THEN
    v_blockers := v_blockers || ARRAY['No allegations have been recorded'];
  ELSIF coalesce(v_unassessed,0) > 0 THEN
    v_blockers := v_blockers || ARRAY[v_unassessed::text || ' allegation(s) still await an assessment outcome'];
  END IF;

  SELECT count(*) INTO v_open_rfi FROM public.complaint_rfis
   WHERE complaint_id=_complaint_id AND status NOT IN ('closed','cancelled');
  IF coalesce(v_open_rfi,0) > 0 THEN
    v_blockers := v_blockers || ARRAY[v_open_rfi::text || ' information request(s) remain open']; END IF;

  SELECT count(*) INTO v_open_rep FROM public.complaint_representations
   WHERE complaint_id=_complaint_id AND status NOT IN ('CLOSED','WITHDRAWN','ACCEPTED_FOR_CONSIDERATION');
  IF coalesce(v_open_rep,0) > 0 THEN
    v_blockers := v_blockers || ARRAY[v_open_rep::text || ' representation window(s) remain open']; END IF;

  SELECT count(*) INTO v_tasks FROM public.complaint_investigation_tasks
   WHERE complaint_id=_complaint_id AND is_mandatory AND coalesce(status,'') NOT IN ('COMPLETED','CANCELLED','completed');
  IF coalesce(v_tasks,0) > 0 THEN
    v_blockers := v_blockers || ARRAY[v_tasks::text || ' mandatory work item(s) are incomplete']; END IF;

  RETURN jsonb_build_object(
    'complaint_id', _complaint_id,
    'readiness', CASE WHEN array_length(v_blockers,1) IS NULL THEN 'READY_FOR_OUTCOME_REVIEW' ELSE 'NOT_READY' END,
    'blockers', to_jsonb(v_blockers),
    'allegations_in_scope', coalesce(v_alleg,0),
    'allegations_awaiting_assessment', coalesce(v_unassessed,0),
    'open_information_requests', coalesce(v_open_rfi,0),
    'open_representation_windows', coalesce(v_open_rep,0),
    'incomplete_mandatory_tasks', coalesce(v_tasks,0));
END; $$;

REVOKE ALL ON FUNCTION public.complaint_investigation_gate(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.complaint_investigation_readiness(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.complaint_investigation_gate(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complaint_investigation_readiness(uuid) TO authenticated, service_role;


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

  IF c.vulnerability_review_state = 'needs_remediation' THEN
    v_blockers := v_blockers || ARRAY['The vulnerability review is outstanding: confirm it, or record that it does not apply'];
  END IF;

  v_scope := CASE WHEN a.decision_outcome = 'PARTIALLY_ACCEPTED' THEN 'PARTIAL'
                  WHEN a.decision_outcome = 'ACCEPTED' THEN 'FULL' ELSE NULL END;

  RETURN jsonb_build_object(
    'ok', array_length(v_blockers,1) IS NULL,
    'blockers', to_jsonb(v_blockers),
    'jurisdiction_status', a.status,
    'jurisdiction_outcome', a.decision_outcome,
    'triage_confirmation_status', c.triage_confirmation_status,
    'vulnerability_review_state', c.vulnerability_review_state,
    'investigation_scope', v_scope);
END; $function$;

REVOKE ALL ON FUNCTION public.complaint_investigation_gate(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.complaint_investigation_gate(uuid) TO authenticated, service_role;

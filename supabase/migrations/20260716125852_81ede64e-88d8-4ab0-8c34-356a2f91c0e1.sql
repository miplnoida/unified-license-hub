CREATE OR REPLACE FUNCTION public.escalate_complaint_to_enforcement(_id uuid, _findings text)
 RETURNS TABLE(complaint_id uuid, enforcement_id uuid, case_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  actor uuid := auth.uid();
  c public.complaints%ROWTYPE;
  new_ea_id uuid;
  new_case_number text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT public.has_complaint_perm(actor, 'escalate') THEN
    RAISE EXCEPTION 'permission denied: complaint_management.escalate' USING ERRCODE='42501';
  END IF;
  IF _findings IS NULL OR length(btrim(_findings)) < 10 THEN
    RAISE EXCEPTION 'findings required (min 10 chars)' USING ERRCODE='22023';
  END IF;

  SELECT * INTO c FROM public.complaints WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'complaint not found' USING ERRCODE='P0002'; END IF;
  IF c.licensee_id IS NULL THEN
    RAISE EXCEPTION 'complaint must be linked to a licensee before escalation' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.enforcement_actions AS ea
    (entity_id, enforcement_type, status, description, findings, opened_by, source_type, source_reference_id)
  VALUES
    (c.licensee_id, 'complaint_escalation', 'open',
     format('Escalated from complaint %s: %s'||E'\n\nFindings: %s', c.complaint_number, c.subject, btrim(_findings)),
     btrim(_findings), actor, 'complaint', c.id)
  RETURNING ea.id, ea.case_number INTO new_ea_id, new_case_number;

  UPDATE public.complaints
     SET enforcement_action_id = new_ea_id, updated_at = now()
   WHERE id = _id;

  INSERT INTO public.enforcement_case_events (case_id, event_type, note, detail, actor_id)
  VALUES (new_ea_id, 'opened',
          format('Auto-opened from complaint %s', c.complaint_number),
          jsonb_build_object('complaint_id', c.id), actor);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (actor, 'complaint.escalated_to_enforcement', 'complaint', _id,
          jsonb_build_object('enforcement_action_id', c.enforcement_action_id),
          jsonb_build_object('enforcement_action_id', new_ea_id, 'case_number', new_case_number, 'findings', btrim(_findings)));

  complaint_id := _id;
  enforcement_id := new_ea_id;
  case_number := new_case_number;
  RETURN NEXT;
END;
$function$;
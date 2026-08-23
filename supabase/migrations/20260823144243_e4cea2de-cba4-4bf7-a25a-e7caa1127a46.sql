-- Remediation reviewers: align with can_act_on_prudential so staff holding
-- manage_remediation (e.g. inspection supervisors closing examination CAPs)
-- can review entity evidence.
CREATE OR REPLACE FUNCTION public.review_prudential_action_response(_action_id uuid, _decision text, _notes text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid();
        _a public.prudential_actions;
        _has_resp boolean;
        _new_status text;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHENTICATED');
  END IF;
  IF _decision NOT IN ('accepted','rejected') THEN
    RETURN jsonb_build_object('error','Decision must be accepted or rejected','code','VALIDATION');
  END IF;
  IF _notes IS NULL OR length(trim(_notes)) < 5 THEN
    RETURN jsonb_build_object('error','Review notes of at least 5 characters are required','code','VALIDATION');
  END IF;
  SELECT * INTO _a FROM public.prudential_actions WHERE id = _action_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Action not found','code','NOT_FOUND');
  END IF;
  IF NOT (public.is_super_admin(_uid)
          OR public.has_permission(_uid,'prudential_supervision','workflow_action')
          OR public.has_permission(_uid,'prudential_supervision','edit')
          OR public.has_permission(_uid,'prudential_supervision','manage_remediation')) THEN
    RETURN jsonb_build_object('error','You are not permitted to review supervisory actions','code','FORBIDDEN');
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.prudential_action_responses r
                  WHERE r.action_id = _action_id AND r.kind = 'entity_response') INTO _has_resp;
  IF NOT _has_resp THEN
    RETURN jsonb_build_object('error','There is no entity response to review','code','NO_RESPONSE');
  END IF;

  _new_status := CASE WHEN _decision = 'accepted' THEN 'completed' ELSE 'in_progress' END;

  INSERT INTO public.prudential_action_responses(action_id, kind, narrative, decision, submitted_by)
  VALUES (_action_id, 'supervisor_review', trim(_notes), _decision, _uid);

  UPDATE public.prudential_actions
     SET review_status = _decision,
         review_notes = trim(_notes),
         reviewed_by = _uid,
         reviewed_at = now(),
         status = _new_status,
         completion_notes = CASE WHEN _decision = 'accepted' THEN trim(_notes) ELSE completion_notes END,
         closed_at = CASE WHEN _decision = 'accepted' THEN now() ELSE closed_at END,
         closed_by = CASE WHEN _decision = 'accepted' THEN _uid ELSE closed_by END,
         progress_percent = CASE WHEN _decision = 'accepted' THEN 100 ELSE progress_percent END,
         updated_at = now()
   WHERE id = _action_id;

  INSERT INTO public.prudential_action_events(action_id, event_type, from_status, to_status, actor_id, reason)
  VALUES (_action_id, 'supervisor_review_' || _decision, _a.status, _new_status, _uid, trim(_notes));

  RETURN jsonb_build_object('ok', true, 'status', _new_status, 'review_status', _decision);
END $function$;
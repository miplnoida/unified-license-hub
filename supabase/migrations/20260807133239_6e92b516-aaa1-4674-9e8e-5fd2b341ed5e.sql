-- Allow examination findings as an action source (the examination handoff has
-- always written this value, but the constraint rejected it).
ALTER TABLE public.prudential_actions
  DROP CONSTRAINT IF EXISTS prudential_actions_source_type_check;
ALTER TABLE public.prudential_actions
  ADD CONSTRAINT prudential_actions_source_type_check CHECK (source_type = ANY (ARRAY[
    'return_breach','assessment','manual','escalation','stress_indicator',
    'examination_finding','ewi_alert','group_risk']));

CREATE OR REPLACE FUNCTION public.examination_create_remediation_action(
  _finding_id uuid,
  _due_date date,
  _assigned_to uuid DEFAULT NULL::uuid,
  _entity_contact text DEFAULT NULL::text,
  _description text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_f public.examination_findings;
  v_entity uuid;
  v_action_id uuid;
BEGIN
  IF NOT (public.can_act_on_examination(auth.uid(), 'manage_remediation')
          OR public.can_act_on_examination(auth.uid(), 'workflow_action')
          OR public.can_act_on_examination(auth.uid(), 'edit')) THEN
    RAISE EXCEPTION 'not_authorised_for_remediation';
  END IF;

  SELECT * INTO v_f FROM public.examination_findings WHERE id = _finding_id;
  IF v_f.id IS NULL THEN RAISE EXCEPTION 'finding_not_found'; END IF;
  IF v_f.remediation_action_id IS NOT NULL THEN RAISE EXCEPTION 'remediation_already_linked'; END IF;

  SELECT entity_id INTO v_entity FROM public.examinations WHERE id = v_f.examination_id;

  INSERT INTO public.prudential_actions (
    entity_id, source_type, source_id, action_type, title, description,
    severity, due_date, assigned_to, entity_contact, status, evidence_required, created_by)
  VALUES (
    v_entity, 'examination_finding', _finding_id, 'remediation_plan',
    v_f.title, COALESCE(_description, v_f.recommendation, v_f.observation),
    v_f.severity, _due_date, _assigned_to, _entity_contact, 'open', true, auth.uid())
  RETURNING id INTO v_action_id;

  UPDATE public.examination_findings
     SET remediation_action_id = v_action_id, status = 'remediation_pending',
         target_date = COALESCE(_due_date, target_date), updated_at = now()
   WHERE id = _finding_id;

  INSERT INTO public.examination_events (examination_id, event_type, actor_id, metadata)
  VALUES (v_f.examination_id, 'remediation_action_created', auth.uid(),
          jsonb_build_object('finding_id', _finding_id, 'action_id', v_action_id));

  RETURN jsonb_build_object('ok', true, 'action_id', v_action_id);
END;
$function$;
-- GAP-3E-001 (P1): prudential_action_issue passed an explicit NULL for
-- breach_after_days, defeating the column default and violating NOT NULL, so no
-- supervisory action could be issued unless the caller supplied a value.
CREATE OR REPLACE FUNCTION public.prudential_action_issue(_entity_id uuid, _action_type text, _title text, _description text DEFAULT NULL::text, _severity text DEFAULT 'medium'::text, _due_date date DEFAULT NULL::date, _assigned_to uuid DEFAULT NULL::uuid, _source_type text DEFAULT 'manual'::text, _source_id uuid DEFAULT NULL::uuid, _evidence_required boolean DEFAULT false, _entity_contact text DEFAULT NULL::text, _response_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _breach_after_days integer DEFAULT NULL::integer, _entity_owner_user_id uuid DEFAULT NULL::uuid)
 RETURNS prudential_actions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.prudential_actions;
BEGIN
  PERFORM public.prudential_enforce('initiate_supervisory_action', _entity_id);
  IF _entity_id IS NULL OR _action_type IS NULL OR _title IS NULL THEN
    RAISE EXCEPTION 'entity, action type and title are required' USING ERRCODE='22023';
  END IF;
  PERFORM public.prudential_require_rationale(_description, 10, 'action description');
  INSERT INTO public.prudential_actions(
    entity_id, action_type, title, description, severity, due_date, assigned_to,
    source_type, source_id, evidence_required, entity_contact, response_due_at,
    breach_after_days, entity_owner_user_id, status, created_by)
  VALUES (_entity_id, _action_type, _title, _description, COALESCE(_severity,'medium'), _due_date, _assigned_to,
    COALESCE(_source_type,'manual'), _source_id, COALESCE(_evidence_required,false), _entity_contact, _response_due_at,
    COALESCE(_breach_after_days, 7), _entity_owner_user_id, 'open', auth.uid())
  RETURNING * INTO v_row;
  PERFORM public.prudential_audit_event('prudential_action_issued','prudential_action',v_row.id,
    NULL, to_jsonb(v_row), jsonb_build_object('entity_id',_entity_id,'source_type',_source_type,'source_id',_source_id), _description, 'CREATE');
  RETURN v_row;
END; $function$;
CREATE OR REPLACE FUNCTION public.conduct_closure_link_enforcement(
  _closure_id uuid,
  _enforcement_action_id uuid DEFAULT NULL,
  _create_new boolean DEFAULT false,
  _enforcement_type text DEFAULT 'warning'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c record; v_inv record; v_id uuid; v_case text;
BEGIN
  SELECT * INTO v_c FROM public.conduct_investigation_closures WHERE id=_closure_id;
  IF v_c IS NULL THEN RAISE EXCEPTION 'Closure record not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.can_manage_conduct_investigation(v_c.investigation_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF v_c.status = 'approved' THEN
    RAISE EXCEPTION 'An approved closure record is immutable' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_inv FROM public.conduct_investigations WHERE id=v_c.investigation_id;

  IF _create_new THEN
    IF v_inv.licensee_id IS NULL THEN
      RAISE EXCEPTION 'An entity is required to open an enforcement case' USING ERRCODE='22023'; END IF;
    v_case := 'ENF-' || to_char(now(),'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    INSERT INTO public.enforcement_actions(
      entity_id, case_number, enforcement_type, status, description, findings,
      opened_by, source_type, source_reference_id)
    VALUES (v_inv.licensee_id, v_case, coalesce(_enforcement_type,'warning'), 'open',
      left(coalesce(v_inv.allegation,''), 2000), v_c.findings_summary,
      auth.uid(), 'conduct_investigation', v_inv.id)
    RETURNING id INTO v_id;

    INSERT INTO public.enforcement_case_events(case_id, event_type, note, actor_id, detail)
    VALUES (v_id, 'opened', 'Referred from market conduct investigation closure', auth.uid(),
      jsonb_build_object('investigation_id', v_inv.id, 'closure_id', _closure_id));
  ELSE
    IF _enforcement_action_id IS NULL THEN
      RAISE EXCEPTION 'An enforcement case must be selected' USING ERRCODE='22023'; END IF;
    v_id := _enforcement_action_id;
    INSERT INTO public.enforcement_case_events(case_id, event_type, note, actor_id, detail)
    VALUES (v_id, 'linked', 'Linked to market conduct investigation closure', auth.uid(),
      jsonb_build_object('investigation_id', v_inv.id, 'closure_id', _closure_id));
  END IF;

  PERFORM set_config('conduct.closure_rpc','on', true);
  UPDATE public.conduct_investigation_closures SET enforcement_action_id=v_id WHERE id=_closure_id;
  PERFORM set_config('conduct.closure_rpc','off', true);

  PERFORM public.log_compliance_audit('UPDATE','conduct_investigation_closure', _closure_id::text,
    jsonb_build_object('enforcement_action_id', v_c.enforcement_action_id),
    jsonb_build_object('enforcement_action_id', v_id),
    'Enforcement referral recorded', NULL, NULL,
    jsonb_build_object('module','market_conduct','investigation_id',v_c.investigation_id));

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.conduct_closure_link_enforcement(uuid,uuid,boolean,text) TO authenticated, service_role;
-- AML-CLOSE-08: a deadline hold needs BOTH a governed reason (from the SLA policy vocabulary)
-- AND a separate written rationale. Previously the reason code doubled as the rationale.
DROP FUNCTION IF EXISTS public.supervisory_response_sla_pause(uuid, text, boolean);

CREATE OR REPLACE FUNCTION public.supervisory_response_sla_pause(
  _obligation_id uuid, _reason text, _resume boolean DEFAULT false, _rationale text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _o public.supervisory_response_sla_obligation;
        _r text := upper(btrim(COALESCE(_reason,'')));
        _w text := btrim(COALESCE(_rationale,''));
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _o FROM public.supervisory_response_sla_obligation WHERE id = _obligation_id;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'not_found: supervisory response deadline' USING ERRCODE = '22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _o.entity_id);
  IF NOT (public.is_super_admin(_uid)
          OR public.has_permission(_uid,'aml_supervision','review')
          OR public.has_permission(_uid,'supervisory_spine','review')) THEN
    RAISE EXCEPTION 'not_authorized: supervisory review authority is required to hold a supervisory deadline' USING ERRCODE = '42501';
  END IF;
  IF _o.stage_instance_id IS NULL OR _o.outcome <> 'PENDING' THEN
    RAISE EXCEPTION 'sla_not_open: this supervisory response has no open governed deadline' USING ERRCODE = '22023';
  END IF;
  IF length(_w) < 10 THEN
    RAISE EXCEPTION 'rationale_required: a written explanation of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  IF NOT _resume THEN
    IF NOT _o.pause_permitted THEN
      RAISE EXCEPTION 'sla_pause_prohibited: the SLA policy governing this response (rule %) does not permit its deadline to be paused',
        COALESCE(_o.sla_policy_rule_code,'-') USING ERRCODE = '42501';
    END IF;
    IF _r = '' OR (jsonb_array_length(_o.pause_reasons) > 0 AND NOT (_o.pause_reasons @> to_jsonb(_r))) THEN
      RAISE EXCEPTION 'sla_pause_reason_not_permitted: the SLA policy governing this response permits a hold only for %',
        COALESCE((SELECT string_agg(v, ', ') FROM jsonb_array_elements_text(_o.pause_reasons) v),'a stated reason') USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.sla_stage_instances s WHERE s.id = _o.stage_instance_id AND s.state = 'paused') THEN
      RAISE EXCEPTION 'sla_already_paused: this deadline is already on hold' USING ERRCODE = '22023';
    END IF;
    PERFORM public.sla_stage_pause('aml_supervisory_response', _o.obligation_key, _r,
      jsonb_build_object('sla_policy_rule_code', _o.sla_policy_rule_code, 'actor_id', _uid, 'rationale', _w));
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.sla_stage_instances s WHERE s.id = _o.stage_instance_id AND s.state = 'paused') THEN
      RAISE EXCEPTION 'sla_not_paused: this deadline is not on hold' USING ERRCODE = '22023';
    END IF;
    PERFORM public.sla_stage_resume('aml_supervisory_response', _o.obligation_key, _w,
      jsonb_build_object('sla_policy_rule_code', _o.sla_policy_rule_code, 'actor_id', _uid, 'rationale', _w));
  END IF;

  RETURN (SELECT jsonb_build_object('obligation_id', _o.id, 'state', s.state,
                 'due_at', s.due_at, 'pause_seconds', s.pause_seconds)
            FROM public.sla_stage_instances s WHERE s.id = _o.stage_instance_id);
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_response_sla_pause(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_response_sla_pause(uuid, text, boolean, text) TO authenticated;
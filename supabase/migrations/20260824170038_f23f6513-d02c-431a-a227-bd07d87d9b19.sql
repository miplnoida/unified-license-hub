CREATE OR REPLACE FUNCTION public.appeal_independence_policy_set(
  _appeal_scope text,
  _prior_decision_maker_may_sit boolean,
  _legal_adviser_votes boolean,
  _regulator_id uuid DEFAULT NULL,
  _notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;
  IF NOT public.has_permission(v_uid,'license_appeals','manage_config') THEN
    RETURN jsonb_build_object('error','You are not allowed to configure appeal policy','code','FORBIDDEN','http',403);
  END IF;
  IF coalesce(_appeal_scope,'') = '' THEN
    RETURN jsonb_build_object('error','An appeal scope is required','code','BAD_INPUT','http',400);
  END IF;
  IF _prior_decision_maker_may_sit IS NULL OR _legal_adviser_votes IS NULL THEN
    RETURN jsonb_build_object('error','Both policy decisions must be stated explicitly','code','POLICY_CONFIGURATION_REQUIRED','http',400);
  END IF;

  SELECT id INTO v_id FROM public.appeal_independence_policies
   WHERE appeal_scope = _appeal_scope
     AND regulator_id IS NOT DISTINCT FROM _regulator_id;

  IF v_id IS NULL THEN
    INSERT INTO public.appeal_independence_policies
      (appeal_scope, regulator_id, prior_decision_maker_may_sit, legal_adviser_votes, notes, created_by)
    VALUES (_appeal_scope, _regulator_id, _prior_decision_maker_may_sit, _legal_adviser_votes, _notes, v_uid)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.appeal_independence_policies
       SET prior_decision_maker_may_sit = _prior_decision_maker_may_sit,
           legal_adviser_votes = _legal_adviser_votes,
           notes = coalesce(_notes, notes),
           updated_at = now()
     WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object('success',true,'http',200,'id',v_id);
END; $$;

REVOKE ALL ON FUNCTION public.appeal_independence_policy_set(text,boolean,boolean,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.appeal_independence_policy_set(text,boolean,boolean,uuid,text) TO authenticated, service_role;
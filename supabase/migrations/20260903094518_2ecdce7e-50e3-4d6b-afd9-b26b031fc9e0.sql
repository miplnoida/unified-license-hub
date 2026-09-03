CREATE OR REPLACE FUNCTION public.examination_execution_require(_examination_id uuid, _action text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE _uid uuid := auth.uid(); _e public.examinations; _perms text[];
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO _e FROM public.examinations WHERE id = _examination_id;
  IF _e.id IS NULL THEN RAISE EXCEPTION 'not_found: examination' USING ERRCODE='22023'; END IF;

  IF public.is_super_admin(_uid) THEN RETURN _uid; END IF;

  -- domain-specific examination authority; never a generic widening.
  -- A generic spine editing permission must NOT confer authority over another
  -- domain's examination fieldwork or findings.
  _perms := CASE upper(COALESCE(_e.domain_code,'PRUDENTIAL'))
    WHEN 'AML_CFT' THEN ARRAY['aml_supervision.examine','aml_supervision.finding_manage']
    WHEN 'AML'     THEN ARRAY['aml_supervision.examine','aml_supervision.finding_manage']
    WHEN 'CONDUCT' THEN ARRAY['market_conduct.approve','market_conduct.edit']
    WHEN 'MARKET_CONDUCT' THEN ARRAY['market_conduct.approve','market_conduct.edit']
    ELSE ARRAY['prudential_supervision.manage_examination','prudential_supervision.edit']
  END;

  IF NOT (public.examination_action_allowed(_uid, _examination_id, _action, false)
          OR public.has_any_permission(_uid, _perms)) THEN
    RAISE EXCEPTION 'not_authorized: examination % authority required for this domain', _action
      USING ERRCODE='42501';
  END IF;

  PERFORM public.supervisory_entity_scope_check(_uid, _e.entity_id);
  RETURN _uid;
END
$fn$;

REVOKE ALL ON FUNCTION public.examination_execution_require(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.examination_execution_require(uuid, text) TO authenticated, service_role;
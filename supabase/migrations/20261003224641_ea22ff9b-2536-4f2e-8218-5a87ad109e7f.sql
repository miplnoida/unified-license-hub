CREATE OR REPLACE FUNCTION public.supervisory_assessment_creation_perimeter(_entity_id uuid, _domain_code text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- AML/CFT requires an explicit, recorded determination that supervision applies.
  -- Sector applicability (overlay) is a separate control and is not consulted here.
  -- Other domains keep their established semantics (no record = not excluded).
  WITH p AS (
    SELECT is_applicable, determined_at FROM public.supervisory_domain_perimeter
     WHERE entity_id = _entity_id AND domain_code = _domain_code)
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM p WHERE is_applicable) THEN
      jsonb_build_object('allowed', true, 'state', 'PERIMETER_ESTABLISHED',
        'determined_at', (SELECT determined_at FROM p))
    WHEN EXISTS (SELECT 1 FROM p WHERE NOT is_applicable) THEN
      jsonb_build_object('allowed', false, 'state', 'DOMAIN_NOT_APPLICABLE',
        'determined_at', (SELECT determined_at FROM p),
        'reason', CASE WHEN _domain_code = 'AML_CFT'
          THEN 'AML/CFT supervision has been determined not to apply to this entity, so an AML/CFT assessment cannot be started.'
          ELSE _domain_code || ' supervision has been determined not to apply to this entity.' END)
    WHEN _domain_code = 'AML_CFT' THEN
      jsonb_build_object('allowed', false, 'state', 'PERIMETER_NOT_ESTABLISHED',
        'reason', 'AML/CFT supervisory applicability has not been established for this entity. A supervisor must record that AML/CFT supervision applies before an assessment can be started.')
    ELSE jsonb_build_object('allowed', true, 'state', 'NOT_RECORDED_DOMAIN_DEFAULT')
  END;
$function$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_creation_perimeter(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_creation_perimeter(uuid, text) TO service_role;

-- Single authoritative boundary: every path that inserts an assessment row.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_perimeter_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _p jsonb;
BEGIN
  _p := public.supervisory_assessment_creation_perimeter(NEW.entity_id, NEW.domain_code);
  IF NOT COALESCE((_p->>'allowed')::boolean, false) THEN
    RAISE EXCEPTION '%: %', lower(_p->>'state'), _p->>'reason' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_perimeter_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS supervisory_assessment_perimeter_guard ON public.supervisory_assessment;
CREATE TRIGGER supervisory_assessment_perimeter_guard
  BEFORE INSERT ON public.supervisory_assessment
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_assessment_perimeter_guard();

-- Read model for the browser: same rule, scoped to the caller.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_creation_eligibility(_entity_id uuid, _domain_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _d text := upper(btrim(COALESCE(_domain_code,'')));
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE='42501'; END IF;
  IF NOT public.supervisory_domain_valid(_d) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _d USING ERRCODE='22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);
  RETURN public.supervisory_assessment_creation_perimeter(_entity_id, _d)
    || jsonb_build_object('entity_id', _entity_id, 'domain_code', _d,
         'can_manage_perimeter', public.has_any_permission(_uid, ARRAY[
           'aml_supervision.approve','supervisory_spine.approve',
           'aml_supervision.manage_config','supervisory_spine.manage_config']));
END $function$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_creation_eligibility(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_creation_eligibility(uuid, text) TO authenticated, service_role;
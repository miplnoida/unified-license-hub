CREATE OR REPLACE FUNCTION public.supervisory_domain_perimeter_set(
  _entity_id uuid, _domain_code text, _is_applicable boolean, _basis text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _id uuid; _before jsonb;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY[
    'aml_supervision.approve','supervisory_spine.approve',
    'aml_supervision.manage_config','prudential_supervision.manage_config',
    'supervisory_spine.manage_config']);
  IF _entity_id IS NULL THEN
    RAISE EXCEPTION 'an entity is required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.supervisory_domain_valid(_domain_code) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _domain_code USING ERRCODE = '22023';
  END IF;
  IF _basis IS NULL OR length(btrim(_basis)) < 10 THEN
    RAISE EXCEPTION 'perimeter_basis_required: state why this domain does or does not apply'
      USING ERRCODE = '22023';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);

  SELECT to_jsonb(p) INTO _before FROM public.supervisory_domain_perimeter p
   WHERE p.entity_id = _entity_id AND p.domain_code = _domain_code;

  INSERT INTO public.supervisory_domain_perimeter(
    entity_id, domain_code, is_applicable, basis, determined_by, determined_at)
  VALUES (_entity_id, _domain_code, _is_applicable, btrim(_basis), _uid, now())
  ON CONFLICT (entity_id, domain_code) DO UPDATE
    SET is_applicable = EXCLUDED.is_applicable,
        basis         = EXCLUDED.basis,
        determined_by = EXCLUDED.determined_by,
        determined_at = now()
  RETURNING id INTO _id;

  PERFORM public.log_compliance_audit(
    CASE WHEN _before IS NULL THEN 'CREATE' ELSE 'UPDATE' END,
    'supervisory_domain_perimeter', _id, _before,
    jsonb_build_object('entity_id',_entity_id,'domain_code',_domain_code,
                       'is_applicable',_is_applicable,'basis',btrim(_basis)),
    'Supervisory perimeter determination for ' || _domain_code);

  RETURN _id;
END $$;
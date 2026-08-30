CREATE OR REPLACE FUNCTION public.ubo_policy_resolve(_regulator_id uuid, _as_of date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE p record;
BEGIN
  SELECT * INTO p FROM public.ubo_policies x
   WHERE x.status IN ('ACTIVE','SUPERSEDED')
     AND x.effective_from <= COALESCE(_as_of, CURRENT_DATE)
     AND (x.effective_to IS NULL OR x.effective_to >= COALESCE(_as_of, CURRENT_DATE))
     AND (x.regulator_id IS NOT DISTINCT FROM _regulator_id OR x.regulator_id IS NULL)
   ORDER BY (x.regulator_id IS NOT DISTINCT FROM _regulator_id) DESC,
            (x.status = 'ACTIVE') DESC,
            x.effective_from DESC, x.version DESC, x.id
   LIMIT 1;

  IF p.id IS NULL THEN
    RETURN jsonb_build_object('status','CONFIGURATION_REQUIRED','regulator_id',_regulator_id,
      'as_of', COALESCE(_as_of, CURRENT_DATE), 'policy', NULL);
  END IF;

  RETURN jsonb_build_object('status','RESOLVED','regulator_id',_regulator_id,
    'as_of', COALESCE(_as_of, CURRENT_DATE),
    'policy', jsonb_build_object('id',p.id,'regulator_id',p.regulator_id,
      'scope', CASE WHEN p.regulator_id IS NULL THEN 'GLOBAL' ELSE 'REGULATOR' END,
      'ownership_threshold',p.ownership_threshold,'voting_threshold',p.voting_threshold,
      'control_test_enabled',p.control_test_enabled,'effective_from',p.effective_from,
      'effective_to',p.effective_to,'version',p.version,'status',p.status,
      'approved_by',p.approved_by,'approved_at',p.approved_at));
END $function$;

REVOKE ALL ON FUNCTION public.ubo_policy_resolve(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ubo_policy_resolve(uuid,date) TO authenticated, service_role;
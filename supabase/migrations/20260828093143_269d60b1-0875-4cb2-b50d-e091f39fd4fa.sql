CREATE OR REPLACE FUNCTION public.onboarding_registration_handoff_ready(_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_party uuid; v_has_org boolean; v_authority boolean; v_blockers text[] := '{}'::text[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;

  SELECT party_id INTO v_party FROM public.licensees WHERE id = _entity_id;
  IF v_party IS NULL THEN
    v_blockers := v_blockers || 'Entity has no canonical organisation record'::text;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.organizations o WHERE o.party_id = v_party) INTO v_has_org;
    IF NOT v_has_org THEN
      v_blockers := v_blockers || 'Entity organisation projection is missing'::text;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.entity_user_memberships m
    JOIN public.entity_membership_status_catalogue s ON s.key = m.status
    WHERE m.entity_id = _entity_id AND s.is_authority_sufficient
  ) INTO v_authority;
  IF NOT v_authority THEN
    v_blockers := v_blockers || 'No user holds approved authority to act for this entity'::text;
  END IF;

  RETURN jsonb_build_object(
    'entity_id', _entity_id,
    'ready', cardinality(v_blockers) = 0,
    'blockers', to_jsonb(v_blockers)
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.onboarding_registration_handoff_ready(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.onboarding_registration_handoff_ready(uuid) TO authenticated, service_role;
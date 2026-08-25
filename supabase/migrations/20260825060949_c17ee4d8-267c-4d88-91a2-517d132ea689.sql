-- Canonical returns entitlement predicate: internal staff exempt, external
-- portal users must hold an eligible (approved/issued, in-good-standing) licence.
CREATE OR REPLACE FUNCTION public.returns_entitlement_ok(
  _uid uuid,
  _entity_id uuid,
  _sector_id uuid DEFAULT NULL,
  _sub_sector_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _uid IS NULL THEN false
    WHEN public.is_super_admin(_uid) THEN true
    WHEN public.sec_is_internal_user(_uid) AND NOT public.has_external_role(_uid) THEN true
    WHEN _entity_id IS NULL THEN false
    ELSE public.can_act_on_license(_entity_id, _sector_id, _sub_sector_id, NULL)
  END;
$$;

REVOKE ALL ON FUNCTION public.returns_entitlement_ok(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.returns_entitlement_ok(uuid, uuid, uuid, uuid) TO authenticated, service_role;

-- Legacy returns spine gate: keep every existing authorisation branch, but
-- external filers now also need a live licence entitlement on the entity.
CREATE OR REPLACE FUNCTION public.legacy_return_can_file(_uid uuid, _entity_id uuid, _on_behalf uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_uid) THEN RETURN true; END IF;
  IF public.has_permission(_uid, 'returns_management', 'submit') THEN RETURN true; END IF;
  IF _entity_id IS NOT NULL AND _entity_id = ANY (COALESCE(public.external_user_entity_ids(_uid), ARRAY[]::uuid[]))
     AND public.returns_entitlement_ok(_uid, _entity_id) THEN RETURN true; END IF;
  IF _on_behalf IS NOT NULL AND _on_behalf = ANY (COALESCE(public.ppoc_mapped_licensee_ids(_uid), ARRAY[]::uuid[]))
     AND public.returns_entitlement_ok(_uid, _on_behalf) THEN RETURN true; END IF;
  IF _entity_id IS NOT NULL AND _entity_id = ANY (COALESCE(public.ppoc_mapped_licensee_ids(_uid), ARRAY[]::uuid[]))
     AND public.returns_entitlement_ok(_uid, _entity_id) THEN RETURN true; END IF;
  RETURN false;
END; $function$;

-- Sector-aware check at legacy return creation.
CREATE OR REPLACE FUNCTION public.legacy_return_create(_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _entity uuid; _on_behalf uuid; _id uuid; _after jsonb;
        _sector uuid; _subsector uuid; _scope_entity uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  _entity := nullif(_payload->>'entity_id','')::uuid;
  _on_behalf := nullif(_payload->>'on_behalf_of_licensee_id','')::uuid;
  _sector := nullif(_payload->>'sector_id','')::uuid;
  _subsector := nullif(_payload->>'subsector_id','')::uuid;
  IF _entity IS NULL THEN RAISE EXCEPTION 'entity_id is required' USING ERRCODE='22023'; END IF;
  IF NOT public.legacy_return_can_file(_uid, _entity, _on_behalf) THEN
    RAISE EXCEPTION 'You are not entitled to file returns for this entity' USING ERRCODE='42501';
  END IF;
  IF nullif(_payload->>'return_configuration_id','') IS NULL THEN
    RAISE EXCEPTION 'return_configuration_id is required' USING ERRCODE='22023';
  END IF;
  -- Licence entitlement must cover the sector scope of the return itself.
  _scope_entity := COALESCE(_on_behalf, _entity);
  IF _sector IS NOT NULL
     AND NOT public.returns_entitlement_ok(_uid, _scope_entity, _sector, _subsector) THEN
    RAISE EXCEPTION 'This return is unavailable because the entity does not hold an approved licence in good standing for the selected sector'
      USING ERRCODE='42501';
  END IF;
  INSERT INTO public.returns_filed (
    entity_id, on_behalf_of_licensee_id, return_configuration_id, sector_id, subsector_id,
    return_year, return_period, period_start_date, period_end_date, due_date,
    workflow_status, created_by, updated_by
  ) VALUES (
    _entity, _on_behalf,
    (_payload->>'return_configuration_id')::uuid,
    _sector,
    _subsector,
    nullif(_payload->>'return_year','')::int,
    nullif(_payload->>'return_period',''),
    nullif(_payload->>'period_start_date','')::date,
    nullif(_payload->>'period_end_date','')::date,
    nullif(_payload->>'due_date','')::date,
    'TEMP', _uid, _uid
  ) RETURNING id INTO _id;
  SELECT to_jsonb(r) INTO _after FROM public.returns_filed r WHERE r.id=_id;
  PERFORM public.log_compliance_audit('CREATE'::compliance_audit_action,'legacy_return',_id::text,NULL,_after,NULL);
  RETURN _after;
END; $function$;

-- Canonical (Wave C) returns spine gates.
CREATE OR REPLACE FUNCTION public.returns_can_file(_entity_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_super_admin(auth.uid())
    OR (
      public.sec_is_internal_user(auth.uid())
      AND NOT public.has_external_role(auth.uid())
      AND public.has_permission(auth.uid(), 'returns_management', 'create')
    )
    OR (
      public.entity_membership_capability(auth.uid(), _entity_id, 'returns.submit')
      AND public.returns_entitlement_ok(auth.uid(), _entity_id)
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.returns_can_prepare(_entity_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    public.returns_can_file(_entity_id)
    OR (
      public.entity_membership_capability(auth.uid(), _entity_id, 'prepare_filing')
      AND public.returns_entitlement_ok(auth.uid(), _entity_id)
    )
  );
$function$;
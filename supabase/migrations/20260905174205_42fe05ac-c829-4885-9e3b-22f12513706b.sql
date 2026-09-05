-- OS-02B — canonical role-scope narrowing for the monitoring register.
-- Narrowing only: it can never admit an entity the caller's canonical scope
-- grants exclude, and it never grants a permission sup_domain_readable denied.
CREATE OR REPLACE FUNCTION public.supervisory_monitoring_scope_admits(
  _uid uuid, _domain_code text, _entity_id uuid,
  _regulator_id uuid, _sector_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  _mods text[];
  _m text;
  _g jsonb;
  _scope jsonb;
  _sub uuid;
  _qualified boolean := false;
BEGIN
  IF _uid IS NULL OR _entity_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_uid) THEN RETURN true; END IF;

  _mods := CASE upper(COALESCE(_domain_code,'CROSS_DOMAIN'))
    WHEN 'AML_CFT' THEN ARRAY['supervisory_spine','aml_supervision']
    WHEN 'PRUDENTIAL' THEN ARRAY['supervisory_spine','prudential_supervision']
    WHEN 'OPERATIONAL_RESILIENCE' THEN ARRAY['supervisory_spine','prudential_supervision']
    WHEN 'MARKET_CONDUCT' THEN ARRAY['supervisory_spine','market_conduct']
    WHEN 'GOVERNANCE' THEN ARRAY['supervisory_spine','fit_and_proper','prudential_supervision']
    ELSE ARRAY['supervisory_spine','prudential_supervision','aml_supervision','market_conduct']
  END;

  _scope := public.entity_regulatory_scope(_entity_id);
  _sub := NULLIF(_scope->>'sub_sector_id','')::uuid;

  FOREACH _m IN ARRAY _mods LOOP
    _g := public.user_scope_grants_for(_uid, _m, 'view');
    IF NOT COALESCE((_g->>'qualified')::boolean, false) THEN CONTINUE; END IF;
    _qualified := true;

    IF COALESCE((_g->>'all')::boolean, false) THEN RETURN true; END IF;

    IF _regulator_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(COALESCE(_g->'regulators','[]'::jsonb)) v
          WHERE v.value::uuid = _regulator_id) THEN RETURN true; END IF;

    IF _sector_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(COALESCE(_g->'sectors','[]'::jsonb)) v
          WHERE v.value::uuid = _sector_id) THEN RETURN true; END IF;

    IF _sub IS NOT NULL AND EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(COALESCE(_g->'sub_sectors','[]'::jsonb)) v
          WHERE v.value::uuid = _sub) THEN RETURN true; END IF;

    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(_g->'institutions','[]'::jsonb)) v
                WHERE v.value::uuid = _entity_id) THEN RETURN true; END IF;

    IF COALESCE((_g->>'assigned')::boolean, false) AND (
         public.user_has_entity_assignment(_uid, _entity_id,
           public.supervisory_domain_regulatory_function(_domain_code))
         OR public.user_has_entity_assignment(_uid, _entity_id)) THEN RETURN true; END IF;

    IF COALESCE((_g->>'team')::boolean, false)
       AND public.user_team_covers_entity(_uid, _entity_id) THEN RETURN true; END IF;
  END LOOP;

  -- No qualifying grant for any supervisory module of this domain: the caller
  -- reached the register through another module, so nothing is admitted here.
  RETURN false;
END $fn$;

REVOKE ALL ON FUNCTION public.supervisory_monitoring_scope_admits(uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_monitoring_scope_admits(uuid,text,uuid,uuid,uuid)
  TO authenticated, service_role;

-- Rewire the existing register to apply the narrowing at the entity/domain pair
-- level. The body is taken from the live definition and only the pair CTE is
-- changed, so no other register semantics are altered.
DO $do$
DECLARE
  _def text;
  _old text := E'  pairs AS (\n    SELECT e.id AS entity_id, d.domain_code\n      FROM ents_s e CROSS JOIN unnest(_doms) AS d(domain_code)\n  ),';
  _new text := E'  pairs AS (\n    SELECT e.id AS entity_id, d.domain_code\n      FROM ents_s e CROSS JOIN unnest(_doms) AS d(domain_code)\n     WHERE public.supervisory_monitoring_scope_admits(\n             _uid, d.domain_code, e.id, e.regulator_id, e.sector_id)\n  ),';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_monitoring_register';
  IF _def IS NULL THEN
    RAISE EXCEPTION 'supervisory_monitoring_register is missing';
  END IF;
  IF position(_old in _def) = 0 THEN
    IF position('supervisory_monitoring_scope_admits' in _def) > 0 THEN
      RAISE NOTICE 'register already narrowed';
      RETURN;
    END IF;
    RAISE EXCEPTION 'register pair CTE not found; refusing to patch blindly';
  END IF;
  _def := replace(_def, _old, _new);
  EXECUTE _def;
END $do$;
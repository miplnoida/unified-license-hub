REVOKE EXECUTE ON FUNCTION public.can_act_on_specific_license(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;

-- Sector scope of a reporting obligation, when the obligation was derived from a rule.
CREATE OR REPLACE FUNCTION public.returns_obligation_scope(_obligation_id uuid)
RETURNS TABLE(entity_id uuid, sector_id uuid, sub_sector_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT o.entity_id, r.sector_id, r.sub_sector_id
    FROM public.entity_reporting_obligations o
    LEFT JOIN public.reporting_obligation_rules r ON r.id = o.source_rule_id
   WHERE o.id = _obligation_id;
$$;

REVOKE EXECUTE ON FUNCTION public.returns_obligation_scope(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_obligation_scope(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.returns_can_file_obligation(_obligation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE s record;
BEGIN
  SELECT * INTO s FROM public.returns_obligation_scope(_obligation_id);
  IF s.entity_id IS NULL THEN RETURN false; END IF;
  RETURN public.returns_can_file(s.entity_id)
     AND public.returns_entitlement_ok(auth.uid(), s.entity_id, s.sector_id, s.sub_sector_id);
END $$;

CREATE OR REPLACE FUNCTION public.returns_can_prepare_obligation(_obligation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE s record;
BEGIN
  SELECT * INTO s FROM public.returns_obligation_scope(_obligation_id);
  IF s.entity_id IS NULL THEN RETURN false; END IF;
  RETURN public.returns_can_prepare(s.entity_id)
     AND public.returns_entitlement_ok(auth.uid(), s.entity_id, s.sector_id, s.sub_sector_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.returns_can_file_obligation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.returns_can_prepare_obligation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_can_file_obligation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.returns_can_prepare_obligation(uuid) TO authenticated, service_role;

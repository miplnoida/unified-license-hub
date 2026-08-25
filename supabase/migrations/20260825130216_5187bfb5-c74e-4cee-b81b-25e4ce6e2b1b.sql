CREATE TABLE IF NOT EXISTS public.sector_alias_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_sector_id uuid NOT NULL UNIQUE REFERENCES public.sectors(id) ON DELETE CASCADE,
  active_sector_id uuid NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sector_alias_map_not_self CHECK (legacy_sector_id <> active_sector_id)
);

GRANT SELECT ON public.sector_alias_map TO authenticated;
GRANT ALL ON public.sector_alias_map TO service_role;

ALTER TABLE public.sector_alias_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read sector alias map" ON public.sector_alias_map;
CREATE POLICY "Authenticated users can read sector alias map"
  ON public.sector_alias_map FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS trg_sector_alias_map_updated_at ON public.sector_alias_map;
CREATE TRIGGER trg_sector_alias_map_updated_at
  BEFORE UPDATE ON public.sector_alias_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.sector_alias_map (legacy_sector_id, active_sector_id, note)
VALUES
  ('d90ffa53-709b-41e8-a6d9-efd1bbac69bc','6e089cf6-975e-4f55-982f-bc75bf54b896','Commercial Bank -> International Banks'),
  ('87ecc596-e045-4001-ab95-853cc71a9d4b','6e089cf6-975e-4f55-982f-bc75bf54b896','Merchant Bank -> International Banks'),
  ('641bdf7f-005a-47b8-83f5-8894fdc6c073','17a9fbec-5377-4f3d-a7b8-e2c357966d23','Building Society -> Credit Unions'),
  ('7bc82eb6-357b-474d-9d91-b9bbad6b6753','17a9fbec-5377-4f3d-a7b8-e2c357966d23','Micro-credit Institution -> Credit Unions'),
  ('a9698ca9-655d-46ff-afee-d5bfb978eb01','d6daa71a-35c0-4987-ac9a-a73a94bcdbc8','Life Insurance -> Domestic Insurance & Pension'),
  ('1ea22781-fee7-4a26-b382-09f0477485d5','d6daa71a-35c0-4987-ac9a-a73a94bcdbc8','General Insurance -> Domestic Insurance & Pension'),
  ('b2000000-0000-4000-8000-000000000001','d6daa71a-35c0-4987-ac9a-a73a94bcdbc8','Pension Fund Administrator -> Domestic Insurance & Pension'),
  ('79bdf821-4ba0-4b59-9b46-0c1c6f1373e9','48c4caeb-3c31-408e-9cac-778e3e8fe7c6','Money Service Business -> Money Services Business'),
  ('b1000000-0000-4000-8000-000000000001','48c4caeb-3c31-408e-9cac-778e3e8fe7c6','Payment Service Provider -> Money Services Business'),
  ('7171f40e-19cd-4a0c-be3d-6f13e7cd9213','875deb8f-b392-412e-949c-264ea535c92d','Securities Dealer -> International Mutual Funds'),
  ('4446f087-15d9-4c31-824d-b28177517d24','6e089cf6-975e-4f55-982f-bc75bf54b896','Financial Group -> International Banks'),
  ('86935244-95e5-49e2-b772-de509fce7e82','6e089cf6-975e-4f55-982f-bc75bf54b896','Financial Holding Company -> International Banks')
ON CONFLICT (legacy_sector_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sector_effective_id(_sector_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT m.active_sector_id FROM public.sector_alias_map m
      WHERE m.legacy_sector_id = _sector_id AND m.is_active),
    _sector_id
  );
$function$;

GRANT EXECUTE ON FUNCTION public.sector_effective_id(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_act_on_license(_licensee_id uuid, _sector_id uuid, _sub_sector_id uuid DEFAULT NULL::uuid, _category_id uuid DEFAULT NULL::uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.entity_license_entitlements(_licensee_id) e
     WHERE e.is_eligible_for_new_activity
       AND (_sector_id IS NULL
            OR e.sector_id = _sector_id
            OR public.sector_effective_id(e.sector_id) = public.sector_effective_id(_sector_id))
       AND (_sub_sector_id IS NULL OR e.sub_sector_id IS NULL OR e.sub_sector_id = _sub_sector_id)
       AND (_category_id IS NULL OR e.category_id IS NULL OR e.category_id = _category_id)
  );
$function$;

CREATE OR REPLACE FUNCTION public.returns_derive_entity_obligations(_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_created int := 0; v_closed int := 0; r record; v_ent record; v_sectors uuid[];
BEGIN
  PERFORM public.returns_require('manage_config');
  SELECT id, sector_id, sub_sector_id, category_id, license_id, lifecycle_stage_id, status
    INTO v_ent FROM public.licensees WHERE id = _entity_id;
  IF v_ent.id IS NULL THEN RAISE EXCEPTION 'Entity not found'; END IF;

  SELECT ARRAY(
    SELECT DISTINCT public.sector_effective_id(x.sid)
      FROM (
        SELECT v_ent.sector_id AS sid
        UNION
        SELECT l.sector_id
          FROM public.entity_licenses el
          JOIN public.licenses l ON l.id = el.license_id
         WHERE el.entity_id = _entity_id
      ) x
     WHERE x.sid IS NOT NULL
  ) INTO v_sectors;

  FOR r IN
    SELECT DISTINCT ON (ru.return_definition_id) ru.*, d.frequency AS def_frequency,
           d.due_days_after_period_end AS def_due_days
      FROM public.reporting_obligation_rules ru
      JOIN public.return_definitions d ON d.id = ru.return_definition_id
     WHERE ru.is_active AND d.is_active AND d.status = 'ACTIVE'
       AND ru.effective_from <= CURRENT_DATE
       AND (ru.effective_to IS NULL OR ru.effective_to >= CURRENT_DATE)
       AND (ru.sector_id IS NULL OR ru.sector_id = ANY(v_sectors))
       AND (ru.sub_sector_id IS NULL OR ru.sub_sector_id = v_ent.sub_sector_id)
       AND (ru.category_id IS NULL OR ru.category_id = v_ent.category_id)
       AND (ru.lifecycle_stage_id IS NULL OR ru.lifecycle_stage_id = v_ent.lifecycle_stage_id)
       AND (NOT ru.requires_active_license OR EXISTS (
              SELECT 1 FROM public.entity_licenses el
               WHERE el.entity_id = _entity_id
                 AND (el.effective_to IS NULL OR el.effective_to > now())))
     ORDER BY ru.return_definition_id, ru.priority ASC, ru.effective_from DESC
  LOOP
    IF EXISTS (SELECT 1 FROM public.entity_reporting_obligations o
                WHERE o.entity_id = _entity_id AND o.return_definition_id = r.return_definition_id
                  AND o.status = 'ACTIVE') THEN
      CONTINUE;
    END IF;
    INSERT INTO public.entity_reporting_obligations(
      entity_id, return_definition_id, source_rule_id, origin, frequency,
      due_days_after_period_end, effective_from, created_by)
    VALUES (_entity_id, r.return_definition_id, r.id, 'RULE',
      COALESCE(r.frequency_override, r.def_frequency),
      COALESCE(r.due_days_override, r.def_due_days),
      r.effective_from, auth.uid())
    ON CONFLICT DO NOTHING;
    v_created := v_created + 1;
  END LOOP;

  UPDATE public.entity_reporting_obligations o
     SET status = 'CLOSED', closed_reason = 'Applicability rule no longer matches', effective_to = CURRENT_DATE
   WHERE o.entity_id = _entity_id AND o.status = 'ACTIVE' AND o.origin = 'RULE'
     AND NOT EXISTS (SELECT 1 FROM public.return_filings f WHERE f.entity_reporting_obligation_id = o.id)
     AND (o.source_rule_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.reporting_obligation_rules ru
         WHERE ru.id = o.source_rule_id AND ru.is_active
           AND (ru.effective_to IS NULL OR ru.effective_to >= CURRENT_DATE)));
  v_closed := 0;

  PERFORM public.create_audit_log('entity', _entity_id, 'DERIVE_REPORTING_OBLIGATIONS',
    jsonb_build_object('created', v_created));
  RETURN jsonb_build_object('created', v_created, 'closed', v_closed);
END $function$;
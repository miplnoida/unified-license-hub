CREATE OR REPLACE FUNCTION public.returns_derive_entity_obligations(_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_created int := 0; v_closed int := 0; r record; v_ent record;
        v_sectors uuid[]; v_has_licence boolean := false;
BEGIN
  PERFORM public.returns_require('manage_config');
  SELECT id, sector_id, sub_sector_id, category_id, license_id, lifecycle_stage_id, status
    INTO v_ent FROM public.licensees WHERE id = _entity_id;
  IF v_ent.id IS NULL THEN RAISE EXCEPTION 'Entity not found'; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _rdeo_lic (license_id uuid, sector_id uuid, status text) ON COMMIT DROP;
  DELETE FROM _rdeo_lic WHERE true;
  INSERT INTO _rdeo_lic (license_id, sector_id, status)
  SELECT DISTINCT l.id, l.sector_id, lower(trim(COALESCE(l.status, '')))
    FROM public.licenses l
   WHERE l.holder_id = _entity_id
      OR l.id = v_ent.license_id
      OR EXISTS (
        SELECT 1 FROM public.entity_licenses el
         WHERE el.license_id = l.id AND el.entity_id = _entity_id
           AND (el.effective_to IS NULL OR el.effective_to > now()));

  SELECT EXISTS (
    SELECT 1 FROM _rdeo_lic
     WHERE status IN ('active','approved','issued','valid','in_good_standing')
  ) INTO v_has_licence;

  SELECT ARRAY(
    SELECT DISTINCT public.sector_effective_id(x.sid)
      FROM (
        SELECT v_ent.sector_id AS sid
        UNION
        SELECT sector_id FROM _rdeo_lic
         WHERE status IN ('active','approved','issued','valid','in_good_standing')
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
       AND (NOT ru.requires_active_license OR v_has_licence)
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
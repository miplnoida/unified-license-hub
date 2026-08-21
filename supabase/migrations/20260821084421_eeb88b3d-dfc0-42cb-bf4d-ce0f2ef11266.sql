-- EPR-01 / P07: canonical stress-indicator evaluation.
-- The legacy evaluate_stress_indicators_for_return() reads returns_filed +
-- return_calculated_ratios (both empty) and is retained for compatibility only.
-- Indicator thresholds/direction semantics are UNCHANGED; only the input facts
-- become canonical (accepted/current filing version metric values).

CREATE UNIQUE INDEX IF NOT EXISTS prudential_stress_events_indicator_filing_uidx
  ON public.prudential_stress_events (indicator_id, return_filing_id)
  WHERE return_filing_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.evaluate_stress_indicators_for_filing(_return_filing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ent_id uuid;
  ent_sector uuid;
  ent_sub uuid;
  v_version_id uuid;
  new_events jsonb := '[]'::jsonb;
  updated_events jsonb := '[]'::jsonb;
  ind RECORD;
  fact RECORD;
  match boolean;
  ins_id uuid;
  was_new boolean;
BEGIN
  IF NOT (public.is_super_admin(auth.uid())
          OR public.has_permission(auth.uid(), 'prudential_supervision', 'edit')) THEN
    RAISE EXCEPTION 'not authorised to evaluate stress indicators';
  END IF;

  SELECT w.entity_id, COALESCE(w.accepted_version_id, w.current_version_id)
    INTO ent_id, v_version_id
    FROM public.v_return_filing_workflow_state w
   WHERE w.filing_id = _return_filing_id
     AND w.status <> 'WITHDRAWN';

  IF ent_id IS NULL OR v_version_id IS NULL THEN
    RETURN jsonb_build_object('new_events','[]'::jsonb,'updated_events','[]'::jsonb);
  END IF;

  SELECT l.sector_id, l.sub_sector_id INTO ent_sector, ent_sub
    FROM public.licensees l WHERE l.id = ent_id;

  FOR ind IN
    SELECT * FROM public.prudential_stress_indicators
    WHERE is_active = true
      AND (sector_id IS NULL OR sector_id = ent_sector)
      AND (sub_sector_id IS NULL OR sub_sector_id = ent_sub)
  LOOP
    FOR fact IN
      SELECT mv.value_numeric AS value
        FROM public.return_metric_values mv
        JOIN public.regulatory_metrics m ON m.id = mv.regulatory_metric_id
       WHERE mv.return_filing_version_id = v_version_id
         AND mv.value_numeric IS NOT NULL
         AND upper(m.code) = upper(ind.metric_key)
    LOOP
      match := CASE ind.direction
        WHEN 'gt'  THEN fact.value >  ind.threshold_value
        WHEN 'gte' THEN fact.value >= ind.threshold_value
        WHEN 'lt'  THEN fact.value <  ind.threshold_value
        WHEN 'lte' THEN fact.value <= ind.threshold_value
        WHEN 'eq'  THEN fact.value =  ind.threshold_value
        ELSE false END;
      IF match THEN
        WITH up AS (
          INSERT INTO public.prudential_stress_events
            (indicator_id, entity_id, return_filing_id, return_filing_version_id, observed_value)
          VALUES (ind.id, ent_id, _return_filing_id, v_version_id, fact.value)
          ON CONFLICT (indicator_id, return_filing_id) WHERE return_filing_id IS NOT NULL
          DO UPDATE SET observed_value = EXCLUDED.observed_value,
                        return_filing_version_id = EXCLUDED.return_filing_version_id
          RETURNING id, (xmax = 0) AS inserted
        )
        SELECT id, inserted INTO ins_id, was_new FROM up;
        IF was_new THEN
          new_events := new_events || jsonb_build_object(
            'event_id', ins_id, 'indicator_id', ind.id, 'metric_key', ind.metric_key,
            'label', ind.label, 'severity', ind.severity, 'observed_value', fact.value,
            'threshold_value', ind.threshold_value, 'direction', ind.direction,
            'escalate', ind.escalate, 'entity_id', ent_id,
            'return_filing_id', _return_filing_id, 'return_filing_version_id', v_version_id
          );
        ELSE
          updated_events := updated_events || jsonb_build_object(
            'event_id', ins_id, 'indicator_id', ind.id, 'metric_key', ind.metric_key,
            'label', ind.label, 'severity', ind.severity, 'observed_value', fact.value,
            'threshold_value', ind.threshold_value, 'direction', ind.direction,
            'escalate', ind.escalate, 'entity_id', ent_id,
            'return_filing_id', _return_filing_id, 'return_filing_version_id', v_version_id
          );
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('new_events', new_events, 'updated_events', updated_events);
END;
$function$;

REVOKE ALL ON FUNCTION public.evaluate_stress_indicators_for_filing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_stress_indicators_for_filing(uuid) TO authenticated, service_role;
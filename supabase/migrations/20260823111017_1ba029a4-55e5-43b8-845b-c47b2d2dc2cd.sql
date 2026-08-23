-- Wave 2 defect: threshold-breach notifications resolved context only from the
-- legacy returns_filed row via return_id. Canonical detection runs populate
-- return_filing_id / entity_id / reporting_period_id and leave return_id NULL,
-- so entity, sector and CTA were emitted as NULL and rendered empty titles.
CREATE OR REPLACE FUNCTION public.trg_return_threshold_breach_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  rf public.returns_filed%ROWTYPE;
  v_payload jsonb;
  v_group integer;
  v_entity uuid;
  v_licensee uuid;
  v_sector uuid;
  v_entity_name text;
  v_cta text;
BEGIN
  IF NEW.return_id IS NOT NULL THEN
    SELECT * INTO rf FROM public.returns_filed WHERE id = NEW.return_id;
  END IF;

  v_entity   := COALESCE(NEW.entity_id, rf.entity_id);
  v_licensee := COALESCE(rf.on_behalf_of_licensee_id, v_entity);
  v_sector   := rf.sector_id;

  IF v_sector IS NULL AND v_entity IS NOT NULL THEN
    SELECT l.sector_id, l.name INTO v_sector, v_entity_name
      FROM public.licensees l WHERE l.id = v_entity;
  ELSIF v_entity IS NOT NULL THEN
    SELECT l.name INTO v_entity_name FROM public.licensees l WHERE l.id = v_entity;
  END IF;

  v_cta := CASE
    WHEN NEW.return_filing_id IS NOT NULL THEN '/returns/filings/' || NEW.return_filing_id
    WHEN NEW.return_id IS NOT NULL THEN '/returns/' || NEW.return_id
    ELSE NULL
  END;

  v_payload := jsonb_build_object(
    'breach_id', NEW.id,
    'return_id', NEW.return_id,
    'return_filing_id', NEW.return_filing_id,
    'return_filing_version_id', NEW.return_filing_version_id,
    'reporting_period_id', NEW.reporting_period_id,
    'metric_key', NEW.metric_key,
    'level', NEW.level,
    'value', NEW.value,
    'threshold_value', NEW.threshold_value,
    'risk_level', NEW.risk_level,
    'entity_id', v_entity,
    'entity_name', v_entity_name,
    'licensee_id', v_licensee,
    'sector_id', v_sector,
    'cta_url', v_cta,
    'cta_label', 'Open return');

  PERFORM public.notification_enqueue_event('prudential_breach_detected', 'return',
    COALESCE(NEW.return_id, NEW.return_filing_id), v_payload, NEW.id::text);

  IF coalesce(NEW.risk_level,'') IN ('medium','low') OR coalesce(NEW.level,'') = 'warning' THEN
    PERFORM public.notification_enqueue_event('prudential.early_warning_triggered', 'return',
      COALESCE(NEW.return_id, NEW.return_filing_id), v_payload, NEW.id::text);
  END IF;

  IF v_entity IS NOT NULL THEN
    SELECT count(*) INTO v_group FROM public.entity_relationships
     WHERE entity_id = v_entity AND coalesce(status,'active') = 'active';
    IF coalesce(v_group,0) > 0 THEN
      PERFORM public.notification_enqueue_event('prudential.group_contagion_alert', 'return',
        COALESCE(NEW.return_id, NEW.return_filing_id),
        v_payload || jsonb_build_object('related_entity_count', v_group), NEW.id::text);
    END IF;
  END IF;

  RETURN NEW;
END $$;
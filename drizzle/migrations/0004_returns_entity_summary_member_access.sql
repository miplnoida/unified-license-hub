CREATE OR REPLACE FUNCTION public.returns_entity_summary(_entity_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_obl int; v_next jsonb; v_overdue int; v_recent jsonb; v_metrics jsonb; v_corr int;
BEGIN
  IF NOT public.entity_membership_capability(auth.uid(), _entity_id, 'returns.view') THEN
    PERFORM public.returns_require('view');
  END IF;

  SELECT count(*) INTO v_obl FROM public.entity_reporting_obligations
   WHERE entity_id = _entity_id AND status = 'ACTIVE';

  SELECT to_jsonb(x) INTO v_next FROM (
    SELECT d.code AS definition_code, d.name AS definition_name, p.period_label, p.due_date
      FROM public.reporting_periods p
      JOIN public.entity_reporting_obligations o ON o.id = p.entity_reporting_obligation_id
      JOIN public.return_definitions d ON d.id = o.return_definition_id
     WHERE o.entity_id = _entity_id AND o.status = 'ACTIVE' AND p.due_date >= CURRENT_DATE
       AND NOT EXISTS (SELECT 1 FROM public.return_filings f WHERE f.reporting_period_id = p.id AND f.status = 'ACCEPTED')
     ORDER BY p.due_date ASC LIMIT 1) x;

  SELECT count(*) INTO v_overdue FROM public.reporting_periods p
    JOIN public.entity_reporting_obligations o ON o.id = p.entity_reporting_obligation_id
   WHERE o.entity_id = _entity_id AND o.status = 'ACTIVE' AND p.due_date < CURRENT_DATE
     AND NOT EXISTS (SELECT 1 FROM public.return_filings f WHERE f.reporting_period_id = p.id
                        AND f.status IN ('SUBMITTED','UNDER_REVIEW','ACCEPTED'));

  SELECT COALESCE(jsonb_agg(to_jsonb(y) ORDER BY y.period_end DESC), '[]'::jsonb) INTO v_recent FROM (
    SELECT f.id AS filing_id, f.filing_reference, f.status, f.current_version_number,
           d.code AS definition_code, d.name AS definition_name, p.period_label, p.period_end, p.due_date, f.submitted_at
      FROM public.return_filings f
      JOIN public.return_definitions d ON d.id = f.return_definition_id
      JOIN public.reporting_periods p ON p.id = f.reporting_period_id
     WHERE f.entity_id = _entity_id ORDER BY p.period_end DESC LIMIT 8) y;

  SELECT COALESCE(jsonb_agg(to_jsonb(z) ORDER BY z.code), '[]'::jsonb) INTO v_metrics FROM (
    SELECT DISTINCT ON (m.code) m.code, m.name, m.unit, mv.value_numeric, mv.availability, p.period_label, p.period_end
      FROM public.return_metric_values mv
      JOIN public.regulatory_metrics m ON m.id = mv.regulatory_metric_id
      JOIN public.return_filing_versions v ON v.id = mv.return_filing_version_id
      JOIN public.return_filings f ON f.id = v.return_filing_id
      JOIN public.reporting_periods p ON p.id = f.reporting_period_id
     WHERE mv.entity_id = _entity_id AND f.accepted_version_id = v.id
     ORDER BY m.code, p.period_end DESC) z;

  SELECT count(*) INTO v_corr FROM public.return_filings WHERE entity_id = _entity_id AND status = 'CORRECTION_REQUESTED';

  RETURN jsonb_build_object('entity_id', _entity_id, 'active_obligations', v_obl, 'next_due', v_next,
    'overdue_count', v_overdue, 'correction_requested_count', v_corr,
    'recent_filings', v_recent, 'latest_accepted_metrics', v_metrics);
END $function$;
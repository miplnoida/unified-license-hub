-- F8-W1B: repoint group supervision reads onto the canonical calculated-metric
-- store (return_metric_values, source_kind='CALCULATED'). The retired
-- return_calculated_ratios store stays read-only historical.
-- Signatures, return shapes, security model and grants are preserved.

CREATE OR REPLACE FUNCTION public.group_member_ratios(_group_id uuid, _period_key text)
 RETURNS TABLE(licensee_id uuid, ratio_key text, label text, display_format text, value numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (m.licensee_id, rm.code)
         m.licensee_id,
         rm.code AS ratio_key,
         rm.name AS label,
         CASE WHEN rm.unit = '%' THEN 'percent' ELSE 'number' END AS display_format,
         mv.value_numeric AS value
  FROM public.financial_group_members m
  JOIN public.return_filings rf ON rf.entity_id = m.licensee_id
  JOIN public.reporting_periods rp ON rp.id = rf.reporting_period_id
   AND rp.period_label = _period_key
  JOIN public.return_filing_versions rfv ON rfv.return_filing_id = rf.id
   AND rfv.status IN ('ACCEPTED', 'SUBMITTED', 'UNDER_REVIEW')
  JOIN public.return_metric_values mv ON mv.return_filing_version_id = rfv.id
   AND mv.source_kind = 'CALCULATED'
   AND COALESCE(mv.availability, 'AVAILABLE') = 'AVAILABLE'
   AND mv.value_numeric IS NOT NULL
  JOIN public.regulatory_metrics rm ON rm.id = mv.regulatory_metric_id
  WHERE m.group_id = _group_id
    AND m.consolidation_treatment <> 'excluded'
    AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
  ORDER BY m.licensee_id, rm.code,
           CASE WHEN rfv.status = 'ACCEPTED' THEN 0 ELSE 1 END,
           rfv.version_number DESC,
           COALESCE(mv.calculated_at, mv.recorded_at) DESC;
$function$;

CREATE OR REPLACE FUNCTION public.group_data_coverage(_group_id uuid, _period_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total int := 0;
  v_missing jsonb := '[]'::jsonb;
  v_missing_count int := 0;
BEGIN
  SELECT COUNT(*) INTO v_total
    FROM public.financial_group_members m
   WHERE m.group_id = _group_id AND m.consolidation_treatment <> 'excluded'
     AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'licensee_id', m.licensee_id,
           'name', l.name,
           'reason', 'no_return_data_for_period')), '[]'::jsonb),
         COUNT(*)
    INTO v_missing, v_missing_count
    FROM public.financial_group_members m
    JOIN public.licensees l ON l.id = m.licensee_id
   WHERE m.group_id = _group_id AND m.consolidation_treatment <> 'excluded'
     AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
     AND NOT EXISTS (
       SELECT 1
         FROM public.group_member_ratios(_group_id, _period_key) r
        WHERE r.licensee_id = m.licensee_id);

  RETURN jsonb_build_object(
    'members_total', v_total,
    'members_missing', v_missing_count,
    'members_with_data', GREATEST(v_total - v_missing_count, 0),
    'excluded_members', v_missing,
    'data_state', CASE
      WHEN v_total = 0 OR v_missing_count >= v_total THEN 'NO_GROUP_DATA'
      WHEN v_missing_count > 0 THEN 'PARTIAL_GROUP_DATA'
      ELSE 'COMPLETE_GROUP_DATA' END);
END $function$;
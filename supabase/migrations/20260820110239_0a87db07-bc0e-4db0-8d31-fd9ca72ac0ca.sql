CREATE OR REPLACE FUNCTION public.returns_filing_detail(_filing_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE f record; v_result jsonb; v_current uuid;
BEGIN
  SELECT * INTO f FROM public.return_filings WHERE id = _filing_id;
  IF f.id IS NULL THEN RAISE EXCEPTION 'Filing not found'; END IF;
  IF NOT (public.is_super_admin(auth.uid())
          OR public.has_permission(auth.uid(),'returns_management','view')
          OR public.entity_membership_capability(auth.uid(), f.entity_id, 'returns.view')) THEN
    RAISE EXCEPTION 'Not authorised to view this filing' USING ERRCODE='42501';
  END IF;

  SELECT ver.id INTO v_current
    FROM public.return_filing_versions ver
   WHERE ver.return_filing_id = f.id
   ORDER BY ver.version_number DESC LIMIT 1;

  SELECT jsonb_build_object(
    'filing', to_jsonb(f),
    'entity_name', (SELECT l.name FROM public.licensees l WHERE l.id = f.entity_id),
    'definition', (SELECT to_jsonb(d) FROM public.return_definitions d WHERE d.id = f.return_definition_id),
    'period', (SELECT to_jsonb(p) FROM public.reporting_periods p WHERE p.id = f.reporting_period_id),
    'versions', (SELECT COALESCE(jsonb_agg(to_jsonb(ver) ORDER BY ver.version_number DESC), '[]'::jsonb)
                   FROM public.return_filing_versions ver WHERE ver.return_filing_id = f.id),
    'forms', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'id', r.id, 'form_template_id', r.form_template_id,
                    'form_version_id', r.form_version_id, 'template_name', t.name,
                    'form_version', fv.version, 'is_required', r.is_required,
                    'sequence', r.sequence, 'tab_name', r.tab_name,
                    'form_response_id', r.form_response_id,
                    'completion_status', r.completion_status,
                    'return_filing_version_id', r.return_filing_version_id) ORDER BY r.sequence), '[]'::jsonb)
                 FROM public.return_filing_form_requirements r
                 LEFT JOIN public.form_templates t ON t.id = r.form_template_id
                 LEFT JOIN public.form_versions fv ON fv.id = r.form_version_id
                WHERE r.return_filing_version_id = v_current),
    'metrics', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'code', m.code, 'name', m.name, 'unit', m.unit,
                    'value_numeric', mv.value_numeric, 'value_text', mv.value_text,
                    'availability', mv.availability, 'availability_reason', mv.availability_reason,
                    'source_kind', mv.source_kind,
                    'calculation_inputs', mv.calculation_inputs) ORDER BY m.code), '[]'::jsonb)
                  FROM public.return_metric_values mv
                  JOIN public.regulatory_metrics m ON m.id = mv.regulatory_metric_id
                 WHERE mv.return_filing_version_id = v_current),
    'findings', (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.severity, r.detected_at), '[]'::jsonb)
                   FROM public.return_filing_validation_results r WHERE r.return_filing_id = f.id),
    'requests', (SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC), '[]'::jsonb)
                   FROM public.return_filing_requests q WHERE q.return_filing_id = f.id)
  ) INTO v_result;
  RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.returns_filing_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_filing_detail(uuid) TO authenticated;
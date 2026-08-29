CREATE OR REPLACE FUNCTION public.returns_open_filing(_period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p record; o record; d record; v_filing public.return_filings;
        v_version_id uuid; v_ref text; v_seq int;
BEGIN
  SELECT * INTO p FROM public.reporting_periods WHERE id = _period_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Reporting period not found'; END IF;
  SELECT * INTO o FROM public.entity_reporting_obligations WHERE id = p.entity_reporting_obligation_id;
  SELECT * INTO d FROM public.return_definitions WHERE id = o.return_definition_id;

  IF NOT public.returns_can_file_obligation(o.id) THEN
    RAISE EXCEPTION 'You are not authorised to file returns for this entity' USING ERRCODE='42501';
  END IF;
  IF o.status <> 'ACTIVE' THEN RAISE EXCEPTION 'This reporting obligation is not active'; END IF;
  IF p.status = 'WAIVED' THEN RAISE EXCEPTION 'This period has been waived'; END IF;

  SELECT * INTO v_filing FROM public.return_filings WHERE reporting_period_id = _period_id;
  IF v_filing.id IS NULL THEN
    SELECT count(*) + 1 INTO v_seq FROM public.return_filings WHERE entity_id = o.entity_id;
    v_ref := 'FIL-' || to_char(now(),'YYYY') || '-' || lpad(v_seq::text, 6, '0') || '-' ||
             substr(replace(gen_random_uuid()::text,'-',''), 1, 4);
    INSERT INTO public.return_filings(
      filing_reference, entity_id, entity_reporting_obligation_id, reporting_period_id,
      return_definition_id, status, created_by)
    VALUES (v_ref, o.entity_id, o.id, p.id, d.id, 'DRAFT', auth.uid())
    RETURNING * INTO v_filing;
  END IF;

  -- F7-B: snapshot the authoritative filing currency at the canonical open point.
  PERFORM public.returns_snapshot_filing_currency(v_filing.id);

  SELECT id INTO v_version_id FROM public.return_filing_versions
   WHERE return_filing_id = v_filing.id AND status IN ('DRAFT','CORRECTION_REQUESTED')
   ORDER BY version_number DESC LIMIT 1;

  IF v_version_id IS NULL THEN
    INSERT INTO public.return_filing_versions(return_filing_id, version_number, status)
    VALUES (v_filing.id,
      COALESCE((SELECT max(version_number) FROM public.return_filing_versions
                 WHERE return_filing_id = v_filing.id), 0) + 1, 'DRAFT')
    RETURNING id INTO v_version_id;

    UPDATE public.return_filings
       SET current_version_number = (SELECT max(version_number) FROM public.return_filing_versions
                                      WHERE return_filing_id = v_filing.id),
           status = CASE WHEN status = 'ACCEPTED' THEN status ELSE 'DRAFT' END,
           updated_at = now()
     WHERE id = v_filing.id;

    INSERT INTO public.return_filing_form_requirements(
      return_filing_version_id, form_template_id, form_version_id, is_required, sequence, tab_name)
    SELECT v_version_id, df.form_template_id, fv.id, df.is_required, df.sequence,
           COALESCE(df.tab_name, df.section_label)
      FROM public.return_definition_forms df
      JOIN LATERAL (
        SELECT v.id FROM public.form_versions v
         WHERE v.template_id = df.form_template_id AND v.status = 'published'
           AND (v.effective_from IS NULL OR v.effective_from::date <= p.period_end)
         ORDER BY v.version DESC LIMIT 1) fv ON true
     WHERE df.return_definition_id = d.id
       AND df.effective_from <= p.period_end
       AND (df.effective_to IS NULL OR df.effective_to >= p.period_end)
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM public.create_audit_log('return_filing', v_filing.id, 'OPEN',
    jsonb_build_object('version_id', v_version_id, 'period', p.period_label));

  RETURN jsonb_build_object('filing_id', v_filing.id, 'filing_reference', v_filing.filing_reference,
                            'version_id', v_version_id);
END $function$;

-- Backfill snapshots for filings opened before this change (deterministic, period-end based).
DO $$
DECLARE r record; v jsonb;
BEGIN
  FOR r IN SELECT fi.id, fi.entity_id, fi.return_definition_id, p.period_end,
                  (SELECT mc.id FROM public.monetary_configs mc
                    WHERE mc.regulator_id IS NOT DISTINCT FROM public.entity_reporting_regulator(fi.entity_id)
                      AND mc.is_active LIMIT 1) AS cfg_id
             FROM public.return_filings fi
             JOIN public.reporting_periods p ON p.id = fi.reporting_period_id
            WHERE fi.reporting_currency IS NULL
  LOOP
    BEGIN
      v := public.entity_reporting_currency_resolve(r.entity_id, r.period_end, r.return_definition_id);
      UPDATE public.return_filings
         SET reporting_currency = v->>'currency',
             currency_source = v->>'source',
             entity_currency_profile_id = NULLIF(v->>'entity_currency_profile_id','')::uuid,
             currency_as_of = r.period_end,
             monetary_config_id = NULLIF(v->>'monetary_config_id','')::uuid,
             currency_snapshot_at = now()
       WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- fail closed: leave unsnapshotted rather than guessing
    END;
  END LOOP;
END $$;
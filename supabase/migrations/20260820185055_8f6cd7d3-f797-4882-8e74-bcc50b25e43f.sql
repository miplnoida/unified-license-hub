DO $$
DECLARE
  s record;
  v_entity uuid;
  v_obl uuid;
  v_def uuid;
  v_period uuid;
  v_filing uuid;
  v_version uuid;
  v_car uuid;
  v_npl uuid;
BEGIN
  SELECT id INTO v_car FROM public.regulatory_metrics WHERE code = 'CAPITAL_ADEQUACY_RATIO';
  SELECT id INTO v_npl FROM public.regulatory_metrics WHERE code = 'NPL_RATIO';

  FOR s IN
    SELECT * FROM (VALUES
      ('Atlantic Commercial Bank Ltd',    'A2-S1', 1, DATE '2026-01-01', DATE '2026-03-31', 18.40::numeric, 3.10::numeric),
      ('Atlantic Commercial Bank Ltd',    'A2-S1', 2, DATE '2026-04-01', DATE '2026-06-30', 18.10, 3.30),
      ('Atlantic Commercial Bank Ltd',    'A2-S1', 3, DATE '2026-07-01', DATE '2026-09-30', 17.90, 3.20),
      ('Nevis Investment Management Ltd', 'A2-S2', 1, DATE '2026-01-01', DATE '2026-03-31', 16.00, 4.00),
      ('Nevis Investment Management Ltd', 'A2-S2', 2, DATE '2026-04-01', DATE '2026-06-30', 15.00, 4.20),
      ('Nevis Investment Management Ltd', 'A2-S2', 3, DATE '2026-07-01', DATE '2026-09-30', 11.50, 4.60),
      ('Federation Credit Finance Ltd',   'A2-S3', 1, DATE '2026-01-01', DATE '2026-03-31', 11.80, 6.20),
      ('Federation Credit Finance Ltd',   'A2-S3', 2, DATE '2026-04-01', DATE '2026-06-30',  8.50, 12.40),
      ('Federation Credit Finance Ltd',   'A2-S3', 3, DATE '2026-07-01', DATE '2026-09-30',  8.20, 13.10)
    ) AS t(entity_name, scenario, seq, period_start, period_end, car, npl)
    ORDER BY 1, 3
  LOOP
    SELECT l.id INTO v_entity FROM public.licensees l WHERE l.name = s.entity_name LIMIT 1;
    IF v_entity IS NULL THEN CONTINUE; END IF;

    SELECT f.entity_reporting_obligation_id, f.return_definition_id
      INTO v_obl, v_def
      FROM public.return_filings f
     WHERE f.entity_id = v_entity
       AND f.entity_reporting_obligation_id IS NOT NULL
     ORDER BY f.created_at DESC
     LIMIT 1;
    IF v_obl IS NULL THEN CONTINUE; END IF;

    SELECT id INTO v_period FROM public.reporting_periods
     WHERE entity_reporting_obligation_id = v_obl
       AND period_label = s.scenario || '-Q' || s.seq;

    IF v_period IS NULL THEN
      INSERT INTO public.reporting_periods
        (entity_reporting_obligation_id, period_label, period_start, period_end, due_date, status, opened_at)
      VALUES (v_obl, s.scenario || '-Q' || s.seq, s.period_start, s.period_end,
              s.period_end + 30, 'CLOSED', s.period_end)
      RETURNING id INTO v_period;
    END IF;

    SELECT id INTO v_filing FROM public.return_filings WHERE reporting_period_id = v_period LIMIT 1;
    IF v_filing IS NULL THEN
      INSERT INTO public.return_filings
        (filing_reference, entity_id, entity_reporting_obligation_id, reporting_period_id,
         return_definition_id, status, current_version_number, submitted_at)
      VALUES (s.scenario || '-' || to_char(s.period_end, 'YYYYMMDD'), v_entity, v_obl, v_period,
              v_def, 'SUBMITTED', 1, now())
      RETURNING id INTO v_filing;

      INSERT INTO public.return_filing_versions
        (return_filing_id, version_number, status, is_immutable, submitted_at)
      VALUES (v_filing, 1, 'SUBMITTED', true, now())
      RETURNING id INTO v_version;

      INSERT INTO public.return_metric_values
        (return_filing_version_id, entity_id, regulatory_metric_id, reporting_period_id,
         value_numeric, availability, source_kind, recorded_at)
      VALUES (v_version, v_entity, v_car, v_period, s.car, 'AVAILABLE', 'REPORTED', now()),
             (v_version, v_entity, v_npl, v_period, s.npl, 'AVAILABLE', 'REPORTED', now());

      UPDATE public.return_filing_versions
         SET status = 'ACCEPTED', accepted_at = now()
       WHERE id = v_version;

      UPDATE public.return_filings
         SET status = 'ACCEPTED', accepted_at = now(), accepted_version_id = v_version
       WHERE id = v_filing;
    END IF;
  END LOOP;
END $$;
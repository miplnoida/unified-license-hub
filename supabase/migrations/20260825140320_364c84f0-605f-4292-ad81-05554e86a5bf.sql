-- 1. Numeric-safe parser for form response values
CREATE OR REPLACE FUNCTION public.returns_parse_numeric(_raw text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE t text; neg boolean := false; n numeric;
BEGIN
  IF _raw IS NULL THEN RETURN NULL; END IF;
  t := btrim(_raw);
  IF t = '' THEN RETURN NULL; END IF;
  IF t LIKE '(%)' THEN neg := true; t := btrim(t, '()'); END IF;
  t := regexp_replace(t, '[^0-9.\-]', '', 'g');
  IF t = '' OR t = '-' OR t = '.' THEN RETURN NULL; END IF;
  BEGIN
    n := t::numeric;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN CASE WHEN neg THEN -n ELSE n END;
END $$;

-- 2. Configuration table
CREATE TABLE public.return_form_validation_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_template_id uuid NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
  rule_code text NOT NULL,
  label text NOT NULL,
  message_template text NOT NULL,
  expression text NOT NULL,
  lhs_field text NOT NULL,
  rhs_fields text[] NOT NULL,
  tolerance numeric NOT NULL DEFAULT 0.01,
  severity text NOT NULL DEFAULT 'ERROR' CHECK (severity IN ('ERROR','WARNING')),
  is_blocking boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_template_id, rule_code)
);

GRANT SELECT ON public.return_form_validation_rules TO authenticated;
GRANT ALL ON public.return_form_validation_rules TO service_role;

ALTER TABLE public.return_form_validation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rfvr_read_authenticated"
  ON public.return_form_validation_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "rfvr_manage_staff"
  ON public.return_form_validation_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_rfvr_updated_at
  BEFORE UPDATE ON public.return_form_validation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Seed the balance-sheet accounting equation for every balance sheet template
--    that exposes the three statutory totals.
WITH fv AS (
  SELECT DISTINCT ON (template_id) template_id, schema_snapshot
    FROM public.form_versions ORDER BY template_id, version DESC
), names AS (
  SELECT fv.template_id, array_agg(DISTINCT fld->>'fieldName') AS field_names
    FROM fv,
         jsonb_array_elements(CASE WHEN jsonb_typeof(fv.schema_snapshot) = 'array' THEN fv.schema_snapshot ELSE '[]'::jsonb END) s,
         jsonb_array_elements(COALESCE(s->'fields', '[]'::jsonb)) fld
   GROUP BY 1
)
INSERT INTO public.return_form_validation_rules(
  form_template_id, rule_code, label, message_template, expression, lhs_field, rhs_fields, tolerance)
SELECT n.template_id,
       'BALANCE_SHEET_EQUATION',
       'Balance sheet must balance',
       'The balance sheet does not balance. Total Assets is {lhs}, while Total Liabilities plus Total Capital Accounts is {rhs} — a difference of {diff}.',
       'line_1_col_1 = line_2_col_1 + line_3_col_1',
       'line_1_col_1',
       ARRAY['line_2_col_1','line_3_col_1'],
       0.01
  FROM names n
 WHERE n.field_names @> ARRAY['line_1_col_1','line_2_col_1','line_3_col_1']
ON CONFLICT (form_template_id, rule_code) DO NOTHING;

-- 4. Extend validation to evaluate configured financial rules
CREATE OR REPLACE FUNCTION public.returns_validate_filing(_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v record; v_errors int; v_warnings int;
BEGIN
  SELECT v2.id, v2.return_filing_id, f.entity_id INTO v
    FROM public.return_filing_versions v2
    JOIN public.return_filings f ON f.id = v2.return_filing_id
   WHERE v2.id = _version_id;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Filing version not found'; END IF;

  DELETE FROM public.return_filing_validation_results WHERE return_filing_version_id = _version_id;

  INSERT INTO public.return_filing_validation_results(
    return_filing_id, return_filing_version_id, severity, rule_code, scope,
    form_template_id, message, is_blocking)
  SELECT v.return_filing_id, _version_id, 'ERROR', 'REQUIRED_FORM_INCOMPLETE', 'FORM',
         r.form_template_id,
         'A required part of this return has not been completed: ' || COALESCE(t.name, 'form'), true
    FROM public.return_filing_form_requirements r
    LEFT JOIN public.form_templates t ON t.id = r.form_template_id
   WHERE r.return_filing_version_id = _version_id
     AND r.is_required AND (r.form_response_id IS NULL OR r.completion_status <> 'COMPLETED');

  -- Configured financial rules (e.g. balance sheet accounting equation)
  INSERT INTO public.return_filing_validation_results(
    return_filing_id, return_filing_version_id, severity, rule_code, scope,
    form_template_id, message, is_blocking)
  SELECT v.return_filing_id, _version_id, e.severity, e.rule_code, 'FORM',
         e.form_template_id,
         replace(replace(replace(e.message_template,
           '{lhs}', to_char(e.lhs, 'FM999,999,999,999,990.00')),
           '{rhs}', to_char(e.rhs, 'FM999,999,999,999,990.00')),
           '{diff}', to_char(abs(e.lhs - e.rhs), 'FM999,999,999,999,990.00')),
         e.is_blocking
    FROM (
      SELECT rule.rule_code, rule.severity, rule.is_blocking, rule.message_template,
             r.form_template_id,
             COALESCE(public.returns_parse_numeric(resp.response_data->>rule.lhs_field), 0) AS lhs,
             COALESCE((
               SELECT sum(COALESCE(public.returns_parse_numeric(resp.response_data->>fk), 0))
                 FROM unnest(rule.rhs_fields) AS fk
             ), 0) AS rhs,
             rule.tolerance
        FROM public.return_filing_form_requirements r
        JOIN public.return_form_validation_rules rule
          ON rule.form_template_id = r.form_template_id AND rule.is_active
        JOIN public.form_responses resp ON resp.id = r.form_response_id
       WHERE r.return_filing_version_id = _version_id
    ) e
   WHERE abs(e.lhs - e.rhs) > e.tolerance;

  INSERT INTO public.return_filing_validation_results(
    return_filing_id, return_filing_version_id, severity, rule_code, scope,
    regulatory_metric_id, message, is_blocking)
  SELECT v.return_filing_id, _version_id, 'WARNING', 'METRIC_NOT_AVAILABLE', 'METRIC',
         mv.regulatory_metric_id,
         'A measurement could not be determined for this period: ' || m.name, false
    FROM public.return_metric_values mv
    JOIN public.regulatory_metrics m ON m.id = mv.regulatory_metric_id
   WHERE mv.return_filing_version_id = _version_id AND mv.availability <> 'AVAILABLE';

  SELECT count(*) FILTER (WHERE severity = 'ERROR'), count(*) FILTER (WHERE severity = 'WARNING')
    INTO v_errors, v_warnings
    FROM public.return_filing_validation_results WHERE return_filing_version_id = _version_id;

  RETURN jsonb_build_object('errors', v_errors, 'warnings', v_warnings,
                            'can_submit', v_errors = 0);
END $function$;
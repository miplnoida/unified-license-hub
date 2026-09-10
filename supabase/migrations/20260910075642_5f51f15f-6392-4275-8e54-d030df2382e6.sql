CREATE OR REPLACE FUNCTION public.supervisory_export_text_safe(_v text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $fn$
  SELECT CASE
           WHEN _v IS NULL THEN NULL
           WHEN left(_v, 1) IN ('=', '+', '-', '@', E'\t', E'\r') THEN '''' || _v
           ELSE _v
         END;
$fn$;

COMMENT ON FUNCTION public.supervisory_export_text_safe(text) IS
  'AML-10: neutralises spreadsheet-formula lead characters in exported text so a governed export can never produce an executable cell.';

CREATE OR REPLACE FUNCTION public.supervisory_portfolio_export(_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _r jsonb;
  _actor text;
  _rows jsonb := '[]'::jsonb;
  _row jsonb;
  _k text;
  _safe jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_super_admin(_uid) OR public.has_any_permission(_uid,
      ARRAY['aml_supervision.view','supervisory_spine.view'])) THEN
    RAISE EXCEPTION 'not_authorized: supervisory view authority is required' USING ERRCODE = '42501';
  END IF;

  _r := public.supervisory_portfolio_internal(_payload);

  SELECT COALESCE(p.full_name, u.email, _uid::text) INTO _actor
    FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE u.id = _uid;

  FOR _row IN SELECT r FROM jsonb_array_elements(COALESCE(_r->'entities','[]'::jsonb)) r LOOP
    _safe := _row;
    FOR _k IN SELECT jsonb_object_keys(_row) LOOP
      IF jsonb_typeof(_row->_k) = 'string' THEN
        _safe := jsonb_set(_safe, ARRAY[_k],
                   to_jsonb(public.supervisory_export_text_safe(_row->>_k)));
      END IF;
    END LOOP;
    _rows := _rows || jsonb_build_array(_safe);
  END LOOP;

  RETURN jsonb_build_object(
    'report_title','AML/CFT portfolio risk and management report',
    'domain_code', _r->>'domain_code',
    'regulator_id', _r->'summary'->>'regulator_id',
    'generated_by', COALESCE(_actor, _uid::text),
    'generated_by_id', _uid,
    'generated_at', _r->>'generated_at',
    'as_of', _r->>'as_of',
    'filters', _r->'filters',
    'summary', _r->'summary',
    'risk_distribution', _r->'risk_distribution',
    'review_distribution', _r->'review_distribution',
    'trends', _r->'trends',
    'entities', _rows,
    'row_count', _r->'row_count',
    'truncated', _r->'truncated',
    'csv_injection_neutralised', true,
    'notes', _r->'notes');
END $fn$;

REVOKE ALL ON FUNCTION public.supervisory_portfolio_export(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_portfolio_export(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.supervisory_export_text_safe(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_export_text_safe(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.supervisory_portfolio_export(jsonb) IS
  'AML-10: governed AML/CFT portfolio management export. Uses the same server read model as the screen, records the requesting actor and neutralises spreadsheet-formula text.';
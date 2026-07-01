
ALTER TABLE public.return_validation_rules ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.prudential_ratios ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.prudential_thresholds
  ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS effective_from date NOT NULL DEFAULT current_date,
  ADD COLUMN IF NOT EXISTS effective_to date,
  ADD COLUMN IF NOT EXISTS sector_id uuid,
  ADD COLUMN IF NOT EXISTS return_type_id uuid;
ALTER TABLE public.return_calculated_ratios
  ADD COLUMN IF NOT EXISTS ratio_version integer,
  ADD COLUMN IF NOT EXISTS formula_snapshot text;
ALTER TABLE public.return_threshold_breaches
  ADD COLUMN IF NOT EXISTS risk_level text CHECK (risk_level IN ('green','amber','red')),
  ADD COLUMN IF NOT EXISTS threshold_version integer;
ALTER TABLE public.returns_filed ADD COLUMN IF NOT EXISTS latest_validation_batch_id uuid;

CREATE TABLE IF NOT EXISTS public.return_validation_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.return_validation_rules(id) ON DELETE CASCADE,
  version integer NOT NULL,
  definition jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid,
  is_current boolean NOT NULL DEFAULT true,
  UNIQUE (rule_id, version)
);
GRANT SELECT ON public.return_validation_rule_versions TO authenticated;
GRANT ALL ON public.return_validation_rule_versions TO service_role;
ALTER TABLE public.return_validation_rule_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read rule versions" ON public.return_validation_rule_versions;
CREATE POLICY "auth read rule versions" ON public.return_validation_rule_versions FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.prudential_threshold_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  threshold_id uuid NOT NULL REFERENCES public.prudential_thresholds(id) ON DELETE CASCADE,
  version integer NOT NULL,
  warn_value numeric, breach_value numeric, upper_value numeric,
  comparator text NOT NULL, unit text,
  effective_from date NOT NULL, effective_to date,
  published_at timestamptz NOT NULL DEFAULT now(), published_by uuid,
  UNIQUE (threshold_id, version)
);
GRANT SELECT ON public.prudential_threshold_versions TO authenticated;
GRANT ALL ON public.prudential_threshold_versions TO service_role;
ALTER TABLE public.prudential_threshold_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read threshold versions" ON public.prudential_threshold_versions;
CREATE POLICY "auth read threshold versions" ON public.prudential_threshold_versions FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.prudential_ratio_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ratio_id uuid NOT NULL REFERENCES public.prudential_ratios(id) ON DELETE CASCADE,
  version integer NOT NULL,
  formula text NOT NULL, display_format text,
  effective_from date NOT NULL DEFAULT current_date,
  published_at timestamptz NOT NULL DEFAULT now(), published_by uuid,
  UNIQUE (ratio_id, version)
);
GRANT SELECT ON public.prudential_ratio_versions TO authenticated;
GRANT ALL ON public.prudential_ratio_versions TO service_role;
ALTER TABLE public.prudential_ratio_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read ratio versions" ON public.prudential_ratio_versions;
CREATE POLICY "auth read ratio versions" ON public.prudential_ratio_versions FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.return_validation_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  return_id uuid NOT NULL,
  rule_id uuid, rule_version integer, rule_name text,
  severity text NOT NULL, passed boolean NOT NULL,
  message text, context text NOT NULL DEFAULT 'submit',
  executed_at timestamptz NOT NULL DEFAULT now(), executed_by uuid
);
CREATE INDEX IF NOT EXISTS idx_val_run_log_return ON public.return_validation_run_log(return_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_val_run_log_batch ON public.return_validation_run_log(batch_id);
GRANT SELECT ON public.return_validation_run_log TO authenticated;
GRANT ALL ON public.return_validation_run_log TO service_role;
ALTER TABLE public.return_validation_run_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read run log" ON public.return_validation_run_log;
CREATE POLICY "auth read run log" ON public.return_validation_run_log FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.prudential_appendonly_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' THEN RETURN COALESCE(NEW, OLD); END IF;
  RAISE EXCEPTION 'Table % is append-only', TG_TABLE_NAME;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='rvrv_appendonly') THEN
    CREATE TRIGGER rvrv_appendonly BEFORE UPDATE OR DELETE ON public.return_validation_rule_versions
      FOR EACH ROW EXECUTE FUNCTION public.prudential_appendonly_guard(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='ptv_appendonly') THEN
    CREATE TRIGGER ptv_appendonly BEFORE UPDATE OR DELETE ON public.prudential_threshold_versions
      FOR EACH ROW EXECUTE FUNCTION public.prudential_appendonly_guard(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='prv_appendonly') THEN
    CREATE TRIGGER prv_appendonly BEFORE UPDATE OR DELETE ON public.prudential_ratio_versions
      FOR EACH ROW EXECUTE FUNCTION public.prudential_appendonly_guard(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='rvrl_appendonly') THEN
    CREATE TRIGGER rvrl_appendonly BEFORE UPDATE OR DELETE ON public.return_validation_run_log
      FOR EACH ROW EXECUTE FUNCTION public.prudential_appendonly_guard(); END IF;
END $$;

CREATE OR REPLACE FUNCTION public.publish_validation_rule(_rule_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _next integer; _def jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.return_validation_rule_versions SET is_current = false WHERE rule_id = _rule_id;
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.return_validation_rule_versions WHERE rule_id = _rule_id;
  SELECT to_jsonb(r.*) INTO _def FROM public.return_validation_rules r WHERE r.id = _rule_id;
  INSERT INTO public.return_validation_rule_versions(rule_id, version, definition, published_by, is_current)
    VALUES (_rule_id, _next, _def, auth.uid(), true);
  UPDATE public.return_validation_rules SET current_version = _next, updated_at = now() WHERE id = _rule_id;
  PERFORM public.log_compliance_audit('UPDATE','return_validation_rules', _rule_id, NULL, _def, 'Rule published', NULL, NULL, jsonb_build_object('version',_next,'event','RULE_PUBLISHED'));
  RETURN _next;
END $$;
GRANT EXECUTE ON FUNCTION public.publish_validation_rule(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_prudential_threshold(_threshold_id uuid, _effective_from date DEFAULT current_date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _next integer; _row public.prudential_thresholds;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.prudential_threshold_versions SET effective_to = _effective_from - 1
    WHERE threshold_id = _threshold_id AND effective_to IS NULL;
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.prudential_threshold_versions WHERE threshold_id = _threshold_id;
  SELECT * INTO _row FROM public.prudential_thresholds WHERE id = _threshold_id;
  INSERT INTO public.prudential_threshold_versions(threshold_id, version, warn_value, breach_value, upper_value, comparator, unit, effective_from, published_by)
    VALUES (_threshold_id, _next, _row.warn_value, _row.breach_value, _row.upper_value, _row.comparator, _row.unit, _effective_from, auth.uid());
  UPDATE public.prudential_thresholds SET current_version = _next, effective_from = _effective_from, updated_at = now() WHERE id = _threshold_id;
  PERFORM public.log_compliance_audit('UPDATE','prudential_thresholds', _threshold_id, NULL, to_jsonb(_row), 'Threshold published', NULL, NULL, jsonb_build_object('version',_next,'event','THRESHOLD_PUBLISHED'));
  RETURN _next;
END $$;
GRANT EXECUTE ON FUNCTION public.publish_prudential_threshold(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_prudential_ratio(_ratio_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _next integer; _row public.prudential_ratios;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.prudential_ratio_versions WHERE ratio_id = _ratio_id;
  SELECT * INTO _row FROM public.prudential_ratios WHERE id = _ratio_id;
  INSERT INTO public.prudential_ratio_versions(ratio_id, version, formula, display_format, published_by)
    VALUES (_ratio_id, _next, _row.formula, _row.display_format, auth.uid());
  UPDATE public.prudential_ratios SET current_version = _next, updated_at = now() WHERE id = _ratio_id;
  PERFORM public.log_compliance_audit('UPDATE','prudential_ratios', _ratio_id, NULL, to_jsonb(_row), 'Ratio published', NULL, NULL, jsonb_build_object('version',_next,'event','RATIO_PUBLISHED'));
  RETURN _next;
END $$;
GRANT EXECUTE ON FUNCTION public.publish_prudential_ratio(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_validation_run(_return_id uuid, _results jsonb, _context text DEFAULT 'submit')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _batch uuid := gen_random_uuid(); _r jsonb;
BEGIN
  FOR _r IN SELECT jsonb_array_elements(_results) LOOP
    INSERT INTO public.return_validation_run_log(batch_id, return_id, rule_id, rule_version, rule_name, severity, passed, message, context, executed_by)
    VALUES (_batch, _return_id, NULLIF(_r->>'rule_id','')::uuid, NULLIF(_r->>'rule_version','')::int,
            _r->>'rule_name', COALESCE(_r->>'severity','error'), COALESCE((_r->>'passed')::boolean, false),
            _r->>'message', _context, auth.uid());
  END LOOP;
  UPDATE public.returns_filed SET latest_validation_batch_id = _batch WHERE id = _return_id;
  PERFORM public.log_compliance_audit('UPDATE','returns_filed', _return_id, NULL,
    jsonb_build_object('batch_id',_batch,'count',jsonb_array_length(_results)),
    'Validation executed', NULL, NULL, jsonb_build_object('event','RETURN_VALIDATED','context',_context));
  RETURN _batch;
END $$;
GRANT EXECUTE ON FUNCTION public.log_validation_run(uuid, jsonb, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_effective_threshold(_return_config_id uuid, _metric_key text, _as_of date DEFAULT current_date, _sector_id uuid DEFAULT NULL, _return_type_id uuid DEFAULT NULL)
RETURNS SETOF public.prudential_thresholds
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.prudential_thresholds t
   WHERE t.metric_key = _metric_key AND t.is_active = true
     AND (t.return_config_id = _return_config_id OR t.return_config_id IS NULL)
     AND (t.sector_id IS NULL OR t.sector_id = _sector_id)
     AND (t.return_type_id IS NULL OR t.return_type_id = _return_type_id)
     AND t.effective_from <= _as_of
     AND (t.effective_to IS NULL OR t.effective_to >= _as_of)
   ORDER BY (t.return_config_id = _return_config_id) DESC,
            (t.sector_id = _sector_id) DESC,
            (t.return_type_id = _return_type_id) DESC,
            t.effective_from DESC
   LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_effective_threshold(uuid, text, date, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.classify_ratio_risk(_value numeric, _warn numeric, _breach numeric, _comparator text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _value IS NULL THEN 'green'
    WHEN _comparator IN ('>=','>') THEN
      CASE WHEN _breach IS NOT NULL AND _value >= _breach THEN 'red'
           WHEN _warn IS NOT NULL AND _value >= _warn THEN 'amber' ELSE 'green' END
    WHEN _comparator IN ('<=','<') THEN
      CASE WHEN _breach IS NOT NULL AND _value <= _breach THEN 'red'
           WHEN _warn IS NOT NULL AND _value <= _warn THEN 'amber' ELSE 'green' END
    ELSE 'green' END;
$$;
GRANT EXECUTE ON FUNCTION public.classify_ratio_risk(numeric, numeric, numeric, text) TO authenticated, service_role;

INSERT INTO public.notification_event_configs (event_key, description, notification_type, channels, is_active)
SELECT * FROM (VALUES
  ('return.validation_failed','Validation errors detected on return submission','warning', ARRAY['in_app','email']::text[], true),
  ('return.validation_passed','All validation rules passed','info', ARRAY['in_app']::text[], true),
  ('return.submitted','A return has been submitted','info', ARRAY['in_app','email']::text[], true),
  ('return.approved','A return has been approved','success', ARRAY['in_app','email']::text[], true),
  ('return.rejected','A return has been rejected','warning', ARRAY['in_app','email']::text[], true),
  ('return.resubmission_requested','Resubmission required','warning', ARRAY['in_app','email']::text[], true),
  ('return.overdue','A return is past its due date','warning', ARRAY['in_app','email']::text[], true),
  ('return.breach_warning','A ratio has crossed the warn threshold','warning', ARRAY['in_app','email']::text[], true),
  ('return.breach_critical','A ratio has crossed the breach threshold','critical', ARRAY['in_app','email']::text[], true)
) AS v(event_key, description, notification_type, channels, is_active)
WHERE NOT EXISTS (SELECT 1 FROM public.notification_event_configs c WHERE c.event_key = v.event_key);

INSERT INTO public.return_validation_rule_versions(rule_id, version, definition, published_by, is_current)
SELECT r.id, 1, to_jsonb(r.*), r.created_by, true FROM public.return_validation_rules r
WHERE NOT EXISTS (SELECT 1 FROM public.return_validation_rule_versions v WHERE v.rule_id = r.id);

INSERT INTO public.prudential_ratio_versions(ratio_id, version, formula, display_format, published_by)
SELECT p.id, 1, p.formula, p.display_format, NULL FROM public.prudential_ratios p
WHERE NOT EXISTS (SELECT 1 FROM public.prudential_ratio_versions v WHERE v.ratio_id = p.id);

INSERT INTO public.prudential_threshold_versions(threshold_id, version, warn_value, breach_value, upper_value, comparator, unit, effective_from, published_by)
SELECT t.id, 1, t.warn_value, t.breach_value, t.upper_value, t.comparator, t.unit, COALESCE(t.effective_from, current_date), NULL FROM public.prudential_thresholds t
WHERE NOT EXISTS (SELECT 1 FROM public.prudential_threshold_versions v WHERE v.threshold_id = t.id);

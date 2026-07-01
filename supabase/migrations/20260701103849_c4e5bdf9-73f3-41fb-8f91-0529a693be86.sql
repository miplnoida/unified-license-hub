
-- Tables (same as prior attempt)
CREATE TABLE IF NOT EXISTS public.return_validation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_config_id uuid NOT NULL REFERENCES public.return_configurations(id) ON DELETE CASCADE,
  form_id uuid NULL,
  scope text NOT NULL CHECK (scope IN ('field','cross_field','cross_form')),
  rule_type text NOT NULL CHECK (rule_type IN ('range','comparison','pattern','expression','required_if')),
  name text NOT NULL,
  expression text NOT NULL,
  severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('error','warning')),
  error_message text NOT NULL,
  field_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.return_validation_rules TO authenticated;
GRANT ALL ON public.return_validation_rules TO service_role;
ALTER TABLE public.return_validation_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='return_validation_rules' AND policyname='admins manage validation rules') THEN
    CREATE POLICY "admins manage validation rules" ON public.return_validation_rules
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
      WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='return_validation_rules' AND policyname='authenticated read active validation rules') THEN
    CREATE POLICY "authenticated read active validation rules" ON public.return_validation_rules
      FOR SELECT TO authenticated USING (is_active = true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_rvr_config ON public.return_validation_rules(return_config_id);

CREATE TABLE IF NOT EXISTS public.prudential_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_config_id uuid NOT NULL REFERENCES public.return_configurations(id) ON DELETE CASCADE,
  metric_key text NOT NULL, label text NOT NULL,
  comparator text NOT NULL CHECK (comparator IN ('>=','<=','between')),
  warn_value numeric NULL, breach_value numeric NULL, upper_value numeric NULL, unit text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (return_config_id, metric_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prudential_thresholds TO authenticated;
GRANT ALL ON public.prudential_thresholds TO service_role;
ALTER TABLE public.prudential_thresholds ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='prudential_thresholds' AND policyname='admins manage thresholds') THEN
    CREATE POLICY "admins manage thresholds" ON public.prudential_thresholds
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
      WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='prudential_thresholds' AND policyname='authenticated read thresholds') THEN
    CREATE POLICY "authenticated read thresholds" ON public.prudential_thresholds
      FOR SELECT TO authenticated USING (is_active = true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_pt_config ON public.prudential_thresholds(return_config_id);

CREATE TABLE IF NOT EXISTS public.prudential_ratios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_config_id uuid NOT NULL REFERENCES public.return_configurations(id) ON DELETE CASCADE,
  ratio_key text NOT NULL, label text NOT NULL, formula text NOT NULL,
  display_format text NOT NULL DEFAULT 'decimal' CHECK (display_format IN ('decimal','percent','currency','ratio')),
  metric_key text NULL, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (return_config_id, ratio_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prudential_ratios TO authenticated;
GRANT ALL ON public.prudential_ratios TO service_role;
ALTER TABLE public.prudential_ratios ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='prudential_ratios' AND policyname='admins manage ratios') THEN
    CREATE POLICY "admins manage ratios" ON public.prudential_ratios
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
      WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='prudential_ratios' AND policyname='authenticated read ratios') THEN
    CREATE POLICY "authenticated read ratios" ON public.prudential_ratios
      FOR SELECT TO authenticated USING (is_active = true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_pr_config ON public.prudential_ratios(return_config_id);

CREATE TABLE IF NOT EXISTS public.return_calculated_ratios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL, return_config_id uuid NULL,
  ratio_key text NOT NULL, label text NULL, value numeric NULL, display_format text NULL,
  computed_at timestamptz NOT NULL DEFAULT now(), computed_by uuid NULL
);
GRANT SELECT ON public.return_calculated_ratios TO authenticated;
GRANT ALL ON public.return_calculated_ratios TO service_role;
ALTER TABLE public.return_calculated_ratios ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='return_calculated_ratios' AND policyname='authenticated read calculated ratios') THEN
    CREATE POLICY "authenticated read calculated ratios" ON public.return_calculated_ratios FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_rcr_return ON public.return_calculated_ratios(return_id, computed_at DESC);

CREATE TABLE IF NOT EXISTS public.return_threshold_breaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL, return_config_id uuid NULL,
  metric_key text NOT NULL, level text NOT NULL CHECK (level IN ('warn','breach')),
  value numeric NULL, threshold_value numeric NULL, comparator text NULL,
  detected_at timestamptz NOT NULL DEFAULT now(), notified boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.return_threshold_breaches TO authenticated;
GRANT ALL ON public.return_threshold_breaches TO service_role;
ALTER TABLE public.return_threshold_breaches ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='return_threshold_breaches' AND policyname='authenticated read breaches') THEN
    CREATE POLICY "authenticated read breaches" ON public.return_threshold_breaches FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_rtb_return ON public.return_threshold_breaches(return_id, detected_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'tg_prevent_audit_mutation') THEN
    CREATE FUNCTION public.tg_prevent_audit_mutation() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
    AS $f$
    BEGIN
      IF current_setting('role', true) IN ('service_role') THEN RETURN COALESCE(NEW, OLD); END IF;
      RAISE EXCEPTION 'Records are immutable';
    END; $f$;
  END IF;
END $$;
DROP TRIGGER IF EXISTS tg_rcr_no_update ON public.return_calculated_ratios;
CREATE TRIGGER tg_rcr_no_update BEFORE UPDATE OR DELETE ON public.return_calculated_ratios
  FOR EACH ROW EXECUTE FUNCTION public.tg_prevent_audit_mutation();
DROP TRIGGER IF EXISTS tg_rtb_no_update ON public.return_threshold_breaches;
CREATE TRIGGER tg_rtb_no_update BEFORE UPDATE OR DELETE ON public.return_threshold_breaches
  FOR EACH ROW EXECUTE FUNCTION public.tg_prevent_audit_mutation();

-- RPCs
CREATE OR REPLACE FUNCTION public.evaluate_return_validations(_return_id uuid, _form_data jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cfg uuid; v_rules jsonb;
BEGIN
  SELECT rf.return_configuration_id INTO v_cfg FROM public.returns_filed rf WHERE rf.id = _return_id;
  IF v_cfg IS NULL THEN
    RETURN jsonb_build_object('return_id', _return_id, 'rules', '[]'::jsonb, 'form_data', COALESCE(_form_data,'{}'::jsonb));
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.severity DESC, r.name), '[]'::jsonb)
  INTO v_rules FROM public.return_validation_rules r
  WHERE r.return_config_id = v_cfg AND r.is_active = true;
  RETURN jsonb_build_object('return_id', _return_id, 'return_config_id', v_cfg, 'rules', v_rules, 'form_data', COALESCE(_form_data,'{}'::jsonb));
END; $$;
REVOKE ALL ON FUNCTION public.evaluate_return_validations(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.evaluate_return_validations(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recompute_return_ratios(_return_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cfg uuid; v_ratios jsonb; v_data jsonb;
BEGIN
  SELECT rf.return_configuration_id INTO v_cfg FROM public.returns_filed rf WHERE rf.id = _return_id;
  SELECT COALESCE(jsonb_object_agg(rfd.form_template_id::text, rfd.form_data), '{}'::jsonb)
  INTO v_data FROM public.return_form_data rfd WHERE rfd.return_id = _return_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.label), '[]'::jsonb)
  INTO v_ratios FROM public.prudential_ratios r WHERE r.return_config_id = v_cfg AND r.is_active = true;
  RETURN jsonb_build_object('return_id', _return_id, 'return_config_id', v_cfg, 'ratios', v_ratios, 'form_data', v_data);
END; $$;
REVOKE ALL ON FUNCTION public.recompute_return_ratios(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.recompute_return_ratios(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_return_ratio(
  _return_id uuid, _ratio_key text, _label text, _value numeric, _display_format text, _computed_by uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_cfg uuid;
BEGIN
  SELECT return_configuration_id INTO v_cfg FROM public.returns_filed WHERE id = _return_id;
  INSERT INTO public.return_calculated_ratios(return_id, return_config_id, ratio_key, label, value, display_format, computed_by)
  VALUES (_return_id, v_cfg, _ratio_key, _label, _value, _display_format, COALESCE(_computed_by, auth.uid()))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.record_return_ratio(uuid,text,text,numeric,text,uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.record_return_ratio(uuid,text,text,numeric,text,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_return_breach(
  _return_id uuid, _metric_key text, _level text, _value numeric, _threshold_value numeric, _comparator text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_cfg uuid;
BEGIN
  SELECT return_configuration_id INTO v_cfg FROM public.returns_filed WHERE id = _return_id;
  INSERT INTO public.return_threshold_breaches(return_id, return_config_id, metric_key, level, value, threshold_value, comparator)
  VALUES (_return_id, v_cfg, _metric_key, _level, _value, _threshold_value, _comparator)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.record_return_breach(uuid,text,text,numeric,numeric,text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_return_breach(uuid,text,text,numeric,numeric,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.peer_ratio_snapshot(_period_end date, _ratio_key text, _sector_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  WITH latest AS (
    SELECT DISTINCT ON (rcr.return_id) rcr.return_id, rcr.value, rf.licensee_id, rf.period_end
    FROM public.return_calculated_ratios rcr
    JOIN public.returns_filed rf ON rf.id = rcr.return_id
    WHERE rcr.ratio_key = _ratio_key AND rf.period_end = _period_end
    ORDER BY rcr.return_id, rcr.computed_at DESC
  )
  SELECT jsonb_build_object(
    'ratio_key', _ratio_key, 'period_end', _period_end,
    'count', COUNT(*), 'min', MIN(value),
    'median', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value),
    'p90', PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY value),
    'max', MAX(value)
  ) INTO v FROM latest;
  RETURN COALESCE(v, jsonb_build_object('ratio_key', _ratio_key, 'period_end', _period_end, 'count', 0));
END; $$;
REVOKE ALL ON FUNCTION public.peer_ratio_snapshot(date,text,uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.peer_ratio_snapshot(date,text,uuid) TO authenticated, service_role;

-- Notification event seeds with required template fields
INSERT INTO public.notification_event_configs
  (event_key, description, title_template, message_template, email_subject_template, email_body_template, channels, is_active)
VALUES
  ('return.validation_failed','Return validation failed','Return validation failed','Your return {{return_id}} failed validation. Please review errors.','Return validation failed','Your return {{return_id}} failed validation with {{error_count}} errors.',ARRAY['in_app','email']::text[],true),
  ('return.validation_passed','Return validation passed','Return validation passed','Your return {{return_id}} passed validation.','Return validation passed','Your return {{return_id}} passed validation.',ARRAY['in_app']::text[],true),
  ('return.submitted','Return submitted','Return submitted','Return {{return_id}} has been submitted for review.','Return submitted','Return {{return_id}} has been submitted for review.',ARRAY['in_app','email']::text[],true),
  ('return.approved','Return approved','Return approved','Return {{return_id}} has been approved.','Return approved','Return {{return_id}} has been approved.',ARRAY['in_app','email']::text[],true),
  ('return.rejected','Return rejected','Return rejected','Return {{return_id}} was rejected. {{reason}}','Return rejected','Return {{return_id}} was rejected. Reason: {{reason}}',ARRAY['in_app','email']::text[],true),
  ('return.overdue','Return overdue','Return overdue','Return {{return_id}} is overdue (due {{due_date}}).','Return overdue','Return {{return_id}} is overdue. Due date: {{due_date}}.',ARRAY['in_app','email']::text[],true),
  ('return.breach_warning','Prudential warning','Prudential warning: {{metric_key}}','Return {{return_id}} triggered a warning on {{metric_key}} ({{value}} vs {{threshold_value}}).','Prudential warning: {{metric_key}}','Return {{return_id}} triggered a warning threshold on {{metric_key}}. Value: {{value}}, threshold: {{threshold_value}}.',ARRAY['in_app','email']::text[],true),
  ('return.breach_critical','Prudential breach','Prudential breach: {{metric_key}}','Return {{return_id}} breached {{metric_key}} ({{value}} vs {{threshold_value}}).','Prudential breach: {{metric_key}}','Return {{return_id}} breached {{metric_key}}. Value: {{value}}, threshold: {{threshold_value}}.',ARRAY['in_app','email']::text[],true)
ON CONFLICT (event_key) DO NOTHING;

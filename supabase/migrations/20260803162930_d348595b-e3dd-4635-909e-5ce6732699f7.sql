
-- ============ Unified Rule Engine (ADM-RE-001/002/003) ============

CREATE SEQUENCE IF NOT EXISTS public.engine_rule_code_seq;

CREATE TABLE public.engine_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code text NOT NULL UNIQUE DEFAULT ('RULE-' || lpad(nextval('public.engine_rule_code_seq')::text, 6, '0')),
  name text NOT NULL,
  description text,
  rule_type text NOT NULL,
  module text NOT NULL,
  sub_module text,
  tags text[] NOT NULL DEFAULT '{}',
  severity text NOT NULL DEFAULT 'medium',
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  suppression_days integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  last_triggered_at timestamptz,
  trigger_count integer NOT NULL DEFAULT 0,
  deactivation_reason text,
  activated_at timestamptz,
  activated_by uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engine_rules_status_chk CHECK (status IN ('draft','active','inactive')),
  CONSTRAINT engine_rules_severity_chk CHECK (severity IN ('low','medium','high','critical')),
  CONSTRAINT engine_rules_type_chk CHECK (rule_type IN (
    'threshold','trend','peer_comparison','pattern_detection','cross_field_validation',
    'routing','sla','condition_monitoring','recurrence','scheduling','macro_overlay','group_contagion'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_rules TO authenticated;
GRANT ALL ON public.engine_rules TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.engine_rule_code_seq TO authenticated, service_role;
ALTER TABLE public.engine_rules ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.engine_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.engine_rules(id) ON DELETE CASCADE,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_id, version)
);
GRANT SELECT, INSERT ON public.engine_rule_versions TO authenticated;
GRANT ALL ON public.engine_rule_versions TO service_role;
ALTER TABLE public.engine_rule_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.engine_rule_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.engine_rules(id) ON DELETE CASCADE,
  version integer NOT NULL,
  passed boolean NOT NULL DEFAULT false,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  evaluated_count integer NOT NULL DEFAULT 0,
  matched_count integer NOT NULL DEFAULT 0,
  error text,
  run_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.engine_rule_tests TO authenticated;
GRANT ALL ON public.engine_rule_tests TO service_role;
ALTER TABLE public.engine_rule_tests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.engine_rule_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.engine_rules(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  run_mode text NOT NULL DEFAULT 'scheduled',
  entity_id uuid,
  entity_label text,
  matched boolean NOT NULL DEFAULT false,
  suppressed boolean NOT NULL DEFAULT false,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  actions_taken jsonb NOT NULL DEFAULT '[]'::jsonb,
  executed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX engine_rule_executions_rule_idx ON public.engine_rule_executions (rule_id, executed_at DESC);
GRANT SELECT ON public.engine_rule_executions TO authenticated;
GRANT ALL ON public.engine_rule_executions TO service_role;
ALTER TABLE public.engine_rule_executions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.engine_rule_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.engine_rules(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES public.engine_rule_executions(id) ON DELETE SET NULL,
  entity_id uuid,
  severity text NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  closed_by uuid,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engine_rule_alerts_status_chk CHECK (status IN ('open','acknowledged','closed'))
);
GRANT SELECT, UPDATE ON public.engine_rule_alerts TO authenticated;
GRANT ALL ON public.engine_rule_alerts TO service_role;
ALTER TABLE public.engine_rule_alerts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.engine_rule_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.engine_rules(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES public.engine_rule_executions(id) ON DELETE SET NULL,
  entity_id uuid,
  title text NOT NULL,
  assigned_role text,
  due_date date,
  status text NOT NULL DEFAULT 'open',
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engine_rule_tasks_status_chk CHECK (status IN ('open','in_progress','done','cancelled'))
);
GRANT SELECT, UPDATE ON public.engine_rule_tasks TO authenticated;
GRANT ALL ON public.engine_rule_tasks TO service_role;
ALTER TABLE public.engine_rule_tasks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.engine_rule_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.engine_rules(id) ON DELETE CASCADE,
  entity_key text NOT NULL,
  suppressed_until timestamptz NOT NULL,
  suppressed_count integer NOT NULL DEFAULT 0,
  last_suppressed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_id, entity_key)
);
GRANT SELECT ON public.engine_rule_suppressions TO authenticated;
GRANT ALL ON public.engine_rule_suppressions TO service_role;
ALTER TABLE public.engine_rule_suppressions ENABLE ROW LEVEL SECURITY;

-- ---------- authorization helpers ----------
CREATE OR REPLACE FUNCTION public.can_view_rule_engine(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.is_super_admin(_user_id)
    OR public.has_permission(_user_id, 'rule_engine', 'view')
    OR public.has_permission(_user_id, 'rule_engine', 'edit')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_rule_engine(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.is_super_admin(_user_id)
    OR public.has_permission(_user_id, 'rule_engine', 'edit')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_activate_rule_engine(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.is_super_admin(_user_id)
    OR public.has_permission(_user_id, 'rule_engine', 'activate')
    OR public.has_permission(_user_id, 'rule_engine', 'edit')
  );
$$;

-- ---------- policies ----------
CREATE POLICY engine_rules_read ON public.engine_rules FOR SELECT TO authenticated USING (public.can_view_rule_engine());
CREATE POLICY engine_rules_write ON public.engine_rules FOR ALL TO authenticated
  USING (public.can_manage_rule_engine()) WITH CHECK (public.can_manage_rule_engine());

CREATE POLICY engine_rule_versions_read ON public.engine_rule_versions FOR SELECT TO authenticated USING (public.can_view_rule_engine());
CREATE POLICY engine_rule_versions_write ON public.engine_rule_versions FOR INSERT TO authenticated WITH CHECK (public.can_manage_rule_engine());

CREATE POLICY engine_rule_tests_read ON public.engine_rule_tests FOR SELECT TO authenticated USING (public.can_view_rule_engine());
CREATE POLICY engine_rule_tests_write ON public.engine_rule_tests FOR INSERT TO authenticated WITH CHECK (public.can_manage_rule_engine());

CREATE POLICY engine_rule_executions_read ON public.engine_rule_executions FOR SELECT TO authenticated USING (public.can_view_rule_engine());
CREATE POLICY engine_rule_alerts_read ON public.engine_rule_alerts FOR SELECT TO authenticated USING (public.can_view_rule_engine());
CREATE POLICY engine_rule_alerts_update ON public.engine_rule_alerts FOR UPDATE TO authenticated
  USING (public.can_view_rule_engine()) WITH CHECK (public.can_view_rule_engine());
CREATE POLICY engine_rule_tasks_read ON public.engine_rule_tasks FOR SELECT TO authenticated USING (public.can_view_rule_engine());
CREATE POLICY engine_rule_tasks_update ON public.engine_rule_tasks FOR UPDATE TO authenticated
  USING (public.can_view_rule_engine()) WITH CHECK (public.can_view_rule_engine());
CREATE POLICY engine_rule_suppressions_read ON public.engine_rule_suppressions FOR SELECT TO authenticated USING (public.can_view_rule_engine());

-- ---------- immutability of rule code ----------
CREATE OR REPLACE FUNCTION public.engine_rules_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.rule_code IS DISTINCT FROM OLD.rule_code THEN
    RAISE EXCEPTION 'rule_code_immutable';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_engine_rules_guard BEFORE UPDATE ON public.engine_rules
FOR EACH ROW EXECUTE FUNCTION public.engine_rules_guard();

-- ---------- validation (R-ADM-019/020/021) ----------
CREATE OR REPLACE FUNCTION public.engine_rule_validate(_rule_type text, _conditions jsonb, _actions jsonb, _name text)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  errs text[] := '{}';
  act jsonb;
  wf uuid;
  sectors jsonb := coalesce(_conditions->'sector_ids', '[]'::jsonb);
  window_days int;
BEGIN
  IF coalesce(btrim(_name), '') = '' THEN errs := errs || 'Rule name is required.'; END IF;

  IF coalesce(jsonb_array_length(coalesce(_conditions->'predicates','[]'::jsonb)), 0) = 0 THEN
    errs := errs || 'At least one condition is required.';
  END IF;

  IF coalesce(jsonb_array_length(coalesce(_actions,'[]'::jsonb)), 0) = 0 THEN
    errs := errs || 'At least one action on trigger is required.';
  END IF;

  -- R-ADM-020: sector scope mandatory for threshold / early-warning style rules
  IF _rule_type IN ('threshold','trend','peer_comparison','macro_overlay','group_contagion')
     AND jsonb_typeof(sectors) = 'array' AND jsonb_array_length(sectors) = 0 THEN
    errs := errs || 'Sector scope is required for threshold and early-warning rules.';
  END IF;

  -- R-ADM-021: pattern detection window must be at least 7 days
  IF _rule_type = 'pattern_detection' THEN
    window_days := coalesce((_conditions->>'window_days')::int, 0);
    IF window_days < 7 THEN
      errs := errs || 'Pattern detection time window must be at least 7 days.';
    END IF;
  END IF;

  -- R-ADM-019: workflow actions may only reference published workflows
  FOR act IN SELECT * FROM jsonb_array_elements(coalesce(_actions,'[]'::jsonb)) LOOP
    IF act->>'type' = 'initiate_workflow' THEN
      wf := nullif(act->>'workflow_id','')::uuid;
      IF wf IS NULL THEN
        errs := errs || 'Initiate Workflow action requires a workflow.';
      ELSIF NOT EXISTS (
        SELECT 1 FROM public.approval_workflows w
        WHERE w.id = wf AND w.current_published_version_id IS NOT NULL
      ) THEN
        errs := errs || 'Only published workflows can be selected for Initiate Workflow.';
      END IF;
    END IF;
    IF act->>'type' = 'generate_alert' AND coalesce(btrim(act->>'template'),'') = '' THEN
      errs := errs || 'Generate Alert action requires alert text.';
    END IF;
    IF act->>'type' = 'send_notification' AND coalesce(btrim(act->>'event_key'),'') = '' THEN
      errs := errs || 'Send Notification action requires a notification event.';
    END IF;
    IF act->>'type' = 'create_task' AND coalesce(btrim(act->>'assigned_role'),'') = '' THEN
      errs := errs || 'Create Task action requires an assigned role.';
    END IF;
  END LOOP;

  RETURN errs;
END; $$;

-- ---------- save (draft or new version) ----------
CREATE OR REPLACE FUNCTION public.engine_rule_save(_payload jsonb, _rule_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_errs text[];
  v_id uuid := _rule_id;
  v_row public.engine_rules;
  v_type text := _payload->>'rule_type';
  v_new_version boolean := false;
BEGIN
  IF NOT public.can_manage_rule_engine(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  v_errs := public.engine_rule_validate(
    v_type,
    coalesce(_payload->'conditions','{}'::jsonb),
    coalesce(_payload->'actions','[]'::jsonb),
    _payload->>'name'
  );

  -- Drafts may be saved incomplete; only a name is mandatory.
  IF coalesce(_payload->>'intent','draft') <> 'draft' AND array_length(v_errs,1) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'errors', to_jsonb(v_errs));
  END IF;
  IF coalesce(btrim(_payload->>'name'),'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'errors', to_jsonb(ARRAY['Rule name is required.']));
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.engine_rules (
      name, description, rule_type, module, sub_module, tags, severity,
      conditions, actions, suppression_days, created_by, updated_by
    ) VALUES (
      btrim(_payload->>'name'), nullif(_payload->>'description',''), v_type,
      coalesce(nullif(_payload->>'module',''),'general'), nullif(_payload->>'sub_module',''),
      coalesce((SELECT array_agg(t::text) FROM jsonb_array_elements_text(coalesce(_payload->'tags','[]'::jsonb)) t), '{}'),
      coalesce(nullif(_payload->>'severity',''),'medium'),
      coalesce(_payload->'conditions','{}'::jsonb), coalesce(_payload->'actions','[]'::jsonb),
      coalesce((_payload->>'suppression_days')::int, 0), auth.uid(), auth.uid()
    ) RETURNING * INTO v_row;
    PERFORM public.create_audit_log(auth.uid(), 'ADMIN_RULE_CREATED', 'engine_rule', v_row.id::text, NULL, to_jsonb(v_row));
  ELSE
    SELECT * INTO v_row FROM public.engine_rules WHERE id = v_id;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'rule_not_found'; END IF;

    -- Editing an active rule creates a new version and returns it to draft review.
    v_new_version := (v_row.status = 'active');

    INSERT INTO public.engine_rule_versions (rule_id, version, snapshot, note, created_by)
    VALUES (v_row.id, v_row.version, to_jsonb(v_row), 'superseded', auth.uid())
    ON CONFLICT (rule_id, version) DO NOTHING;

    UPDATE public.engine_rules SET
      name = btrim(_payload->>'name'),
      description = nullif(_payload->>'description',''),
      rule_type = v_type,
      module = coalesce(nullif(_payload->>'module',''), module),
      sub_module = nullif(_payload->>'sub_module',''),
      tags = coalesce((SELECT array_agg(t::text) FROM jsonb_array_elements_text(coalesce(_payload->'tags','[]'::jsonb)) t), '{}'),
      severity = coalesce(nullif(_payload->>'severity',''),'medium'),
      conditions = coalesce(_payload->'conditions','{}'::jsonb),
      actions = coalesce(_payload->'actions','[]'::jsonb),
      suppression_days = coalesce((_payload->>'suppression_days')::int, 0),
      version = CASE WHEN v_new_version THEN version + 1 ELSE version END,
      status = CASE WHEN v_new_version THEN 'draft' ELSE status END,
      updated_by = auth.uid(),
      updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;

    PERFORM public.create_audit_log(auth.uid(), 'ADMIN_RULE_UPDATED', 'engine_rule', v_row.id::text, NULL, to_jsonb(v_row));
  END IF;

  RETURN jsonb_build_object('ok', true, 'rule', to_jsonb(v_row), 'new_version', v_new_version, 'warnings', to_jsonb(v_errs));
END; $$;

-- ---------- record a sandbox test ----------
CREATE OR REPLACE FUNCTION public.engine_rule_record_test(
  _rule_id uuid, _params jsonb, _results jsonb, _evaluated int, _matched int, _passed boolean, _error text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ver int; v_id uuid;
BEGIN
  IF NOT public.can_manage_rule_engine(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT version INTO v_ver FROM public.engine_rules WHERE id = _rule_id;
  IF v_ver IS NULL THEN RAISE EXCEPTION 'rule_not_found'; END IF;
  INSERT INTO public.engine_rule_tests (rule_id, version, passed, params, results, evaluated_count, matched_count, error, run_by)
  VALUES (_rule_id, v_ver, coalesce(_passed,false), coalesce(_params,'{}'::jsonb), coalesce(_results,'[]'::jsonb),
          coalesce(_evaluated,0), coalesce(_matched,0), _error, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- ---------- activate / deactivate ----------
CREATE OR REPLACE FUNCTION public.engine_rule_activate(_rule_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.engine_rules; v_errs text[]; v_test boolean;
BEGIN
  IF NOT public.can_activate_rule_engine(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_row FROM public.engine_rules WHERE id = _rule_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'rule_not_found'; END IF;

  v_errs := public.engine_rule_validate(v_row.rule_type, v_row.conditions, v_row.actions, v_row.name);
  IF array_length(v_errs,1) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'errors', to_jsonb(v_errs));
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.engine_rule_tests t
    WHERE t.rule_id = _rule_id AND t.version = v_row.version AND t.passed
  ) INTO v_test;
  IF NOT v_test THEN
    RETURN jsonb_build_object('ok', false, 'errors',
      to_jsonb(ARRAY['This rule version must pass a sandbox test before it can be activated.']));
  END IF;

  UPDATE public.engine_rules
     SET status = 'active', activated_at = now(), activated_by = auth.uid(),
         deactivation_reason = NULL, updated_by = auth.uid()
   WHERE id = _rule_id RETURNING * INTO v_row;

  INSERT INTO public.engine_rule_versions (rule_id, version, snapshot, note, created_by)
  VALUES (v_row.id, v_row.version, to_jsonb(v_row), 'activated', auth.uid())
  ON CONFLICT (rule_id, version) DO UPDATE SET snapshot = EXCLUDED.snapshot, note = 'activated';

  PERFORM public.create_audit_log(auth.uid(), 'ADMIN_RULE_ACTIVATED', 'engine_rule', v_row.id::text, NULL, to_jsonb(v_row));
  PERFORM public.notification_enqueue_event('admin_rule_activated', 'engine_rule', v_row.id,
    jsonb_build_object('rule_code', v_row.rule_code, 'rule_name', v_row.name, 'module', v_row.module));

  RETURN jsonb_build_object('ok', true, 'rule', to_jsonb(v_row));
END; $$;

CREATE OR REPLACE FUNCTION public.engine_rule_deactivate(_rule_id uuid, _justification text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.engine_rules; v_open int;
BEGIN
  IF NOT public.can_activate_rule_engine(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF coalesce(btrim(_justification),'') = '' THEN RAISE EXCEPTION 'justification_required'; END IF;

  UPDATE public.engine_rules
     SET status = 'inactive', deactivation_reason = btrim(_justification), updated_by = auth.uid()
   WHERE id = _rule_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'rule_not_found'; END IF;

  -- R-ADM-017: open alerts remain open.
  SELECT count(*) INTO v_open FROM public.engine_rule_alerts WHERE rule_id = _rule_id AND status = 'open';

  PERFORM public.create_audit_log(auth.uid(), 'ADMIN_RULE_DEACTIVATED', 'engine_rule', v_row.id::text,
    NULL, jsonb_build_object('justification', btrim(_justification), 'open_alerts_retained', v_open));

  RETURN jsonb_build_object('ok', true, 'rule', to_jsonb(v_row), 'open_alerts_retained', v_open);
END; $$;

REVOKE ALL ON FUNCTION public.engine_rule_save(jsonb, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.engine_rule_activate(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.engine_rule_deactivate(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.engine_rule_record_test(uuid, jsonb, jsonb, int, int, boolean, text) FROM anon;

-- ---------- metric series for evaluation (read-only over existing data) ----------
CREATE OR REPLACE VIEW public.v_engine_metric_series
WITH (security_invoker = true) AS
SELECT
  rf.entity_id                AS entity_id,
  l.name                      AS entity_name,
  rf.sector_id                AS sector_id,
  rcr.ratio_key               AS metric_key,
  rcr.value                   AS value,
  rf.return_year              AS return_year,
  rf.return_period            AS return_period,
  rf.period_end_date          AS period_end_date,
  rcr.computed_at             AS computed_at,
  row_number() OVER (PARTITION BY rf.entity_id, rcr.ratio_key ORDER BY rf.period_end_date DESC NULLS LAST, rcr.computed_at DESC) AS recency_rank
FROM public.return_calculated_ratios rcr
JOIN public.returns_filed rf ON rf.id = rcr.return_id
JOIN public.licensees l ON l.id = rf.entity_id
WHERE rcr.value IS NOT NULL AND rf.entity_id IS NOT NULL;

GRANT SELECT ON public.v_engine_metric_series TO authenticated, service_role;

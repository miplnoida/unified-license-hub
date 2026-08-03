-- 1. Extra identification fields on shared rules
ALTER TABLE public.engine_rules
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS effective_to date;

-- 2. Version immutability: prior versions can never be altered or removed.
CREATE OR REPLACE FUNCTION public.engine_rule_versions_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'engine_rule_versions rows are immutable (attempted %)', TG_OP
    USING ERRCODE = '42501';
END; $$;

DROP TRIGGER IF EXISTS trg_engine_rule_versions_immutable ON public.engine_rule_versions;
CREATE TRIGGER trg_engine_rule_versions_immutable
BEFORE UPDATE OR DELETE ON public.engine_rule_versions
FOR EACH ROW EXECUTE FUNCTION public.engine_rule_versions_immutable();

-- activate() previously upserted the snapshot; that now violates immutability.
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

  IF v_row.effective_to IS NOT NULL AND v_row.effective_from IS NOT NULL
     AND v_row.effective_to < v_row.effective_from THEN
    RETURN jsonb_build_object('ok', false, 'errors',
      to_jsonb(ARRAY['Expiry date cannot be earlier than the effective date.']));
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
  ON CONFLICT (rule_id, version) DO NOTHING;

  PERFORM public.create_audit_log(auth.uid(), 'ADMIN_RULE_ACTIVATED', 'engine_rule', v_row.id::text, NULL, to_jsonb(v_row));
  PERFORM public.notification_enqueue_event('admin_rule_activated', 'engine_rule', v_row.id,
    jsonb_build_object('rule_code', v_row.rule_code, 'rule_name', v_row.name, 'module', v_row.module));

  RETURN jsonb_build_object('ok', true, 'rule', to_jsonb(v_row));
END; $$;

-- 3. Persist the new identification fields through save()
CREATE OR REPLACE FUNCTION public.engine_rule_save(_payload jsonb, _rule_id uuid DEFAULT NULL::uuid)
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

  IF coalesce((_payload->>'suppression_days')::int, 0) < 0 THEN
    v_errs := v_errs || 'Suppression window cannot be negative.';
  END IF;
  IF nullif(_payload->>'effective_to','') IS NOT NULL
     AND nullif(_payload->>'effective_from','') IS NOT NULL
     AND (_payload->>'effective_to')::date < (_payload->>'effective_from')::date THEN
    v_errs := v_errs || 'Expiry date cannot be earlier than the effective date.';
  END IF;

  IF coalesce(_payload->>'intent','draft') <> 'draft' AND array_length(v_errs,1) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'errors', to_jsonb(v_errs));
  END IF;
  IF coalesce(btrim(_payload->>'name'),'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'errors', to_jsonb(ARRAY['Rule name is required.']));
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.engine_rules (
      name, description, rule_type, module, sub_module, tags, severity,
      conditions, actions, suppression_days, owner_user_id, effective_from, effective_to,
      created_by, updated_by
    ) VALUES (
      btrim(_payload->>'name'), nullif(_payload->>'description',''), v_type,
      coalesce(nullif(_payload->>'module',''),'general'), nullif(_payload->>'sub_module',''),
      coalesce((SELECT array_agg(t::text) FROM jsonb_array_elements_text(coalesce(_payload->'tags','[]'::jsonb)) t), '{}'),
      coalesce(nullif(_payload->>'severity',''),'medium'),
      coalesce(_payload->'conditions','{}'::jsonb), coalesce(_payload->'actions','[]'::jsonb),
      coalesce((_payload->>'suppression_days')::int, 0),
      nullif(_payload->>'owner_user_id','')::uuid,
      nullif(_payload->>'effective_from','')::date,
      nullif(_payload->>'effective_to','')::date,
      auth.uid(), auth.uid()
    ) RETURNING * INTO v_row;
    PERFORM public.create_audit_log(auth.uid(), 'ADMIN_RULE_CREATED', 'engine_rule', v_row.id::text, NULL, to_jsonb(v_row));
  ELSE
    SELECT * INTO v_row FROM public.engine_rules WHERE id = v_id;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'rule_not_found'; END IF;

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
      owner_user_id = nullif(_payload->>'owner_user_id','')::uuid,
      effective_from = nullif(_payload->>'effective_from','')::date,
      effective_to = nullif(_payload->>'effective_to','')::date,
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

-- 4. Restore a historical version as a NEW version (history never overwritten)
CREATE OR REPLACE FUNCTION public.engine_rule_restore_version(_rule_id uuid, _version integer, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_snap jsonb; v_row public.engine_rules; v_before jsonb;
BEGIN
  IF NOT public.can_manage_rule_engine(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT snapshot INTO v_snap FROM public.engine_rule_versions
   WHERE rule_id = _rule_id AND version = _version;
  IF v_snap IS NULL THEN RAISE EXCEPTION 'version_not_found'; END IF;

  SELECT to_jsonb(r) INTO v_before FROM public.engine_rules r WHERE r.id = _rule_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'rule_not_found'; END IF;

  -- snapshot the current state before superseding it
  INSERT INTO public.engine_rule_versions (rule_id, version, snapshot, note, created_by)
  SELECT _rule_id, (v_before->>'version')::int, v_before, 'superseded', auth.uid()
  ON CONFLICT (rule_id, version) DO NOTHING;

  UPDATE public.engine_rules SET
    name = v_snap->>'name',
    description = nullif(v_snap->>'description',''),
    rule_type = v_snap->>'rule_type',
    module = coalesce(nullif(v_snap->>'module',''), module),
    sub_module = nullif(v_snap->>'sub_module',''),
    severity = coalesce(nullif(v_snap->>'severity',''),'medium'),
    conditions = coalesce(v_snap->'conditions','{}'::jsonb),
    actions = coalesce(v_snap->'actions','[]'::jsonb),
    suppression_days = coalesce((v_snap->>'suppression_days')::int, 0),
    effective_from = nullif(v_snap->>'effective_from','')::date,
    effective_to = nullif(v_snap->>'effective_to','')::date,
    version = version + 1,
    status = 'draft',
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = _rule_id
  RETURNING * INTO v_row;

  INSERT INTO public.engine_rule_versions (rule_id, version, snapshot, note, created_by)
  VALUES (v_row.id, v_row.version, to_jsonb(v_row),
          coalesce(nullif(btrim(_note),''), 'restored from v' || _version), auth.uid());

  PERFORM public.create_audit_log(auth.uid(), 'ADMIN_RULE_VERSION_RESTORED', 'engine_rule',
    v_row.id::text, v_before, to_jsonb(v_row));

  RETURN jsonb_build_object('ok', true, 'rule', to_jsonb(v_row));
END; $$;

REVOKE ALL ON FUNCTION public.engine_rule_restore_version(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.engine_rule_restore_version(uuid, integer, text) TO authenticated;

-- 5. Unified read-only rule inventory (oversight layer).
-- Not exposed directly; read only through rule_inventory_search() which
-- enforces can_view_rule_engine().
CREATE OR REPLACE VIEW public.rule_inventory AS
WITH shared AS (
  SELECT
    r.id::text                        AS rule_id,
    'shared_engine'::text             AS family,
    'Shared Engine'::text             AS family_label,
    r.rule_code, r.name, r.description,
    r.module, r.sub_module, r.rule_type, r.severity,
    CASE WHEN r.status = 'active' THEN 'active' WHEN r.status = 'draft' THEN 'draft' ELSE 'inactive' END AS status,
    r.version, r.version AS active_version,
    r.trigger_count, r.last_triggered_at,
    (SELECT max(t.created_at) FROM public.engine_rule_tests t WHERE t.rule_id = r.id) AS last_tested_at,
    r.owner_user_id, r.updated_by AS last_modified_by, r.updated_at AS last_modified_at,
    r.tags,
    '/admin/rule-engine'::text        AS source_screen,
    'evaluate-engine-rules'::text     AS runtime_owner,
    jsonb_build_object(
      'edit_central', true, 'clone', true, 'test', true, 'activate', true,
      'versions', true, 'executions', true, 'alerts', true, 'tasks', true,
      'module_editor', false, 'export', true
    ) AS capabilities
  FROM public.engine_rules r
),
return_validation AS (
  SELECT
    v.id::text, 'return_validation', 'Return Validation',
    'RVR-' || left(replace(v.id::text,'-',''), 8), v.name, v.error_message,
    'returns', v.scope, v.rule_type, v.severity,
    CASE WHEN v.is_active THEN 'active' ELSE 'inactive' END,
    v.current_version, v.current_version,
    (SELECT count(*)::int FROM public.return_validation_run_log l WHERE l.rule_id = v.id),
    (SELECT max(l.executed_at) FROM public.return_validation_run_log l WHERE l.rule_id = v.id),
    NULL::timestamptz,
    v.created_by, v.created_by, v.updated_at,
    '{}'::text[],
    '/admin/return-config', 'evaluate_return_validations()',
    jsonb_build_object(
      'edit_central', false, 'clone', true, 'test', true, 'activate', true,
      'versions', true, 'executions', true, 'alerts', false, 'tasks', false,
      'module_editor', true, 'export', true
    )
  FROM public.return_validation_rules v
),
prudential AS (
  SELECT
    p.id::text, 'prudential', 'Prudential Thresholds',
    'PTH-' || upper(p.metric_key), coalesce(p.label, p.metric_key),
    'Threshold on ' || p.metric_key || ' (' || coalesce(p.unit,'') || ')',
    'prudential', p.taxonomy_code, 'threshold', 'high',
    CASE WHEN p.is_active THEN 'active' ELSE 'inactive' END,
    p.current_version, p.current_version,
    (SELECT count(*)::int FROM public.return_threshold_breaches b
      WHERE b.metric_key = p.metric_key AND b.return_config_id = p.return_config_id),
    (SELECT max(b.detected_at) FROM public.return_threshold_breaches b
      WHERE b.metric_key = p.metric_key AND b.return_config_id = p.return_config_id),
    NULL::timestamptz,
    NULL::uuid, NULL::uuid, p.updated_at,
    '{}'::text[],
    '/supervision/breaches', 'evaluate-return-prudential',
    jsonb_build_object(
      'edit_central', false, 'clone', false, 'test', false, 'activate', true,
      'versions', true, 'executions', true, 'alerts', true, 'tasks', false,
      'module_editor', true, 'export', true
    )
  FROM public.prudential_thresholds p
),
conduct AS (
  SELECT
    c.id::text, 'conduct', 'Conduct Monitoring',
    'CMR-' || left(replace(c.id::text,'-',''), 8), c.name, c.description,
    'conduct', c.scope, c.rule_type, 'medium',
    CASE WHEN c.active THEN 'active' ELSE 'inactive' END,
    1, 1,
    (SELECT count(*)::int FROM public.conduct_monitoring_rule_runs x WHERE x.rule_id = c.id),
    (SELECT max(x.completed_at) FROM public.conduct_monitoring_rule_runs x WHERE x.rule_id = c.id),
    NULL::timestamptz,
    c.created_by, c.created_by, c.updated_at,
    '{}'::text[],
    '/admin/conduct/monitoring-rules', 'evaluate-conduct-monitoring',
    jsonb_build_object(
      'edit_central', false, 'clone', false, 'test', true, 'activate', true,
      'versions', false, 'executions', true, 'alerts', true, 'tasks', false,
      'module_editor', true, 'export', true
    )
  FROM public.conduct_monitoring_rules c
),
triage AS (
  SELECT
    t.id::text, 'complaint_triage', 'Complaint Triage',
    'CTR-' || lpad(t.priority_order::text, 3, '0'), t.name, t.description,
    'complaints', t.match_mode, 'classification', 'medium',
    CASE WHEN t.active THEN 'active' ELSE 'inactive' END,
    1, 1,
    (SELECT count(*)::int FROM public.conduct_triage_audit_events e
      WHERE e.matched_rule_id = t.id AND NOT coalesce(e.dry_run, false)),
    (SELECT max(e.evaluated_at) FROM public.conduct_triage_audit_events e
      WHERE e.matched_rule_id = t.id AND NOT coalesce(e.dry_run, false)),
    (SELECT max(e.evaluated_at) FROM public.conduct_triage_audit_events e
      WHERE e.matched_rule_id = t.id AND coalesce(e.dry_run, false)),
    t.created_by, t.updated_by, t.updated_at,
    '{}'::text[],
    '/admin/conduct/triage-rules', 'evaluate-complaint-triage',
    jsonb_build_object(
      'edit_central', false, 'clone', false, 'test', true, 'activate', true,
      'versions', false, 'executions', true, 'alerts', false, 'tasks', false,
      'module_editor', true, 'export', true
    )
  FROM public.conduct_triage_rules t
),
sufficiency AS (
  SELECT
    s.id::text, 'licensing', 'Licensing Sufficiency',
    coalesce(s.code, 'SUF-' || left(replace(s.id::text,'-',''), 8)), s.name, s.description,
    'licensing', s.rule_type, s.rule_type, s.severity,
    CASE WHEN s.is_active THEN 'active' ELSE 'inactive' END,
    1, 1,
    (SELECT count(*)::int FROM public.sufficiency_evaluation_results r WHERE r.rule_id = s.id),
    NULL::timestamptz,
    NULL::timestamptz,
    s.created_by, s.created_by, s.updated_at,
    '{}'::text[],
    '/admin/sufficiency-rules', 'evaluate-application-sufficiency',
    jsonb_build_object(
      'edit_central', false, 'clone', false, 'test', false, 'activate', true,
      'versions', false, 'executions', true, 'alerts', false, 'tasks', false,
      'module_editor', true, 'export', true
    )
  FROM public.sufficiency_rules s
),
rfi AS (
  SELECT
    a.id::text, 'licensing', 'RFI Auto-Rules',
    'RFI-' || left(replace(a.id::text,'-',''), 8), a.name, a.description,
    'licensing', a.workflow_type_key, 'suggestion', 'low',
    CASE WHEN a.active THEN 'active' ELSE 'inactive' END,
    1, 1, 0, NULL::timestamptz, NULL::timestamptz,
    a.created_by, a.created_by, a.updated_at,
    '{}'::text[],
    '/admin/rfi-auto-rules', 'reviewer suggestion (no autonomous run)',
    jsonb_build_object(
      'edit_central', false, 'clone', false, 'test', false, 'activate', true,
      'versions', false, 'executions', false, 'alerts', false, 'tasks', false,
      'module_editor', true, 'export', true
    )
  FROM public.application_rfi_auto_rules a
),
routing AS (
  SELECT
    c.id::text, 'correspondence', 'Correspondence Routing',
    'CRR-' || lpad(c.sort_order::text, 3, '0'), c.name,
    'Route ' || c.match_type || ' = ' || coalesce(c.match_value,'') || ' to ' || coalesce(c.assign_unit,'unassigned'),
    'correspondence', c.match_type, 'routing', coalesce(c.priority,'medium'),
    CASE WHEN c.is_active THEN 'active' ELSE 'inactive' END,
    1, 1, 0, NULL::timestamptz, NULL::timestamptz,
    c.created_by, c.created_by, c.updated_at,
    '{}'::text[],
    '/admin/correspondence-routing', 'create_correspondence_thread()',
    jsonb_build_object(
      'edit_central', false, 'clone', false, 'test', true, 'activate', true,
      'versions', false, 'executions', false, 'alerts', false, 'tasks', false,
      'module_editor', true, 'export', true
    )
  FROM public.correspondence_routing_rules c
),
escalation AS (
  SELECT
    e.id::text, 'escalation', 'Escalation Rules',
    'ESC-' || left(replace(e.id::text,'-',''), 8), e.name, e.description,
    coalesce(e.source_module,'escalation'), e.escalation_type::text, 'sla',
    e.default_severity::text,
    CASE WHEN e.is_active THEN 'active' ELSE 'inactive' END,
    1, 1,
    (SELECT count(*)::int FROM public.escalations x WHERE x.rule_id = e.id),
    (SELECT max(x.created_at) FROM public.escalations x WHERE x.rule_id = e.id),
    NULL::timestamptz,
    e.created_by, e.updated_by, e.updated_at,
    '{}'::text[],
    '/admin/escalations', 'run_complaint_escalation_sweep() / escalation timers',
    jsonb_build_object(
      'edit_central', false, 'clone', false, 'test', true, 'activate', true,
      'versions', false, 'executions', true, 'alerts', true, 'tasks', true,
      'module_editor', true, 'export', true
    )
  FROM public.escalation_rules e
)
SELECT * FROM shared
UNION ALL SELECT * FROM return_validation
UNION ALL SELECT * FROM prudential
UNION ALL SELECT * FROM conduct
UNION ALL SELECT * FROM triage
UNION ALL SELECT * FROM sufficiency
UNION ALL SELECT * FROM rfi
UNION ALL SELECT * FROM routing
UNION ALL SELECT * FROM escalation;

REVOKE ALL ON public.rule_inventory FROM PUBLIC;
REVOKE ALL ON public.rule_inventory FROM anon, authenticated;

-- 6. Server-side search / filter / sort / pagination + KPIs
CREATE OR REPLACE FUNCTION public.rule_inventory_search(
  _search text DEFAULT NULL,
  _family text DEFAULT NULL,
  _module text DEFAULT NULL,
  _sub_module text DEFAULT NULL,
  _rule_type text DEFAULT NULL,
  _status text DEFAULT NULL,
  _severity text DEFAULT NULL,
  _tag text DEFAULT NULL,
  _triggered_from timestamptz DEFAULT NULL,
  _triggered_to timestamptz DEFAULT NULL,
  _sort text DEFAULT 'last_modified_at',
  _dir text DEFAULT 'desc',
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows jsonb;
  v_total int;
  v_kpi jsonb;
  v_sort text := lower(coalesce(_sort,'last_modified_at'));
  v_dir text := CASE WHEN lower(coalesce(_dir,'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_limit int := least(greatest(coalesce(_limit,50),1),200);
BEGIN
  IF NOT public.can_view_rule_engine(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF v_sort NOT IN ('rule_code','name','family','module','rule_type','severity','status',
                    'trigger_count','last_triggered_at','last_tested_at','last_modified_at') THEN
    v_sort := 'last_modified_at';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _ri_filtered ON COMMIT DROP AS SELECT * FROM public.rule_inventory WHERE false;
  DELETE FROM _ri_filtered;
  INSERT INTO _ri_filtered
  SELECT * FROM public.rule_inventory i
  WHERE (_search IS NULL OR btrim(_search) = ''
         OR concat_ws(' ', i.rule_code, i.name, i.description, i.module, i.sub_module,
                      array_to_string(i.tags,' ')) ILIKE '%' || btrim(_search) || '%')
    AND (_family IS NULL OR _family = 'all' OR i.family = _family)
    AND (_module IS NULL OR _module = 'all' OR i.module = _module)
    AND (_sub_module IS NULL OR _sub_module = 'all' OR i.sub_module = _sub_module)
    AND (_rule_type IS NULL OR _rule_type = 'all' OR i.rule_type = _rule_type)
    AND (_status IS NULL OR _status = 'all' OR i.status = _status)
    AND (_severity IS NULL OR _severity = 'all' OR i.severity = _severity)
    AND (_tag IS NULL OR _tag = 'all' OR i.tags @> ARRAY[_tag])
    AND (_triggered_from IS NULL OR i.last_triggered_at >= _triggered_from)
    AND (_triggered_to IS NULL OR i.last_triggered_at <= _triggered_to);

  SELECT count(*) INTO v_total FROM _ri_filtered;

  EXECUTE format($q$
    SELECT coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object(
             'owner_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = x.owner_user_id),
             'modified_by_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = x.last_modified_by)
           ) ORDER BY %2$s), '[]'::jsonb)
    FROM (SELECT * FROM _ri_filtered ORDER BY %1$I %2$s NULLS LAST LIMIT %3$s OFFSET %4$s) x
  $q$, v_sort, v_dir, v_limit, greatest(coalesce(_offset,0),0))
  INTO v_rows;

  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM public.rule_inventory),
    'active', (SELECT count(*) FROM public.rule_inventory WHERE status = 'active'),
    'draft', (SELECT count(*) FROM public.rule_inventory WHERE status = 'draft'),
    'inactive', (SELECT count(*) FROM public.rule_inventory WHERE status = 'inactive'),
    'never_executed', (SELECT count(*) FROM public.rule_inventory WHERE coalesce(trigger_count,0) = 0),
    'never_tested', (SELECT count(*) FROM public.rule_inventory WHERE last_tested_at IS NULL AND capabilities->>'test' = 'true'),
    'stale_tests', (SELECT count(*) FROM public.rule_inventory
                     WHERE capabilities->>'test' = 'true'
                       AND (last_tested_at IS NULL OR last_tested_at < now() - interval '90 days')),
    'failing', (SELECT count(*) FROM public.engine_rule_executions e
                 WHERE e.executed_at > now() - interval '30 days'
                   AND e.reason ILIKE 'error%'),
    'families', (SELECT jsonb_object_agg(family, c) FROM (
                   SELECT family, count(*) AS c FROM public.rule_inventory GROUP BY family) f)
  ) INTO v_kpi;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total, 'kpis', v_kpi);
END; $$;

REVOKE ALL ON FUNCTION public.rule_inventory_search(text,text,text,text,text,text,text,text,timestamptz,timestamptz,text,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rule_inventory_search(text,text,text,text,text,text,text,text,timestamptz,timestamptz,text,text,integer,integer) TO authenticated;

-- 7. Finer-grained Rule Engine permissions
WITH m AS (SELECT id FROM public.permission_modules WHERE key = 'rule_engine'),
ins AS (
  INSERT INTO public.permission_actions (module_id, key, label, description, sort_order, is_system, audience)
  SELECT m.id, v.key, v.label, v.descr, v.ord, true, 'internal'
  FROM m, (VALUES
    ('test','Run Rule Tests','Run sandbox/dry-run rule tests',40),
    ('view_executions','View Executions','View rule execution history',50),
    ('view_alerts','View Rule Alerts','View alerts generated by rules',60),
    ('manage_alerts','Manage Rule Alerts','Acknowledge and close rule alerts',70),
    ('view_tasks','View Rule Tasks','View tasks generated by rules',80),
    ('manage_tasks','Manage Rule Tasks','Assign and complete rule tasks',90),
    ('view_versions','View Rule Versions','View rule version history',100),
    ('restore_versions','Restore Rule Versions','Restore a historical rule version',110),
    ('export','Export Rules','Export the rule inventory',120)
  ) AS v(key,label,descr,ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.permission_actions a WHERE a.module_id = m.id AND a.key = v.key
  )
  RETURNING id, key
)
INSERT INTO public.permissions (module, name, description, action_id, enforced)
SELECT 'rule_engine', ins.key, 'Rule Engine — ' || ins.key, ins.id, true
FROM ins
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p WHERE p.module = 'rule_engine' AND p.name = ins.key
);
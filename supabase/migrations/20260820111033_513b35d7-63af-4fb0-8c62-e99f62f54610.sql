
-- 1. Split review vs approve authority ------------------------------------
CREATE OR REPLACE FUNCTION public.returns_review_filing(_version_id uuid, _action text, _reason text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v record; v_new_version uuid;
BEGIN
  IF _action NOT IN ('START_REVIEW','ACCEPT','REJECT','REQUEST_CORRECTION') THEN
    RAISE EXCEPTION 'Unsupported review action';
  END IF;
  IF _action IN ('ACCEPT','REJECT') THEN
    PERFORM public.returns_require('approve');
  ELSE
    PERFORM public.returns_require('review');
  END IF;
  IF _action IN ('REJECT','REQUEST_CORRECTION') AND COALESCE(length(trim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'Please record a reason of at least 10 characters';
  END IF;

  SELECT v2.id, v2.status, v2.return_filing_id, v2.version_number, f.entity_id
    INTO v FROM public.return_filing_versions v2
    JOIN public.return_filings f ON f.id = v2.return_filing_id
   WHERE v2.id = _version_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Filing version not found'; END IF;
  IF v.status NOT IN ('SUBMITTED','UNDER_REVIEW') THEN
    RAISE EXCEPTION 'Only a submitted filing version can be reviewed';
  END IF;

  IF _action = 'START_REVIEW' THEN
    UPDATE public.return_filing_versions SET status = 'UNDER_REVIEW' WHERE id = _version_id;
    UPDATE public.return_filings SET status = 'UNDER_REVIEW', updated_at = now() WHERE id = v.return_filing_id;
  ELSIF _action = 'ACCEPT' THEN
    UPDATE public.return_filing_versions
       SET status = 'ACCEPTED', accepted_at = now(), accepted_by = auth.uid(), is_immutable = true
     WHERE id = _version_id;
    UPDATE public.return_filings
       SET status = 'ACCEPTED', accepted_at = now(), accepted_version_id = _version_id, updated_at = now()
     WHERE id = v.return_filing_id;
  ELSIF _action = 'REJECT' THEN
    UPDATE public.return_filing_versions
       SET status = 'REJECTED', rejected_at = now(), rejected_by = auth.uid(),
           rejection_reason = _reason, is_immutable = true
     WHERE id = _version_id;
    UPDATE public.return_filings
       SET status = 'REJECTED', rejected_at = now(), updated_at = now()
     WHERE id = v.return_filing_id;
  ELSE
    UPDATE public.return_filing_versions SET status = 'SUPERSEDED', is_immutable = true WHERE id = _version_id;
    INSERT INTO public.return_filing_versions(return_filing_id, version_number, status, supersedes_version_id)
    VALUES (v.return_filing_id, v.version_number + 1, 'DRAFT', _version_id)
    RETURNING id INTO v_new_version;

    INSERT INTO public.return_filing_form_requirements(
      return_filing_version_id, form_template_id, form_version_id, is_required, sequence, tab_name, completion_status)
    SELECT v_new_version, r.form_template_id, r.form_version_id, r.is_required, r.sequence, r.tab_name, 'PENDING'
      FROM public.return_filing_form_requirements r
     WHERE r.return_filing_version_id = _version_id;

    UPDATE public.return_filings
       SET status = 'CORRECTION_REQUESTED', current_version_number = v.version_number + 1, updated_at = now()
     WHERE id = v.return_filing_id;

    INSERT INTO public.return_filing_requests(
      return_filing_id, return_filing_version_id, request_kind, message, status, created_by)
    VALUES (v.return_filing_id, _version_id, 'CORRECTION', _reason, 'OPEN', auth.uid());
  END IF;

  PERFORM public.create_audit_log('return_filing', v.return_filing_id, 'RETURN_REVIEW_' || _action,
    jsonb_build_object('version_id', _version_id, 'reason', _reason));
  RETURN jsonb_build_object('action', _action, 'new_version_id', v_new_version);
END $function$;

-- 2. Obligation rule tester ----------------------------------------------
CREATE OR REPLACE FUNCTION public.returns_test_obligation_rule(_rule_id uuid, _entity_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; e record; d record; v_reasons jsonb := '[]'::jsonb; v_match boolean := true;
        v_has_lic boolean; v_freq text; v_due int;
  PROCEDURE_placeholder int;
BEGIN
  PERFORM public.returns_require('manage_config');
  SELECT * INTO r FROM public.reporting_obligation_rules WHERE id = _rule_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Obligation rule not found'; END IF;
  SELECT id, name, sector_id, sub_sector_id, category_id, lifecycle_stage_id, status
    INTO e FROM public.licensees WHERE id = _entity_id;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Entity not found'; END IF;
  SELECT * INTO d FROM public.return_definitions WHERE id = r.return_definition_id;

  IF NOT r.is_active THEN v_match := false;
    v_reasons := v_reasons || jsonb_build_object('dimension','rule_active','pass',false,'detail','Rule is inactive');
  ELSE v_reasons := v_reasons || jsonb_build_object('dimension','rule_active','pass',true,'detail','Rule is active'); END IF;

  IF NOT (d.is_active AND d.status = 'ACTIVE') THEN v_match := false;
    v_reasons := v_reasons || jsonb_build_object('dimension','definition_status','pass',false,'detail','Return definition is '||d.status);
  ELSE v_reasons := v_reasons || jsonb_build_object('dimension','definition_status','pass',true,'detail','Return definition is ACTIVE'); END IF;

  IF r.effective_from > CURRENT_DATE OR (r.effective_to IS NOT NULL AND r.effective_to < CURRENT_DATE) THEN
    v_match := false;
    v_reasons := v_reasons || jsonb_build_object('dimension','effective_window','pass',false,'detail','Today is outside the rule effective window');
  ELSE v_reasons := v_reasons || jsonb_build_object('dimension','effective_window','pass',true,'detail','Rule is in force today'); END IF;

  IF r.sector_id IS NULL THEN
    v_reasons := v_reasons || jsonb_build_object('dimension','sector','pass',true,'detail','Any sector');
  ELSIF r.sector_id = e.sector_id THEN
    v_reasons := v_reasons || jsonb_build_object('dimension','sector','pass',true,'detail','Entity sector matches');
  ELSE v_match := false;
    v_reasons := v_reasons || jsonb_build_object('dimension','sector','pass',false,'detail','Entity sector does not match');
  END IF;

  IF r.sub_sector_id IS NULL THEN
    v_reasons := v_reasons || jsonb_build_object('dimension','sub_sector','pass',true,'detail','Any sub-sector');
  ELSIF r.sub_sector_id = e.sub_sector_id THEN
    v_reasons := v_reasons || jsonb_build_object('dimension','sub_sector','pass',true,'detail','Entity sub-sector matches');
  ELSE v_match := false;
    v_reasons := v_reasons || jsonb_build_object('dimension','sub_sector','pass',false,'detail','Entity sub-sector does not match');
  END IF;

  IF r.category_id IS NULL THEN
    v_reasons := v_reasons || jsonb_build_object('dimension','category','pass',true,'detail','Any category');
  ELSIF r.category_id = e.category_id THEN
    v_reasons := v_reasons || jsonb_build_object('dimension','category','pass',true,'detail','Entity category matches');
  ELSE v_match := false;
    v_reasons := v_reasons || jsonb_build_object('dimension','category','pass',false,'detail','Entity category does not match');
  END IF;

  IF r.lifecycle_stage_id IS NULL THEN
    v_reasons := v_reasons || jsonb_build_object('dimension','lifecycle','pass',true,'detail','Any lifecycle stage');
  ELSIF r.lifecycle_stage_id = e.lifecycle_stage_id THEN
    v_reasons := v_reasons || jsonb_build_object('dimension','lifecycle','pass',true,'detail','Lifecycle stage matches');
  ELSE v_match := false;
    v_reasons := v_reasons || jsonb_build_object('dimension','lifecycle','pass',false,'detail','Lifecycle stage does not match');
  END IF;

  IF r.classification_value_id IS NULL THEN
    v_reasons := v_reasons || jsonb_build_object('dimension','classification','pass',true,'detail','Any classification');
  ELSE
    IF EXISTS (SELECT 1 FROM public.entity_facts f
                WHERE f.entity_id = _entity_id AND f.classification_value_id = r.classification_value_id) THEN
      v_reasons := v_reasons || jsonb_build_object('dimension','classification','pass',true,'detail','Entity carries the required classification');
    ELSE v_match := false;
      v_reasons := v_reasons || jsonb_build_object('dimension','classification','pass',false,'detail','Entity does not carry the required classification');
    END IF;
  END IF;

  IF r.requires_active_license THEN
    SELECT EXISTS (SELECT 1 FROM public.entity_licenses el
                    WHERE el.entity_id = _entity_id
                      AND (el.effective_to IS NULL OR el.effective_to > now())) INTO v_has_lic;
    IF v_has_lic THEN
      v_reasons := v_reasons || jsonb_build_object('dimension','active_licence','pass',true,'detail','Entity holds an in-force licence');
    ELSE v_match := false;
      v_reasons := v_reasons || jsonb_build_object('dimension','active_licence','pass',false,'detail','Entity holds no in-force licence');
    END IF;
  ELSE
    v_reasons := v_reasons || jsonb_build_object('dimension','active_licence','pass',true,'detail','Active licence not required');
  END IF;

  IF r.jurisdiction IS NOT NULL THEN
    v_reasons := v_reasons || jsonb_build_object('dimension','jurisdiction','pass',true,'detail','Rule jurisdiction: '||r.jurisdiction);
  END IF;

  v_freq := COALESCE(r.frequency_override, d.frequency);
  v_due := COALESCE(r.due_days_override, d.due_days_after_period_end);

  RETURN jsonb_build_object(
    'matches', v_match,
    'entity_id', _entity_id,
    'entity_name', e.name,
    'rule_code', r.code,
    'rule_name', r.name,
    'priority', r.priority,
    'definition_code', d.code,
    'definition_name', d.name,
    'frequency', v_freq,
    'frequency_source', CASE WHEN r.frequency_override IS NOT NULL THEN 'RULE_OVERRIDE' ELSE 'DEFINITION' END,
    'due_days_after_period_end', v_due,
    'due_days_source', CASE WHEN r.due_days_override IS NOT NULL THEN 'RULE_OVERRIDE' ELSE 'DEFINITION' END,
    'example_period_end', date_trunc('quarter', CURRENT_DATE)::date - 1,
    'example_due_date', (date_trunc('quarter', CURRENT_DATE)::date - 1) + v_due,
    'already_obliged', EXISTS (SELECT 1 FROM public.entity_reporting_obligations o
                                WHERE o.entity_id = _entity_id
                                  AND o.return_definition_id = r.return_definition_id
                                  AND o.status = 'ACTIVE'),
    'reasons', v_reasons
  );
END $function$;

-- 3. Version comparison --------------------------------------------------
CREATE OR REPLACE FUNCTION public.returns_compare_filing_versions(_version_a uuid, _version_b uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE va record; vb record; v_forms jsonb := '[]'::jsonb; v_metrics jsonb; v_val jsonb; v_req jsonb;
        fr record;
BEGIN
  PERFORM public.returns_require('view');
  SELECT v.*, f.filing_reference INTO va
    FROM public.return_filing_versions v JOIN public.return_filings f ON f.id = v.return_filing_id
   WHERE v.id = _version_a;
  SELECT v.*, f.filing_reference INTO vb
    FROM public.return_filing_versions v JOIN public.return_filings f ON f.id = v.return_filing_id
   WHERE v.id = _version_b;
  IF va.id IS NULL OR vb.id IS NULL THEN RAISE EXCEPTION 'Filing version not found'; END IF;
  IF va.return_filing_id <> vb.return_filing_id THEN RAISE EXCEPTION 'Versions belong to different filings'; END IF;

  -- form response field diffs, keyed by template
  FOR fr IN
    SELECT COALESCE(a.form_template_id, b.form_template_id) AS template_id,
           t.name AS template_name,
           a.form_version_id AS a_form_version_id, b.form_version_id AS b_form_version_id,
           a.completion_status AS a_completion, b.completion_status AS b_completion,
           ra.response_data AS a_data, rb.response_data AS b_data
      FROM (SELECT * FROM public.return_filing_form_requirements WHERE return_filing_version_id = _version_a) a
      FULL JOIN (SELECT * FROM public.return_filing_form_requirements WHERE return_filing_version_id = _version_b) b
        ON b.form_template_id = a.form_template_id
      LEFT JOIN public.form_templates t ON t.id = COALESCE(a.form_template_id, b.form_template_id)
      LEFT JOIN public.form_responses ra ON ra.id = a.form_response_id
      LEFT JOIN public.form_responses rb ON rb.id = b.form_response_id
  LOOP
    v_forms := v_forms || jsonb_build_object(
      'template_id', fr.template_id,
      'template_name', fr.template_name,
      'a_form_version_id', fr.a_form_version_id,
      'b_form_version_id', fr.b_form_version_id,
      'form_version_pinning_changed', fr.a_form_version_id IS DISTINCT FROM fr.b_form_version_id,
      'a_completion', fr.a_completion,
      'b_completion', fr.b_completion,
      'field_changes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'field', k,
                 'old_value', (fr.a_data -> k),
                 'new_value', (fr.b_data -> k),
                 'change', CASE
                   WHEN NOT (COALESCE(fr.a_data,'{}'::jsonb) ? k) THEN 'ADDED'
                   WHEN NOT (COALESCE(fr.b_data,'{}'::jsonb) ? k) THEN 'REMOVED'
                   ELSE 'CHANGED' END)
                 ORDER BY k)
          FROM (SELECT jsonb_object_keys(COALESCE(fr.a_data,'{}'::jsonb) || COALESCE(fr.b_data,'{}'::jsonb)) AS k) keys
         WHERE (fr.a_data -> k) IS DISTINCT FROM (fr.b_data -> k)
      ), '[]'::jsonb)
    );
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'code', m.code, 'name', m.name, 'unit', m.unit,
           'a_value', a.value_numeric, 'b_value', b.value_numeric,
           'a_availability', a.availability, 'b_availability', b.availability,
           'delta', CASE WHEN a.value_numeric IS NOT NULL AND b.value_numeric IS NOT NULL
                         THEN b.value_numeric - a.value_numeric END,
           'changed', a.value_numeric IS DISTINCT FROM b.value_numeric
                      OR a.availability IS DISTINCT FROM b.availability) ORDER BY m.code), '[]'::jsonb)
    INTO v_metrics
    FROM public.regulatory_metrics m
    LEFT JOIN public.return_metric_values a ON a.regulatory_metric_id = m.id AND a.return_filing_version_id = _version_a
    LEFT JOIN public.return_metric_values b ON b.regulatory_metric_id = m.id AND b.return_filing_version_id = _version_b
   WHERE a.id IS NOT NULL OR b.id IS NOT NULL;

  SELECT jsonb_build_object(
    'a', COALESCE((SELECT jsonb_agg(jsonb_build_object('rule_code', rule_code, 'severity', severity,
            'message', message, 'is_blocking', is_blocking) ORDER BY rule_code)
          FROM public.return_filing_validation_results WHERE return_filing_version_id = _version_a), '[]'::jsonb),
    'b', COALESCE((SELECT jsonb_agg(jsonb_build_object('rule_code', rule_code, 'severity', severity,
            'message', message, 'is_blocking', is_blocking) ORDER BY rule_code)
          FROM public.return_filing_validation_results WHERE return_filing_version_id = _version_b), '[]'::jsonb)
  ) INTO v_val;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('request_kind', request_kind, 'message', message,
           'status', status, 'response_text', response_text, 'created_at', created_at,
           'responded_at', responded_at) ORDER BY created_at), '[]'::jsonb)
    INTO v_req
    FROM public.return_filing_requests
   WHERE return_filing_version_id IN (_version_a, _version_b);

  RETURN jsonb_build_object(
    'filing_reference', va.filing_reference,
    'a', jsonb_build_object('id', va.id, 'version_number', va.version_number, 'status', va.status,
           'submitted_at', va.submitted_at, 'accepted_at', va.accepted_at, 'rejected_at', va.rejected_at,
           'rejection_reason', va.rejection_reason, 'declaration_accepted_at', va.declaration_accepted_at,
           'is_immutable', va.is_immutable),
    'b', jsonb_build_object('id', vb.id, 'version_number', vb.version_number, 'status', vb.status,
           'submitted_at', vb.submitted_at, 'accepted_at', vb.accepted_at, 'rejected_at', vb.rejected_at,
           'rejection_reason', vb.rejection_reason, 'declaration_accepted_at', vb.declaration_accepted_at,
           'is_immutable', vb.is_immutable),
    'forms', v_forms,
    'metrics', COALESCE(v_metrics, '[]'::jsonb),
    'validation', v_val,
    'requests', v_req
  );
END $function$;

-- 4. Entity returns summary ---------------------------------------------
CREATE OR REPLACE FUNCTION public.returns_entity_summary(_entity_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_obl int; v_next jsonb; v_overdue int; v_recent jsonb; v_metrics jsonb; v_corr int;
BEGIN
  PERFORM public.returns_require('view');

  SELECT count(*) INTO v_obl FROM public.entity_reporting_obligations
   WHERE entity_id = _entity_id AND status = 'ACTIVE';

  SELECT to_jsonb(x) INTO v_next FROM (
    SELECT d.code AS definition_code, d.name AS definition_name, p.period_label, p.due_date
      FROM public.reporting_periods p
      JOIN public.entity_reporting_obligations o ON o.id = p.entity_reporting_obligation_id
      JOIN public.return_definitions d ON d.id = o.return_definition_id
     WHERE o.entity_id = _entity_id AND o.status = 'ACTIVE'
       AND p.due_date >= CURRENT_DATE
       AND NOT EXISTS (SELECT 1 FROM public.return_filings f
                        WHERE f.reporting_period_id = p.id AND f.status = 'ACCEPTED')
     ORDER BY p.due_date ASC LIMIT 1) x;

  SELECT count(*) INTO v_overdue
    FROM public.reporting_periods p
    JOIN public.entity_reporting_obligations o ON o.id = p.entity_reporting_obligation_id
   WHERE o.entity_id = _entity_id AND o.status = 'ACTIVE' AND p.due_date < CURRENT_DATE
     AND NOT EXISTS (SELECT 1 FROM public.return_filings f
                      WHERE f.reporting_period_id = p.id
                        AND f.status IN ('SUBMITTED','UNDER_REVIEW','ACCEPTED'));

  SELECT COALESCE(jsonb_agg(to_jsonb(y) ORDER BY y.period_end DESC), '[]'::jsonb) INTO v_recent FROM (
    SELECT f.id AS filing_id, f.filing_reference, f.status, f.current_version_number,
           d.code AS definition_code, d.name AS definition_name,
           p.period_label, p.period_end, p.due_date, f.submitted_at
      FROM public.return_filings f
      JOIN public.return_definitions d ON d.id = f.return_definition_id
      JOIN public.reporting_periods p ON p.id = f.reporting_period_id
     WHERE f.entity_id = _entity_id
     ORDER BY p.period_end DESC LIMIT 8) y;

  SELECT COALESCE(jsonb_agg(to_jsonb(z) ORDER BY z.code), '[]'::jsonb) INTO v_metrics FROM (
    SELECT DISTINCT ON (m.code) m.code, m.name, m.unit, mv.value_numeric, mv.availability,
           p.period_label, p.period_end
      FROM public.return_metric_values mv
      JOIN public.regulatory_metrics m ON m.id = mv.regulatory_metric_id
      JOIN public.return_filing_versions v ON v.id = mv.return_filing_version_id
      JOIN public.return_filings f ON f.id = v.return_filing_id
      JOIN public.reporting_periods p ON p.id = f.reporting_period_id
     WHERE mv.entity_id = _entity_id AND f.accepted_version_id = v.id
     ORDER BY m.code, p.period_end DESC) z;

  SELECT count(*) INTO v_corr FROM public.return_filings
   WHERE entity_id = _entity_id AND status = 'CORRECTION_REQUESTED';

  RETURN jsonb_build_object(
    'entity_id', _entity_id,
    'active_obligations', v_obl,
    'next_due', v_next,
    'overdue_count', v_overdue,
    'correction_requested_count', v_corr,
    'recent_filings', v_recent,
    'latest_accepted_metrics', v_metrics);
END $function$;

-- 5. Definition status + assigned forms ---------------------------------
CREATE OR REPLACE FUNCTION public.returns_set_definition_status(_definition_id uuid, _status text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE d record;
BEGIN
  PERFORM public.returns_require('manage_config');
  IF _status NOT IN ('DRAFT','ACTIVE','SUSPENDED','RETIRED') THEN
    RAISE EXCEPTION 'Unsupported definition status %', _status;
  END IF;
  SELECT * INTO d FROM public.return_definitions WHERE id = _definition_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Return definition not found'; END IF;
  IF d.status = 'RETIRED' AND _status <> 'RETIRED' THEN
    RAISE EXCEPTION 'A retired return definition cannot be reactivated';
  END IF;
  UPDATE public.return_definitions
     SET status = _status,
         is_active = (_status = 'ACTIVE'),
         effective_to = CASE WHEN _status = 'RETIRED' THEN COALESCE(effective_to, CURRENT_DATE) ELSE effective_to END,
         updated_at = now()
   WHERE id = _definition_id;
  PERFORM public.create_audit_log('return_definition', _definition_id, 'RETURN_DEFINITION_STATUS',
    jsonb_build_object('from', d.status, 'to', _status));
  RETURN jsonb_build_object('id', _definition_id, 'status', _status);
END $function$;

CREATE OR REPLACE FUNCTION public.returns_save_definition_form(_payload jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  PERFORM public.returns_require('manage_config');
  v_id := NULLIF(_payload->>'id','')::uuid;
  IF _payload->>'return_definition_id' IS NULL OR _payload->>'form_template_id' IS NULL THEN
    RAISE EXCEPTION 'Return definition and form template are required';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.return_definition_forms(
      return_definition_id, form_template_id, sequence, is_required, section_label, tab_name, effective_from)
    VALUES (
      (_payload->>'return_definition_id')::uuid,
      (_payload->>'form_template_id')::uuid,
      COALESCE((_payload->>'sequence')::int, 1),
      COALESCE((_payload->>'is_required')::boolean, true),
      NULLIF(_payload->>'section_label',''),
      NULLIF(_payload->>'tab_name',''),
      COALESCE(NULLIF(_payload->>'effective_from','')::date, CURRENT_DATE))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.return_definition_forms SET
      sequence = COALESCE((_payload->>'sequence')::int, sequence),
      is_required = COALESCE((_payload->>'is_required')::boolean, is_required),
      section_label = NULLIF(_payload->>'section_label',''),
      tab_name = NULLIF(_payload->>'tab_name','')
     WHERE id = v_id;
  END IF;
  PERFORM public.create_audit_log('return_definition', (_payload->>'return_definition_id')::uuid,
    'RETURN_DEFINITION_FORM_SAVED', _payload);
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.returns_delete_definition_form(_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE d uuid;
BEGIN
  PERFORM public.returns_require('manage_config');
  SELECT return_definition_id INTO d FROM public.return_definition_forms WHERE id = _id;
  IF d IS NULL THEN RETURN; END IF;
  DELETE FROM public.return_definition_forms WHERE id = _id;
  PERFORM public.create_audit_log('return_definition', d, 'RETURN_DEFINITION_FORM_REMOVED',
    jsonb_build_object('id', _id));
END $function$;

GRANT EXECUTE ON FUNCTION public.returns_test_obligation_rule(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.returns_compare_filing_versions(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.returns_entity_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.returns_set_definition_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.returns_save_definition_form(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.returns_delete_definition_form(uuid) TO authenticated;

-- 6. Navigation ----------------------------------------------------------
UPDATE public.sec_navigation_items
   SET is_active = false, show_in_sidebar = false, updated_at = now()
 WHERE key = 'nav_returns_configuration';

UPDATE public.sec_navigation_items
   SET is_active = false, show_in_sidebar = false, updated_at = now()
 WHERE key IN ('nav_returns_management_returns_queue')
   AND audience = 'internal';

INSERT INTO public.sec_routes(key, path_pattern, match_type, required_permission_id, audience, is_protected, is_system, is_active, priority)
SELECT 'route_admin_rdm_reporting', '/admin/regulatory-data-model/reporting', 'exact',
       (SELECT p.id FROM public.sec_permissions p JOIN public.permission_modules pm ON pm.id = p.module_id
         WHERE pm.key = 'returns_management' AND p.key = 'manage_config'),
       'internal', true, true, true, 100
WHERE NOT EXISTS (SELECT 1 FROM public.sec_routes WHERE key = 'route_admin_rdm_reporting');

INSERT INTO public.sec_navigation_items(
  key, parent_id, label, description, item_type, route_id, icon_key, sort_order, audience,
  is_active, show_in_sidebar, show_in_search, keywords, is_system, admin_only, required_permission_id)
SELECT 'nav_admin_rdm_reporting',
       (SELECT id FROM public.sec_navigation_items WHERE key = 'admin_config_regulatory_data_model'),
       'Reporting & Metrics',
       'Return definitions, obligation rules, regulatory metrics and data integrity',
       'link',
       (SELECT id FROM public.sec_routes WHERE key = 'route_admin_rdm_reporting'),
       'chart-bar', 10, 'internal', true, true, true,
       ARRAY['returns','return definitions','obligation rules','metrics','reporting'],
       true, true,
       (SELECT p.id FROM public.sec_permissions p JOIN public.permission_modules pm ON pm.id = p.module_id
         WHERE pm.key = 'returns_management' AND p.key = 'manage_config')
WHERE NOT EXISTS (SELECT 1 FROM public.sec_navigation_items WHERE key = 'nav_admin_rdm_reporting');

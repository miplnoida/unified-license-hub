-- =====================================================================
-- Certification V2 — Wave 1.5c "TRUE OPERATIONAL ZERO-STATE" harness.
--
-- Adds a catalogue-driven classification of every public business table
-- into CONFIG_KEEP / REFERENCE_KEEP / SECURITY_CONFIG_KEEP /
-- CERTIFICATION_HARNESS_KEEP / RUNTIME_MUST_ZERO, a governed zeroiser
-- for the runtime set, a generic user-detach helper and the zero-state
-- certification gate.
--
-- Every function fails closed via cert_v2_assert_allowed() (non-production
-- guard) and is SECURITY DEFINER.
-- =====================================================================

-- ------------------------------------------------- certification user manifest
CREATE TABLE IF NOT EXISTS public.cert_certification_users (
  user_id           uuid PRIMARY KEY,
  email             text NOT NULL UNIQUE,
  role_key          text NOT NULL,
  role_id           uuid,
  persona_family    text NOT NULL,
  audience          text NOT NULL CHECK (audience IN ('internal','external','break_glass')),
  role_display_name text,
  expected_modules  jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_machine        boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cert_certification_users TO authenticated;
GRANT ALL    ON public.cert_certification_users TO service_role;
ALTER TABLE public.cert_certification_users ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='cert_certification_users'
                    AND policyname='cert_users_admin_read') THEN
    CREATE POLICY cert_users_admin_read ON public.cert_certification_users
      FOR SELECT TO authenticated USING (public.sec_has_permission('security.roles.view'));
  END IF;
END $$;

-- ------------------------------------------- governed certification role catalogue
-- Legacy (non-template) roles are classified explicitly; only ACTIVE_REQUIRED
-- legacy roles receive a certification login.
CREATE OR REPLACE FUNCTION public.cert_v2_role_catalogue()
RETURNS TABLE(role_id uuid, role_key text, role_name text, audience text,
              role_class text, legacy_class text, certify boolean)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH legacy AS (
    SELECT * FROM (VALUES
      ('committee_member','ACTIVE_REQUIRED'),
      ('consumer_complainant','COMPATIBILITY_ONLY'),
      ('legacy_admin','DEPRECATED'),
      ('insurance_regulator','DEPRECATED'),
      ('applicant','DUPLICATE'),
      ('regulated_entity_user','DUPLICATE'),
      ('analyst','DUPLICATE'),
      ('approver_decision_maker_b5c0d563','DUPLICATE'),
      ('approver_decision_maker_bef85f9b','DUPLICATE'),
      ('executive_supervisor','DUPLICATE'),
      ('f_p_assessor','DUPLICATE'),
      ('investigator','DUPLICATE'),
      ('legal_compliance_reviewer','DUPLICATE'),
      ('licensing_analyst','DUPLICATE'),
      ('market_conduct_supervisor','DUPLICATE')
    ) v(key, class)
  )
  SELECT r.id, r.key, r.name,
         CASE WHEN r.is_break_glass THEN 'break_glass' ELSE r.role_type END,
         CASE WHEN r.is_break_glass THEN 'BREAK_GLASS'
              WHEN t.key IS NOT NULL THEN 'CANONICAL_TEMPLATE'
              ELSE 'LEGACY' END,
         CASE WHEN r.is_break_glass OR t.key IS NOT NULL THEN NULL ELSE l.class END,
         (r.status = 'active'
          AND (r.is_break_glass OR t.key IS NOT NULL OR coalesce(l.class,'DEPRECATED') = 'ACTIVE_REQUIRED'))
    FROM public.sec_roles r
    LEFT JOIN public.sec_role_templates t ON t.key = r.key
    LEFT JOIN legacy l ON l.key = r.key;
$$;
GRANT EXECUTE ON FUNCTION public.cert_v2_role_catalogue() TO authenticated, service_role;

-- ---------------------------------------------------------- table classification
CREATE OR REPLACE FUNCTION public.cert_v2_table_classification()
RETURNS TABLE(table_name text, category text, reason text, row_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  WITH keep_config AS (
    SELECT unnest(ARRAY[
      -- workflow / approval definitions
      'approval_workflows','approval_workflow_versions','approval_workflow_types',
      'approval_steps','approval_step_actions','approval_action_notifications',
      'approval_step_entry_notifications','workflow_templates','process_templates',
      'delegation_rules_config','review_step_permissions','review_role_display_settings',
      'review_narrative_fields','decision_rationale_templates','appeal_panel_scopes',
      'lifecycle_stages','enforcement_workflow_stages','enforcement_workflow_transitions',
      'enforcement_case_number_counters',
      -- forms
      'forms','form_templates','form_versions','form_fields','form_purposes',
      'form_trigger_types','form_field_definitions','form_field_dependencies',
      'form_applicability_rules','form_data_domains','registration_form_configs',
      'registration_journey_types','license_action_form_configs',
      'license_verification_templates','application_form_requirements',
      'application_rfi_auto_rules',
      -- returns / obligations definitions
      'return_definitions','return_definition_forms','return_configs','return_config_forms',
      'return_configurations','return_templates','return_types','reporting_obligation_rules',
      -- metrics / prudential configuration
      'regulatory_metrics','metric_calculation_rules','prudential_ratios',
      'prudential_ratio_versions','prudential_thresholds','prudential_threshold_versions',
      'prudential_ewi_rules','prudential_stress_indicators','prudential_risk_taxonomy',
      'prudential_process_sla_config','pfmi_principles','pfmi_principle_applicability',
      'group_ewi_rules','group_consolidation_methods','risk_score_weights',
      'payment_oversight_config','payment_system_operators',
      -- conduct / complaints configuration
      'complaint_types','complaint_status_catalogue','complaint_intake_rules',
      'complaint_escalation_rules','complaint_duplicate_rules',
      'complaint_duplicate_scoring_config','complaint_rfi_settings',
      'conduct_channels','conduct_products','conduct_risk_categories',
      'conduct_triage_rules','conduct_monitoring_rules','conduct_monitoring_rule_versions',
      'conduct_alert_thresholds','conduct_intelligence_templates',
      -- fit & proper configuration
      'fp_screening_configs','fp_screening_execution_rules','fp_sector_decision_rules',
      'fp_committees','fp_committee_members',
      -- notifications configuration
      'notification_event_configs','notification_templates','notification_template_versions',
      'notification_event_channel_templates','notification_channel_policies',
      -- correspondence configuration
      'correspondence_templates','correspondence_routing_rules',
      -- fees
      'fee_types','fee_configurations','fee_components','fee_rules',
      'license_fee_bindings','license_fee_process_settings','license_lifecycle_configs',
      'license_terms',
      -- escalation / SLA configuration
      'escalation_rules','sla_configurations','sla_escalation_tiers',
      'business_calendar_profiles','business_calendar_holidays',
      'business_calendar_process_assignments',
      -- reporting configuration
      'report_definitions','report_sources','report_source_columns','report_source_filters',
      'report_option_sets','report_status_options','report_templates','report_runtime_config',
      'report_dashboard_layouts','report_dashboard_widgets',
      -- entity / registry configuration
      'entity_identifier_types','entity_identity_statuses','entity_resolution_policies',
      'entity_registry_failure_policies','entity_membership_roles',
      'entity_membership_role_permissions','entity_data_authority_rules',
      'registry_publication_policies','classification_schemes','classification_values',
      'data_domains','data_concepts',
      -- integration / platform configuration
      'integration_connections','integration_credentials','integration_alert_rules',
      'captcha_configurations','captcha_secrets','site_settings','engine_rules',
      'engine_rule_versions','rule_overrides','onboarding_alert_rules',
      'onboarding_alert_signals','onboarding_retention_policies','rbac_module_scopes'
    ]) AS t
  ), keep_reference AS (
    SELECT unnest(ARRAY[
      'countries','states','sectors','sub_sectors','categories','regulators','services',
      'master_data_types','master_data_items','relationship_types','ownership_types',
      'regulatory_request_types','role_types'
    ]) AS t
  ),
  cls AS (
    SELECT c.relname::text AS tbl,
      CASE
        WHEN c.relname LIKE 'cert\_%' OR c.relname = 'certification_seed_manifest'
          THEN 'CERTIFICATION_HARNESS_KEEP'
        WHEN (c.relname LIKE 'sec\_%' AND c.relname <> 'sec_user_roles')
          OR c.relname IN ('permissions','permission_actions','permission_modules',
                           'permission_module_routes','permission_dependent_actions',
                           'roles','role_permissions')
          THEN 'SECURITY_CONFIG_KEEP'
        WHEN c.relname IN (SELECT t FROM keep_reference) THEN 'REFERENCE_KEEP'
        WHEN c.relname IN (SELECT t FROM keep_config)    THEN 'CONFIG_KEEP'
        ELSE 'RUNTIME_MUST_ZERO'
      END AS cat
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  )
  SELECT cls.tbl, cls.cat,
    CASE cls.cat
      WHEN 'CERTIFICATION_HARNESS_KEEP' THEN 'Certification fixture registry / guard'
      WHEN 'SECURITY_CONFIG_KEEP' THEN 'Roles, permissions, navigation and route configuration'
      WHEN 'REFERENCE_KEEP' THEN 'Reference / master data'
      WHEN 'CONFIG_KEEP' THEN 'Business configuration (definitions, templates, rules, thresholds)'
      ELSE 'Operational/runtime population — must be zero before the V2 seed'
    END,
    (xpath('/row/c/text()', query_to_xml(
        format('select count(*) as c from public.%I', cls.tbl), false, true, '')))[1]::text::bigint
  FROM cls
  ORDER BY 2, 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cert_v2_table_classification() TO authenticated, service_role;

-- --------------------------------------------------- user-identity runtime set
CREATE OR REPLACE FUNCTION public.cert_v2_user_identity_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT ARRAY['profiles','sec_user_roles','user_roles','user_dynamic_roles']::text[];
$$;

-- ------------------------------------------------------ runtime zeroiser (TRUNCATE)
-- Config loss is impossible: keep-table counts are snapshotted and the whole
-- statement is rolled back (exception) if any keep table shrinks.
CREATE OR REPLACE FUNCTION public.cert_v2_zero_runtime(_keep_user_ids uuid[] DEFAULT '{}'::uuid[])
RETURNS TABLE(table_name text, rows_before bigint, rows_after bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tables text[];
  v_sql text;
  r record;
  v_lost text;
BEGIN
  PERFORM public.cert_v2_assert_allowed();

  CREATE TEMP TABLE _zs_before ON COMMIT DROP AS
    SELECT c.table_name, c.category, c.row_count FROM public.cert_v2_table_classification() c;

  SELECT array_agg(b.table_name ORDER BY b.table_name) INTO v_tables
    FROM _zs_before b
   WHERE b.category = 'RUNTIME_MUST_ZERO'
     AND NOT (b.table_name = ANY (public.cert_v2_user_identity_tables()));

  IF v_tables IS NOT NULL THEN
    SELECT 'TRUNCATE TABLE ' || string_agg(format('public.%I', t), ', ') || ' CASCADE'
      INTO v_sql FROM unnest(v_tables) t;
    EXECUTE v_sql;
  END IF;

  -- user-identity tables keep only the certification accounts
  DELETE FROM public.sec_user_roles     WHERE NOT (user_id = ANY (_keep_user_ids));
  DELETE FROM public.user_roles         WHERE NOT (user_id = ANY (_keep_user_ids));
  DELETE FROM public.user_dynamic_roles WHERE NOT (user_id = ANY (_keep_user_ids));

  -- config integrity guard
  SELECT string_agg(format('%s (%s -> %s)', b.table_name, b.row_count, a.row_count), ', ')
    INTO v_lost
    FROM _zs_before b
    JOIN public.cert_v2_table_classification() a ON a.table_name = b.table_name
   WHERE b.category <> 'RUNTIME_MUST_ZERO' AND a.row_count < b.row_count;
  IF v_lost IS NOT NULL THEN
    RAISE EXCEPTION 'CONFIG_LOSS_DETECTED: %', v_lost USING ERRCODE = '22023';
  END IF;

  FOR r IN
    SELECT b.table_name AS tn, b.row_count AS rb, a.row_count AS ra
      FROM _zs_before b
      JOIN public.cert_v2_table_classification() a ON a.table_name = b.table_name
     WHERE b.category = 'RUNTIME_MUST_ZERO' AND b.row_count > 0
     ORDER BY 1
  LOOP
    RETURN QUERY SELECT r.tn, r.rb, r.ra;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.cert_v2_zero_runtime(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_v2_zero_runtime(uuid[]) TO service_role;

-- --------------------------------------- detach purged users from keep tables
-- Nulls (or reassigns) every FK column pointing at auth.users / public.profiles
-- for users that are about to be removed, so the auth delete cannot be blocked
-- and configuration provenance columns do not dangle.
CREATE OR REPLACE FUNCTION public.cert_v2_detach_users(_keep_user_ids uuid[], _reassign_to uuid)
RETURNS TABLE(target text, action text, rows_affected integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_n integer;
BEGIN
  PERFORM public.cert_v2_assert_allowed();
  FOR r IN
    SELECT src.relname::text AS tbl, a.attname::text AS col, a.attnotnull AS nn
      FROM pg_constraint c
      JOIN pg_class src ON src.oid = c.conrelid
      JOIN pg_class tgt ON tgt.oid = c.confrelid
      JOIN pg_namespace tn ON tn.oid = tgt.relnamespace
      JOIN pg_namespace sn ON sn.oid = src.relnamespace
      JOIN unnest(c.conkey) k ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
     WHERE c.contype = 'f' AND sn.nspname = 'public'
       AND array_length(c.conkey,1) = 1
       AND (tgt.relname = 'profiles' OR (tn.nspname = 'auth' AND tgt.relname = 'users'))
       AND src.relname <> 'profiles'
       AND NOT (src.relname = ANY (public.cert_v2_user_identity_tables()))
     ORDER BY 1,2
  LOOP
    IF r.nn THEN
      EXECUTE format('UPDATE public.%I SET %I = $2 WHERE NOT (%I = ANY($1))',
                     r.tbl, r.col, r.col) USING _keep_user_ids, _reassign_to;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN RETURN QUERY SELECT r.tbl||'.'||r.col, 'reassigned', v_n; END IF;
    ELSE
      EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I IS NOT NULL AND NOT (%I = ANY($1))',
                     r.tbl, r.col, r.col, r.col) USING _keep_user_ids;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN RETURN QUERY SELECT r.tbl||'.'||r.col, 'nulled', v_n; END IF;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.cert_v2_detach_users(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_v2_detach_users(uuid[], uuid) TO service_role;

-- ------------------------------------- notification / correspondence runtime clean
-- Reusable: also invoked as the POST-SEED runtime clean before Wave 3.
CREATE OR REPLACE FUNCTION public.cert_v2_clean_message_runtime()
RETURNS TABLE(table_name text, rows_deleted bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_sql text; v_tables text[];
BEGIN
  PERFORM public.cert_v2_assert_allowed();

  CREATE TEMP TABLE _mr_before ON COMMIT DROP AS
    SELECT c.table_name, c.row_count
      FROM public.cert_v2_table_classification() c
     WHERE c.category = 'RUNTIME_MUST_ZERO'
       AND (c.table_name LIKE 'notification%' OR c.table_name LIKE '%notification%'
            OR c.table_name LIKE 'correspondence%' OR c.table_name = 'notifications');

  SELECT array_agg(b.table_name ORDER BY b.table_name) INTO v_tables FROM _mr_before b;
  IF v_tables IS NOT NULL THEN
    SELECT 'TRUNCATE TABLE ' || string_agg(format('public.%I', t), ', ') || ' CASCADE'
      INTO v_sql FROM unnest(v_tables) t;
    EXECUTE v_sql;
  END IF;

  FOR r IN SELECT b.table_name AS tn, b.row_count AS rc FROM _mr_before b WHERE b.row_count > 0 ORDER BY 1
  LOOP
    RETURN QUERY SELECT r.tn, r.rc;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.cert_v2_clean_message_runtime() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_v2_clean_message_runtime() TO service_role;

-- ----------------------------------------------------------- zero-state gate
CREATE OR REPLACE FUNCTION public.cert_v2_zero_state_gate()
RETURNS TABLE(metric text, actual_count bigint, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH cls AS (
    SELECT k.table_name AS t, k.category AS c, k.row_count AS n
      FROM public.cert_v2_table_classification() k
     WHERE k.category = 'RUNTIME_MUST_ZERO'
  ), m AS (
    SELECT 'OLD_BUSINESS_RUNTIME_ROWS' AS k,
           (SELECT coalesce(sum(n),0) FROM cls
             WHERE NOT (t = ANY (public.cert_v2_user_identity_tables()))) AS n
    UNION ALL SELECT 'OLD_NOTIFICATION_RUNTIME_ROWS',
           (SELECT coalesce(sum(n),0) FROM cls WHERE t LIKE '%notification%' OR t = 'notifications')
    UNION ALL SELECT 'OLD_CORRESPONDENCE_RUNTIME_ROWS',
           (SELECT coalesce(sum(n),0) FROM cls WHERE t LIKE 'correspondence%')
    UNION ALL SELECT 'OLD_WORKFLOW_RUNTIME_ROWS',
           (SELECT coalesce(sum(n),0) FROM cls
             WHERE t LIKE 'workflow%' OR t LIKE 'approval_action%'
                OR t LIKE 'sla_stage%' OR t LIKE 'escalation%' OR t = 'escalations')
    UNION ALL SELECT 'OLD_SUPERVISORY_RUNTIME_ROWS',
           (SELECT coalesce(sum(n),0) FROM cls
             WHERE t LIKE 'prudential%' OR t LIKE 'conduct%' OR t LIKE 'complaint%'
                OR t LIKE 'examination%' OR t LIKE 'enforcement%' OR t LIKE 'fp\_%'
                OR t LIKE 'thematic%' OR t LIKE 'entity%' OR t LIKE 'return%'
                OR t LIKE 'application%' OR t LIKE 'licen%' OR t LIKE 'group\_%'
                OR t LIKE 'ai\_%')
    UNION ALL SELECT 'OLD_EXTERNAL_USER_RELATIONSHIPS',
           (SELECT count(*) FROM public.entity_user_access)
         + (SELECT count(*) FROM public.entity_user_memberships)
         + (SELECT count(*) FROM public.ppoc_entity_mappings)
    UNION ALL SELECT 'STALE_WEB_USER_LINKS',
           (SELECT count(*) FROM public.profiles p
             WHERE p.licensee_id IS NOT NULL
                OR coalesce(btrim(p.entity_name),'') NOT IN ('','Regulator'))
    UNION ALL SELECT 'NON_CERTIFICATION_PROFILES',
           (SELECT count(*) FROM public.profiles p
             WHERE NOT EXISTS (SELECT 1 FROM public.cert_certification_users u WHERE u.user_id = p.id))
    UNION ALL SELECT 'CERTIFICATION_USERS_WITHOUT_ACTIVE_ROLE',
           (SELECT count(*) FROM public.cert_certification_users u
             WHERE NOT EXISTS (SELECT 1 FROM public.sec_user_roles ur
                                WHERE ur.user_id = u.user_id AND ur.status = 'active'))
  )
  SELECT m.k, m.n, CASE WHEN m.n = 0 THEN 'PASS' ELSE 'FAIL' END FROM m ORDER BY 1;
$$;
GRANT EXECUTE ON FUNCTION public.cert_v2_zero_state_gate() TO authenticated, service_role;


-- --------------------------------------------- configuration integrity gate
CREATE OR REPLACE FUNCTION public.cert_v2_config_integrity_gate()
RETURNS TABLE(area text, actual_count bigint, expected_min bigint, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  WITH c AS (
    SELECT 'roles' k, (SELECT count(*) FROM public.sec_roles) n, 60::bigint e
    UNION ALL SELECT 'role_templates', (SELECT count(*) FROM public.sec_role_templates), 48
    UNION ALL SELECT 'permissions', (SELECT count(*) FROM public.sec_permissions), 336
    UNION ALL SELECT 'role_permissions', (SELECT count(*) FROM public.sec_role_permissions), 1233
    UNION ALL SELECT 'navigation_items', (SELECT count(*) FROM public.sec_navigation_items), 257
    UNION ALL SELECT 'routes', (SELECT count(*) FROM public.sec_routes), 134
    UNION ALL SELECT 'workflow_definitions', (SELECT count(*) FROM public.approval_workflows), 11
    UNION ALL SELECT 'workflow_steps', (SELECT count(*) FROM public.approval_steps), 35
    UNION ALL SELECT 'form_templates', (SELECT count(*) FROM public.form_templates), 55
    UNION ALL SELECT 'form_fields', (SELECT count(*) FROM public.form_fields), 2892
    UNION ALL SELECT 'return_definitions', (SELECT count(*) FROM public.return_definitions), 6
    UNION ALL SELECT 'regulatory_metrics', (SELECT count(*) FROM public.regulatory_metrics), 25
    UNION ALL SELECT 'metric_calculation_rules', (SELECT count(*) FROM public.metric_calculation_rules), 5
    UNION ALL SELECT 'prudential_thresholds', (SELECT count(*) FROM public.prudential_thresholds), 15
    UNION ALL SELECT 'prudential_ewi_rules', (SELECT count(*) FROM public.prudential_ewi_rules), 8
    UNION ALL SELECT 'notification_event_configs', (SELECT count(*) FROM public.notification_event_configs), 248
    UNION ALL SELECT 'notification_templates', (SELECT count(*) FROM public.notification_templates), 426
    UNION ALL SELECT 'correspondence_templates', (SELECT count(*) FROM public.correspondence_templates), 5
    UNION ALL SELECT 'sectors', (SELECT count(*) FROM public.sectors), 12
    UNION ALL SELECT 'sub_sectors', (SELECT count(*) FROM public.sub_sectors), 12
    UNION ALL SELECT 'master_data_items', (SELECT count(*) FROM public.master_data_items), 20950
  )
  SELECT c.k, c.n, c.e, CASE WHEN c.n >= c.e THEN 'PASS' ELSE 'FAIL' END FROM c ORDER BY 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cert_v2_config_integrity_gate() TO authenticated, service_role;

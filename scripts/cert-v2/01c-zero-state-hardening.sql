-- Certification V2 / Wave 1.5c — zero-state hardening (applied 2026-08-23)
-- Authoritative deployed definitions, exported from the certification database.

CREATE OR REPLACE FUNCTION public.cert_v2_table_classification_base()
 RETURNS TABLE(table_name text, category text, reason text, row_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH keep_config AS (
    SELECT unnest(ARRAY[
      'approval_workflows','approval_workflow_versions','approval_workflow_types',
      'approval_steps','approval_step_actions','approval_action_notifications',
      'approval_step_entry_notifications','workflow_templates','process_templates',
      'delegation_rules_config','review_step_permissions','review_role_display_settings',
      'review_narrative_fields','decision_rationale_templates','appeal_panel_scopes',
      'lifecycle_stages','enforcement_workflow_stages','enforcement_workflow_transitions',
      'enforcement_case_number_counters',
      'forms','form_templates','form_versions','form_fields','form_purposes','form_packages',
      'form_trigger_types','form_field_definitions','form_field_dependencies',
      'form_applicability_rules','form_data_domains','registration_form_configs',
      'registration_journey_types','license_action_form_configs',
      'license_verification_templates','application_form_requirements',
      'application_rfi_auto_rules',
      'return_definitions','return_definition_forms','return_configs','return_config_forms',
      'return_configurations','return_templates','return_types','reporting_obligation_rules',
      'regulatory_metrics','metric_calculation_rules','prudential_ratios',
      'prudential_ratio_versions','prudential_thresholds','prudential_threshold_versions',
      'prudential_ewi_rules','prudential_stress_indicators','prudential_risk_taxonomy',
      'prudential_process_sla_config','pfmi_principles','pfmi_principle_applicability',
      'group_ewi_rules','risk_score_weights',
      'payment_oversight_config','payment_system_operators',
      'complaint_types','complaint_status_catalogue','complaint_intake_rules',
      'complaint_escalation_rules','complaint_duplicate_rules',
      'complaint_duplicate_scoring_config','complaint_rfi_settings',
      'conduct_channels','conduct_products','conduct_risk_categories',
      'conduct_triage_rules','conduct_monitoring_rules','conduct_monitoring_rule_versions',
      'conduct_alert_thresholds','conduct_intelligence_templates',
      'fp_screening_configs','fp_screening_execution_rules','fp_sector_decision_rules',
      'fp_committees','fp_committee_members',
      'notification_event_configs','notification_templates','notification_template_versions',
      'notification_event_channel_templates','notification_channel_policies',
      'correspondence_templates','correspondence_routing_rules',
      'fee_types','fee_configurations','fee_components','fee_rules',
      'license_fee_bindings','license_fee_process_settings','license_lifecycle_configs',
      'license_terms',
      'escalation_rules','sla_configurations','sla_escalation_tiers',
      'business_calendar_profiles','business_calendar_holidays',
      'business_calendar_process_assignments',
      'report_definitions','report_sources','report_source_columns','report_source_filters',
      'report_option_sets','report_status_options','report_templates','report_runtime_config',
      'report_dashboard_layouts','report_dashboard_widgets',
      'entity_identifier_types','entity_identity_statuses','entity_resolution_policies',
      'entity_registry_failure_policies','entity_membership_roles',
      'entity_membership_role_permissions','entity_data_authority_rules',
      'registry_publication_policies','classification_schemes','classification_values',
      'data_domains','data_concepts',
      'integration_connections','integration_credentials','integration_alert_rules',
      'captcha_configurations','captcha_secrets','site_settings','engine_rules',
      'engine_rule_versions','onboarding_alert_rules',
      'onboarding_retention_policies','rbac_module_scopes'
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
      ELSE 'Operational/runtime population - must be zero before the V2 seed'
    END,
    (xpath('/row/c/text()', query_to_xml(
        format('select count(*) as c from public.%I', cls.tbl), false, true, '')))[1]::text::bigint
  FROM cls
  ORDER BY 2, 1;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.cert_v2_detach_users(_keep_user_ids uuid[], _reassign_to uuid)
 RETURNS TABLE(target text, action text, rows_affected integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; v_n integer; v_keep text[];
BEGIN
  PERFORM public.cert_v2_assert_allowed();

  SELECT array_agg(c.table_name) INTO v_keep
    FROM public.cert_v2_table_classification() c
   WHERE c.category <> 'RUNTIME_MUST_ZERO';

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
       AND src.relname = ANY (v_keep)
       AND NOT (src.relname = ANY (public.cert_v2_user_identity_tables()))
     ORDER BY 1,2
  LOOP
    BEGIN
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
    EXCEPTION WHEN OTHERS THEN
      -- append-only / immutability guarded configuration table: report, do not abort
      RETURN QUERY SELECT r.tbl||'.'||r.col, 'blocked_immutable:'||SQLERRM, 0;
    END;
  END LOOP;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.cert_v2_zero_message_runtime()
 RETURNS TABLE(table_name text, rows_before bigint, rows_after bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tables text[] := ARRAY[
    'notifications','notification_event_queue','notification_dispatch_log',
    'notification_delivery_attempts','notification_digest_queue',
    'correspondence_messages','correspondence_threads','correspondence_dispatches',
    'correspondence_events','correspondence_attachments',
    'audit_logs','compliance_audit_logs','security_event_logs','integration_logs',
    'worker_invocation_tokens','otp_verifications','document_action_logs'
  ];
  t text; v_before bigint; v_after bigint;
BEGIN
  PERFORM public.cert_v2_assert_allowed();

  FOREACH t IN ARRAY v_tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname='public' AND c.relname=t AND c.relkind='r'
    ) THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO v_before;
      IF v_before > 0 THEN
        EXECUTE format('TRUNCATE TABLE public.%I CASCADE', t);
      END IF;
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO v_after;
      RETURN QUERY SELECT t, v_before, v_after;
    END IF;
  END LOOP;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.cert_v2_operational_area_matrix()
 RETURNS TABLE(area text, tables_count integer, row_count bigint, expectation text, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ident text[] := ARRAY['profiles','sec_user_roles','user_roles','user_dynamic_roles','pre_license_users'];
BEGIN
  RETURN QUERY
  WITH cls AS (
    SELECT c.table_name t, c.row_count n
      FROM public.cert_v2_table_classification() c
     WHERE c.category = 'RUNTIME_MUST_ZERO'
       AND NOT (c.table_name = ANY (v_ident))
  ), areas AS (
    SELECT * FROM (VALUES
      ('Entity Registry',        ARRAY['entity_%','registry_%']),
      ('Registration',           ARRAY['registration_%','pre_license%','declaration_%','onboarding_%']),
      ('Entity Resolution',      ARRAY['entity_resolution%','entity_match%','entity_merge%']),
      ('Membership/User Access', ARRAY['entity_user_%','ppoc_%','web_user%','delegation_%']),
      ('Licensing',              ARRAY['application%','licence_%','license_%','licenses','appeal%','enforcement_appeals']),
      ('Returns',                ARRAY['return_%','returns_%','compliance_returns']),
      ('Prudential',             ARRAY['prudential_%','group_%','financial_group%','risk_%','stress_%','camels%','pfmi_%']),
      ('Fit & Proper',           ARRAY['fp\_%','aml_%']),
      ('Complaints',             ARRAY['complaint%']),
      ('Conduct',                ARRAY['conduct_%']),
      ('Thematic',               ARRAY['thematic%']),
      ('Inspections/Examinations',ARRAY['examination%','inspection%']),
      ('Enforcement',            ARRAY['enforcement_%']),
      ('Correspondence',         ARRAY['correspondence_%']),
      ('Notifications',          ARRAY['notification%','notifications','%_notifications']),
      ('Payments/Fees runtime',  ARRAY['payment%','fee_calc%','invoice%','refund%']),
      ('Escalations',            ARRAY['escalation%','%_escalation%']),
      ('Workflow Instances',     ARRAY['workflow_instance%','approval_action%','approval_actions','review_%','decision_%']),
      ('Supervisory Intelligence',ARRAY['supervisory_%','monitoring_%','ewi_%']),
      ('AI runtime insights',    ARRAY['ai\_%']),
      ('Reports/jobs/exports',   ARRAY['report_run%','%_export_%','%_jobs','audit_export%']),
      ('Documents',              ARRAY['document%','file_uploads']),
      ('Audit/Logs',             ARRAY['audit\_%','%_audit_%','%_logs','%_log','security_events'])
    ) v(a, pats)
  ), matched AS (
    SELECT a.a AS area, cls.t, cls.n
      FROM areas a JOIN cls ON EXISTS (SELECT 1 FROM unnest(a.pats) p WHERE cls.t LIKE p)
  ), noncert AS (
    SELECT (SELECT count(*) FROM public.profiles p
             WHERE p.id NOT IN (SELECT user_id FROM public.cert_certification_users))
         + (SELECT count(*) FROM public.sec_user_roles s
             WHERE s.user_id NOT IN (SELECT user_id FROM public.cert_certification_users))
         + (SELECT count(*) FROM public.user_roles u
             WHERE u.user_id NOT IN (SELECT user_id FROM public.cert_certification_users))
         + (SELECT count(*) FROM public.user_dynamic_roles d
             WHERE d.user_id NOT IN (SELECT user_id FROM public.cert_certification_users)) AS n
  )
  SELECT m.area, count(*)::int, coalesce(sum(m.n),0)::bigint, 'ZERO before Wave 2 seed'::text,
         CASE WHEN coalesce(sum(m.n),0) = 0 THEN 'PASS' ELSE 'FAIL' END
    FROM matched m GROUP BY m.area
   UNION ALL
  SELECT 'Certification identities (retained)'::text, array_length(v_ident,1),
         (SELECT count(*) FROM public.profiles)::bigint,
         'ONLY certification personas - zero non-certification rows'::text,
         CASE WHEN (SELECT n FROM noncert) = 0 THEN 'PASS' ELSE 'FAIL' END
   UNION ALL
  SELECT 'UNCLASSIFIED runtime tables'::text, count(*)::int, coalesce(sum(cls.n),0)::bigint,
         'ZERO before Wave 2 seed'::text,
         CASE WHEN coalesce(sum(cls.n),0) = 0 THEN 'PASS' ELSE 'FAIL' END
    FROM cls WHERE NOT EXISTS (SELECT 1 FROM matched m WHERE m.t = cls.t)
   ORDER BY 1;
END;
$function$

;

GRANT EXECUTE ON FUNCTION public.cert_v2_table_classification_base() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cert_v2_detach_users(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_v2_detach_users(uuid[], uuid) TO service_role;
REVOKE ALL ON FUNCTION public.cert_v2_zero_message_runtime() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_v2_zero_message_runtime() TO service_role;
GRANT EXECUTE ON FUNCTION public.cert_v2_operational_area_matrix() TO authenticated, service_role;

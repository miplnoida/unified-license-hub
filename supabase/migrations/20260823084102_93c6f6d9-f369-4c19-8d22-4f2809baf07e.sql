
CREATE OR REPLACE FUNCTION public.cert_v2_operational_area_matrix()
RETURNS TABLE(area text, tables_count integer, row_count bigint, expectation text, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
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
$function$;
GRANT EXECUTE ON FUNCTION public.cert_v2_operational_area_matrix() TO authenticated, service_role;

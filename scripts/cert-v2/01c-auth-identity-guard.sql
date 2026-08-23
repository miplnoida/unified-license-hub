-- =====================================================================
-- Certification V2 — Wave 1.5c auth-identity safety layer.
--
--  * cert_machine_identities            explicit machine/system whitelist
--  * cert_v2_auth_identity_classification()  CERTIFICATION_USER_KEEP /
--        MACHINE_SYSTEM_KEEP / OLD_HUMAN_PURGE / UNKNOWN_BLOCKER
--  * cert_v2_auth_purge_precheck()      fail-closed gate for auth deletion
--  * cert_v2_operational_area_matrix()  operational-area zero-state matrix
--
-- Applied as a migration; kept here so repository == database.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.cert_machine_identities (
  user_id       uuid PRIMARY KEY,
  email         text,
  owner_system  text NOT NULL,
  evidence      text NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cert_machine_identities TO authenticated;
GRANT ALL    ON public.cert_machine_identities TO service_role;
ALTER TABLE public.cert_machine_identities ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                   AND tablename='cert_machine_identities' AND policyname='cert_machine_admin_read') THEN
    CREATE POLICY cert_machine_admin_read ON public.cert_machine_identities
      FOR SELECT TO authenticated USING (EXISTS (
        SELECT 1 FROM public.sec_user_roles ur JOIN public.sec_roles r ON r.id = ur.role_id
         WHERE ur.user_id = auth.uid() AND ur.status = 'active'
           AND (r.is_break_glass OR r.key = ANY (ARRAY['security_administrator','system_administrator']))));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cert_v2_auth_identity_classification()
RETURNS TABLE(user_id uuid, email text, classification text, evidence text,
              created_at timestamptz, last_sign_in_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH u AS (
    SELECT au.id, au.email::text AS email, au.created_at, au.last_sign_in_at,
           coalesce(au.raw_app_meta_data, '{}'::jsonb)  AS app_meta,
           coalesce(au.raw_user_meta_data, '{}'::jsonb) AS user_meta
      FROM auth.users au
  )
  SELECT u.id, u.email,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.cert_certification_users c WHERE c.user_id = u.id)
        THEN 'CERTIFICATION_USER_KEEP'
      WHEN EXISTS (SELECT 1 FROM public.cert_machine_identities m WHERE m.user_id = u.id)
        OR u.app_meta->>'cert_identity_class' = 'machine'
        OR (u.user_meta->>'is_machine') = 'true'
        OR EXISTS (SELECT 1 FROM public.integration_connections ic WHERE ic.created_by = u.id)
        OR EXISTS (SELECT 1 FROM public.api_keys k WHERE k.created_by = u.id)
        THEN 'MACHINE_SYSTEM_KEEP'
      WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
        OR u.last_sign_in_at IS NOT NULL
        OR (u.app_meta->>'provider') IN ('email','google')
        THEN 'OLD_HUMAN_PURGE'
      ELSE 'UNKNOWN_BLOCKER'
    END,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.cert_certification_users c WHERE c.user_id = u.id)
        THEN 'listed in certification manifest'
      WHEN EXISTS (SELECT 1 FROM public.cert_machine_identities m WHERE m.user_id = u.id)
        THEN 'listed in machine-identity whitelist'
      WHEN u.app_meta->>'cert_identity_class' = 'machine' THEN 'app metadata cert_identity_class=machine'
      WHEN (u.user_meta->>'is_machine') = 'true'   THEN 'user metadata is_machine=true'
      WHEN EXISTS (SELECT 1 FROM public.integration_connections ic WHERE ic.created_by = u.id)
        THEN 'owns integration connection(s)'
      WHEN EXISTS (SELECT 1 FROM public.api_keys k WHERE k.created_by = u.id)
        THEN 'owns API key(s)'
      WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
        THEN 'has human profile row'
      WHEN u.last_sign_in_at IS NOT NULL THEN 'interactive sign-in history'
      WHEN (u.app_meta->>'provider') IN ('email','google') THEN 'interactive auth provider'
      ELSE 'no positive evidence - must be resolved manually'
    END,
    u.created_at, u.last_sign_in_at
  FROM u;
$$;
REVOKE ALL ON FUNCTION public.cert_v2_auth_identity_classification() FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.cert_v2_auth_identity_classification() TO service_role;

CREATE OR REPLACE FUNCTION public.cert_v2_auth_purge_precheck()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH c AS (SELECT * FROM public.cert_v2_auth_identity_classification())
  SELECT jsonb_build_object(
    'guard_ok', public.cert_v2_guard_ok(),
    'total', (SELECT count(*) FROM c),
    'certification_keep', (SELECT count(*) FROM c WHERE c.classification='CERTIFICATION_USER_KEEP'),
    'machine_keep',       (SELECT count(*) FROM c WHERE c.classification='MACHINE_SYSTEM_KEEP'),
    'old_human_purge',    (SELECT count(*) FROM c WHERE c.classification='OLD_HUMAN_PURGE'),
    'unknown_blocker',    (SELECT count(*) FROM c WHERE c.classification='UNKNOWN_BLOCKER'),
    'purge_allowed', public.cert_v2_guard_ok()
       AND NOT EXISTS (SELECT 1 FROM c WHERE c.classification='UNKNOWN_BLOCKER')
       AND EXISTS (SELECT 1 FROM c WHERE c.classification='CERTIFICATION_USER_KEEP'),
    'purge_ids', coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',c.user_id,'email',c.email))
                             FROM c WHERE c.classification='OLD_HUMAN_PURGE'), '[]'::jsonb),
    'unknown_ids', coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',c.user_id,'email',c.email,'evidence',c.evidence))
                             FROM c WHERE c.classification='UNKNOWN_BLOCKER'), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.cert_v2_auth_purge_precheck() FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.cert_v2_auth_purge_precheck() TO service_role;

CREATE OR REPLACE FUNCTION public.cert_v2_operational_area_matrix()
RETURNS TABLE(area text, tables_count integer, row_count bigint, expectation text, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  WITH cls AS (
    SELECT c.table_name t, c.row_count n
      FROM public.cert_v2_table_classification() c
     WHERE c.category = 'RUNTIME_MUST_ZERO'
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
  )
  SELECT m.area, count(*)::int, coalesce(sum(m.n),0)::bigint, 'ZERO before Wave 2 seed'::text,
         CASE WHEN coalesce(sum(m.n),0) = 0 THEN 'PASS' ELSE 'FAIL' END
    FROM matched m GROUP BY m.area
   UNION ALL
  SELECT 'UNCLASSIFIED runtime tables'::text, count(*)::int, coalesce(sum(cls.n),0)::bigint,
         'ZERO before Wave 2 seed'::text,
         CASE WHEN coalesce(sum(cls.n),0) = 0 THEN 'PASS' ELSE 'FAIL' END
    FROM cls WHERE NOT EXISTS (SELECT 1 FROM matched m WHERE m.t = cls.t)
   ORDER BY 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cert_v2_operational_area_matrix() TO PUBLIC;

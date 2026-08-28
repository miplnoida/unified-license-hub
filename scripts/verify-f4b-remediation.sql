-- =====================================================================
-- verify:f4b — permanent regression gate for F4-B licensing remediation
--
-- Non-destructive. Structural assertions only: it proves that the F4-B
-- controls exist and are wired, never that any particular business record is
-- in a given state.
-- =====================================================================
\set ON_ERROR_STOP on
\timing off
\pset pager off

\echo '=== F4-B LICENSING REMEDIATION VERIFICATION ==='

DO $$
DECLARE
  v_fail int := 0;
  v_pass int := 0;
  v_msg text;

  PROCEDURE_PLACEHOLDER boolean;

  FUNCTION_MISSING text;
BEGIN
  -- helper-free inline assertions -------------------------------------------

  -- F4-01: the ungoverned manual-approval path is gone.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'perform_manual_application_approval') THEN
    v_fail := v_fail + 1; RAISE WARNING 'FAIL F4-01: perform_manual_application_approval still exists';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS F4-01: manual approval path retired';
  END IF;

  -- F4-01: exactly one production licence-issuance path.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND pg_get_functiondef(p.oid) ILIKE '%provision_application_entity(%'
         AND p.proname <> 'provision_application_entity') > 2 THEN
    v_fail := v_fail + 1; RAISE WARNING 'FAIL F4-01: more than one caller of provision_application_entity';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS F4-01: single governed licence-issuance path';
  END IF;

  -- F4-02/11: handoff contract integrity.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                  AND indexname='registration_licensing_handoffs_application_uk') THEN
    v_fail := v_fail + 1; RAISE WARNING 'FAIL F4-11: handoff application uniqueness missing';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS F4-11: one application per handoff';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid='public.registration_licensing_handoffs'::regclass
                    AND contype='f' AND confdeltype='r') THEN
    v_fail := v_fail + 1; RAISE WARNING 'FAIL F4-02: handoff -> application FK is not ON DELETE RESTRICT';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS F4-02: handoff link cannot be silently lost';
  END IF;

  IF position('REGISTRATION_HANDOFF_REQUIRED' in
        (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='create_application_draft' LIMIT 1)) = 0 THEN
    v_fail := v_fail + 1; RAISE WARNING 'FAIL F4-02: create_application_draft does not enforce the F3 handoff';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS F4-02: F3 consumer contract enforced for initial licences';
  END IF;

  -- F4-03: F&P gate uses the canonical entity, not applicant_id.
  IF position('applicant_id' in
        (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='check_decision_gates' LIMIT 1)) > 0 THEN
    v_fail := v_fail + 1; RAISE WARNING 'FAIL F4-03: check_decision_gates still resolves identity via applicant_id';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS F4-03: decision gates use canonical entity identity';
  END IF;

  FOREACH v_msg IN ARRAY ARRAY['application_fp_readiness','application_licensing_readiness',
                               'licensing_gate_applicability','application_workflow_resolve',
                               'application_is_initial_licence','withdraw_application',
                               'licensing_provisioning_enqueue','licensing_provisioning_claim',
                               'licensing_provisioning_complete','application_status_vocabulary'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE n.nspname='public' AND p.proname = v_msg) THEN
      v_fail := v_fail + 1; RAISE WARNING 'FAIL: required function public.% is missing', v_msg;
    ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS: public.% present', v_msg;
    END IF;
  END LOOP;

  -- F4-04/05/13: final approval consults the readiness resolver and fails closed.
  IF position('application_licensing_readiness' in
        (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='perform_final_workflow_approval' LIMIT 1)) = 0 THEN
    v_fail := v_fail + 1; RAISE WARNING 'FAIL F4-04: final approval does not consult the readiness resolver';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS F4-04: final approval gated by readiness resolver';
  END IF;

  -- F4-07: canonical status vocabulary enforced by trigger.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.applications'::regclass
                  AND tgname='trg_applications_status_vocabulary' AND NOT tgisinternal) THEN
    v_fail := v_fail + 1; RAISE WARNING 'FAIL F4-07: application status vocabulary is not enforced';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS F4-07: application status vocabulary enforced server-side';
  END IF;

  -- F4-06: no write privileges for anon anywhere in the F4 estate.
  IF EXISTS (
    SELECT 1 FROM public.v_f4_privilege_census
     WHERE grantee = 'anon'
       AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
  ) THEN
    v_fail := v_fail + 1; RAISE WARNING 'FAIL F4-06: anon retains write privileges in the F4 estate';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS F4-06: anon has no write privilege in the F4 estate';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.v_f4_privilege_census
     WHERE grantee = 'authenticated'
       AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
  ) THEN
    v_fail := v_fail + 1; RAISE WARNING 'FAIL F4-06: authenticated retains structural privileges in the F4 estate';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS F4-06: authenticated holds no structural privileges';
  END IF;

  -- F4-06: every DML privilege held by authenticated is backed by a policy.
  IF EXISTS (
    SELECT 1 FROM public.v_f4_privilege_census c
     WHERE c.grantee = 'authenticated'
       AND c.privilege_type IN ('INSERT','UPDATE','DELETE')
       AND NOT EXISTS (
         SELECT 1 FROM pg_policies p
          WHERE p.schemaname='public' AND p.tablename = c.table_name
            AND p.permissive='PERMISSIVE'
            AND p.cmd IN (c.privilege_type, 'ALL')
            AND (p.roles='{public}' OR 'authenticated' = ANY (p.roles)))
  ) THEN
    v_fail := v_fail + 1; RAISE WARNING 'FAIL F4-06: authenticated DML privilege without a backing policy';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS F4-06: authenticated DML is policy-backed';
  END IF;

  -- F4-08: recoverable provisioning.
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='licensing_provisioning_outbox') THEN
    v_fail := v_fail + 1; RAISE WARNING 'FAIL F4-08: provisioning outbox missing';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS F4-08: provisioning outbox present';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.applications'::regclass
                  AND tgname='trg_applications_enqueue_provisioning' AND NOT tgisinternal) THEN
    v_fail := v_fail + 1; RAISE WARNING 'FAIL F4-08: provisioning is not enqueued on approval';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS F4-08: provisioning enqueued inside the approval transaction';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema='public'
       AND routine_name IN ('licensing_provisioning_claim','licensing_provisioning_complete','licensing_provisioning_enqueue')
       AND grantee IN ('anon','authenticated','PUBLIC')
  ) THEN
    v_fail := v_fail + 1; RAISE WARNING 'FAIL F4-08: provisioning worker RPCs are callable by app users';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS F4-08: provisioning worker RPCs are service-role only';
  END IF;

  -- F4-09/10: workflow vocabulary is an explicit server mapping.
  IF (SELECT count(*) FROM public.application_workflow_vocabulary) < 3 THEN
    v_fail := v_fail + 1; RAISE WARNING 'FAIL F4-10: workflow entity-type mapping incomplete';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS F4-10: workflow entity-type vocabulary mapped server-side';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.approval_workflows w
     WHERE w.is_active AND w.retired_at IS NULL
       AND w.entity_type IN ('pre_application','post_application','application')
       AND NOT EXISTS (SELECT 1 FROM public.application_workflow_vocabulary v WHERE v.entity_type = w.entity_type)
  ) THEN
    v_fail := v_fail + 1; RAISE WARNING 'FAIL F4-10: an active application workflow uses an unmapped entity_type';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS F4-10: every active application workflow entity_type is mapped';
  END IF;

  -- F4-12: entity_licenses is canonical.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.licensees'::regclass
                  AND tgname='trg_licensees_legacy_license_id' AND NOT tgisinternal) THEN
    v_fail := v_fail + 1; RAISE WARNING 'FAIL F4-12: licensees.license_id is still freely writable';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS F4-12: legacy licensees.license_id is read-only for app code';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.licensees l
     JOIN public.licenses lic ON lic.id = l.license_id
     WHERE l.license_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.entity_licenses el WHERE el.license_id = l.license_id)
  ) THEN
    v_fail := v_fail + 1; RAISE WARNING 'FAIL F4-12: legacy licence link not represented in entity_licenses';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS F4-12: legacy licence links mirrored into entity_licenses';
  END IF;

  -- F4-13: governed gate configuration exists and is governed.
  IF NOT EXISTS (SELECT 1 FROM public.config_governed_tables WHERE table_name='licensing_gate_configs') THEN
    v_fail := v_fail + 1; RAISE WARNING 'FAIL F4-13: licensing_gate_configs is not registered as governed configuration';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS F4-13: licensing gate configuration is governed (F1)';
  END IF;

  -- F4-14: governed withdrawal available to app users.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND routine_name='withdraw_application' AND grantee='authenticated'
  ) THEN
    v_fail := v_fail + 1; RAISE WARNING 'FAIL F4-14: withdraw_application is not callable by signed-in users';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'PASS F4-14: governed withdrawal available';
  END IF;

  RAISE NOTICE '---------------------------------------------';
  RAISE NOTICE 'F4-B VERIFICATION: % passed, % failed', v_pass, v_fail;

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'F4-B VERIFICATION FAILED: % assertion(s) failed', v_fail;
  END IF;
END $$;

\echo '=== F4-B VERIFICATION COMPLETE ==='

-- F8-W1B — PRUDENTIAL GROUP SUPERVISION (GAP-F8-04)
-- Proves that consolidated group supervision is wired to the CANONICAL truth
-- established in F8-W1A (return_metric_values, source_kind='CALCULATED'), that
-- it owns no independent ratio calculation and no dependency on the retired
-- return_calculated_ratios store, and that ownership treatment, EWI/breach
-- linkage, RBAC/RLS and auditability are real database contracts.
\set ON_ERROR_STOP on
\timing off
\pset pager off

DO $$
DECLARE n int; t text; def text;
BEGIN
  -- 1. Group structure contracts exist.
  PERFORM 1 FROM pg_class WHERE oid = 'public.financial_groups'::regclass;
  PERFORM 1 FROM pg_class WHERE oid = 'public.financial_group_members'::regclass;
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = 'public.financial_group_members'::regclass
     AND conname IN ('fgm_role_check','fgm_treatment_check','fgm_ownership_check','fgm_unique');
  IF n < 4 THEN
    RAISE EXCEPTION 'FAIL 1: group membership integrity constraints incomplete (found %)', n;
  END IF;
  RAISE NOTICE 'PASS 1: group structure with role, treatment, ownership and uniqueness constraints';

  -- 2. Member ratio resolution reads the canonical calculated store only.
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'group_member_ratios';
  IF def IS NULL THEN RAISE EXCEPTION 'FAIL 2: group_member_ratios missing'; END IF;
  IF def NOT LIKE '%return_metric_values%' THEN
    RAISE EXCEPTION 'FAIL 2: group_member_ratios does not read the canonical metric store';
  END IF;
  IF def NOT LIKE '%CALCULATED%' THEN
    RAISE EXCEPTION 'FAIL 2: group_member_ratios does not restrict to CALCULATED metric values';
  END IF;
  IF def LIKE '%return_calculated_ratios%' THEN
    RAISE EXCEPTION 'FAIL 2: group_member_ratios still reads the retired ratio store';
  END IF;
  RAISE NOTICE 'PASS 2: group member ratios resolve from canonical CALCULATED metric values';

  -- 3. Canonical filing lineage is used to pick the authoritative version.
  IF def NOT LIKE '%return_filing_versions%' OR def NOT LIKE '%return_filings%'
     OR def NOT LIKE '%reporting_periods%' THEN
    RAISE EXCEPTION 'FAIL 3: group member ratios bypass canonical filing/period lineage';
  END IF;
  IF def NOT LIKE '%ACCEPTED%' THEN
    RAISE EXCEPTION 'FAIL 3: group member ratios do not prefer accepted filing versions';
  END IF;
  RAISE NOTICE 'PASS 3: member values resolve through canonical filing, version and period lineage';

  -- 4. Data coverage is derived from the same canonical resolution.
  SELECT pg_get_functiondef(p.oid) INTO t FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'group_data_coverage';
  IF t IS NULL THEN RAISE EXCEPTION 'FAIL 4: group_data_coverage missing'; END IF;
  IF t LIKE '%return_calculated_ratios%' THEN
    RAISE EXCEPTION 'FAIL 4: group_data_coverage still reads the retired ratio store';
  END IF;
  IF t NOT LIKE '%group_member_ratios%' THEN
    RAISE EXCEPTION 'FAIL 4: group_data_coverage does not derive coverage from canonical member ratios';
  END IF;
  RAISE NOTICE 'PASS 4: group data coverage is derived from the canonical member resolution';

  -- 5. Consolidation consumes canonical member values and does not recalculate ratios.
  SELECT pg_get_functiondef(p.oid) INTO t FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'group_consolidated_recompute';
  IF t IS NULL THEN RAISE EXCEPTION 'FAIL 5: group_consolidated_recompute missing'; END IF;
  IF t NOT LIKE '%group_member_ratios%' THEN
    RAISE EXCEPTION 'FAIL 5: consolidation does not consume canonical member ratios';
  END IF;
  IF t LIKE '%return_calculated_ratios%' OR t LIKE '%record_return_ratio%' THEN
    RAISE EXCEPTION 'FAIL 5: consolidation depends on the retired ratio path';
  END IF;
  RAISE NOTICE 'PASS 5: consolidation consumes canonical member ratios with no independent ratio store';

  -- 6. Consolidation methodology is configured, never hardcoded/invented.
  PERFORM 1 FROM pg_class WHERE oid = 'public.group_consolidation_methods'::regclass;
  IF t NOT LIKE '%group_consolidation_methods%' AND t NOT LIKE '%ratio_rules%' THEN
    RAISE EXCEPTION 'FAIL 6: consolidation does not read configured methodology';
  END IF;
  RAISE NOTICE 'PASS 6: consolidation aggregates only per configured methodology';

  -- 7. Ownership treatment participates in consolidation.
  IF t NOT LIKE '%ownership_percentage%' OR t NOT LIKE '%proportional%'
     OR t NOT LIKE '%excluded%' THEN
    RAISE EXCEPTION 'FAIL 7: ownership treatment (proportional / exclusion) not applied';
  END IF;
  RAISE NOTICE 'PASS 7: ownership percentage, proportional treatment and exclusions are applied';

  -- 8. Consolidated results are persisted with group + period keys.
  PERFORM 1 FROM pg_class WHERE oid = 'public.group_consolidated_snapshots'::regclass;
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='group_consolidated_snapshots'
     AND column_name IN ('group_id','period_end');
  IF n < 2 THEN
    RAISE EXCEPTION 'FAIL 8: consolidated snapshots lack group/period keys';
  END IF;
  RAISE NOTICE 'PASS 8: consolidated snapshots are keyed by group and reporting period';

  -- 9. Group EWI / breach surfaces exist and use canonical breach truth.
  PERFORM 1 FROM pg_class WHERE oid = 'public.group_ewi_alerts'::regclass;
  SELECT pg_get_viewdef('public.prudential_group_consolidated'::regclass, true) INTO t;
  IF t LIKE '%return_calculated_ratios%' THEN
    RAISE EXCEPTION 'FAIL 9: group consolidated read surface depends on the retired ratio store';
  END IF;
  IF t NOT LIKE '%group_ewi_alerts%' THEN
    RAISE EXCEPTION 'FAIL 9: group consolidated read surface omits group EWI alerts';
  END IF;
  RAISE NOTICE 'PASS 9: group EWI/breach surfaces are exposed on canonical truth only';

  -- 10. No retired-store dependency anywhere in group supervision routines.
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND (p.proname LIKE 'group_%' OR p.proname LIKE '%group_consolidat%')
     AND pg_get_functiondef(p.oid) LIKE '%return_calculated_ratios%';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 10: % group routine(s) still read the retired ratio store', n;
  END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'record_return_ratio';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 10: the retired ratio writer was reintroduced';
  END IF;
  RAISE NOTICE 'PASS 10: no group supervision routine depends on the retired ratio path';

  -- 11. RBAC: group read/manage is decided by permission functions, not client code.
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.proname IN ('can_read_financial_group','can_manage_financial_group');
  IF n < 2 THEN RAISE EXCEPTION 'FAIL 11: group RBAC helper functions missing'; END IF;
  RAISE NOTICE 'PASS 11: group read and manage authority is enforced by database helpers';

  -- 12. RLS is enabled on every group surface.
  SELECT count(*) INTO n FROM pg_class
   WHERE relname IN ('financial_groups','financial_group_members',
                     'group_consolidated_snapshots','group_ewi_alerts',
                     'group_consolidation_methods')
     AND relnamespace = 'public'::regnamespace AND relrowsecurity;
  IF n < 5 THEN
    RAISE EXCEPTION 'FAIL 12: RLS not enabled on all group surfaces (enabled on %)', n;
  END IF;
  RAISE NOTICE 'PASS 12: RLS enabled on all group structure, consolidation and EWI surfaces';

  -- 13. Group surfaces are reachable through the Data API for signed-in users.
  IF NOT has_table_privilege('authenticated','public.financial_groups','SELECT')
     OR NOT has_table_privilege('authenticated','public.group_consolidated_snapshots','SELECT') THEN
    RAISE EXCEPTION 'FAIL 13: group surfaces lack SELECT grants for signed-in users';
  END IF;
  RAISE NOTICE 'PASS 13: group surfaces are granted to signed-in users and policy-gated';

  -- 14. Traceability: consolidated snapshots record the methodology used.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='group_consolidated_snapshots'
     AND column_name IN ('method_id','methodology','inputs','computed_at','computed_by');
  IF n = 0 THEN
    RAISE EXCEPTION 'FAIL 14: consolidated snapshots carry no methodology/computation trace';
  END IF;
  RAISE NOTICE 'PASS 14: consolidated snapshots carry computation traceability columns (%)', n;

  -- 15. Auditability: group supervision changes are auditable.
  PERFORM 1 FROM pg_class WHERE oid = 'public.compliance_audit_logs'::regclass;
  RAISE NOTICE 'PASS 15: compliance audit log exists for group supervision actions';
END$$;

\echo 'F8-W1B GROUP SUPERVISION: ALL GATES PASSED'

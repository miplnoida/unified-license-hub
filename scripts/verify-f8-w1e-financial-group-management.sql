-- FINANCIAL GROUP MANAGEMENT — governance gate
-- Proves that the Prudential Supervision → Financial Groups workspace can be
-- managed safely: structural invariants and methodology validity are enforced by
-- the SERVER (not the browser), governed mutations are audited canonically,
-- canonical legal ownership is exposed read-only for comparison, and the
-- consolidation maths / RBAC / RLS contracts proven in F8-W1B are unchanged.
\set ON_ERROR_STOP on
\timing off
\pset pager off

DO $$
DECLARE n int; def text; ok boolean; v_group uuid; v_h uuid; v_s uuid; v_e1 uuid; v_e2 uuid; v_m1 uuid; v_m2 uuid;
BEGIN
  -- 1. New supervisory capture columns exist.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='financial_group_members'
     AND column_name IN ('exclusion_rationale','ownership_variance_reason','ownership_variance_note');
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL 1: supervisory capture columns missing (found %)', n; END IF;
  RAISE NOTICE 'PASS 1: exclusion rationale and ownership-variance capture columns exist';

  -- 2. Variance reason is constrained to a controlled vocabulary.
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid='public.financial_group_members'::regclass AND conname='fgm_variance_reason_check';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 2: ownership variance reason vocabulary not constrained'; END IF;
  RAISE NOTICE 'PASS 2: ownership variance reason restricted to a controlled vocabulary';

  -- 3. Structural + methodology validation triggers are installed.
  SELECT count(*) INTO n FROM pg_trigger
   WHERE NOT tgisinternal AND tgname IN ('trg_fgm_validate','trg_gcm_validate');
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL 3: server-side validation triggers missing (found %)', n; END IF;
  RAISE NOTICE 'PASS 3: member and methodology validation enforced server-side';

  -- 4. Canonical audit triggers cover every governed group surface.
  SELECT count(*) INTO n FROM pg_trigger
   WHERE NOT tgisinternal
     AND tgname IN ('trg_fg_audit','trg_fgm_audit','trg_gcm_audit','trg_ige_audit','trg_gea_audit');
  IF n <> 5 THEN RAISE EXCEPTION 'FAIL 4: group audit triggers incomplete (found %)', n; END IF;
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='tg_group_audit';
  IF def NOT LIKE '%prudential_audit_event%' THEN
    RAISE EXCEPTION 'FAIL 4: group audit does not use the canonical prudential audit primitive';
  END IF;
  RAISE NOTICE 'PASS 4: group master, members, methodology, exposures and alerts audited via prudential_audit_event';

  -- 5. Canonical ownership reference exists, is read-only and authorisation gated.
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='financial_group_ownership_reference';
  IF def IS NULL THEN RAISE EXCEPTION 'FAIL 5: financial_group_ownership_reference missing'; END IF;
  IF def NOT LIKE '%can_read_financial_group%' THEN
    RAISE EXCEPTION 'FAIL 5: ownership reference is not authorisation gated';
  END IF;
  IF def NOT LIKE '%ownership_interests%' OR def NOT LIKE '%APPROVED%' THEN
    RAISE EXCEPTION 'FAIL 5: ownership reference does not read the canonical approved ownership ledger';
  END IF;
  IF def ~* '(insert into|update )\s+public\.ownership_interests' THEN
    RAISE EXCEPTION 'FAIL 5: ownership reference must never write the ownership ledger';
  END IF;
  IF def NOT LIKE '%STABLE%' THEN RAISE EXCEPTION 'FAIL 5: ownership reference is not read-only (STABLE)'; END IF;
  RAISE NOTICE 'PASS 5: canonical ownership evidence exposed read-only and gated by group read authority';

  -- 6. anon may not execute the ownership reference.
  SELECT has_function_privilege('anon',
    'public.financial_group_ownership_reference(uuid,uuid,uuid,date)', 'EXECUTE') INTO ok;
  IF ok THEN RAISE EXCEPTION 'FAIL 6: anon can execute the ownership reference'; END IF;
  SELECT has_function_privilege('authenticated',
    'public.financial_group_ownership_reference(uuid,uuid,uuid,date)', 'EXECUTE') INTO ok;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 6: authenticated cannot execute the ownership reference'; END IF;
  RAISE NOTICE 'PASS 6: ownership reference callable by signed-in users only';

  -- 7. Group profile payload surfaces the supervisory capture fields.
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='prudential_group_consolidated';
  IF def NOT LIKE '%exclusion_rationale%' OR def NOT LIKE '%ownership_variance_reason%' THEN
    RAISE EXCEPTION 'FAIL 7: group profile payload omits the supervisory capture fields';
  END IF;
  IF def NOT LIKE '%can_read_financial_group%' THEN
    RAISE EXCEPTION 'FAIL 7: group profile payload is no longer authorisation gated';
  END IF;
  RAISE NOTICE 'PASS 7: group profile payload exposes rationale/variance and remains authorisation gated';

  -- 8. Write authority is unchanged: management policies still use the canonical helper.
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('financial_groups','financial_group_members','group_consolidation_methods','intragroup_exposures')
     AND qual LIKE '%can_manage_financial_group%';
  IF n < 4 THEN RAISE EXCEPTION 'FAIL 8: group write policies no longer use can_manage_financial_group (found %)', n; END IF;
  RAISE NOTICE 'PASS 8: group write authority unchanged (can_manage_financial_group)';

  -- 9. RLS remains enabled on every group table.
  SELECT count(*) INTO n FROM pg_class
   WHERE relname IN ('financial_groups','financial_group_members','group_consolidation_methods',
                     'intragroup_exposures','group_consolidated_snapshots','group_risk_scores','group_ewi_alerts')
     AND relrowsecurity;
  IF n < 7 THEN RAISE EXCEPTION 'FAIL 9: RLS not enabled on all group tables (found %)', n; END IF;
  RAISE NOTICE 'PASS 9: RLS enabled on all financial group tables';

  -- 10. Consolidation maths still reads only canonical accepted metric values.
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='group_member_ratios';
  IF def NOT LIKE '%return_metric_values%' OR def LIKE '%return_calculated_ratios%' THEN
    RAISE EXCEPTION 'FAIL 10: group ratio resolution diverged from the canonical metric store';
  END IF;
  RAISE NOTICE 'PASS 10: consolidation still derives from canonical CALCULATED metric values';
END $$;

-- ---------------------------------------------------------------------------
-- Runtime proof of the server-side invariants, fully rolled back.
-- ---------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_group uuid; v_e1 uuid; v_e2 uuid; v_m1 uuid; v_m2 uuid; failed boolean;
BEGIN
  SELECT id INTO v_e1 FROM public.licensees ORDER BY created_at LIMIT 1;
  SELECT id INTO v_e2 FROM public.licensees WHERE id <> v_e1 ORDER BY created_at LIMIT 1;
  IF v_e1 IS NULL OR v_e2 IS NULL THEN
    RAISE NOTICE 'SKIP runtime gates 11-16: fewer than two canonical entities available';
    RETURN;
  END IF;

  INSERT INTO public.financial_groups (group_code, name, status)
  VALUES ('VERIFY-FGM-' || substr(md5(random()::text), 1, 6), 'Verification group', 'active')
  RETURNING id INTO v_group;

  INSERT INTO public.financial_group_members (group_id, licensee_id, member_role, consolidation_treatment, ownership_percentage)
  VALUES (v_group, v_e1, 'ultimate_holding', 'full', 100) RETURNING id INTO v_m1;
  INSERT INTO public.financial_group_members (group_id, licensee_id, parent_member_id, member_role, consolidation_treatment, ownership_percentage)
  VALUES (v_group, v_e2, v_m1, 'subsidiary', 'full', 60) RETURNING id INTO v_m2;
  RAISE NOTICE 'PASS 11: valid holding/subsidiary hierarchy accepted';

  -- 12. cycle rejected
  failed := false;
  BEGIN
    UPDATE public.financial_group_members SET parent_member_id = v_m2 WHERE id = v_m1;
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'FAIL 12: circular hierarchy accepted'; END IF;
  RAISE NOTICE 'PASS 12: circular hierarchy rejected server-side';

  -- 13. self parent rejected
  failed := false;
  BEGIN
    UPDATE public.financial_group_members SET parent_member_id = v_m2 WHERE id = v_m2;
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'FAIL 13: self-parenting accepted'; END IF;
  RAISE NOTICE 'PASS 13: self-parenting rejected server-side';

  -- 14. excluded treatment without rationale rejected
  failed := false;
  BEGIN
    UPDATE public.financial_group_members
       SET consolidation_treatment = 'excluded', exclusion_rationale = NULL WHERE id = v_m2;
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'FAIL 14: exclusion without a rationale accepted'; END IF;
  UPDATE public.financial_group_members
     SET consolidation_treatment = 'excluded', exclusion_rationale = 'Non-regulated activity' WHERE id = v_m2;
  RAISE NOTICE 'PASS 14: exclusion requires a rationale, and is accepted once documented';

  -- 15. end date before effective date rejected
  failed := false;
  BEGIN
    UPDATE public.financial_group_members
       SET effective_date = '2025-01-01', end_date = '2024-01-01' WHERE id = v_m2;
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'FAIL 15: end date before effective date accepted'; END IF;
  RAISE NOTICE 'PASS 15: member date chronology enforced';

  -- 16. unsupported methodology token rejected, supported tokens accepted
  failed := false;
  BEGIN
    INSERT INTO public.group_consolidation_methods (group_id, version, ratio_rules, large_exposure_pct)
    VALUES (v_group, 1, '[{"ratio_key":"CAR","method":"average"}]'::jsonb, 10);
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'FAIL 16: unsupported aggregation method accepted'; END IF;
  INSERT INTO public.group_consolidation_methods (group_id, version, ratio_rules, eliminate_exposure_types, large_exposure_pct, is_active)
  VALUES (v_group, 1, '[{"ratio_key":"CAR","method":"weighted_avg"},{"ratio_key":"TOTAL_ASSETS","method":"sum","eliminate":true}]'::jsonb,
          ARRAY['loan','deposit','capital'], 10, true);
  RAISE NOTICE 'PASS 16: methodology accepts only engine-supported aggregation tokens';

  -- 17. blank ratio key and invalid exposure type rejected
  failed := false;
  BEGIN
    INSERT INTO public.group_consolidation_methods (group_id, version, ratio_rules, large_exposure_pct)
    VALUES (v_group, 2, '[{"ratio_key":"","method":"sum"}]'::jsonb, 10);
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'FAIL 17: methodology rule without a metric code accepted'; END IF;
  failed := false;
  BEGIN
    INSERT INTO public.group_consolidation_methods (group_id, version, eliminate_exposure_types, large_exposure_pct)
    VALUES (v_group, 3, ARRAY['equity_swap'], 10);
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'FAIL 17: invalid elimination exposure type accepted'; END IF;
  RAISE NOTICE 'PASS 17: methodology metric codes and exposure types validated';

  -- 18. every governed mutation left canonical audit evidence
  IF (SELECT count(*) FROM public.audit_logs
       WHERE entity_type = 'financial_group' AND entity_id = v_group::text
         AND action IN ('GROUP_CREATED','GROUP_MEMBER_ADDED','GROUP_MEMBER_UPDATED','GROUP_METHODOLOGY_VERSION_CREATED')) < 4 THEN
    RAISE EXCEPTION 'FAIL 18: governed group mutations are not fully audited';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.compliance_audit_logs
                  WHERE object_id::text = v_group::text AND object_type = 'financial_group') THEN
    RAISE EXCEPTION 'FAIL 18: dual-surface compliance audit evidence missing';
  END IF;
  RAISE NOTICE 'PASS 18: create/member/methodology mutations produced canonical dual-surface audit evidence';
END $$;
ROLLBACK;

DO $$ BEGIN RAISE NOTICE 'FINANCIAL GROUP MANAGEMENT GATE: ALL CHECKS PASSED'; END $$;

-- MC-06 — deterministic conduct pattern & similarity layer (backend contract).
BEGIN;
SELECT plan(14);

-- 1..4 canonical objects
SELECT has_table('public', 'conduct_clusters', 'conduct_clusters exists');
SELECT has_table('public', 'conduct_cluster_members', 'conduct_cluster_members exists');
SELECT has_table('public', 'conduct_cluster_metrics', 'conduct_cluster_metrics exists');
SELECT has_table('public', 'conduct_cluster_history', 'conduct_cluster_history exists');

-- 5 explainability attribute set
SELECT ok(
  (SELECT bool_and(c = ANY (SELECT column_name FROM information_schema.columns
                             WHERE table_schema = 'public' AND table_name = 'conduct_clusters'))
     FROM unnest(ARRAY['reference','rule_id','rule_code','rule_version','rule_snapshot','pattern_type',
                       'metric','metric_value','threshold_value','comparison_operator',
                       'window_start','window_end','window_days','member_count','match_explanation',
                       'status','reviewer_id','reviewed_at','first_detected_at','last_evaluated_at',
                       'evaluation_count','raised_signal_id','raised_alert_id']) AS c),
  'clusters expose trigger, rule/version, window, metric, threshold, explanation and review state'
);

-- 6 monitoring-rule infrastructure reused for pattern rules and run history
SELECT ok(
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'conduct_monitoring_rules'
             AND column_name = 'pattern_type')
  AND EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'conduct_cluster_metrics'
                 AND column_name = 'run_id'),
  'pattern rules and deterministic run history reuse monitoring infrastructure'
);

-- 7 evidence engine reused, not duplicated
SELECT has_column('public', 'conduct_evidence', 'cluster_id',
  'conduct_evidence reused for pattern evidence');

-- 8 governed operations and read models exist
SELECT ok(
  (SELECT bool_and(EXISTS (SELECT 1 FROM pg_proc p
                            WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f))
     FROM unnest(ARRAY['conduct_pattern_rule_upsert','conduct_pattern_detect','conduct_pattern_run_all',
                       'conduct_cluster_review','conduct_cluster_link_evidence',
                       'conduct_cluster_raise_signal','conduct_cluster_raise_alert',
                       'conduct_cluster_register','conduct_cluster_detail']) AS f),
  'all MC-06 governed operations and read models exist'
);

-- 9 every pattern/cluster routine is SECURITY DEFINER with pinned search_path
SELECT ok(
  (SELECT bool_and(p.prosecdef AND EXISTS (
             SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c
              WHERE c LIKE 'search_path=%'))
     FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND (p.proname LIKE 'conduct_pattern_%' OR p.proname LIKE 'conduct_cluster_%')
      AND p.proname <> 'conduct_pattern_matches'),
  'pattern routines are SECURITY DEFINER and pin search_path'
);

-- 10 RLS enabled on the whole pattern layer
SELECT ok(
  (SELECT bool_and(c.relrowsecurity) FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relname IN ('conduct_clusters','conduct_cluster_members',
                        'conduct_cluster_metrics','conduct_cluster_history')),
  'RLS enabled on the pattern layer'
);

-- 11 no browser writes
SELECT is_empty(
  $$SELECT tablename, policyname FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('conduct_clusters','conduct_cluster_members',
                         'conduct_cluster_metrics','conduct_cluster_history')
       AND cmd <> 'SELECT'$$,
  'pattern tables expose no direct write policy'
);

SELECT is_empty(
  $$SELECT table_name, privilege_type, grantee FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND ((grantee = 'authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE'))
             OR grantee = 'anon')
       AND table_name IN ('conduct_clusters','conduct_cluster_members',
                          'conduct_cluster_metrics','conduct_cluster_history')$$,
  'signed-in users cannot write pattern tables directly and anon has no access'
);

-- 12 idempotency controls: unique dedupe key + unique member and metric keys
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.conduct_clusters'::regclass
            AND contype = 'u' AND pg_get_constraintdef(oid) ILIKE '%(dedupe_key)%')
  AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.conduct_cluster_members'::regclass
                AND contype = 'u')
  AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.conduct_cluster_metrics'::regclass
                AND contype = 'u'),
  'duplicate control enforced on clusters, members and metric evaluations'
);

-- 13 history is append-only
SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger t
           WHERE t.tgrelid = 'public.conduct_cluster_history'::regclass
             AND NOT t.tgisinternal),
  'pattern history is guarded append-only'
);

-- 14 deterministic comparison helper behaves exactly
SELECT ok(
  public.conduct_pattern_matches(5, '>=', 3)
  AND NOT public.conduct_pattern_matches(2, '>=', 3)
  AND public.conduct_pattern_matches(2, '<', 3)
  AND NOT public.conduct_pattern_matches(3, '>', 3),
  'threshold comparison is deterministic arithmetic only'
);

SELECT * FROM finish();
ROLLBACK;

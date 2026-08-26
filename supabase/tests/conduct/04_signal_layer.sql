-- MC-05 — canonical conduct Signal layer (backend contract).
BEGIN;
SELECT plan(14);

-- 1..4 canonical objects exist and are distinct from alerts/complaints
SELECT has_table('public', 'conduct_signals', 'conduct_signals exists');
SELECT has_table('public', 'conduct_signal_sources', 'conduct_signal_sources exists');
SELECT has_table('public', 'conduct_signal_alert_links', 'conduct_signal_alert_links exists');
SELECT has_table('public', 'conduct_signal_history', 'conduct_signal_history exists');

-- 5 required signal attributes
SELECT ok(
  (SELECT bool_and(c = ANY (SELECT column_name FROM information_schema.columns
                             WHERE table_schema = 'public' AND table_name = 'conduct_signals'))
     FROM unnest(ARRAY['reference','regulator_id','licensee_id','sector_id','product_id',
                       'title','summary','source_type','signal_category','severity','risk_score',
                       'systemic_potential','status','owner_id','rationale','created_at',
                       'validated_at','dismissed_at','escalated_at','escalated_alert_id']) AS c),
  'conduct_signals captures the MC-05 attribute set'
);

-- 6 evidence engine is reused, not duplicated
SELECT has_column('public', 'conduct_evidence', 'signal_id',
  'conduct_evidence reused for signal evidence');

-- 7 governed RPCs present
SELECT ok(
  (SELECT bool_and(EXISTS (SELECT 1 FROM pg_proc p
                            WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f))
     FROM unnest(ARRAY['conduct_signal_create','conduct_signal_link_source','conduct_signal_link_evidence',
                       'conduct_signal_assign','conduct_signal_validate','conduct_signal_dismiss',
                       'conduct_signal_link_alert','conduct_signal_escalate_to_alert',
                       'conduct_signal_reopen','conduct_signal_register','conduct_signal_case']) AS f),
  'all MC-05 governed operations exist'
);

-- 8 every signal RPC is SECURITY DEFINER with a pinned search_path
SELECT ok(
  (SELECT bool_and(p.prosecdef AND EXISTS (
             SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c
              WHERE c LIKE 'search_path=%'))
     FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname LIKE 'conduct_signal_%'
      AND p.proname <> 'conduct_signal_next_reference'),
  'signal RPCs are SECURITY DEFINER and pin search_path'
);

-- 9 RLS enabled on all signal tables
SELECT ok(
  (SELECT bool_and(c.relrowsecurity) FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relname IN ('conduct_signals','conduct_signal_sources',
                        'conduct_signal_alert_links','conduct_signal_history')),
  'RLS enabled on the signal layer'
);

-- 10 no direct browser writes: read-only policies only
SELECT is_empty(
  $$SELECT tablename, policyname FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('conduct_signals','conduct_signal_sources',
                         'conduct_signal_alert_links','conduct_signal_history')
       AND cmd <> 'SELECT'$$,
  'signal tables expose no direct write policy'
);

-- 11 authenticated has no table-level write privilege
SELECT is_empty(
  $$SELECT table_name, privilege_type FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND grantee = 'authenticated'
       AND privilege_type IN ('INSERT','UPDATE','DELETE')
       AND table_name IN ('conduct_signals','conduct_signal_sources',
                          'conduct_signal_alert_links','conduct_signal_history')$$,
  'authenticated cannot write signal tables directly'
);

-- 12 anon has no access at all
SELECT is_empty(
  $$SELECT table_name FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND grantee = 'anon'
       AND table_name IN ('conduct_signals','conduct_signal_sources',
                          'conduct_signal_alert_links','conduct_signal_history')$$,
  'anon has no privileges on the signal layer'
);

-- 13 history is append-only
SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger t
           WHERE t.tgrelid = 'public.conduct_signal_history'::regclass
             AND NOT t.tgisinternal),
  'signal history is guarded append-only'
);

-- 14 signal / alert / complaint remain distinct objects
SELECT ok(
  'public.conduct_signals'::regclass <> 'public.conduct_alerts'::regclass
  AND 'public.conduct_signals'::regclass <> 'public.complaints'::regclass
  AND EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'conduct_signal_alert_links'
                 AND column_name = 'alert_id'),
  'signal, alert and complaint stay distinct but linkable'
);

SELECT * FROM finish();
ROLLBACK;

-- Security-definer functions must pin search_path.
BEGIN;
SELECT plan(1);
SELECT ok(
  (SELECT bool_and(
     EXISTS (
       SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c
       WHERE c LIKE 'search_path=%'
     )
   )
   FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.prosecdef
     AND p.proname IN (
       'confirm_complaint_duplicate',
       'dismiss_complaint_duplicate',
       'manual_escalate_complaint',
       'dismiss_complaint_escalation',
       'cleanup_orphaned_complaint_evidence',
       'finalize_complaint_with_attachments',
       'get_public_complaint_tracking',
       'create_complaint'
     )),
  'new SECURITY DEFINER complaint RPCs pin search_path'
);
SELECT * FROM finish();
ROLLBACK;

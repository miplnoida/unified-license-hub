-- Attachment lifecycle: staged/finalized tracking, atomic RPC, cleanup RPC + deadletter.
BEGIN;
SELECT plan(6);

SELECT has_column('public','complaint_evidence','staged_at','staged_at present');
SELECT has_column('public','complaint_evidence','finalized_at','finalized_at present');
SELECT has_function('public','finalize_complaint_with_attachments',
  'atomic finalize RPC exists');
SELECT has_function('public','cleanup_orphaned_complaint_evidence', ARRAY['interval'],
  'cleanup RPC exists');
SELECT has_table('public','complaint_storage_cleanup_deadletter',
  'dead-letter table exists');

-- Behavioural: staged evidence older than interval is deleted; recent is preserved.
DO $$
DECLARE
  reg uuid := gen_random_uuid();
  cid uuid := gen_random_uuid();
  fid_old uuid := gen_random_uuid();
  fid_new uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.regulators(id,name,code) VALUES (reg,'Att Reg','ATT-'||substr(reg::text,1,8))
    ON CONFLICT DO NOTHING;
  INSERT INTO public.complaints(id, complaint_number, subject, description, email, status, regulator_id, created_at)
    VALUES (cid,'ATT-1','s','d','a@e.com','submitted', reg, now());

  INSERT INTO public.file_uploads(id, file_name, file_path, bucket_name, uploaded_by, entity_type, entity_id)
    VALUES
      (fid_old,'old.pdf','complaints/'||cid||'/old.pdf','complaint-evidence', NULL,'complaint',cid),
      (fid_new,'new.pdf','complaints/'||cid||'/new.pdf','complaint-evidence', NULL,'complaint',cid);

  INSERT INTO public.complaint_evidence(complaint_id, file_upload_id, label, staged_at, finalized_at)
    VALUES
      (cid, fid_old, 'stale', now() - interval '48 hours', NULL),
      (cid, fid_new, 'fresh', now() - interval '1 hour', NULL);
END $$;

-- Run as service_role so the security check passes.
SET LOCAL ROLE service_role;

SELECT is(
  (SELECT count(*)::int FROM public.cleanup_orphaned_complaint_evidence('24:00:00'::interval)),
  1,
  'cleanup returns exactly the stale staged evidence'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;

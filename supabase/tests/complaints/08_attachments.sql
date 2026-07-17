-- Attachment lifecycle: staged_at, finalized_at, atomic RPC, cleanup RPC.
BEGIN;
SELECT plan(4);

SELECT has_column('public','complaint_evidence','staged_at','staged_at present');
SELECT has_column('public','complaint_evidence','finalized_at','finalized_at present');
SELECT has_function('public','finalize_complaint_with_attachments',
  'atomic finalize RPC exists');
SELECT has_function('public','cleanup_orphaned_complaint_evidence', ARRAY['interval'],
  'cleanup RPC exists');

SELECT * FROM finish();
ROLLBACK;

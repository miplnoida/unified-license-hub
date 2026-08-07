BEGIN;
SELECT plan(28);

-- Bulk intake ---------------------------------------------------------------
SELECT has_table('public','complaint_import_batches','import batch header exists');
SELECT has_table('public','complaint_import_rows','import row outcomes exist');
SELECT has_function('public','complaint_bulk_import','bulk import RPC exists');
SELECT has_column('public','complaint_import_rows','validation_errors','row-level errors captured');
SELECT has_column('public','complaint_import_rows','duplicate_of_complaint_id','duplicates point at existing case');
SELECT has_column('public','complaint_import_rows','rejection_reason','rejections carry a reason');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.complaint_import_batches'::regclass),
  'RLS enabled on complaint_import_batches');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.complaint_import_rows'::regclass),
  'RLS enabled on complaint_import_rows');
SELECT ok(
  (SELECT count(*) FROM pg_policies WHERE tablename='complaint_import_batches') > 0,
  'complaint_import_batches has policies');
SELECT ok(
  (SELECT count(*) FROM pg_policies WHERE tablename='complaint_import_rows') > 0,
  'complaint_import_rows has policies');
SELECT ok(
  has_table_privilege('authenticated','public.complaint_import_batches','SELECT'),
  'authenticated may read import batches');
SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE proname='complaint_bulk_import'),
  'bulk import runs as SECURITY DEFINER');
SELECT ok(
  (SELECT proconfig::text LIKE '%search_path%' FROM pg_proc WHERE proname='complaint_bulk_import'),
  'bulk import pins search_path');

-- Closure / QA --------------------------------------------------------------
SELECT has_table('public','complaint_closure_reviews','closure review history exists');
SELECT has_function('public','complaint_record_closure_review','closure review RPC exists');
SELECT has_column('public','complaint_closure_reviews','decision','decision recorded');
SELECT has_column('public','complaint_closure_reviews','rationale','rationale recorded');
SELECT has_column('public','complaint_closure_reviews','qa_required','QA gate recorded');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.complaint_closure_reviews'::regclass),
  'RLS enabled on complaint_closure_reviews');
SELECT ok(
  NOT has_table_privilege('authenticated','public.complaint_closure_reviews','UPDATE')
  AND NOT has_table_privilege('authenticated','public.complaint_closure_reviews','DELETE'),
  'closure review history is append-only for clients');

-- Pattern alert transparency ------------------------------------------------
SELECT has_column('public','conduct_alerts','explanation','alerts explain why they fired');
SELECT has_column('public','conduct_alerts','source_record_ids','alerts cite source records');

-- Investigation case file ---------------------------------------------------
SELECT has_column('public','conduct_investigations','scope','investigation scope captured');
SELECT has_column('public','conduct_investigations','legal_basis','legal basis captured');
SELECT has_column('public','conduct_investigations','investigation_plan','investigation plan captured');

-- Enforcement lifecycle -----------------------------------------------------
SELECT has_function('public','enforcement_lifecycle_action','enforcement lifecycle RPC exists');
SELECT has_table('public','enforcement_obligations','enforcement obligations tracked');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.enforcement_obligations'::regclass),
  'RLS enabled on enforcement_obligations');

SELECT * FROM finish();
ROLLBACK;

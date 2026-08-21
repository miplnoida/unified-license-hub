-- P12 closure evidence: correspondence read models must be executable and governed.
-- Run with: psql -v ON_ERROR_STOP=1 -f supabase/tests/correspondence/01_read_model_contract.sql
--
-- Regression guarded here:
--   1. correspondence_work_queue used CREATE TEMP TABLE inside a STABLE function,
--      so every queue load failed at runtime ("CREATE TABLE is not allowed in a
--      non-volatile function"). The function must contain no temp-table DDL.
--   2. Both read models selected licensees.entity_name, a column that does not
--      exist, so queue and thread workspace both failed.
--   3. Delivery evidence is service-governed: the browser roles must hold no DML
--      on correspondence_threads / _messages / _dispatches, and anon no access.

BEGIN;

DO $$
DECLARE q text := pg_get_functiondef('public.correspondence_work_queue(jsonb,integer,integer)'::regprocedure);
        c text := pg_get_functiondef('public.correspondence_thread_case(uuid)'::regprocedure);
BEGIN
  IF q ILIKE '%CREATE TEMP TABLE%' THEN
    RAISE EXCEPTION 'correspondence_work_queue must not create temp tables (non-volatile function)';
  END IF;
  IF q ILIKE '%entity_name FROM public.licensees%' OR c ILIKE '%entity_name FROM public.licensees%' THEN
    RAISE EXCEPTION 'read models must not select licensees.entity_name (column does not exist)';
  END IF;
  IF q NOT ILIKE '%ORDER BY last_activity_at DESC NULLS LAST, id%' THEN
    RAISE EXCEPTION 'work queue paging must be deterministic (tie-broken by id)';
  END IF;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['correspondence_threads','correspondence_messages',
                           'correspondence_attachments','correspondence_dispatches',
                           'correspondence_events']
  LOOP
    IF has_table_privilege('authenticated', 'public.' || t, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || t, 'DELETE') THEN
      RAISE EXCEPTION 'authoritative browser DML must be zero for public.%', t;
    END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION 'anon must not read public.%', t;
    END IF;
  END LOOP;
END $$;

ROLLBACK;

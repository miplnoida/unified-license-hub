-- verify:audit-contract
--
-- Permanent gate. Extracts every `INSERT INTO <audit table> (col, col, ...)`
-- column list found in LIVE project-owned functions in the `public` schema and
-- compares it against the real table schema. Fails when any referenced column
-- does not exist, and fails explicitly on the known obsolete patterns
-- (`actor_id`, `details`) that caused DEF-F4-C-02.
--
-- Usage: psql -f scripts/verify-audit-contract.sql
\set ON_ERROR_STOP on
\pset pager off

WITH audit_tables AS (
  SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'p')
     AND (c.relname LIKE '%audit%'
          OR c.relname LIKE '%\_log'
          OR c.relname LIKE '%\_logs'
          OR c.relname LIKE '%\_events')
), fns AS (
  SELECT p.oid,
         p.proname,
         pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
), hits AS (
  SELECT f.proname,
         t.tbl,
         m[1] AS collist
    FROM fns f
    CROSS JOIN audit_tables t
    CROSS JOIN LATERAL regexp_matches(
      f.def,
      'insert\s+into\s+(?:public\.)?' || t.tbl || '\s*\(([^)]*)\)',
      'gi'
    ) AS m
), refs AS (
  SELECT h.proname,
         h.tbl,
         btrim(lower(col), E' \t\r\n') AS col
    FROM hits h
    CROSS JOIN LATERAL regexp_split_to_table(h.collist, ',') AS col
   WHERE btrim(col, E' \t\r\n') <> ''
), bad AS (
  SELECT r.proname, r.tbl, r.col,
         CASE WHEN r.col IN ('actor_id', 'details')
              THEN 'OBSOLETE_AUDIT_COLUMN' ELSE 'UNKNOWN_COLUMN' END AS reason
    FROM refs r
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = r.tbl
        AND c.column_name = r.col
   )
)
SELECT * FROM bad ORDER BY proname, tbl, col;

DO $$
DECLARE
  v_count integer;
  v_detail text;
BEGIN
  WITH audit_tables AS (
    SELECT c.relname AS tbl
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
       AND (c.relname LIKE '%audit%' OR c.relname LIKE '%\_log'
            OR c.relname LIKE '%\_logs' OR c.relname LIKE '%\_events')
  ), fns AS (
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f'
  ), hits AS (
    SELECT f.proname, t.tbl, m[1] AS collist
      FROM fns f CROSS JOIN audit_tables t
      CROSS JOIN LATERAL regexp_matches(
        f.def, 'insert\s+into\s+(?:public\.)?' || t.tbl || '\s*\(([^)]*)\)', 'gi') AS m
  ), refs AS (
    SELECT h.proname, h.tbl, btrim(lower(col), E' \t\r\n') AS col
      FROM hits h CROSS JOIN LATERAL regexp_split_to_table(h.collist, ',') AS col
     WHERE btrim(col, E' \t\r\n') <> ''
  ), bad AS (
    SELECT r.proname, r.tbl, r.col FROM refs r
     WHERE NOT EXISTS (
       SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema='public' AND c.table_name=r.tbl AND c.column_name=r.col)
  )
  SELECT count(*), coalesce(string_agg(proname||'.'||tbl||'.'||col, ', '), '')
    INTO v_count, v_detail FROM bad;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'verify:audit-contract FAILED — % stale audit writer column reference(s): %', v_count, v_detail;
  END IF;
  RAISE NOTICE 'verify:audit-contract PASSED — 0 stale audit writers';
END;
$$;

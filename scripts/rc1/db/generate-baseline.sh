#!/usr/bin/env bash
# RC1 §1 — install baseline generator.
#
# Replaying 1,003 development-era migrations against an empty database is not
# the production install path: dozens of those files seed rows that reference
# IDs created out-of-band, import historic fixtures, or assume an object that a
# later migration replaced (see docs/rc1/01-migration-certification.md).
# Rather than rewrite history, this script introspects the CERTIFIED schema
# (read-only, catalog queries only — no pg_dump) and emits a squashed install
# baseline. Fresh installs = platform bootstrap + baseline + forward migrations.
#
# Output: supabase/baseline/<phase>.sql (+ seed CSVs), all regenerated in place.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUT="$ROOT/supabase/baseline"
rm -rf "$OUT"; mkdir -p "$OUT/seed"

q() { psql -At -X -q -c "$1"; }

echo "-- generated $(date -u +%FT%TZ) from the certified schema" >"$OUT/00_manifest.sql"

# ------------------------------------------------------------------ 10 types
q "
SELECT 'CREATE TYPE public.' || quote_ident(t.typname) || ' AS ENUM (' ||
       string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) || ');'
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
 WHERE t.typnamespace = 'public'::regnamespace
 GROUP BY t.typname ORDER BY t.typname;
" >"$OUT/10_types.sql"

q "
SELECT 'CREATE DOMAIN public.' || quote_ident(t.typname) || ' AS ' ||
       format_type(t.typbasetype, t.typtypmod) ||
       coalesce(' CHECK (' || pg_get_constraintdef(c.oid) || ')', '') || ';'
  FROM pg_type t
  LEFT JOIN pg_constraint c ON c.contypid = t.oid
 WHERE t.typnamespace = 'public'::regnamespace AND t.typtype = 'd'
 ORDER BY t.typname;
" >>"$OUT/10_types.sql"

# -------------------------------------------------------------- 20 sequences
q "
SELECT 'CREATE SEQUENCE IF NOT EXISTS public.' || quote_ident(c.relname) || ';'
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'e') AND c.relname NOT LIKE 'cert\_%' AND c.relname NOT LIKE 'rc1\_%' AND c.relname NOT LIKE '\_time\_trial%' AND c.relname <> 'tap_funky' AND c.relkind = 'S'
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'a')
 ORDER BY c.relname;
" >"$OUT/20_sequences.sql"

# ----------------------------------------------------------------- 30 tables
# Columns + identity/serial + NOT NULL. Defaults that call functions are
# deferred to phase 55 so function creation can come first.
q "
WITH cols AS (
  SELECT c.relname AS tbl, a.attnum,
         quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod) ||
         CASE WHEN a.attidentity <> '' THEN ' GENERATED ' ||
                CASE a.attidentity WHEN 'a' THEN 'ALWAYS' ELSE 'BY DEFAULT' END || ' AS IDENTITY'
              ELSE '' END ||
         CASE WHEN a.attgenerated <> '' THEN ' GENERATED ALWAYS AS (' ||
                pg_get_expr(ad.adbin, ad.adrelid) || ') STORED' ELSE '' END ||
         CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END AS coldef
    FROM pg_class c
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
   WHERE c.relnamespace = 'public'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'e') AND c.relname NOT LIKE 'cert\_%' AND c.relname NOT LIKE 'rc1\_%' AND c.relname NOT LIKE '\_time\_trial%' AND c.relname <> 'tap_funky' AND c.relkind = 'r'
)
SELECT 'CREATE TABLE IF NOT EXISTS public.' || quote_ident(tbl) || ' (' ||
       string_agg(coldef, ', ' ORDER BY attnum) || ');'
  FROM cols GROUP BY tbl ORDER BY tbl;
" >"$OUT/30_tables.sql"

# -------------------------------------------------------------- 40 functions
# check_function_bodies=off makes a single pass dependency-order independent.
{
  echo "SET check_function_bodies = off;"
  q "
  SELECT pg_get_functiondef(p.oid) || ';'
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e') AND p.proname NOT LIKE 'cert\_%' AND p.proname NOT LIKE 'rc1\_%' AND p.proname NOT LIKE '\_time\_trial%' AND p.prokind IN ('f','p')
   ORDER BY p.proname, p.oid;
  "
  q "
  SELECT 'CREATE AGGREGATE public.' || quote_ident(p.proname) || '(' ||
         pg_get_function_identity_arguments(p.oid) || ') (SFUNC = ' ||
         a.aggtransfn::regprocedure::text || ', STYPE = ' || format_type(a.aggtranstype, NULL) ||
         coalesce(', INITCOND = ' || quote_literal(a.agginitval), '') || ');'
    FROM pg_proc p JOIN pg_aggregate a ON a.aggfnoid = p.oid
   WHERE p.pronamespace = 'public'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e') AND p.proname NOT LIKE 'cert\_%' AND p.proname NOT LIKE 'rc1\_%' AND p.proname NOT LIKE '\_time\_trial%' ORDER BY p.proname;
  "
} >"$OUT/40_functions.sql"

# ------------------------------------------------------------------ 50 views
q "
SELECT c.relname || E'\t' ||
       CASE c.relkind WHEN 'm' THEN 'CREATE MATERIALIZED VIEW public.'
                      ELSE 'CREATE OR REPLACE VIEW public.' END ||
       quote_ident(c.relname) || ' AS ' ||
       replace(pg_get_viewdef(c.oid, true), E'\n', ' ')
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'e') AND c.relname NOT LIKE 'cert\_%' AND c.relname NOT LIKE 'rc1\_%' AND c.relname NOT LIKE '\_time\_trial%' AND c.relname <> 'tap_funky' AND c.relkind IN ('v','m')
 ORDER BY c.relname;
" >"$OUT/50_views.tsv"

# ----------------------------------------------------------- 55 col defaults
q "
SELECT 'ALTER TABLE public.' || quote_ident(c.relname) || ' ALTER COLUMN ' ||
       quote_ident(a.attname) || ' SET DEFAULT ' || pg_get_expr(ad.adbin, ad.adrelid) || ';'
  FROM pg_attrdef ad
  JOIN pg_class c ON c.oid = ad.adrelid
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ad.adnum
 WHERE c.relnamespace = 'public'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'e') AND c.relname NOT LIKE 'cert\_%' AND c.relname NOT LIKE 'rc1\_%' AND c.relname NOT LIKE '\_time\_trial%' AND c.relname <> 'tap_funky' AND c.relkind = 'r'
   AND a.attgenerated = '' AND a.attidentity = ''
 ORDER BY c.relname, a.attnum;
" >"$OUT/55_defaults.sql"

# -------------------------------------------------- 60 constraints + indexes
q "
SELECT 'ALTER TABLE public.' || quote_ident(c.relname) || ' ADD CONSTRAINT ' ||
       quote_ident(con.conname) || ' ' || pg_get_constraintdef(con.oid) || ';'
  FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
 WHERE con.connamespace = 'public'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'e') AND c.relname NOT LIKE 'cert\_%' AND c.relname NOT LIKE 'rc1\_%' AND c.relname NOT LIKE '\_time\_trial%' AND c.relname <> 'tap_funky' AND con.contype IN ('p','u')
 ORDER BY c.relname, con.conname;
" >"$OUT/60_constraints_pk.sql"

q "
SELECT pg_get_indexdef(i.indexrelid) || ';'
  FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
  JOIN pg_class ic ON ic.oid = i.indexrelid
 WHERE c.relnamespace = 'public'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'e') AND c.relname NOT LIKE 'cert\_%' AND c.relname NOT LIKE 'rc1\_%' AND c.relname NOT LIKE '\_time\_trial%' AND c.relname <> 'tap_funky' AND c.relkind = 'r'
   AND NOT i.indisprimary
   AND NOT EXISTS (SELECT 1 FROM pg_constraint con
                    WHERE con.conindid = i.indexrelid AND con.contype IN ('p','u'))
 ORDER BY ic.relname;
" >"$OUT/62_indexes.sql"

q "
SELECT 'ALTER TABLE public.' || quote_ident(c.relname) || ' ADD CONSTRAINT ' ||
       quote_ident(con.conname) || ' ' || pg_get_constraintdef(con.oid) ||
       CASE WHEN NOT con.convalidated THEN ' NOT VALID' ELSE '' END || ';'
  FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
 WHERE con.connamespace = 'public'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'e') AND c.relname NOT LIKE 'cert\_%' AND c.relname NOT LIKE 'rc1\_%' AND c.relname NOT LIKE '\_time\_trial%' AND c.relname <> 'tap_funky' AND con.contype IN ('c','f','x')
   AND con.conparentid = 0
 ORDER BY con.contype DESC, c.relname, con.conname;
" >"$OUT/64_constraints_check_fk.sql"

# --------------------------------------------------------------- 70 triggers
q "
SELECT pg_get_triggerdef(t.oid) || ';'
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE c.relnamespace = 'public'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'e') AND c.relname NOT LIKE 'cert\_%' AND c.relname NOT LIKE 'rc1\_%' AND c.relname NOT LIKE '\_time\_trial%' AND c.relname <> 'tap_funky' AND NOT t.tgisinternal
 ORDER BY c.relname, t.tgname;
" >"$OUT/70_triggers.sql"

# --------------------------------------------------------- 80 RLS + policies
q "
SELECT 'ALTER TABLE public.' || quote_ident(c.relname) || ' ENABLE ROW LEVEL SECURITY;' ||
       CASE WHEN c.relforcerowsecurity
            THEN ' ALTER TABLE public.' || quote_ident(c.relname) || ' FORCE ROW LEVEL SECURITY;'
            ELSE '' END
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'e') AND c.relname NOT LIKE 'cert\_%' AND c.relname NOT LIKE 'rc1\_%' AND c.relname NOT LIKE '\_time\_trial%' AND c.relname <> 'tap_funky' AND c.relkind = 'r' AND c.relrowsecurity
 ORDER BY c.relname;
" >"$OUT/80_rls.sql"

q "
SELECT 'CREATE POLICY ' || quote_ident(pol.polname) || ' ON public.' || quote_ident(c.relname) ||
       ' AS ' || CASE pol.polpermissive WHEN true THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END ||
       ' FOR ' || CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                                 WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END ||
       ' TO ' || coalesce((SELECT string_agg(quote_ident(r.rolname), ', ')
                             FROM pg_roles r WHERE r.oid = ANY (pol.polroles)), 'PUBLIC') ||
       coalesce(' USING (' || pg_get_expr(pol.polqual, pol.polrelid) || ')', '') ||
       coalesce(' WITH CHECK (' || pg_get_expr(pol.polwithcheck, pol.polrelid) || ')', '') || ';'
  FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
 WHERE c.relnamespace = 'public'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'e') AND c.relname NOT LIKE 'cert\_%' AND c.relname NOT LIKE 'rc1\_%' AND c.relname NOT LIKE '\_time\_trial%' AND c.relname <> 'tap_funky'
 ORDER BY c.relname, pol.polname;
" >"$OUT/82_policies.sql"

# ----------------------------------------------------------------- 90 grants
q "
WITH t AS (
  SELECT c.relname, c.oid FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'e') AND c.relname NOT LIKE 'cert\_%' AND c.relname NOT LIKE 'rc1\_%' AND c.relname NOT LIKE '\_time\_trial%' AND c.relname <> 'tap_funky' AND c.relkind IN ('r','v','m')
), g AS (
  SELECT t.relname, r.rolname, p.priv
    FROM t
    CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) AS r(rolname)
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('REFERENCES'),('TRIGGER')) AS p(priv)
   WHERE has_table_privilege(r.rolname, t.oid, p.priv)
)
SELECT 'GRANT ' || string_agg(priv, ', ' ORDER BY priv) || ' ON public.' ||
       quote_ident(relname) || ' TO ' || quote_ident(rolname) || ';'
  FROM g GROUP BY relname, rolname ORDER BY relname, rolname;
" >"$OUT/90_grants_tables.sql"

q "
WITH s AS (
  SELECT c.relname, c.oid FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'e') AND c.relname NOT LIKE 'cert\_%' AND c.relname NOT LIKE 'rc1\_%' AND c.relname NOT LIKE '\_time\_trial%' AND c.relname <> 'tap_funky' AND c.relkind = 'S'
), g AS (
  SELECT s.relname, r.rolname, p.priv
    FROM s
    CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) AS r(rolname)
    CROSS JOIN (VALUES ('USAGE'),('SELECT'),('UPDATE')) AS p(priv)
   WHERE has_sequence_privilege(r.rolname, s.oid, p.priv)
)
SELECT 'GRANT ' || string_agg(priv, ', ' ORDER BY priv) || ' ON SEQUENCE public.' ||
       quote_ident(relname) || ' TO ' || quote_ident(rolname) || ';'
  FROM g GROUP BY relname, rolname ORDER BY relname, rolname;
" >>"$OUT/90_grants_tables.sql"

q "
WITH f AS (
  SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e') AND p.proname NOT LIKE 'cert\_%' AND p.proname NOT LIKE 'rc1\_%' AND p.proname NOT LIKE '\_time\_trial%' AND p.prokind IN ('f','p')
)
SELECT 'REVOKE ALL ON FUNCTION public.' || quote_ident(proname) || '(' || args || ') FROM PUBLIC;' ||
       coalesce((SELECT ' GRANT EXECUTE ON FUNCTION public.' || quote_ident(proname) || '(' || args ||
                        ') TO ' || string_agg(quote_ident(r.rolname), ', ') || ';'
                   FROM (VALUES ('anon'),('authenticated'),('service_role')) AS r(rolname)
                  WHERE has_function_privilege(r.rolname, f.oid, 'EXECUTE')), '')
  FROM f ORDER BY proname, args;
" >"$OUT/92_grants_functions.sql"

# ------------------------------------------------- 95 reference/config seed
# Only reference + configuration tables. No entity, filing, complaint, audit,
# certification-fixture or user data is exported.
mapfile -t SEED_TABLES < <(q "
SELECT c.relname FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'e') AND c.relname NOT LIKE 'cert\_%' AND c.relname NOT LIKE 'rc1\_%' AND c.relname NOT LIKE '\_time\_trial%' AND c.relname <> 'tap_funky' AND c.relkind = 'r'
   AND (c.relname ~ '(_config|_configs|_configurations|_catalogue|_catalog|_types|_rules|_thresholds|_templates|_definitions|_registry|_scopes|_levels|_stages|_categories)$'
        OR c.relname IN ('permissions','roles','role_permissions','sec_permissions','sec_roles',
                         'sec_role_permissions','sec_route_registry','sec_navigation_nodes',
                         'countries','app_settings','site_settings','data_domains','data_concepts',
                         'classification_schemes','classification_values','entity_identifier_types',
                         'entity_identity_statuses','entity_membership_roles','fee_types',
                         'enforcement_workflow_stages','enforcement_workflow_transitions',
                         'complaint_status_catalogue','prudential_process_sla_config'))
   AND c.relname NOT LIKE 'cert_%'
 ORDER BY 1;
")
{ echo "SET session_replication_role = replica;"; } >"$OUT/95_seed.sql"
for t in "${SEED_TABLES[@]}"; do
  [ -n "$t" ] || continue
  n="$(q "SELECT count(*) FROM public.$t")"
  [ "$n" = "0" ] && continue
  cols="$(q "SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) FROM pg_attribute
             WHERE attrelid='public.$t'::regclass AND attnum>0 AND NOT attisdropped AND attgenerated=''")"
  psql -X -q -c "\\copy (SELECT $cols FROM public.$t) TO '$OUT/seed/$t.csv' WITH (FORMAT csv, HEADER true)" >/dev/null
  echo "\\copy public.$t ($cols) FROM 'seed/$t.csv' WITH (FORMAT csv, HEADER true)" >>"$OUT/95_seed.sql"
done

echo "SET session_replication_role = origin;" >>"$OUT/95_seed.sql"

# ------------------------------------------------------------------ manifest
{
  echo "-- RC1 install baseline manifest"
  echo "-- generated: $(date -u +%FT%TZ)"
  echo "-- source: certified schema (catalog introspection only)"
  for f in 10_types 20_sequences 30_tables 40_functions 55_defaults \
           60_constraints_pk 62_indexes 64_constraints_check_fk 70_triggers \
           80_rls 82_policies 90_grants_tables 92_grants_functions; do
    printf -- "-- %-28s %s statements\n" "$f.sql" "$(grep -c ';' "$OUT/$f.sql" || echo 0)"
  done
  printf -- "-- %-28s %s views\n" "50_views.tsv" "$(wc -l <"$OUT/50_views.tsv")"
  printf -- "-- %-28s %s tables\n" "95_seed.sql" "$(wc -l <"$OUT/95_seed.sql")"
} >"$OUT/00_manifest.sql"

cat "$OUT/00_manifest.sql"

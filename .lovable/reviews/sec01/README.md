# SEC-01 — three separately approvable packages (NOT EXECUTED)

Revalidated live (read-only) 2026-11-27 09:37 UTC: 765 public tables, all RLS-enabled, all owned by `postgres`.
Effective = direct: no PUBLIC table grants and `anon`/`authenticated` are members of no other role, so there is no inherited table privilege. Effective TRUNCATE: anon 391, authenticated 441. Effective anon INSERT/UPDATE/DELETE: 365 tables.

## AML/CFT freeze boundary (excluded from A and B)
- 98 frozen tables (`supervisory_*`, `aml_*`, `sup_*`, `entity_risk_state`).
- 71 shared-dependency tables referenced by any `supervisory_*`/`aml_*`/`sup_*` function (e.g. applications, complaints, examinations, profiles, roles, user_roles, regulators, sectors, licenses, return_filings, audit_logs…). Full list regenerable with the query in this folder's notes.
- These keep their current privileges until the freeze is lifted.

## Package A — remove TRUNCATE (priority)
- Files: `package-a.sql` / `package-a-rollback.sql`. 661 REVOKEs on **355 tables** (anon + authenticated).
- Impact: no app path uses TRUNCATE (repo search: none in src/ or supabase/functions); service_role and owner keep it. SECURITY DEFINER functions run as owner, unaffected.
- Public services: none depend on TRUNCATE.
- AML/CFT: zero frozen/shared tables touched.
- Pre-check: `select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and (has_table_privilege('anon',c.oid,'TRUNCATE') or has_table_privilege('authenticated',c.oid,'TRUNCATE'));` expect 447 (395 non-frozen incl. 40 shared + 52 frozen).
- Post-check: same query expect 92 (52 frozen + 40 shared); re-run complaint intake and an officer save as smoke test.

## Package B — remove unneeded anonymous writes
- Files: `package-b.sql` / `package-b-rollback.sql`. 814 REVOKEs on **273 tables**.
- Kept (anon write grant retained): every table with an INSERT/UPDATE/DELETE/ALL policy for `anon` or `public` (35 tables, incl. `complaints`, `file_uploads`, `application_acknowledgements`, `notification_preferences`, `worker_invocation_tokens`, report builder tables) plus `entity_risk_scores` (written by an invoker trigger on a kept table).
- Dependencies checked: no anon-executable SECURITY INVOKER function writes any table; invoker triggers on kept tables write only `conduct_alerts` (kept) and `entity_risk_scores` (kept).
- Functional impact: none expected — with RLS enabled and no anon write policy, these writes are already denied; this removes the defence-in-depth gap.
- Public services: complaint intake/tracking, registration, captcha and file upload keep their grants or use SECURITY DEFINER RPCs.
- AML/CFT: zero frozen/shared tables touched.
- Pre/post-check: count of non-frozen tables where anon has INSERT/UPDATE/DELETE and no anon/public write policy: before 273, after 0.

## Package C — default privileges for future tables
- Files: `package-c.sql` / `package-c-rollback.sql`.
- Future tables created by `postgres` or `supabase_admin` in `public` will no longer automatically give TRUNCATE to anon/authenticated or INSERT/UPDATE/DELETE to anon. SELECT and authenticated DML defaults are unchanged.
- **Future AML/CFT tables:** any new AML/CFT table would start without these privileges and its migration would need explicit GRANTs (already the project rule). Existing frozen tables are not changed. Because AML/CFT development is frozen, no pending AML migration is affected.
- `supabase_admin` statements may be refused by platform privilege; if so, run the `postgres` lines only and record the gap.
- Pre/post-check: `select pg_get_userbyid(defaclrole), defaclacl from pg_default_acl where defaclobjtype='r' and defaclnamespace='public'::regnamespace;` — anon should change from `arwdDxtm` to `rxtm`-style (no a/w/d/D), authenticated lose `D`.

## Transaction and locks (all packages)
Single transaction each, `lock_timeout 5s`: GRANT/REVOKE takes a brief lock per table; on timeout the whole package rolls back with no partial state. Run off-peak; retry once. Rollback scripts restore exactly the pre-state captured above.

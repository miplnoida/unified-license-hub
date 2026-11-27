# Phase 1 — Database and backend-function proposals (NOT EXECUTED)

Baseline commit: 37467d921cd1418f45fbf6eca9e5530316034964 (2026-11-27). Nothing below has been run.

## Why backend-function fixes were not made
Lovable-managed backend functions deploy automatically when their files change. The approval note requires stopping before any change that would deploy. SEC-09/10/11/12/13/18 are therefore BLOCKED — DEPLOYMENT APPROVAL REQUIRED. Code-level evidence and minimal fixes follow.

| ID | Function | Confirmed defect (file:line) | Minimal fix |
|---|---|---|---|
| SEC-09 | document-extract | File read by caller-supplied id with service role, no ownership/entity check (index.ts:77-115); scan/release state never selected or checked before signed URL (84-88, 111-115) | Resolve file via caller-scoped client; refuse unless existing released scan state. Needs the authoritative release-state values confirmed (business decision). |
| SEC-10 | send-notification | Any signed-in user may send to any recipient and update any dispatch log by id (23-89, 119-150); batch mode reports success with failures hidden (298-339) | Restrict to existing worker contract or admin permission; bind log id to recipient; return failure counts. |
| SEC-11 | send-correspondence | Dispatch permission checked, but source record read with service role without scope (36-47, 74, 107); stored as "sent" with no transport (135-174) | Pass record scope to existing gate; store as queued until provider accepts. |
| SEC-12 | generate-return-analysis | Only view permission, no return scope (116-144); ratios taken from caller body (147-178); AI failure returns ok:true (250-291) | Require generate/edit permission and return scope; load ratios server-side; return partial/failed status. Internal evaluator call path must be kept (business decision on trusted path). |
| SEC-13 | developer-api | Scopes selected but never enforced (43-85); DB errors returned as empty 200 (33, 67-80); expiry/revocation already rejected (no defect) | Per-route scope map using existing scope names; return 5xx on query error. Scope-to-endpoint mapping needs confirmation. |
| SEC-18 | process-queue | No provider call; marks every queued notification for the template as "delivered" (168-179); write errors ignored, no stale reclaim (102-125) | Send via shared email provider, mark only the specific notification "sent"; reserve "delivered" for callbacks; check write errors. Lease/idempotency key would need a schema change (separate proposal). |

## SEC-01 — Excessive table privileges (CONFIRMED, read-only check)
Public tables: 765, all with RLS on. anon can TRUNCATE 391 and INSERT 365; authenticated can TRUNCATE 441. TRUNCATE ignores RLS. The app's data API cannot issue TRUNCATE, so no legitimate browser path uses it.

Proposed SQL:
```sql
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind='r' LOOP
    EXECUTE format('REVOKE TRUNCATE ON public.%I FROM anon, authenticated', r.relname);
  END LOOP; END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon, authenticated;
```
Rollback: same loop with `GRANT TRUNCATE ... TO anon, authenticated` and default-privileges GRANT.
Acceptance: `has_table_privilege('anon', t, 'TRUNCATE')` false for every public table; full test suite and sign-in, application, returns and report journeys unchanged.
Anonymous INSERT grants are NOT proposed for blanket revoke: public intake (complaints, registration) must be inventoried first.

## SEC-02, 04, 05, 06, 07, 14, 15, 16, 17, 19
NOT TESTED in this pass — each needs a per-function read of live definitions before exact SQL can be written safely. Carried forward from the functional gap register unchanged. Existing holds (correction-save, application visibility, returns write grants, report read grants) remain on hold.

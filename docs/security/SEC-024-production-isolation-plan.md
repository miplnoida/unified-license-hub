# SEC-024 — Production Database Isolation Plan (plan only, not executed)

1. **New production backend:** a separate Cloud project. Build its schema from `supabase/baseline/`, excluding all `cert_*`, `rc1_*` and pgTAP objects. Classify it as `production`.
2. **Dependencies:**
   - secrets (SMTP, SMS, payment, captcha)
   - Edge Functions
   - storage buckets and policies
   - auth settings and the email domain
   - cron/scheduled workers
   - the custom domain
3. **Data migration:**
   - users (auth identities)
   - profiles and roles
   - licensees, applications, returns, complaints, payments and audit logs
   - storage objects

   TEST/certification fixtures are excluded. Each migrated set is verified with row counts and checksums.
4. **Cutover:**
   - Put the app into read-only mode.
   - Do a final delta sync.
   - Switch the published site to the new backend.
   - Run smoke tests.

   Estimated downtime: 2–4 hours read-only.
5. **Rollback:** keep the old backend read-only for 14 days and switch back if needed. Any writes made after cutover are reconciled manually.
6. **Afterwards:** the current backend becomes non-production/certification only.

Effort is about 3–5 days plus a scheduled window. It needs the owner's approval and a backup confirmation.

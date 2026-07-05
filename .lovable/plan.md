## Fix Critical Security Findings

Five `error`-level findings from the scanner. All are RLS/policy issues on existing tables — one migration per fix, no app code changes required.

### 1. `site_settings` — SMTP/SMS credentials readable by anyone
Current: `SELECT` policy `Anyone can read site_settings` open to `anon`+`authenticated`. Row `email_sms_settings` stores SMTP host, password, SMS API key in plaintext JSON.

Fix:
- Drop the permissive SELECT policy.
- Add SELECT policy restricted to `super_admin` / `admin` via `has_role(auth.uid(), ...)` for keys containing credentials (`email_sms_settings`, and any future `*_settings` with secrets).
- Add a second SELECT policy allowing `anon`+`authenticated` to read only public-facing keys (branding, site name, etc.) — filter with `key <> 'email_sms_settings'` (extendable list).
- Verify `useEmailSmsSettings` still works for admins (it already runs from admin-only Settings pages).

### 2. `inspection_findings` — unrestricted write
Current: SELECT/INSERT/UPDATE/DELETE all `authenticated` with `true`.

Fix:
- Replace the four permissive policies with:
  - SELECT: internal staff (`has_role` in `super_admin|admin|supervisor|analyst|licensing_officer`) OR the licensee owning the parent inspection's entity.
  - INSERT/UPDATE/DELETE: internal staff roles only.

### 3. `return_threshold_breaches` — unrestricted update
Current: `Staff can update breaches` uses `true`/`true`.

Fix:
- Replace UPDATE policy with `has_role(auth.uid(),'super_admin'|'admin'|'supervisor'|'analyst')`.
- Add restrictive policy denying external roles on UPDATE.

### 4. `sufficiency_evaluations` + `sufficiency_evaluation_results` — unrestricted insert/read
Current: INSERT allows any authenticated user; SELECT `true`.

Fix:
- INSERT: restrict to internal staff via `has_role`.
- SELECT: internal staff always; external users only for rows tied to their own application (`application_id in (select id from applications where applicant_id = auth.uid())`). Same shape for `sufficiency_evaluation_results` joined via evaluation.

### 5. `sectors` — anonymous write open to the internet
Current: INSERT/UPDATE/DELETE policies scoped to `public` with `true`.

Fix:
- Drop the three write policies.
- Recreate INSERT/UPDATE/DELETE restricted to `super_admin`/`admin`.
- Keep SELECT open (sectors are reference data used on public pages).

### Delivery

- One migration per table group (5 migrations, or a single combined one — combined is fine since they're all policy DDL). Each follows: drop old policy → create new policy. No table structure changes, no GRANT changes needed (grants already exist).
- After migration: re-run the security scanner to confirm the five error findings clear; mark any that pass as fixed with a short explanation.
- Warn-level findings (document_extractions, enforcement_case_events, notification_digest_log, reinsurance_contracts, HIBP, function search_path, public bucket listing, etc.) are **not** in scope for this plan — happy to tackle them next if you want.

### Not touched
- No frontend changes. `useEmailSmsSettings`, sufficiency panels, inspection UIs, and sector admin pages already run under admin/internal contexts, so tightening RLS won't break them.
- No changes to `auth`, `storage`, or config tables.

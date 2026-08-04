# Integration Manager (ADM-INT-001) — close the FRD gaps

## What exists today

- `/settings/integrations` renders a **hardcoded array of four fake integrations** (Stripe, DocuSign, KYC, External Registry) with non-functional "Connect"/"Configure"/"Save Changes" buttons — no persistence at all.
- `/admin/integration-logs` is real: it reads the `integration_logs` table (direction, integration_key, endpoint, status, http_status, duration, error) with filters, and edge functions write to it via `_shared/integration-log.ts`.
- `api_keys` / `api_key_usage` exist for inbound platform API keys.
- There is **no** integration connection registry, no test-connection action, no status/health indicator, no error-threshold alerting, no credential masking/rotation, and no disable-with-justification.

## What the FRD requires (ADM-INT-001)

1. Connections table: Name, Type (inbound/outbound/bidirectional), Protocol, Status traffic light (Active / Error / Inactive), Last Successful Event, Error Count (24h), Actions.
2. Edit Connection modal: Name, Base URL, Auth Type (API Key / OAuth2 / SAML / File-based / SFTP), masked credentials, Timeout, Retry settings, data mapping config.
3. Test Connection — real ping, response time + status shown inline, logged, creates no real data.
4. Event Log tab — chronological, payload *summary* only, filterable by integration / date range / status.
5. Alert Configuration — notify admin when error count exceeds N events in M minutes; configurable recipient.
6. Disable Integration — toggle with mandatory justification; warning when active cases depend on it (R-ADM-028).
7. R-ADM-027 — credentials encrypted, never shown in plaintext; masked with "Rotate Credentials".
8. Audit events: `INTEGRATION_TEST`, `INTEGRATION_DISABLED`, `INTEGRATION_CREDENTIALS_ROTATED`, plus config updates.
9. Validation: Base URL must be valid HTTPS; credentials required for non-public endpoints.

## Plan

### 1. Backend — connection registry and governance

New tables (all with GRANTs, RLS via the existing `has_permission(uid,'settings',…)` helpers):

- `integration_connections` — name, integration_key (unique), type, protocol, base_url, auth_type, timeout_ms, retry_count, retry_backoff_ms, data_mapping (jsonb), enabled, status (`active`/`error`/`inactive`), last_success_at, last_error_at, disabled_reason, created/updated audit columns. **No secret material stored here.**
- `integration_credentials` — one current row per connection holding only non-reversible metadata (`secret_ref` naming the backend secret, key_prefix, masked hint, rotated_at, rotated_by, version). Readable only by `service_role`; admins read a masked view.
- `integration_alert_rules` — connection_id (nullable = global), error_count_threshold, window_minutes, recipient_user_ids / recipient_emails, enabled, last_fired_at.

RPCs (SECURITY DEFINER, each calling `enforce_permission('settings', <action>)` and writing an audit row):

- `integration_connection_save` — validates HTTPS base URL and required-credential rule, upserts, audits `ADMIN_INTEGRATION_UPDATED`.
- `integration_connection_set_enabled(id, enabled, justification)` — justification mandatory when disabling; audits `INTEGRATION_DISABLED` / `INTEGRATION_ENABLED`.
- `integration_connection_dependencies(id)` — counts in-flight records that reference the integration key (open applications/returns/complaints touching it via `integration_logs` entity refs) so the UI can show the R-ADM-028 warning.
- `integration_credentials_rotate(id, secret_ref, key_prefix)` — supersedes the prior row, audits `INTEGRATION_CREDENTIALS_ROTATED`.
- `integration_health_summary()` — per connection: last successful event, 24h error count, derived traffic-light status, last error message.

Seed the registry from what the platform actually integrates with (SMTP email, SMS provider, Lovable AI gateway, payment gateway simulator, plus placeholders for external registry / credit bureau / AML screening) so the page reflects reality instead of the current fake list.

### 2. Edge function — `integration-test-connection`

Validates JWT, checks `settings.edit` permission, reads the connection, performs a bounded, read-only probe (HTTPS `HEAD`/`GET` on base URL, or an SMTP/SMS/AI provider-specific no-op check), records latency and HTTP status, writes an `integration_logs` row with `integration_key`, `status`, `duration_ms` and a payload **summary**, audits `INTEGRATION_TEST`, and updates `status` / `last_success_at` / `last_error_at`. Returns HTTP 200 with the outcome in the body (project convention).

### 3. Alerting worker

Extend the existing scheduled sweep pattern: a SQL function `integration_alert_sweep()` invoked by `pg_cron` that counts failures per connection inside each rule's window and, on breach, raises a `system_health_alert` escalation + notification to the configured recipients (reusing the existing notification event pipeline), then stamps `last_fired_at` for de-duplication.

### 4. Frontend — rebuild `/settings/integrations` as the Integration Manager

Two tabs on one page:

- **Connections** — live data table with the FRD columns and traffic-light badge (green/red/grey); clicking the badge deep-links to the Event Log filtered to that integration. Row actions: Edit, Test Connection (inline result: status + response time), Rotate Credentials, Enable/Disable.
- **Event Log** — embeds the existing integration-log view (filter by integration, status, direction, date range), so `/admin/integration-logs` keeps working unchanged.

Plus an **Alert Configuration** panel (threshold N errors / M minutes + recipients).

Dialogs: connection config modal (name, base URL, type, protocol, auth type, timeout, retries, data mapping JSON, masked credential display), rotate-credentials confirmation, and a disable dialog requiring justification and showing the dependency warning when the count is non-zero. All action buttons wrapped in `PermissionGate module="settings"` so RBAC hides rather than greys them.

### 5. Verification

- pgTAP suite for the new RPCs: HTTPS validation, mandatory disable justification, credential secrecy (non-service roles cannot read `integration_credentials`), audit rows written for test/disable/rotate, health summary maths.
- Vitest for the status-derivation and masking helpers.
- Manual pass in the preview: seed connections visible, test connection produces a log row, disable requires justification, rotation records an audit event.
- Update the FRD gap tracker row 13 to Done with the new evidence.

## Scope guard

Nothing outside the Integration Manager changes. `/admin/integration-logs`, `_shared/integration-log.ts`, the API keys page, email/SMS settings and notification pipelines are read/reused, not rewritten.

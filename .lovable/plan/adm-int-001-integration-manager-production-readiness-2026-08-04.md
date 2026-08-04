# ADM-INT-001 — Integration Manager: production readiness

Agreed constraints from your answers:

- **Real where available, mock elsewhere.** SMTP email, AI gateway, payment simulator and the internal registry/reporting/audit APIs get real adapters. AML, sanctions, credit bureau, KYC, e-signing and government registry get the same real adapter code pointed at a controllable mock endpoint until you supply provider credentials. Swapping in a live base URL + rotated credential later requires no code change.
- **Adapters with fallback.** Every business flow calls the adapter. When a connection is disabled or unconfigured, the existing internal behaviour runs unchanged — so nothing that is already signed off can regress, and the enforcement path is still real.
- **One phase group per turn, in order.** Nothing is claimed closed until its tests pass and its report exists.

Nothing is redesigned. The existing registry, health dashboard, test connection, credential rotation, alert rules, event log, dependency viewer and permission gates are extended in place.

## Current state (verified this turn)

- `integration_connections` holds 8 seeded connections: ai_gateway, aml_screening, credit_bureau, email_smtp, external_registry, payment_gateway, platform_api, sms_provider. All show status `inactive`.
- The table has no columns for circuit breaker, average latency, success rate, error rate, credential version, environment or owner — Phase 1 adds them.
- `integration-test-connection` performs a single unauthenticated `GET` and treats any status under 500 as healthy. It does not check TLS, auth, schema, rate limit, certificate or token expiry.
- No connector adapter layer, retry queue or dead-letter queue exists yet. `integration_logs` has no correlation ID, sizes, retry number or error category.

## Delivery groups

Each group ends with its tests green and its named report committed under `docs/verification/integrations/`.

**Group A — Registry + adapter framework (Phases 1, 2)**
Extend `integration_connections` with the missing FRD columns (environment, owner, circuit breaker state, rolling latency/success/error rate, credential version, last recovery). Seed the full 12-integration set: government registry, AML, sanctions, credit bureau, identity/KYC, payment gateway, email, document signing, SMS (framework-ready, disabled), notification provider, external reporting API, audit export API — replacing anything demo-shaped. Build `supabase/functions/_shared/connector/` with a single adapter contract (authenticate, refresh token, build request, parse response, parse error, retry, timeout, correlation ID, audit, log, report health) plus one adapter module per integration key, each independently replaceable. Deliverables: registry verification + production adapter matrix.

**Group B — Connection testing + retry queue (Phases 4, 5)**
Rewrite the probe into staged checks — DNS, TLS and certificate expiry, authentication, authorization, required headers, reachability, expected business response, schema validation, field mapping, timeout, latency, rate-limit headers, API version, token expiry, clock drift — each reported pass/fail/skip inline. Healthy requires a valid business response, not HTTP 200. Add `integration_retry_queue` and `integration_dead_letter` with status, attempt count, reason, backoff + jitch strategy, max limit, an idempotency key enforcing exactly-once for payments/notifications/registry/AML/signing/workflow events, and a worker; UI gets retry now, cancel, retry all, batch retry and DLQ replay. Deliverables: connection test report + retry queue report.

**Group C — Credentials, monitoring, alerts, logs (Phases 6, 7, 8, 9)**
Credentials stay in the backend secret store; the database keeps only reference, version, masked hint and rotation audit. Rotation deactivates the prior version, records an audit row, and exposes a credential test. Health dashboard gains the full metric set and live-data trend charts. Alert rules extend to latency, retry, certificate expiry, token expiry, auth failure, repeated error, offline and recovery, with recipients/roles, suppression window, acknowledge/resolve and history, each alert deep-linking to connection, log row and correlation ID. Logs gain correlation ID, environment, sizes, retry number, error category, source module and business event, with masking of passwords, tokens, secrets, PII, PAN and national IDs, plus pagination, search, filter, export and retention. Deliverables: credential security, health dashboard, alert and log verification reports.

**Group D — Mapping engine + dependencies (Phases 10, 11)**
Versioned mapping definitions with transformations, constants, expressions, defaults, conditional rules, nested objects, arrays, date/number conversion, validation, preview, import/export, test and rollback — no hardcoded mappings left in adapter code. Dependency graph records upstream/downstream and dependent integrations, detects cycles, propagates health and blocks or warns on a disable that breaks a dependent integration. Deliverables: mapping engine + dependency analysis reports.

**Group E — Business process integration (Phase 3)**
Route registration identity verification, F&P AML + sanctions screening, application payment, license-issue document signing and approved-license registry publication through their adapters, each with the current behaviour as fallback when the connection is off. Every call carries a correlation ID and writes an integration log and audit row. Deliverable: business-flow integration matrix.

**Group F — Security, audit, verification, CI (Phases 12–17)**
Server-side permission checks for edit, delete, enable, disable, rotate, retry, log access, export and alert management. Audit rows for all 15 listed events with user, role, timestamp, connection, environment, before/after, correlation ID and reason. pgTAP + Vitest + Deno suites for each of the above; end-to-end scenarios across identity, AML, sanctions, payment, signing, registry, reporting and notification against the mock/real endpoints asserting request, mapping, auth, response, retry, audit, logs, alerts, recovery and no duplicate requests. Load runs at 100 connections / 1k / 10k requests, parallel calls, timeout recovery, retry storm and large log/alert/queue volumes. Regression pass across registration, applications, F&P, workflow, complaints, returns, payments, notifications, audit, dashboards and rule engine. CI job extended with build, typecheck, migration, integration, retry, credential, security, health, performance and regression stages. Deliverables: RBAC, audit, end-to-end, performance and regression reports, green Actions run, commit SHA, and the recalculated FRD percentage for point 13.

## Honest limits I will state in every report

- Integrations without your credentials are proven against a mock endpoint. Those rows will read **adapter verified, provider unverified** until you supply sandbox credentials — I will not report them as real-provider verified.
- Completion percentage will be computed from passing tests and executed flows, never from the presence of screens, tables or RPCs.

## Next step

On approval I execute **Group A** only, and report back with the registry verification and adapter matrix before touching Group B.

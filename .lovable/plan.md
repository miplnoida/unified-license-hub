# ADM-INT-001 — Rewire business flows through Integration Manager

## Verified current state (checked this turn)

- `integration_connections` holds 15 integrations with adapter keys, circuit-breaker state, health metrics, credential version — but **no fallback-governance columns** (no fallback enabled/strategy/allowed categories/max duration/approval/business-critical).
- Only `integration_logs`, `integration_credentials`, `integration_alert_rules`, `integration_connections` exist. **No retry queue, no dead-letter table.**
- `callIntegration()` is referenced only inside `supabase/functions/_shared/connector/index.ts` and its own docs. **Zero business modules invoke it** — registration, F&P screening, payments, licence signing and registry publication all still run their internal logic directly.
- Enabled today: `ai_gateway`, `email_smtp`, `platform_api`, `payment_gateway` (sandbox). Everything else disabled/unverified, so most rewired flows will legitimately execute in fallback mode until credentials arrive.

So the work is exactly what you described: governance layer + rewiring + executable evidence. The adapter framework itself is not touched except where a missing operation is required.

## Delivery order (one group per turn, nothing claimed closed without green tests + its report)

**Group B — Governance core (items 1, 2, 12 partly, 14, 15)**
Add fallback-governance columns to `integration_connections` plus an `integration_fallback_events` table. Build the single canonical service `supabase/functions/_shared/integration/invoke.ts` exposing `invokeIntegration()` with the exact request contract (integration key, operation, source module, business event, source entity type/id, actor, correlation ID, idempotency key, payload, required capability, fallback policy, timeout override, metadata) and the exact result contract (success, executionMode `real|mock|fallback|blocked`, connection/adapter IDs, providerVerified, provider status, mapped response, fallbackUsed/reason, retryable, correlation ID, log ID, error category/message, provider reference, timestamp). Fallback eligibility is decided **only** here, from connection config plus error category; business-rejection categories (auth, authorization, validation, provider business rejection, sanctions/AML/KYC/credit adverse, decline, e-sign rejection, registry rejection, duplicate, compliance) can never yield fallback success. Every fallback writes a fallback event + audit row. Extend log writes with the full first-class column set and add the redaction pass (tokens, keys, auth headers, national IDs, PAN, KYC docs, screening payloads; no raw bodies by default). Deliverables: fallback policy matrix, credential-security report, log-redaction report.

**Group C — Durable retry queue + DLQ (items 10, 11)**
`integration_retry_queue` and `integration_dead_letter` with the listed fields and statuses (`queued`, `processing`, `retry_scheduled`, `succeeded`, `failed`, `cancelled`, `dead_letter`), `FOR UPDATE SKIP LOCKED` claim RPC, exponential backoff with jitter, per-integration attempt caps, attempt history, and a hard rule that permanent rejections and adverse business results are never enqueued. A worker edge function drains it. Admin UI gains a Retry Queue / Dead Letter tab under `/settings/integrations` with view, redacted request, retry history, Retry Now (permission + justification, idempotency key unchanged), Cancel, Mark Resolved, Batch Retry, export, and deep links to source record / connection / logs / audit. Deliverables: retry queue report, DLQ report.

**Group D — Business rewiring (items 3, 4, 5, 6, 7, 8)**
Each flow calls `invokeIntegration()` first and keeps today's logic as the governed fallback path, labelled honestly:
- Registration/KYC → `identity_verification`; fallback status `internally_validated_provider_not_configured`, provider-unverified flag retained, never shows "Externally KYC Verified"; idempotency keyed on registration submission.
- F&P → `aml_screening`, `sanctions_screening`, `credit_bureau`, `identity_verification`; persists screening source, provider reference, score, matched records, execution mode, correlation ID on the assessment; matches never bypassed; internal fallback labelled `internal_screening_provider_unavailable`.
- Payments → `payment_gateway` for create, status, capture, refund, callback, reconciliation; simulator becomes an explicit adapter mode surfaced as simulated, never real settlement; shared idempotency key across retries; replayed callbacks idempotent; timeout leaves payment pending/unknown; existing payment history and application status shape preserved.
- Licence issuance → `document_signing` (create/status/download/void/callback); with no provider the current internal certificate stays, marked internally generated, never "externally signed"; issuance is not rolled back for an optional signing provider.
- Registry publication → `government_registry` / configured external registry; internal approval never equals external publication; non-success states `not_configured` / `pending_external_publication`; rejection stays rejected; retries never duplicate external records.
- Reporting, audit export, AI gateway, platform API, notification/email: route through the adapter where one is configured, without inventing fallback for internal real integrations; every remaining direct call documented with justification.
Deliverables: business-module rewiring matrix, KYC, F&P, payment, e-signing, registry publication reports.

**Group E — Bypass guard, testing, monitoring, RBAC, audit (items 9, 12, 13, 16, 17)**
Machine-readable call-site registry `scripts/integration-call-sites.json` (module, file, integration key, operation, adapter, fallback policy, source entity, idempotency strategy) plus `scripts/verify-integration-bypass.mjs` failing CI on direct provider URLs, credential reads, direct adapter imports, hardcoded provider domains, undocumented call paths, or business code skipping the canonical service — with an allowlist limited to connector runtime, platform framework calls and documented internal infrastructure. Rewrite `integration-test-connection` into staged checks (DNS, TLS/cert, auth, authorization, reachability, schema, operation support, request/response mapping, latency, timeout, API version, token expiry/refresh, rate limit, provider business status) reported as transport / auth / schema / mapping / operation / overall readiness — HTTP 200 with an invalid payload fails. Fallback monitoring metrics and the eight named alerts, with automatic recovery to the primary adapter under the recovery policy. Server-side permission checks for all 17 listed actions plus RLS tests across the 8 personas. Immutable audit rows for the 24 listed events with the full field set. Deliverables: external-call bypass scan, RBAC/RLS report, audit report.

**Group F — End-to-end, regression, CI, final accounting (items 18, 19, 20)**
Every listed scenario executed against real services where available and mock endpoints elsewhere, capturing business action, integration key, execution mode, adapter, request/response mapping, log ID, audit ID, source-record update, retry record, correlation ID, idempotency outcome, expected, actual, pass/fail. Regression pass proving unchanged behaviour with no third-party provider configured across registration, F&P, payment simulator, licence generation/approval, registry status, reporting, notifications, workflow, audit, dashboards. CI job extended with all 21 listed stages. Deliverables: end-to-end scenario report, regression report, updated FRD traceability matrix, green CI link, commit SHA, and a completion percentage computed from passing tests and executed flows only.

## Honest limits stated in every report

- Integrations without your credentials are exercised against mock endpoints and will read **adapter verified, provider unverified**. Those flows will legitimately run in `fallback` execution mode in this environment; the report will say so rather than claim external verification.
- CI currently has pre-existing red checks outside this scope (noted in the Group A reports). Group F states whether they are inside ADM-INT-001 or pre-existing.

## Next step

On approval I execute **Group B only** — fallback governance schema, the canonical invocation service, log hardening and redaction — and report back before touching the retry queue.

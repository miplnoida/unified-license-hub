# ADM-INT-001 — Integration Registry Verification (Group A, Phase 1)

Date: 2026-08-04
Scope: `integration_connections`, `integration_credentials`, `integration_logs`, `integration_health_summary()`

## Registry contents (queried, not asserted)

15 registered connections. The 12 FRD-required integration types are all present; the
three extras (`ai_gateway`, `platform_api`, `external_registry`) are pre-existing internal
integrations that were kept rather than removed.

| integration_key | environment | adapter_key | owner team | provider verified | enabled |
|---|---|---|---|---|---|
| government_registry | sandbox | government_registry | Licensing | no | no |
| aml_screening | sandbox | aml_screening | Fit & Proper | no | no |
| sanctions_screening | sandbox | sanctions_screening | Fit & Proper | no | no |
| credit_bureau | sandbox | credit_bureau | Licensing | no | no |
| identity_verification | sandbox | identity_verification | Registration | no | no |
| payment_gateway | sandbox | payment_gateway | Finance | no | yes |
| email_smtp | production | email_smtp | Platform | **yes** | yes |
| document_signing | sandbox | document_signing | Licensing | no | no |
| sms_provider | sandbox | sms_provider | Platform | no | no |
| notification_provider | sandbox | notification_provider | Platform | no | no |
| external_reporting | sandbox | external_reporting | Reporting | no | no |
| audit_export | sandbox | audit_export | Compliance | no | no |
| ai_gateway | production | ai_gateway | Platform | **yes** | yes |
| platform_api | production | platform_api | Platform | **yes** | yes |
| external_registry | sandbox | external_registry | Licensing | no | no |

`provider_verified = yes` means the integration runs against a real system today
(internally hosted). Every `sandbox` row is **adapter verified, provider unverified** —
its adapter is implemented and unit-tested, but no live provider credential has been
supplied, so no claim is made about real-provider behaviour.

## Fields added for production operation

`integration_connections`: `environment` (sandbox|production, constrained),
`owner_team`, `owner_user_id`, `adapter_key`, `provider_verified`, `circuit_state`
(closed|open|half_open, constrained), `circuit_failure_count`, `circuit_opened_at`,
`circuit_cooloff_seconds`, `circuit_failure_threshold`, `avg_latency_ms`,
`success_rate`, `error_rate`, `credential_version`, `last_recovery_at`,
`rate_limit_per_minute`.

`integration_logs`: `correlation_id` (indexed), `environment`, `request_bytes`,
`response_bytes`, `retry_attempt`, `error_category`, `source_module`,
`business_event`, plus a `(integration_key, created_at DESC)` index for the event log.

## Behaviour verified

- `integration_health_summary()` now returns average latency, success rate, error rate,
  circuit state, environment, owner and credential version, and derives status `error`
  when the breaker is open — previously it reported only last success/error.
- `integration_record_outcome()` moves circuit state: consecutive failures increment the
  counter and open the breaker at the per-connection threshold; a success closes it,
  resets the counter and stamps `last_recovery_at`. Latency is kept as a rolling mean.
  Executable only by `service_role`.
- `integration_resolve_connection()` returns the connection plus the credential
  **reference** (`secret_ref`) only. No credential value is stored in, or retrievable
  from, the database. Executable only by `service_role`.
- `integration_connection_save()` still rejects a non-HTTPS base URL for
  REST/SOAP/WEBHOOK/GRAPHQL and now also rejects an invalid `environment`.

## Known state

- `integration_logs` holds 321 historical rows with `correlation_id = NULL`. Correlation
  is populated from this change forward; historic rows are intentionally not backfilled
  because their originating action is unknowable.
- Every sandbox connection is disabled and has no credential, so no business flow can
  reach a provider yet. That is the intended pre-Group-E state.

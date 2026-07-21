# Slice 2 — Edge Function Authorization Coverage

## Current state (verified this turn)

- `supabase/functions/_shared/authz.ts` exists and exposes `requireUserPermission(module, action, scope?)`.
- Of 59 functions, only **2** actually use it today: `audit-export` and `generate-report`.
- 32 functions call `getClaims()` inline (authenticated but not `has_permission`-gated).
- 16 functions have no JWT check at all — mix of legitimate schedulers, public endpoints, and gaps that must be closed.
- `docs/rbac/edge-function-permission-map.tsv` only documents the 2 already-migrated functions.

## Goals

One authoritative authz path per function, aligned with the module.action catalog from Slice 1. Never trust caller-supplied user ids; always resolve identity from the JWT the shared helper validates.

## Scope of this slice

Full migration of every user-invoked function + a formal worker-token guard for schedulers + full documentation. Deno test coverage focuses on the 6 highest-risk mutating functions (adding tests for all 59 would balloon the slice).

## Work items

### 1. Classify every function (authoritative table)

Publish `docs/rbac/edge-function-permission-map.tsv` with one row per function and one of these auth kinds:
- `user` → `requireUserPermission(module, action[, scope])`
- `worker` → requires `x-worker-token` matching `WORKER_INVOKE_TOKEN` secret **or** cron `Authorization: Bearer <service_role>`
- `public` → explicitly public (documented reason, e.g., OTP request, public registry)
- `api_key` → developer-API key auth (unchanged)

### 2. Migrate user-invoked functions to `requireUserPermission`

Function → module.action (representative selection):

| Function | module | action | scope |
|---|---|---|---|
| add-application-remark | application_management | edit | recordId → applications |
| approve-pre-licensee | registration_management | approve | recordId |
| bulk-intake | complaint_management | create | — |
| create-web-user / list-web-users / manage-web-user / toggle-user-status | user_management | create/view/edit | licenseeId |
| document-extract | document_management | upload | — |
| dispatch-license-certificate | license_management | dispatch | recordId |
| evaluate-application-sufficiency | application_management | edit | recordId |
| evaluate-return-prudential | returns_management | view | returnId |
| fp-ai-media-ingest / fp-cycle-scheduler / fp-monitoring-sweep / fp-screening-run | fit_and_proper | configure / execute | — |
| generate-application-ai-assessment | application_management | view | recordId |
| generate-dashboard-insights | report_management | view | — |
| generate-license-certificate | license_management | issue | recordId |
| generate-return-analysis | returns_management | view | returnId |
| get-licensee-registration | registration_management | view | licenseeId |
| manage-api-key | integration_management | configure | — |
| notification-retry / notification-status | notification_management | view / dispatch | — |
| perform-license-action | license_management | workflow_action | recordId |
| perform-registration-workflow-action | registration_management | workflow_action | recordId |
| perform-return-workflow-action | returns_management | workflow_action | returnId |
| perform-workflow-action | application_management | workflow_action | recordId |
| resubmit-return | returns_management | edit | returnId |
| run-scheduled-reports | report_management | execute | — |
| send-correspondence | correspondence_management | dispatch | — |
| sign-license-certificate | license_management | issue | recordId |
| test-smtp-email | notification_management | configure | — |
| verify-and-submit | application_management | submit | recordId |

Each callsite replaces the ad-hoc `getClaims()` block with:
```ts
const gate = await requireUserPermission(req, MODULE, ACTION, scope);
if (!gate.ok) return gate.response;
const { userId, adminClient } = gate;
```
Callers that already resolve `userId` from claims stop trusting body-supplied ids; ownership is re-derived from the JWT.

### 3. Worker-token guard for schedulers

Add `supabase/functions/_shared/workerAuth.ts` exporting `requireWorkerInvocation(req)`:
- Accepts `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (cron path), **or**
- `x-worker-token` matching `WORKER_INVOKE_TOKEN` secret (manual sweep runs)
- Returns 401 otherwise.

Apply to: `complaint-escalation-sweep`, `complaint-storage-cleanup`, `dispatch-notification-event`, `evaluate-conduct-monitoring`, `evaluate-prudential-early-warnings`, `license-expiry-reminders`, `notification-digest`, `notification-failure-sweep`, `overdue-action-sweep`, `overdue-returns-sweep`, `process-notification-outbox`, `process-queue`, `rfi-near-due-sweep`, `risk-score-recompute`, `sla-escalation-sweep`, `send-notification`, `prudential-monitoring-sweep`.

Request `WORKER_INVOKE_TOKEN` via `add_secret` at the start of build mode.

### 4. Public functions — explicit allow-list

Add a header comment + shared `markPublicFunction(reason)` no-op documenting intent for: `public-registry`, `register-pre-licensee`, `send-registration-otp`, `verify-registration-otp`, `developer-api`. No behavioural change.

### 5. Deno tests for the top-6 highest-risk functions

Add `*_test.ts` (Deno convention) covering **401 (no bearer), 403 (wrong permission), 200 (mapped permission)** for:
1. `perform-workflow-action`
2. `perform-return-workflow-action`
3. `perform-license-action`
4. `approve-pre-licensee`
5. `verify-and-submit`
6. `create-web-user`

Tests mock `adminClient.rpc('has_permission', …)` via env-injected supabase test project. All tests use the pattern in `<useful-context>edge-function-testing`.

### 6. Documentation

- Rewrite `docs/rbac/edge-function-permission-map.tsv` with the full 59-row table (function, kind, module, action, scope, notes).
- Add `docs/rbac/edge-function-authorization.md` explaining the four kinds and the worker-token mechanism.
- Append a change-log entry under `docs/rbac/change-log.md`.

## Out of scope for this slice

- Rewriting RLS on 249 tables (Slice 3+).
- Locking down SECURITY DEFINER function search paths beyond the ones already touched.
- Storage policy overhaul (later slice).
- Vitest coverage for every user-invoked function (only top-6 in this slice).

## Verification

- `bunx vitest run` remains green.
- `supabase--test_edge_functions` runs the 6 new Deno test files, all pass.
- Grep sweep: every function in `supabase/functions/*/index.ts` matches one of `requireUserPermission`, `requireWorkerInvocation`, or `markPublicFunction`; the audit fails CI otherwise (add a lightweight `scripts/verify-edge-authz.mjs`).

## Rollout / risk

- Migration is per-function; no shared runtime state changes.
- If a caller was silently relying on unauthenticated access, it will now receive 401/403 — that's the intended enforcement. All internal callers already send `Authorization: Bearer <session>` via `supabase.functions.invoke`.
- Worker cron jobs already run with service-role bearer, so the worker guard accepts them without config change; the extra `WORKER_INVOKE_TOKEN` is only needed for on-demand manual invocations.

# F0 Pass B3 — GAP-F0-04 (edge authorization) + GAP-F0-05 (atomic authorization)

Scope: edge-function authorization classification with real runtime enforcement,
and removal of client-side check-then-mutate paths. No permission-catalogue
cleanup, no anonymous EXECUTE hardening, no F0-C work.

## Baseline

| Scanner | Before | After |
|---------|--------|-------|
| `scripts/verify-edge-authz.mjs` | FAIL — 9 functions unclassified | OK — 83 functions gated (user 47, worker 27, webhook 1, machine 1, public 7) |
| `scripts/verify-atomic-authz.mjs` | FAIL — 8 suspicious patterns | OK — 0 unallowlisted patterns |

## GAP-F0-04 — per-function outcome

The scanner now recognises five marker classes, each backed by a real control
(see `docs/rbac/edge-function-authorization.md`). Two new shared helpers were
added so webhook and machine endpoints are gated centrally instead of inline.

| Function | Class | Enforcement now in place |
|---|---|---|
| `application-acknowledgement` | user | `requireAuthenticatedUser` (central JWT verification) + existing `can_read_application` record predicate. Inline `getClaims` block removed. |
| `bootstrap-break-glass-admin` | worker | **Behaviour change:** was anonymously invokable. Now requires the service-role bearer or ops `x-worker-token` via `requireWorkerInvocation`. Owner recovery is unchanged for operators. |
| `cert-v2-user-fixtures` | worker | `requireWorkerInvocation` **plus** the existing `cert_v2_guard_ok` non-production guard — two independent controls. |
| `evaluate-prudential-early-warnings` | worker | Already enforced `requireWorkerOrPrudentialUser`; that helper is now a recognised marker (no behaviour change). |
| `overdue-action-sweep` | worker | Same as above. |
| `prudential-monitoring-sweep` | worker | Same as above. |
| `manage-captcha` | public + permission | `verify` stays anonymous (public intake needs it) and is documented via `markPublicFunction`. **Behaviour change:** admin actions no longer match legacy `app_role` strings — they require `has_permission(settings.edit)`, the canonical authority. |
| `notification-delivery-webhook` | webhook | HMAC-SHA256 verification moved into `_shared/webhookAuth.ts` (`requireSignedWebhook`); unset secret and bad signature both 401 before the payload is parsed. |
| `screening-sandbox` | machine | Provider credential check moved into `_shared/sandboxAuth.ts` (`requireSandboxCredential`) with timing-safe compare; unset secret rejects every call. `health` remains unauthenticated by design. |

## GAP-F0-05 — atomic authorization

Seven of the eight flagged sites were refactored to SECURITY DEFINER RPCs that
fuse the permission check with the write in one transaction; `created_by` is
stamped server-side and is no longer client-supplied.

| Site | New RPC | Authority |
|---|---|---|
| `reportService.createReportSchedule` | `public.report_schedule_save(null, payload)` | `report_management.create` or super admin |
| `reportService.updateReportSchedule` | `public.report_schedule_save(id, patch)` | as above + creator/super-admin ownership |
| `reportService.deleteReportSchedule` | `public.report_schedule_delete(id)` | as above |
| `reportService.saveTemplate` (insert + update) | `public.report_template_save(id?, payload)` | `report_management.create` + ownership |
| `reportService.deleteTemplate` | `public.report_template_delete(id)` | as above |
| `FpaScreening` add config | `public.fp_screening_config_save(null, payload)` | `fit_and_proper_screening.create` / `can_manage_fp_config` |
| `FpaScreening` toggle config | `public.fp_screening_config_set_active(id, active)` | `fit_and_proper_screening.edit` / `can_manage_fp_config` |
| `FpaScreening` cancel run | `public.fp_screening_run_cancel(id)` | `fit_and_proper_screening.manage_screening` or `fit_and_proper.edit` |

All seven RPCs are `REVOKE ... FROM PUBLIC, anon` and `GRANT EXECUTE` to
`authenticated` / `service_role` only.

Note found while refactoring: the old client pre-checks used
`report_management.configure`, which does not exist in the permission
catalogue (`report_management` holds `create`, `export`, `view`). The RPCs use
catalogued actions. Catalogue cleanup itself remains GAP-F0-02, out of scope
for this pass.

The one remaining flagged site — `WebUsersTab.tsx:261` — is allowlisted with a
documented reason: the follow-up call is `functions.invoke('manage-web-user')`,
and that function re-verifies the JWT and enforces
`has_permission(user_management.edit)` server-side before mutating.

## Regression

- `scripts/verify-edge-authz.mjs`: OK
- `scripts/verify-atomic-authz.mjs`: OK
- `bunx vitest run`: 136 files / **1258 tests passed**
- Typecheck (`tsgo -p tsconfig.app.json`): clean
- Edge functions redeployed: the six functions whose source changed

## Status

GAP-F0-04 CLOSED. GAP-F0-05 CLOSED (7 refactored, 1 documented allowlist).
Remaining F0 items untouched by design: GAP-F0-02 (permission catalogue),
GAP-F0-07 (pgTAP privileges), anonymous EXECUTE hardening, F0-C E2E.

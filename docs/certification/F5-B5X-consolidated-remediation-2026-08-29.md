# F5-B5X — Consolidated Final F5 Remediation

Date: 2026-08-29

## Gap status

| Gap | Status | Notes |
|---|---|---|
| GAP-F5-05 lifecycle completeness | CLOSED | Variation + voluntary surrender now have governed applicant journeys (catalogue, forms, workflow, effects) executed by the F4-certified lifecycle engine. Reinstatement = internal `DECIDE_REINSTATEMENT` decision path; expiry = scheduled `license_expiry_sweep` / `mark_expired_licenses` with officer confirmation (proved by gate E-09/E-10). `PLS_DEREGISTRATION` remains BCR (entity closure vs licence surrender is jurisdiction-dependent). |
| GAP-F5-06 form resolution | CLOSED | `post_license_service_form_set()` is the sole authority; argument-order defect repaired; intake UI consumes it. |
| GAP-F5-07 / 07a workflow resolution | CLOSED | `application_workflow_view()` is primary in `workflowApprovalResolver`; client cascade retained only as offline fallback. |
| GAP-F5-11 open statuses | CLOSED | Canonical `post_license_open_statuses()` returned by the server view. |
| GAP-F5-12 licence eligibility | CLOSED | Eligibility/status decisions come from server entitlement resolution. |
| GAP-F5-13 / 14 surfaces | CLOSED | Quick Actions repaired to `/post-license/new`, `/payments`, `/entity/returns`; no unreachable targets (gate S-05..S-09). |
| GAP-F5-16 F5 classification | CLOSED | Server-owned `applications.request_kind`; `data.type` hint removed from `derive_application_request_kind`; forging proved impossible (B-01, B-05, B-06). |
| GAP-F5-17 fee boundary | CLOSED | `post_license_fee_assessment` requires payment only for a real assessed amount; absent configuration is explicit (`BUSINESS_CONFIGURATION_ABSENT`), never invented pricing. F6 keeps schedules/refunds/reconciliation. |

## Changed artefacts

- Migration: effect-kind widening, 6 canonical `LICENCE.*` concepts, 8+8 variation/surrender services, effect map + provenance bindings, 16 published concept-bound forms, `post_license_lifecycle_input` (legal basis), `derive_application_request_kind` / `applications_set_request_kind`, `post_license_service_form_set` repair, grants.
- `scripts/verify-f5b5x.sql`, `scripts/verify-f5b5x-surfaces.sh`, `package.json` (`verify:f5b5x`).
- `src/lib/applicationCategory.ts`, `src/lib/workflowApprovalResolver.ts`, `src/hooks/useOpenPostLicenseRequests.ts`, `src/pages/NewPostLicenseApplication.tsx`, `src/pages/applications/ApplicationsList.tsx`, `src/components/dashboard/widgets/index.tsx`, `src/components/dashboard/QuickActions.tsx`, `src/test/workflowApprovalResolver.test.ts`.

## Gate results

| Gate | Result |
|---|---|
| verify:f5b5x (run 1) | 51/51 SQL + 8/8 surfaces |
| verify:f5b5x (run 2) | 51/51 SQL + 8/8 surfaces, identical, zero residue |
| verify:f5b4 | 48 PASS / 0 FAIL |
| verify:f5b3 | 53 PASS / 0 FAIL |
| verify:f5b3-establishments | 34 PASS / 0 FAIL |
| verify:f5b2 | 44 PASS / 0 FAIL |
| verify:f5b1 | 51 PASS / 0 FAIL |
| Frontend tests | 141 files / 1293 tests PASS |
| Typecheck | PASS |

## BCR / boundary items

- `PLS_DEREGISTRATION` (entity closure) — BCR, jurisdiction decision.
- Fees and SLA for variation/surrender — BCR; no pricing or service level invented.
- Refunds, fee schedules, reconciliation — F6 boundary. Correspondence/SLA/reporting — F14/F15/F18 boundary.

## Delta — remove client workflow authority (GAP-F5-07 / 07a)

`src/lib/workflowApprovalResolver.ts` was reduced to a thin server-authority adapter:

- Persisted applications resolve **only** through `application_workflow_view(_application_id)`.
- Fail-closed on RPC error/throw, forbidden, no row, `found=false`, or malformed/incomplete state (`reason = 'server_unresolved'`, `unresolved = true`). No browser fallback matching.
- Unsaved applications return `reason = 'unresolved_unsaved'` — no regulatory decision is made in the browser and no preview algorithm was added.
- Retired client duplicates: `resolveEffectiveRegulator`, `matchWorkflowForApplication`, `resolveAttachedActiveWorkflow`, `matchesLegacyLicenseType`, `entityTypesForApplication`, `getGlobalReviewEnabled`, and all direct reads of `services.workflow_id`, `approval_workflows`, `approval_steps`, `workflow_instances`, `categories`, `sectors`, `site_settings`.
- `applications.request_kind` remains authoritative for persisted classification; the legacy `service_id` heuristic survives only as display fallback for non-persisted/legacy rows and influences no workflow, submission, authorization, effect, queue, or reporting decision.

Surface gate strengthened to prove absence (S-10..S-16): RPC usage, zero direct table queries, no `services.workflow_id` read, no hierarchical matcher, fail-closed reasons present, no client global-review duplication, `request_kind` classification. Resolver unit tests extended to 8 cases (enabled, disabled, RPC error, RPC throw, `found=false`, malformed state, unsaved, forged taxonomy); the mocked `from()` throws so any reintroduced client query fails the suite.

Delta gate results: verify:f5b5x SQL 51/51 + surfaces 15/15 twice (identical, zero residue); verify:f5b4 48/48; verify:f5b3 53/53; frontend 141 files / 1299 tests PASS; typecheck PASS; build OK.

F9 remains separately uncertified. F5-C not started.

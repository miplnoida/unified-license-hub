# F4-B — Licensing Controlled Remediation

Date: 2026-08-28
Authoritative input: `docs/certification/F4-licensing-discovery-2026-08-28.md`
Frozen phases (not weakened): F0, F1, F2, F3
Permanent gate: `npm run verify:f4b` → **30 passed, 0 failed**

## 1. One production final-approval path (GAP-F4-01) — CLOSED

- `public.perform_manual_application_approval` **dropped** (all overloads).
- `src/pages/applications/ApplicationDetail.tsx` no longer offers an ad-hoc approval; it directs the officer to the governed workflow action.
- Production path is now exactly: governed workflow action → `user_can_act_on_workflow_step` (maker/checker, last-step, allowed_actions) → `application_licensing_readiness` → `perform_final_workflow_approval` → `provision_application_entity`.
- Gate asserts that `provision_application_entity` has no second production caller.

## 2. F3 → F4 consumer contract (GAP-F4-02 / F4-11) — CLOSED

- `registration_licensing_handoffs.application_id`: `NOT NULL`, unique, FK `ON DELETE RESTRICT` (was `SET NULL`, i.e. silently loseable).
- `registration_licensing_handoffs.registration_id` unique → one handoff per registration.
- `create_application_draft` now requires an **approved** registration handoff for initial/new licence applications, verifies handoff ownership, and returns the existing handoff application instead of creating a second one (idempotent).
- Post-licensing service requests (F5: renewal/variation/service, i.e. `service_id`, `license_id` or `type = post_license`) are explicitly exempt — the rule is not blanketed onto F5.
- `public.application_is_initial_licence(uuid)` is the single server-side discriminator.

## 3. Fit & Proper decision gating (GAP-F4-03) — CLOSED

- Identity now resolves through the canonical entity: `applications.entity_id → licensees.id`. The previous code compared a **user account id** to an entity id, so the gate silently passed.
- New `public.application_fp_readiness(uuid)`:
  1. explicit `application_fp_links` (required links) → each must carry a current positive determination (`public.fp_positive_outcomes()`);
  2. otherwise current controlled functions at the canonical entity (`fp_individual_roles`);
  3. otherwise the regulator configuration decides — absent configuration returns `BUSINESS_CONFIGURATION_REQUIRED`, never a silent pass.
- Required-and-missing F&P **fails final approval closed**.

## 4. Governed decision prerequisites (GAP-F4-04 / 05 / 13) — CLOSED

`public.application_licensing_readiness(uuid)` is the single server-authoritative resolver. Dimensions: registration handoff, workflow configuration, forms/documents (`application_form_requirements`), fees (verified `payments` evidence + configuration), fit & proper, licence conditions, coordination blockers (`check_decision_gates`). Overall state is the worst dimension; `perform_final_workflow_approval` refuses to proceed unless it is `PASS`, and records the readiness snapshot in the audit log for both blocked and successful decisions.

New governed configuration table `public.licensing_gate_configs` (registered in `config_governed_tables`, F1 governance) declares per scope (regulator / sector / sub-sector / category / licence type / service) whether `forms_documents`, `fees`, `fit_and_proper`, `conditions`, `inspection` are REQUIRED or NOT_APPLICABLE. No regulator policy has been invented: until it is populated the resolver reports `BUSINESS_CONFIGURATION_REQUIRED`.

## 5. Privileges and state integrity (GAP-F4-06 / 07) — CLOSED

- Registry-derived census `public.f4_estate_tables()` + `public.v_f4_privilege_census` over `applications`, `licenses`, `entity_licenses`, `registration_licensing_handoffs`, `application_*`, `license_*`, `licensing_*`.
- `anon`: **no** INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN anywhere in the estate.
- `authenticated`: no TRUNCATE/REFERENCES/TRIGGER/MAINTAIN anywhere; DML retained **only** where a permissive RLS policy actually grants that command. The gate re-proves this on every run.
- Canonical application status vocabulary `public.application_status_vocabulary()` enforced by `trg_applications_status_vocabulary` on insert and on status change. Historical values are never rewritten.

## 6. Recoverable provisioning (GAP-F4-08) — CLOSED

- `public.licensing_provisioning_outbox` — one row per `(application_id, task_key)` for `portal_access` and `license_certificate`; attempts, exponential backoff, dead-letter, `succeeded_at`, staff-readable, service-role writable only.
- Enqueued **inside** the approval transaction (`trg_applications_enqueue_provisioning`), so provisioning can no longer be lost when a post-commit HTTP call fails.
- Worker RPCs `licensing_provisioning_claim` / `_complete` are service-role only (`auth.uid()` must be NULL), with `FOR UPDATE SKIP LOCKED`.
- Edge function `licensing-provisioning-worker` (worker-credential gated) executes tasks idempotently; scheduled every minute via `worker_kick`.
- `approve-pre-licensee` now accepts worker invocation in addition to a staff session; state re-checks (application must be `approved`) are unchanged.
- Health view: `public.v_licensing_provisioning_health`.

## 7. Workflow authority (GAP-F4-09 / F4-10) — CLOSED

- `public.application_workflow_resolve(uuid)` selects the workflow server-side by specificity (service > category > sub-sector > sector > licence type), requires `is_active`, `retired_at IS NULL` and at least one step, and returns `BUSINESS_CONFIGURATION_REQUIRED` when nothing matches.
- `public.application_workflow_vocabulary` is the explicit server mapping for the `pre_application` / `post_application` / `application` drift (phase + instance entity type; `application` retained as a non-canonical legacy alias). The gate proves every active application workflow entity type is mapped.

## 8. Canonical entity/licence relationship (GAP-F4-12) — CLOSED

- `entity_licenses` is canonical. `licensees.license_id` is marked DEPRECATED and is now **read-only for application code**: `trg_licensees_legacy_license_id` rejects non-trusted writes and mirrors trusted provisioning writes into `entity_licenses`.
- Legacy values backfilled into `entity_licenses` where unambiguous (no conflicting entity link).

## 9. Withdrawal (GAP-F4-14) — CLOSED (server)

`public.withdraw_application(uuid, text)`: owner (applicant or approved entity member) or staff with `application_management.edit`; mandatory reason; permitted from draft/in-progress/submitted/RFI states; idempotent; cancels the active workflow instance; writes `approval_actions`, audit log and notification; refuses approved/rejected/cancelled.

## 10. Remaining items carried forward

| Item | Type | Status |
| --- | --- | --- |
| GAP-F4-15 dead application screens (`ApplicationQueue.tsx`, `PreLicense.tsx`, `PostLicense.tsx`) | PRODUCT_GAP (low) | **OPEN** — still routed; retirement not executed in this pass |
| Applicant-facing withdrawal UI for `withdraw_application` | PRODUCT_GAP (low) | **OPEN** — server action governed and callable; no button yet |
| DR-F4-01…07 (48 licences without applications, 19 licences without entity link, legacy pre-F3 applications) | DATA_REMEDIATION | Recorded, not auto-mutated |
| CFG-F4-01…06 (forms/documents, fees, F&P, conditions, inspection applicability per licence type; decision-authority thresholds) | BUSINESS_CONFIGURATION_REQUIRED | Awaiting authoritative regulator configuration in `licensing_gate_configs` |

## 11. Frozen-phase impact

No F0–F3 object was weakened: F3 changes are additive integrity constraints on the handoff plus a stricter consumer rule inside `create_application_draft`. Privilege changes only remove privileges. `verify:f4b` is additive to the existing gates.

## Verdict

**F4-B READY FOR F4-C CERTIFICATION** — with the two OPEN low-severity product items above (dead screens, withdrawal UI) explicitly carried into F4-C scope. No unresolved Critical/High product gaps.

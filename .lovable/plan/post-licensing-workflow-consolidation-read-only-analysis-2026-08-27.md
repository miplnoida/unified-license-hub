# Post-Licensing Workflow Consolidation — Read-Only Analysis

No code, data, or configuration was changed. All findings below come from live database reads.

## A. Current state

| Item | Value |
| --- | --- |
| Total workflows in system | 132 |
| `PLS - ...` workflows | 120 (all `entity_type = post_application`, all active, all with `service_id` + `sub_sector_id` set) |
| Steps across PLS workflows | 360 (40x3 + 32x3 + 24x4 + 24x2) |
| Generic post-licence workflow | 1 — "Post Application Workflow" (3 steps, active, no sector/sub-sector/category/service scope) |
| Regulators involved | 1 — every PLS workflow carries the same regulator; `services.regulator_id` is NULL for all 120 service records |
| Sub-sectors | 8, each with exactly the same 15 services |
| Applications using PLS workflows | 0 |
| Applications using the generic post workflow | 0 |
| Workflow instances referencing either | 0 |
| Post-licence applications in total | 2, both `draft`, both with `workflow_id = NULL` |

## B. Functional deduplication

Signatures were computed from step order, step name, step type, approver type, effective role name, allowed actions, SLA hours, escalation role/hours, start/terminal flags and conditions — ignoring workflow id/name, service id and sub-sector id.

**120 physical workflows → 4 genuinely unique functional signatures.**

| Pattern | Physical workflows | Steps | Chain (role / SLA hrs / terminal) |
| --- | --- | --- | --- |
| Standard | 40 | 3 | Licensing Analyst Review (48, start) → Licensing Officer (48) → Final Approval — Licensing Supervisor (72, terminal, adds `return_for_correction`) |
| Enhanced | 32 | 3 | Licensing Analyst Review (48, start) → Specialist Review — Prudential Supervisor (72) → Final Approval — Licensing Supervisor (72, terminal) |
| Fit & Proper | 24 | 4 | Licensing Analyst Review (48, start) → Fit & Proper Assessment — F&P Assessor (96) → Licensing Officer (48) → Final Approval — Licensing Supervisor (72, terminal) |
| Notification | 24 | 2 | Regulatory Review — Licensing Analyst (48, start) → Acknowledge & Close — Licensing Officer (48, terminal) |

Uniform across all 360 steps: `sequential`, `role_based_user`, notifications enabled, licensee-visible, no conditions, no per-step escalation role/hours, no RFI SLA pause, no digital signature. Actions are `approve / reject / send_back` everywhere, plus `return_for_correction` on the final approval step. So the only differentiators are the number of steps and the role chain — nothing sub-sector- or regulator-specific.

## C. Service mapping (15 logical services)

Each service exists in 8 sub-sector copies; all 8 copies of a given service share one identical signature, so current pattern equals recommended pattern in every case.

| Service | Current pattern | Recommended pattern | decision_type | F&P | SLA days |
| --- | --- | --- | --- | --- | --- |
| Change of Legal Name | Standard | Standard | approval | no | 30 |
| Change of Address | Standard | Standard | approval | no | 20 |
| New Branch | Standard | Standard | approval | no | 30 |
| Branch Closure | Standard | Standard | approval | no | 30 |
| External Auditor Change | Standard | Standard | approval | no | 30 |
| Change of Control | Enhanced | Enhanced | approval | yes | 60 |
| Shareholding Change | Enhanced | Enhanced | approval | yes | 45 |
| Group Restructure | Enhanced | Enhanced | approval | no | 60 |
| Entity Deregistration / Relationship Closure | Enhanced | Enhanced | approval | no | 60 |
| Director Appointment | Fit & Proper | Fit & Proper | approval | yes | 45 |
| Beneficial Owner Change | Fit & Proper | Fit & Proper | approval | yes | 45 |
| Key Function Holder Change | Fit & Proper | Fit & Proper | approval | yes | 45 |
| Director Resignation | Notification | Notification | notification | no | 15 |
| Material Outsourcing Notification | Notification | Notification | notification | no | 20 |
| Material Incident Notification | Notification | Notification | notification | no | 10 |

Note: Change of Control and Shareholding Change are flagged `requires_fit_and_proper = true` but routed through Enhanced (no F&P step). That is a legitimate design if the F&P check is handled as service metadata/checklist rather than a step — but it is an inconsistency worth an explicit decision before consolidation.

## D. Regulator / sub-sector analysis

- All 8 sub-sectors (Commercial Bank, Merchant Bank, Building Society, Micro-credit Institution, Financial Holding Company, Life Insurance, General Insurance, Securities Dealer) use byte-identical step configuration for the same service: same roles, same step count, same SLA hours, same actions, same start/terminal, no conditions.
- **Separate sub-sector workflows are not required.** Nothing differs except `sub_sector_id`.
- Only one regulator exists across all 120 workflows, so **regulator-specific duplication is not justified either**. Option D is premature.

## E. Can the existing generic "Post Application Workflow" be reused?

**PARTIALLY.**

Its 3 steps are: Legal/Compliance Review (role Legal/Compliance Reviewer, SLA 48) → Licensing Officer (SLA **1 hour**, escalates to Super Admin after 2 hours) → Final Approval (role **Super Admin**, SLA 72). None of its steps are marked `is_start` or `is_terminal`.

- Structurally it is a 3-step approve/reject/send-back chain, so it can act as a catch-all safety net for unmapped post-licence services (it already sits at regulator-only specificity, which is the last taxonomy tier the resolver tries).
- It is not fit to be the canonical Standard pattern as configured: the role chain (Legal/Compliance + Super Admin) differs from the PLS Standard chain (Analyst → Officer → Supervisor), the 1-hour officer SLA looks like test data, and the missing start/terminal flags make it weaker than the PLS patterns.
- Recommendation: keep it untouched as the fallback, and treat the 4 PLS signatures as the canonical library.

## F. Recommended target

**Current: 120 workflows (+1 generic). Recommended: 4 canonical post-licence workflows (+1 generic fallback retained) = 5.**

Option comparison:

| Option | Verdict |
| --- | --- |
| A — 120 dedicated | Works today, but 116 of 120 are pure duplicates; an approver change means 120 edits and near-certain drift. |
| B — one generic workflow for all 15 services | Rejected: collapses genuinely different processes (F&P step, notification-only acknowledgement, specialist review) into one chain. |
| **C — small reusable library (Standard / Enhanced / Fit & Proper / Notification) + service metadata** | **Recommended.** Matches the 4 measured signatures exactly, keeps service-level SLA/F&P/decision_type/checklist where it already lives, no engine redesign. |
| D — patterns per regulator | Not justified: only one regulator exists. Revisit only if a second regulator with a genuinely different chain is onboarded. |

Service metadata that should stay at service level (already stored there): `decision_type`, `requires_fit_and_proper`, `sla_days`, `lifecycle_stage`, `document_checklist`, `effective_from/to`, `fee_reference`. These already vary per service while the process does not — which is exactly why 4 workflows suffice.

## G. Migration risk

| Area | Risk | Why |
| --- | --- | --- |
| Application Queue | LOW | No schema or query change; queue reads `applications` + `workflow_id/current_step_id` as today. |
| Existing applications | LOW | Zero applications reference PLS or the generic post workflow; the only 2 post-licence apps are drafts with NULL workflow. |
| Workflow instances | LOW | Zero instances reference any PLS or generic post workflow. |
| Roles | LOW | Canonical workflows reuse the same 5 role ids already in use. |
| Forms (120) | LOW | Untouched; form templates stay service/sub-sector scoped. |
| Fees (120) | LOW | Untouched; fee resolution keys on `service_id`. |
| Payments | LOW | No coupling to workflow identity. |
| Pre-licence | LOW | Resolver splits on `entity_type` (`pre_application` vs `post_application`). |
| F&P | MEDIUM | Needs the Change of Control / Shareholding Change inconsistency resolved (metadata flag vs. F&P step). |
| Audit | MEDIUM | Retirement must be non-destructive so historical configuration stays readable. |
| Resolver | MEDIUM | Today it is taxonomy-only; adding a `services.workflow_id`-first tier is a behaviour change that needs regression coverage. |

## H. Resolver architecture and `services.workflow_id`

`public._resolve_application_workflow(license_type, regulator, sector, category, is_post_license, service_id, sub_sector_id)` resolves taxonomy-first: regulator+service → regulator+category → regulator+sub_sector → regulator+sector → regulator-only → legacy `license_type` prefix. It never consults `services.workflow_id`, even though all 120 service rows already populate it.

Two viable consolidation routes:

1. **Configuration-only (no resolver change).** Point the 4 canonical workflows at regulator-only or regulator+sector scope and let the existing taxonomy fallback pick them up. Problem: one taxonomy slot can hold only one workflow, so four patterns cannot be distinguished by taxonomy alone. This route works only if the service-scoped tier is kept — i.e. 15 workflows (one per service), not 4.
2. **Add a `services.workflow_id`-first tier (recommended).** Insert one lookup ahead of the taxonomy chain: if the service row has a `workflow_id` pointing at an active workflow, use it; otherwise fall through to today's chain unchanged. That is a small, additive change and is the only way to reach exactly 4 workflows while keeping service-specific metadata. Explicit mapping also becomes self-documenting for administrators.

So: `Service → services.workflow_id → reusable workflow`, with the current taxonomy hierarchy retained as fallback. Nothing else in the engine changes.

## I. Admin UX impact

With 120 workflows an administrator must identify the right one out of 120 near-identical names before changing a single approver, and a role change to "Standard" processing means 40 separate edits with no guarantee of consistency. With 4 patterns, the same change is one edit, the list is scannable, drift is structurally impossible, and onboarding a 16th service is a metadata row plus a dropdown selection instead of 8 cloned workflows and 24 steps. The 4-pattern model is clearly easier and safer; the only new admin concept is "which pattern does this service use", which is one field on the service.

## J. Proposed phased migration plan (not executed)

- **Phase 0 — decide F&P semantics.** Confirm whether Change of Control and Shareholding Change should route through the F&P pattern or keep F&P as service metadata. This determines whether the library has 4 patterns or a 5th variant.
- **Phase 1 — designate canonical workflows.** Promote 4 existing PLS workflows (one per signature) to canonical, renaming them to pattern names. No new steps created, so no new risk. Generic "Post Application Workflow" stays as fallback, unchanged.
- **Phase 2 — map services.** Set `services.workflow_id` on all 120 service rows to the canonical workflow for its signature. Verify by re-running the signature query: mapped workflow signature must equal the service's current workflow signature for all 120 rows.
- **Phase 3 — resolver tier.** Add the `services.workflow_id`-first lookup ahead of the taxonomy chain, with fall-through preserved. Cover with tests for pre-licence, post-licence mapped, post-licence unmapped, and legacy `license_type` cases.
- **Phase 4 — preserve history.** No rewrite of any existing workflow instance or application. Currently zero exist, but the rule must hold for anything created between now and cutover.
- **Phase 5 — retire, do not delete.** For the 116 redundant workflows, prove zero references in `applications.workflow_id`, `workflow_instances.workflow_id`, `approval_actions`, and `services.workflow_id`, then set `is_active = false` with `retired_at` / `retirement_reason`. Keep rows and steps for audit. Hard deletion is not recommended.
- **Phase 6 — regression test.** Create one post-licence draft per service (15) across at least 2 sub-sectors, submit, and assert the resolved workflow, first step, role routing, SLA, and terminal behaviour match the pre-consolidation baseline captured in Phase 2.

## Constraints honoured

Application Queue unchanged; 120 forms and 120 fee configurations untouched and still service-scoped; services, roles and payments untouched; nothing deleted or deactivated in this task.

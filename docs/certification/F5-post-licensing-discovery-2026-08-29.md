# F5-A — POST-LICENSING SERVICES DISCOVERY / FINITE GAP REGISTER

**Pass type:** DISCOVERY ONLY. No remediation, no migration, no data/configuration change, no workflow retirement, no F4 redesign, no F6 work was performed.
**Evidence HEAD (tested):** `cf278ba45c723132589920485ca5a39d5c6711b8`
**Frozen F4 runtime baseline:** `dfe4340b8e546fe39f2e1a54ae1c4dacbdc25e0a`
**Read-only census script:** `scripts/verify-f5-discovery.sql`
**Date:** 2026-08-29

---

## 1. F4 → F5 BOUNDARY

F5 begins only where an **existing licence** exists. The operative boundary objects are
`public.licenses` (canonical licence ID + status) → `public.entity_licenses` (canonical entity
binding) → `public.license_terms WHERE is_current` (operative term).

| Boundary fact (LIVE) | Value |
|---|---|
| Licences | 60 |
| Canonical entity–licence bindings | 60 |
| Licence terms | 60, all `is_current` |
| Licences without a **current** term | 0 |
| Licences without an **original** term | 1 (`LIC-2026-000033`) |
| Licences without `holder_id` / `sector_id` | 0 / 0 |

**Original-term exception — CLEARED.** The canonical resolver
`public.entity_license_entitlements()` derives eligibility from `licenses.status`,
`licenses.valid_until` and `public.license_grace_days(...)`. It does **not** read
`license_terms` at all, and neither does `can_act_on_license` /
`can_act_on_specific_license`. `LIC-2026-000033` is therefore fully usable for F5: no F5 path
requires an original term where a current term is the operative state. Verified structurally,
not assumed.

**Boundary contract as implemented:**

| Requirement | Implementation | State |
|---|---|---|
| Canonical licence ID | `create_application_draft` requires `data.license_id` for any post-licence intent | ENFORCED |
| Canonical entity binding | Owner derived from `licenses.holder_id`; a mismatching claimed `licensee_id` raises `LICENSE_ENTITY_MISMATCH` | ENFORCED |
| Current term | Not required (correct — see above) | CORRECT BY DESIGN |
| Canonical licence status | `entity_license_entitlements` → `effective_status` + `is_eligible_for_new_activity` | ENFORCED |

**Boundary verdict: SOUND.** Defects recorded below concern what happens *after* the boundary,
not the boundary itself.

---

## 2. SURFACE COVERAGE MANIFEST

| # | Route | Component | Hook / Service | RPC / Table | Permission | Lifecycle purpose | Class |
|---|---|---|---|---|---|---|---|
| 1 | `/post-license/new` | `NewPostLicenseApplication.tsx` | `useLicenseEntitlements`, `useServices`, `useFormTemplates`, `useOpenPostLicenseRequests`, `useLicenseStatusGate`, `useLicenseeAccessGuard` | `entity_license_entitlements`, `create_application_draft`, `services`, `form_templates`, `applications` | `EP area="licensing" capability="can_submit"` | Service entitlement + selection + draft creation | ACTIVE |
| 2 | `/post-licensee/applications/:id/forms` | `PostLicenseApplicationForms.tsx` | `useResolveAppFormVersion`, `useVersionSections`, `resolveApplicationFeeBreakdown` | `applications`, `form_responses`, `fee_components`, `payments`, edge `verify-and-submit` | licensee entity capability | Form completion, fee/payment readiness, submission | ACTIVE |
| 3 | `/applications/:id` | `applications/ApplicationDetail.tsx` | `workflowApprovalResolver`, workflow hooks, `withdraw_application` | `applications`, `approval_workflows`, `approval_steps`, `workflow_instances` | owner or reviewer capability | Shared pre/post request workspace, decision view, withdrawal | ACTIVE (shared with F4) |
| 4 | `/applications` | `applications/ApplicationsList.tsx` | application list hooks | `applications` | owner scope via RLS | Applicant/entity request list (pre + post, undifferentiated) | ACTIVE |
| 5 | `/applications/queue` | `applications/ApplicationQueue.tsx` | queue hooks | `applications`, workflow tables | `application_management.*` | Regulator queue (pre + post, undifferentiated) | ACTIVE |
| 6 | `/licensee-services`, `/licensee-services/:slug` | `LicenseeServices.tsx`, `LicenseeServiceDetail.tsx` | `lib/publicServices/catalogue.ts` | static catalogue | public | Public entry; CTA → `/post-license/new` | ACTIVE |
| 7 | `/admin/forms?tab=post_license` | `admin/FormManagement.tsx`, `FormBuilder.tsx` | form template hooks | `form_templates`, `form_versions` | admin/form config | Post-licence form configuration | ACTIVE |
| 8 | `/admin/masters/services` | `admin/MasterConfiguration.tsx` | master config hooks | `services` | admin | Service catalogue configuration | ACTIVE |
| 9 | `/admin/workflow-engine`, `/admin/workflow-engine/rules` | `NavHubPage` + workflow config | workflow hooks | `approval_workflows`, `approval_steps` | admin | Workflow configuration (generic) | ACTIVE |
| 10 | `/payments`, `/payments/:id` | payment pages, `LicenseePaymentPanel` | payment hooks | `payments`, `fee_components` | licensee | Fees/payment surfaces used by F5 | ACTIVE (F6 owns depth) |
| 11 | `/admin/forms/post-license` | — | — | — | admin | Legacy path | DUPLICATE (compat redirect, intentional) |
| 12 | none | `admin/PostLicenseForms.tsx` | — | `form_templates` | — | Alternate post-licence form list | UNREACHABLE / DUPLICATE of #7 |
| 13 | none | `admin/PostLicensingApplications.tsx` | hardcoded `initialApps` mock | none | — | Intended admin post-licensing queue | LEGACY + UNREACHABLE (mock data, zero DB calls) |
| 14 | none | `billing/PostLicenseeBilling.tsx` | — | `fee_components`, `fee_types`, `applications` | — | Post-licensee billing | UNREACHABLE |
| 15 | none | `PostLicenseeDashboard.tsx` | — | — | — | Post-licensee dashboard | UNREACHABLE (superseded by `Dashboard.tsx` audience router) |
| 16 | none | `PreLicenseeDashboard.tsx` | — | — | — | Pre-licensee dashboard | UNREACHABLE (superseded) |
| 17 | `/billing/post-licensee` (**no such route**) | `QuickActions.tsx` | — | — | — | Quick action "View Billing" | BROKEN ENTRYPOINT |
| 18 | `/post-license` (**no such route**) | `QuickActions.tsx` | — | — | — | Quick action "Post-License Services" | BROKEN ENTRYPOINT |
| 19 | `/dashboard` renewal card | `dashboard/LicenseeDashboard.tsx` | dashboard hooks | `applications` | licensee | Deep-link into in-progress renewal forms | ACTIVE |

Nothing was removed. Items 12–18 are recorded, not touched.

**Structural observation:** there is **no regulator-facing post-licensing queue distinct from
F4's**. Post-licence requests are separated from initial-licence applications only by the
client-side heuristic `getApplicationCategory()` (`data.service_id` / `data.type`).

---

## 3. POST-LICENCE SERVICE CATALOGUE — LIVE RE-CENSUS

**Counts (LIVE, not documentation):**

| Fact | Value |
|---|---|
| `services` rows, `lifecycle_stage='post_license'`, `status='active'` | 128 |
| `services` rows, `lifecycle_stage='renewal'`, `status='active'` | 8 |
| **Total F5 catalogue rows** | **136** |
| Inactive F5 rows | 0 |
| Distinct business definitions | **17** (each fanned out across 8 sectors) |
| Bound to a workflow (`services.workflow_id`) | 136 / 136 |
| Unbound / null workflow | 0 |
| `requires_fit_and_proper = true` | 40 (5 definitions × 8 sectors) |
| `decision_type='approval'` / `'notification'` | 112 / 24 |
| Rows with `fee_reference` | **0** |
| Rows with non-empty `document_checklist` | **0** |
| Rows with `sla_days IS NULL` | 8 |
| Rows with `code IS NULL` | 16 |
| Regulator | single regulator `8dd8ac87…` across all rows |

**Per-definition census** (each row = 8 sector instances; workflow resolved via
`services.workflow_id`, precedence step 0 of the canonical resolver):

| Definition | Code | Decision type | Workflow pattern | F&P | SLA (days) | Fee cfg | Form cfg | Effective post-approval action | Status |
|---|---|---|---|---|---|---|---|---|---|
| Change of Control | `PLS_CHANGE_OF_CONTROL` | approval | Fit & Proper Post-License | yes | 60 | none on service | service-bound templates | **NONE** | active |
| Beneficial Owner Change | `PLS_BENEFICIAL_OWNER_CHANGE` | approval | Fit & Proper Post-License | yes | 45 | none | service-bound | **NONE** | active |
| Shareholding Change | `PLS_SHAREHOLDING_CHANGE` | approval | Fit & Proper Post-License | yes | 45 | none | service-bound | **NONE** | active |
| Director Appointment | `PLS_DIRECTOR_APPOINTMENT` | approval | Fit & Proper Post-License | yes | 45 | none | service-bound | **NONE** | active |
| Key Function Holder Change | `PLS_KFH_CHANGE` | approval | Fit & Proper Post-License | yes | 45 | none | service-bound | **NONE** | active |
| Director Resignation | `PLS_DIRECTOR_RESIGNATION` | notification | Post-License Notification | no | 15 | none | service-bound | **NONE** | active |
| Material Incident Notification | `PLS_INCIDENT_NOTIFICATION` | notification | Post-License Notification | no | 10 | none | service-bound | **NONE** | active |
| Material Outsourcing Notification | `PLS_OUTSOURCING_NOTIFICATION` | notification | Post-License Notification | no | 20 | none | service-bound | **NONE** | active |
| Change of Legal Name | `PLS_CHANGE_LEGAL_NAME` | approval | Standard / Enhanced (per sector) | no | 30 | none | service-bound | **NONE** | active |
| Change of Address | `PLS_CHANGE_ADDRESS` | approval | Standard | no | 20 | none | service-bound | **NONE** | active |
| Change of Registered Address | *(none)* | approval | Standard | no | 20 | none | service-bound | **NONE** | active (duplicate of above) |
| New Branch | `PLS_NEW_BRANCH` | approval | Standard | no | 30 | none | service-bound | **NONE** | active |
| Branch Closure | `PLS_BRANCH_CLOSURE` | approval | Standard | no | 30 | none | service-bound | **NONE** | active |
| External Auditor Change | `PLS_AUDITOR_CHANGE` | approval | Standard | no | 30 | none | service-bound | **NONE** | active |
| Group Restructure | `PLS_GROUP_RESTRUCTURE` | approval | Enhanced | no | 60 | none | service-bound | **NONE** | active |
| Entity Deregistration / Relationship Closure | `PLS_DEREGISTRATION` | approval | Enhanced | no | 60 | none | service-bound | **NONE** | active |
| Renew | *(none)* | approval | Standard | no | **null** | none | service-bound | **NONE** (client-side `is_renewal` form diffing only) | active (`lifecycle_stage='renewal'`) |

**Representation of the requested service types:**

| Requested type | How the product represents it today |
|---|---|
| Licence renewal | `Renew` (8 rows, `lifecycle_stage='renewal'`, uncoded, no SLA). Intake reuses the generic application flow with `data.is_renewal` / `renewal_of_license_id` flags read client-side. `license_renewals` holds 1 row. No new term is created. |
| Licence variation | **NOT REPRESENTED as a service.** Schema exists (`license_variations` 0 rows, `license_variation_items` 0 rows, RPCs `license_variation_case`, `license_variation_operation`, UI `LicenseVariationPanel.tsx`) but there is no catalogue service and no F5 intake route. |
| Surrender / cancellation | **NOT REPRESENTED as a service.** `license_lifecycle_configs` models `surrender`; no catalogue row, no intake. |
| Change of legal name | `PLS_CHANGE_LEGAL_NAME` — intake only, no canonical entity update on approval. |
| Change of address | `PLS_CHANGE_ADDRESS` **plus** an uncoded duplicate `Change of Registered Address`. |
| New / closed branch | `PLS_NEW_BRANCH`, `PLS_BRANCH_CLOSURE` — intake only; no branch record effect. |
| External auditor change | `PLS_AUDITOR_CHANGE` — intake only. |
| Director appointment / resignation | `PLS_DIRECTOR_APPOINTMENT` (approval, F&P flag), `PLS_DIRECTOR_RESIGNATION` (notification). No party structure effect. |
| Key function holder change | `PLS_KFH_CHANGE` (approval, F&P flag). |
| Beneficial owner / shareholding / change of control | `PLS_BENEFICIAL_OWNER_CHANGE`, `PLS_SHAREHOLDING_CHANGE`, `PLS_CHANGE_OF_CONTROL` (all F&P-flagged). |
| Group restructure | `PLS_GROUP_RESTRUCTURE`. |
| Material outsourcing | `PLS_OUTSOURCING_NOTIFICATION` (notification). |
| Material incident | `PLS_INCIDENT_NOTIFICATION` (notification). |
| Deregistration / relationship closure | `PLS_DEREGISTRATION`. |
| *(reinstatement, expiry confirmation)* | Modelled in `license_lifecycle_configs` matter kinds; no catalogue service. |

No service types were invented. A parallel declarative taxonomy exists in
`public.regulatory_request_types` (17 system rows, e.g. `LICENSE_VARIATION`,
`LICENSE_SURRENDER`, `LICENSE_RENEWAL`) that is **not** joined to `services` and not consumed by
the F5 intake path — recorded as DR-F5-05.

---

## 4. CANONICAL F5 APPLICATION LIFECYCLE (TRACED)

```text
existing eligible licence            licenses + entity_licenses (status/valid_until/grace)
  -> service entitlement             entity_license_entitlements() [SECURITY DEFINER, auth.uid()-derived]
  -> authority check                 can_act_on_specific_license() + entity membership + can_submit
  -> service selection               services filtered by licence sector/sub-sector (UI)
  -> published form resolution       UI matcher  ||  application_resolve_form_set(...,'post_license')
  -> duplicate prevention            trg_prevent_duplicate_post_license_request (advisory lock,
                                     post_license_open_statuses())
  -> draft                           create_application_draft()  [status 'draft']
  -> form completion                 applicationDraftSave(); status -> 'in_progress'
  -> evidence / documents            form-embedded uploads (no service document checklist)
  -> submission                      edge verify-and-submit -> submit_application()
                                     gates: ownership, status, can_act_on_license, duplicate,
                                            completed payment (PAYMENT_REQUIRED)
  -> workflow resolution             _resolve_application_workflow(..., _is_post_license=true,
                                     _service_id, _sub_sector_id) -> workflow_instances
  -> assessment / RFI                shared application RFI + AI assessment surfaces
  -> maker / checker / decision      approval_steps + perform_final_workflow_approval
  -> notification                    trg_application_notification_events -> notification outbox
  -> POST-APPROVAL EFFECT            ** ABSENT ** (see §9)
  -> licence / term / entity update  ** ABSENT **
  -> audit / history                 applications audit triggers + audit_timeline (present)
```

**State vocabulary** (`application_workflow_vocabulary`, canonical):

| entity_type | instance_entity_type | phase | canonical | notes |
|---|---|---|---|---|
| `pre_application` | `application` | initial_licensing | yes | F4 |
| `post_application` | `application` | post_licensing | yes | **F5** |
| `application` | `application` | initial_licensing | no | legacy alias retained |

**Open statuses** for duplicate protection are the canonical set returned by
`public.post_license_open_statuses()` (18 values) — enforced server-side by trigger.

**Transition authority:** draft/in_progress → submitted only via `submit_application`
(owner-only); all workflow transitions only via `perform-workflow-action` /
`perform_final_workflow_approval`; direct DML blocked by
`trg_prevent_direct_application_workflow_mutation`; withdrawal via governed
`withdraw_application(uuid,text)` (owner-only, non-terminal, reason required).

---

## 5. SERVICE ELIGIBILITY AND AUTHORITY

`entity_license_entitlements(target_licensee_id)` is the single canonical resolver
(SECURITY DEFINER, STABLE, identity from `auth.uid()`):

- **Entity scoping:** union of `profiles.licensee_id`, `entity_user_memberships` (status
  `APPROVED` only), `licensees.applicant_id`, plus personally-held licences.
- **Cross-entity protection:** when `target_licensee_id` is supplied, access requires
  `can_current_user_access_licensee(...)` or super-admin or `license_management.view`;
  otherwise the function returns **zero rows** (no error leak).
- **Effective status:** `suspended | revoked | cancelled | inactive | expired` → blocked;
  past `valid_until` but within grace → `active_grace`, still eligible; past grace → `expired`.
- **Grace:** resolved server-side by `license_grace_days(sector, sub_sector, category)`.
- **Eligibility:** `is_eligible_for_new_activity` = status in the good-standing set **and**
  within `valid_until + grace`.

`can_act_on_specific_license(_license_id, …)` additionally proves: licence exists; licence
`holder_id` matches the claimed entity; supplied taxonomy matches the licence exactly (no
widening by tampering); and the licence is eligible via the same resolver.

**Structural attack-surface assessment (read-only; no live mutating probes were executed in
this discovery pass):**

| Attempt | Server behaviour | Verdict |
|---|---|---|
| Draft against **another entity's licence** | `create_application_draft` overrides `licensee_id` with `licenses.holder_id`; `LICENSE_ENTITY_MISMATCH` when claimed entity differs; `can_act_on_specific_license` returns false for a licence not reachable by the caller | BLOCKED |
| Draft with **no licence** (post-licence intent) | `LICENSE_REQUIRED` (non-staff) | BLOCKED |
| **Incompatible taxonomy** in payload | `can_act_on_specific_license` compares payload taxonomy to the licence and rejects mismatch | BLOCKED |
| **Inactive / suspended / revoked / expired-past-grace** licence | `is_eligible_for_new_activity` false → draft refused, submit refused with `LICENSE_ENTITLEMENT_REQUIRED` | BLOCKED |
| **Non-current relationship** (membership not `APPROVED`) | Entity not in `scoped_entities` → no entitlement rows | BLOCKED |
| **Missing submission authority** (colleague's draft) | `submit_application` requires `applicant_id = auth.uid()` — a PPOC/authorised secondary user **cannot submit** a draft raised by a colleague | OVER-RESTRICTIVE → GAP-F5-02 |
| **Wrong service** for the licence scope | No server-side check that `data.service_id` belongs to the licence's sector/sub-sector; only the UI filters | GAP-F5-15 |
| **Submission-time entitlement source** | `verify-and-submit` passes sector/sub-sector/category from the client-written `data` payload into `can_act_on_license` rather than deriving them from `data.license_id`. Cross-entity escape is prevented (entitlement is entity-derived), but scope is asserted from mutable payload | GAP-F5-01 |

**Browser vs server equivalence:** eligibility (canonical resolver) is equivalent — the UI calls
the same RPC. **Not equivalent:** licence status/grace is recomputed independently by
`useLicenseStatusGate` from `site_settings` (GAP-F5-12); open-status duplicate list is
hand-mirrored in TypeScript (GAP-F5-11); form-set matching is re-implemented in TypeScript
(GAP-F5-06); workflow matching is re-implemented in TypeScript (GAP-F5-07).

---

## 6. FORMS / DOCUMENTS / FEES — SERVER TRUTH

| Dimension | Server truth | UI behaviour | Divergence |
|---|---|---|---|
| Form applicability | `application_resolve_form_set(..., _application_type='post_license')`: package → category → sub-sector → sector, `form_type IN ('post_license','application')`, published versions only | `NewPostLicenseApplication.tsx` runs its own service → sub-sector → sector → name-match chain and writes `data.form_template_ids` before the server resolver is consulted | **YES** — GAP-F5-06 |
| Template estate | 139 `post_license` templates: 137 published (all service-bound, 121 also sub-sector-bound), 2 draft | — | — |
| Version pinning | `useResolveAppFormVersion` pins a published `form_versions` row per application | matches | none |
| Required documents | `services.document_checklist` empty for all 136 rows; requirements live inside form templates only | UI shows form-level uploads | CFG-F5-02 |
| Incomplete forms | Completeness enforced server-side in `verify-and-submit` | UI also computes completeness | acceptable (defence in depth) |
| Configured fees | `services.fee_reference` empty for all 136 rows; fees resolve via `fee_components` | `resolveApplicationFeeBreakdown` + direct `payments` read to enable Submit | server gate exists (`submit_application` returns `PAYMENT_REQUIRED` with no completed payment) | 
| Exemptions / waivers | No F5-specific exemption or waiver mechanism found | — | CFG-F5-07 |
| Payment prerequisite | **Hard server gate:** `submit_application` refuses submission unless a `payments` row is `completed/success/paid` — applied to *all* applications, including `notification` services and zero-fee services | UI mirrors | **GAP-F5-17** (notification-only services cannot be filed without a payment record) |

**Governed completeness view** `service_configuration_completeness` reports every F5 service
complete across the five dimensions, with `decision_authority` universally
`SATISFIED_BY_FALLBACK` and no `is_complete = false` rows. Boundary: deeper fee certification
belongs to **F6**.

---

## 7. WORKFLOW ARCHITECTURE

**Canonical `post_application` workflows (LIVE, all active):**

| Workflow | ID | Steps | Services bound | Scope |
|---|---|---|---|---|
| Standard Post-License Approval | `7e9e0fc2…` | 3 | 56 | service-scoped seed row |
| Fit & Proper Post-License Approval | `24d71346…` | 4 (1 F&P-labelled step) | 40 | service-scoped seed row |
| Post-License Notification | `d2590edc…` | 2 | 24 | service-scoped seed row |
| Enhanced Post-License Approval | `2b5fdc86…` | 3 | 16 | service-scoped seed row |
| **Post Application Workflow (generic fallback)** | `c8980ebd…` | 3 | 0 direct | regulator-only, all taxonomy NULL |

All 136 services map to one of the four patterns via `services.workflow_id`; **0 services are
unbound**, and every bound workflow is active with ≥2 steps.

**Server resolver ordering** — `_resolve_application_workflow(_license_type, _regulator_id,
_sector_id, _category_id, _is_post_license, _service_id, _sub_sector_id)`:

0. `services.workflow_id` explicit mapping (highest precedence) — **this is the path all 136 F5 services take**
1. regulator + `service_id`
2. regulator + `category_id`
3. regulator + `sub_sector_id`
4. regulator + `sector_id`
5. regulator-only, all-NULL taxonomy → **generic `Post Application Workflow` fallback**

Entity-type preference array for post-licence resolution is
`ARRAY['post_application','application']`, ordered by `array_position(...)` — canonical rows win,
legacy `application` rows remain reachable as a compatibility tail. Vocabulary alignment with
`application_workflow_vocabulary` is exact.

**Structural resolution outcome by pattern:** Standard, Enhanced, Fit & Proper and Notification
all resolve deterministically at step 0 (single-row `services.workflow_id` join filtered on
`entity_type = ANY('{post_application,application}')` and `is_active`). No service resolves
ambiguously; no service resolves to a step-less or inactive workflow. Generic fallback is
reachable only for a post-licence request carrying no `service_id`.

**Defect — resolver overload ambiguity (GAP-F5-07a):** three overloads of
`_resolve_application_workflow` are live. The legacy 4-argument overload filters
`entity_type='application'` **only** and can never return a `post_application` workflow; the
5-argument overload delegates correctly. `submit_application` calls the correct 7-argument form,
but the legacy overload remains callable (EXECUTE granted to `authenticated`) and would silently
mis-resolve a post-licence request. Historical PLS workflows were **not retired** in this pass,
per instruction.

**Client/server resolver disagreement (GAP-F5-07):** `src/lib/workflowApprovalResolver.ts`
re-implements taxonomy matching in TypeScript with its own precedence
(service → category → sub-sector → sector → wildcard) and a staleness cross-check. It does not
implement step-0 `services.workflow_id` precedence, so client and server can disagree for any
service whose `workflow_id` differs from its taxonomy match.

---

## 8. F&P INTEGRATION — EVIDENCE-BASED ASSESSMENT

40 catalogue rows carry `requires_fit_and_proper = true` and bind to the *Fit & Proper
Post-License Approval* workflow, which contains one F&P-labelled step. Per instruction, a
workflow step label was **not** accepted as evidence. Actual linkage evidence:

| Integration requirement | Evidence | Verdict |
|---|---|---|
| Creates or links an F&P assessment | The only application↔F&P join table is `public.application_fp_links` (`application_id`, `assessment_id`, `role_note`, `is_required`, `linked_by`). It holds **0 rows** and is referenced nowhere in `src/` or `supabase/functions/` except generated types | **NOT INTEGRATED** |
| Identifies the affected individual / controller | `fp_individuals` (21 rows) has no linkage from any post-licence request; no post-licence form field is mapped to an `fp_individuals` record | **NOT INTEGRATED** |
| Blocks final approval pending F&P outcome | No routine reads `services.requires_fit_and_proper` at runtime (verified across all DB routines and edge functions); no decision gate consults `fp_determinations` | **NOT INTEGRATED** |
| Uses current positive determination | `fp_determinations` (29 rows) is never consulted from an F5 path | **NOT INTEGRATED** |
| Records linkage / provenance | No provenance rows exist | **NOT INTEGRATED** |

`requires_fit_and_proper` is declarative configuration with zero runtime effect. Deeper F&P
certification remains **F9**; the F5-owned defect is the missing linkage and gate (GAP-F5-04).

---

## 9. POST-APPROVAL EFFECTS — CRITICAL FINDING

**No post-licence service performs any business effect on approval.** Evidence:

- No edge function references post-licence semantics beyond the intake gate in
  `verify-and-submit`.
- No trigger on `applications`, `licenses` or `license_terms` produces a post-licence effect
  (`trg_applications_enqueue_provisioning` serves **initial** licensing only).
- No DB routine reads `services.decision_type` or `services.requires_fit_and_proper` at runtime.
- Effect stores are empty or unrelated: `license_variations` **0**, `license_variation_items`
  **0**, `regulatory_service_tasks` **0**, `license_terms` with `term_kind <> 'original'` **0**,
  `license_renewals` **1**, `license_lifecycle_matters` **5** (no linked post-licence
  applications).

| Service family | Required effect | Actual effect today |
|---|---|---|
| Renewal (`Renew`) | New current `license_terms` row (`term_kind='renewal'`), `valid_until` extension | application status only |
| Variation | Variation term + licence attribute/condition change | no service exists |
| Surrender / cancellation | Licence status + effective date | no service exists |
| Change of legal name / address | Canonical entity data update | application status only |
| Director / KFH / controller changes | Party + F&P structure update | application status only |
| Branch changes | Branch record create/close | application status only |
| Notification-only (24 rows) | Record acknowledgement **without** approval-style mutation | routed through a 2-step approval workflow; no acknowledgement record type |
| Deregistration | Relationship/licence lifecycle effect | application status only |

**Every one of the 17 definitions ends at `applications.status = 'approved'` and performs no
required business effect.** This is the principal F5 gap (GAP-F5-03).

---

## 10. CROSS-MODULE BOUNDARIES

| Module | Boundary with F5 | Current state (not fixed here) |
|---|---|---|
| **F6 Fees & Payments** | F5 owns service orchestration and the *decision* to charge; F6 owns fee schedules, payment verification, refunds | F5 has no service-level fee configuration; a blanket completed-payment gate applies to all submissions (GAP-F5-17) |
| **F9 Fit & Proper** | F5 owns "this service requires F&P and must block on it"; F9 owns assessment, screening, determination | Linkage table exists and is empty; no gate (GAP-F5-04) |
| **F14 Correspondence** | F5 approval should emit outbound correspondence for decisions | Generic application correspondence only; no service-specific templates |
| **F15 Notifications / SLA / Escalations** | `services.sla_days` should drive SLA clocks and escalations | `sla_days` is populated (8 rows null) but no F5 SLA instance or escalation rule consumes it |
| **F16 Appeals / Reviews** | Refused post-licence decisions should be appealable | Licensing appeals exist for F4 decisions; no post-licence appeal path found |
| **F18 Reporting** | Post-licence volumes/outcomes should be reportable | No F5-specific report template; post-licence rows are indistinguishable in application reports without the client heuristic |

---

## 11. SECURITY / AUDIT / WRITE-CONTRACT CENSUS

| Object | Finding |
|---|---|
| `regulatory_request_types` | `anon` **and** `authenticated` hold `INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES`; RLS on but the only policy is `SELECT USING (true)` → unauthenticated destructive DML is structurally possible → **GAP-F5-08 (CRITICAL)** |
| `license_lifecycle_configs` | `authenticated` holds `INSERT/UPDATE/DELETE`; admin-only RLS policy is the sole barrier; violates config-lockdown standard → GAP-F5-09 |
| `license_renewals` | `authenticated` holds direct `INSERT/UPDATE`; a lifecycle effect table mutable from the browser without a governed RPC → GAP-F5-10 |
| `services` | `SELECT` to `anon`/`authenticated`; writes admin-gated. OK |
| `applications` | `SELECT` only for `authenticated`; all writes governed by RPC + anti-mutation trigger. OK |
| `license_terms` | `SELECT` only; append-only trigger `tg_license_terms_append_only`. OK |
| `license_variations`, `license_variation_items`, `license_lifecycle_matters` | `SELECT` only for external roles. OK |
| `regulatory_service_tasks` | `SELECT` only for `authenticated`. OK |
| SECURITY DEFINER guards | `entity_license_entitlements`, `can_act_on_license`, `can_act_on_specific_license`, `create_application_draft`, `submit_application`, `license_variation_operation` all derive identity from `auth.uid()` and set `search_path=public`. OK |
| PUBLIC EXECUTE | `_resolve_application_workflow(7-arg)` revoked from `PUBLIC`/`anon`; legacy 4-arg overload still executable by `authenticated` → GAP-F5-07a |
| Direct browser mutations | None on `applications`; present on `license_renewals` and `license_lifecycle_configs` (above) |
| Entity isolation | Enforced at draft, submit and entitlement resolution; no cross-entity path found |
| Stale DB audit writers | None — `verify:audit-contract` (F4-B3) remains green for F5 objects |
| Stale runtime write contracts | None — `verify:write-contract` (F4-B4) finds no stale column references on F5 paths |
| Audit / action-history completeness | `applications` carries audit + compliance-audit + notification-event triggers; post-licence rows are covered. **Gap:** no audit record type exists for a post-licence *effect*, because no effect exists |

---

## 12. FINITE DISCOVERY REGISTERS

### 12.1 GAP-F5 — product gaps

| ID | Severity | Evidence | Affected journey | Root cause | Remediation recommendation |
|---|---|---|---|---|---|
| GAP-F5-01 | HIGH | `verify-and-submit` passes `data.sector_id / sub_sector_id / category_id` (client-written) into `can_act_on_license` | All F5 submissions | Entitlement scope asserted from mutable payload instead of `data.license_id` | Resolve scope from the licence server-side; prefer `can_act_on_specific_license(license_id)` at submit |
| GAP-F5-02 | HIGH | `submit_application` / `verify-and-submit` require `applicant_id = auth.uid()` | PPOC and secondary users | Submission authority modelled per-user, not per-entity-capability | Authorise submission by entity membership capability (`can_submit`) with the owner as a special case |
| GAP-F5-03 | **CRITICAL** | No effect routine/trigger; `license_variations` 0, `license_variation_items` 0, `regulatory_service_tasks` 0, non-original `license_terms` 0 | **All 17 definitions** | Post-approval effect layer was never built | Governed, idempotent effect applier per service family + outbox in the F4 provisioning pattern |
| GAP-F5-04 | HIGH | `application_fp_links` 0 rows and unreferenced in code; no routine reads `requires_fit_and_proper`; `fp_determinations` never consulted | 40 F&P-flagged services | Flag is declarative only | Create/link an F&P case at submission; block final approval on a current positive determination; record provenance |
| GAP-F5-05 | HIGH | No catalogue rows for variation / surrender / reinstatement / expiry confirmation despite `license_lifecycle_configs` support | Licence lifecycle journeys | Catalogue incomplete relative to the lifecycle model | Add the missing service definitions and intake routes (business-approved) |
| GAP-F5-06 | MEDIUM | TS matcher in `NewPostLicenseApplication.tsx:76-97` vs `application_resolve_form_set` | Service selection → forms | Duplicated resolver | Make the server resolver the sole authority; UI renders its result |
| GAP-F5-07 | MEDIUM | `workflowApprovalResolver.ts` omits step-0 `services.workflow_id` precedence used by the server | Workflow display / expectation | Duplicated resolver with different precedence | Expose a read-only server resolver RPC; delete the TS algorithm |
| GAP-F5-07a | MEDIUM | Legacy 4-arg `_resolve_application_workflow` filters `entity_type='application'` only and is executable by `authenticated` | Any future caller | Overload retained after the post-licence-aware rewrite | Deprecate/guard the legacy overloads (no retirement in this pass) |
| GAP-F5-08 | **CRITICAL** | `regulatory_request_types`: `anon`+`authenticated` INSERT/UPDATE/DELETE/TRUNCATE; only `SELECT USING (true)` policy | Platform-wide config integrity | Missing GRANT lockdown | Revoke external DML; admin-only writes; add hardening assertion |
| GAP-F5-09 | HIGH | `license_lifecycle_configs` `authenticated` DML | Lifecycle policy integrity | Config-lockdown standard not applied | Revoke; route writes through an admin RPC |
| GAP-F5-10 | HIGH | `license_renewals` `authenticated` INSERT/UPDATE | Renewal effect integrity | Effect table exposed to the browser | Revoke; renewals only via governed RPC |
| GAP-F5-11 | MEDIUM | `useOpenPostLicenseRequests.ts` hardcodes 18 statuses "mirroring" `post_license_open_statuses()` | Duplicate prevention UX | Rule duplicated by convention | Read the status set from the server |
| GAP-F5-12 | MEDIUM | `useLicenseStatusGate` recomputes status + grace from `site_settings` | Every F5 entry gate | Second eligibility implementation | Consume `entity_license_entitlements` only |
| GAP-F5-13 | MEDIUM | `admin/PostLicensingApplications.tsx` (mock data), `admin/PostLicenseForms.tsx`, `billing/PostLicenseeBilling.tsx`, `PostLicenseeDashboard.tsx`, `PreLicenseeDashboard.tsx` unrouted | Admin/licensee navigation | Abandoned scaffolding retained | Route or delete after review (not in discovery) |
| GAP-F5-14 | MEDIUM | `QuickActions.tsx` → `/billing/post-licensee`, `/post-license` (neither route exists) | Licensee dashboard | Stale links | Point at real routes |
| GAP-F5-15 | MEDIUM | No server check that `data.service_id` belongs to the licence's taxonomy; UI-only filter; UI also ignores `lifecycle_stage` | All F5 intake | Service↔licence compatibility unvalidated server-side | Validate service scope inside `create_application_draft` and at submit |
| GAP-F5-16 | LOW | No post-licensing queue/list; separation depends on client-side `getApplicationCategory()` | Regulator triage, applicant list | Category never persisted as a column | Persist a request-kind column; add filtered views |
| GAP-F5-17 | MEDIUM | `submit_application` returns `PAYMENT_REQUIRED` when no completed payment exists, with no zero-fee/notification exemption | 24 notification services and any zero-fee service | Payment gate not fee-aware | Make the gate conditional on an assessed fee > 0 (coordinate with F6) |

### 12.2 CFG-F5 — business configuration required

| ID | Item | Classification |
|---|---|---|
| CFG-F5-01 | Per-service `decision_authority` — currently `SATISFIED_BY_FALLBACK` for all 136 rows | SHARED_FALLBACK (acceptable; confirm with regulator) |
| CFG-F5-02 | `services.document_checklist` empty for all 136 rows | BUSINESS_CONFIGURATION_REQUIRED |
| CFG-F5-03 | `services.fee_reference` empty for all 136 rows (fees resolved via `fee_components`) | NOT_APPLICABLE if `fee_components` remains the source of truth; otherwise BUSINESS_CONFIGURATION_REQUIRED |
| CFG-F5-04 | 24 `notification` services routed through approval workflows; no acknowledge-and-file pattern | BUSINESS_CONFIGURATION_REQUIRED |
| CFG-F5-05 | `Renew` has no `code` and no `sla_days` | REQUIRED |
| CFG-F5-06 | `Change of Registered Address` (8 rows, uncoded) duplicates `PLS_CHANGE_ADDRESS`; already `NOT_APPLICABLE` for fees in `service_config_expectations` | BUSINESS_CONFIGURATION_REQUIRED (deduplicate) |
| CFG-F5-07 | No fee exemption/waiver rules for post-licence services | BUSINESS_CONFIGURATION_REQUIRED (jointly with F6) |
| CFG-F5-08 | Renewal windows, grace and reminder days exist in `license_lifecycle_configs` but are not bound to the `Renew` service | REQUIRED |
| CFG-F5-09 | Variation rules (permitted attribute/condition changes) undefined | BUSINESS_CONFIGURATION_REQUIRED |
| CFG-F5-10 | SLA instances/escalation rules do not consume `services.sla_days` | REQUIRED (F15 boundary) |

### 12.3 DR-F5 — data / historical inconsistencies (LIVE counts)

| ID | Item | LIVE count |
|---|---|---|
| DR-F5-01 | "≈120 post-licence services" counts sector fan-out rows, not business definitions | 136 rows / **17 definitions** |
| DR-F5-02 | Post-licence requests ever created — all still `draft`; decision and effect paths have **never executed** | 2 (2 draft, 0 submitted, 0 decided) |
| DR-F5-03 | Licence without an `original` term (F4-B5 documented append-only exception; **does not affect F5 eligibility**) | 1 (`LIC-2026-000033`) |
| DR-F5-04 | `license_lifecycle_matters` rows with no corresponding post-licence application (provenance unverified) | 5 |
| DR-F5-05 | `regulatory_request_types` rows describing lifecycle requests, not joined to `services` and unused by F5 intake | 17 |
| DR-F5-06 | Uncoded catalogue rows (`Renew`, `Change of Registered Address`) | 16 |
| DR-F5-07 | `license_renewals` rows with no linked post-licence application | 1 |
| DR-F5-08 | F&P estate never linked to any application (`application_fp_links`) | 0 links against 21 assessments / 29 determinations |
| DR-F5-09 | Draft (unpublished) post-licence form templates | 2 of 139 |

---

## 13. DISCOVERY EXIT CRITERIA

| Criterion | State |
|---|---|
| Exact tested HEAD | `cf278ba45c723132589920485ca5a39d5c6711b8` (F4 baseline `dfe4340b…`) |
| Complete F5 architecture | §1, §4 |
| Surface manifest (19 surfaces, classified) | §2 |
| Service catalogue counts | 136 rows / 17 definitions / 0 unbound / 40 F&P-flagged — §3 |
| Workflow-pattern counts | 4 patterns (56/40/24/16) + 1 generic `post_application` fallback, all active — §7 |
| Lifecycle / state model | §4 (vocabulary `pre_application` / `post_application` / legacy `application`) |
| Finite GAP register | 18 entries (2 CRITICAL, 6 HIGH, 9 MEDIUM, 1 LOW) |
| Finite CFG register | 10 entries, classified |
| Finite DR register | 9 entries with live counts |
| Recommended F5-B sequence | below |

**Recommended F5-B remediation sequence**

1. **F5-B1 — privilege lockdown (no behaviour change):** GAP-F5-08, -09, -10; extend
   `verify:hardening` with F5 assertions.
2. **F5-B2 — intake authority correctness:** GAP-F5-01, -02, -15.
3. **F5-B3 — post-approval effect engine (largest):** GAP-F5-03, then GAP-F5-05 (variation,
   surrender, reinstatement, expiry) with governed idempotent appliers + outbox.
4. **F5-B4 — F&P integration:** GAP-F5-04 (create/link case, block on determination, provenance).
5. **F5-B5 — single-authority consolidation:** GAP-F5-06, -07, -07a, -11, -12.
6. **F5-B6 — fee-aware submission + surface closure:** GAP-F5-17, -13, -14, -16.
7. **F5-B7 — business configuration (with the regulator):** CFG-F5-01 … CFG-F5-10.

---

## FINAL VERDICT

**F5-A DISCOVERY COMPLETE — READY FOR INDEPENDENT REVIEW.**

No remediation, migration, data change or workflow retirement was performed. F5-B has not been
started.

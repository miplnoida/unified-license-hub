# F5-A — POST-LICENSING SERVICES DISCOVERY

**Pass type:** DISCOVERY ONLY — no product code, schema, privilege or data change was made.
**Evidence HEAD:** `cf278ba45c723132589920485ca5a39d5c6711b8`
**F4 frozen HEAD:** `dfe4340b8e546fe39f2e1a54ae1c4dacbdc25e0a` (F4 PRODUCT CERTIFIED AND FROZEN)
**Census script:** `scripts/verify-f5-discovery.sql` (read-only)
**Date:** 2026-08-29

---

## 1. F4 → F5 BOUNDARY

F5 begins where F4 ends: an **issued licence with a current term**. The boundary object set is
`public.licenses` → `public.entity_licenses` (entity binding) → `public.license_terms` (current term).

| Boundary fact | Live value |
|---|---|
| Licences | 60 |
| Entity-licence bindings | 60 |
| Licence terms | 60 (all `is_current`) |
| Licences without a current term | 0 |
| Licences without an `original` term | 1 (`LIC-2026-000033`, documented F4-B5 append-only exception) |
| Licences without `holder_id` / `sector_id` | 0 / 0 |

**Boundary contract (as implemented):** a post-licence request is created only through
`public.create_application_draft`, which
(a) requires `data.license_id` for any post-licence intent,
(b) derives the owning entity from `licenses.holder_id` — never from the client payload,
(c) rejects `LICENSE_ENTITY_MISMATCH` when a caller claims a different entity, and
(d) re-checks `public.can_act_on_specific_license` for non-staff callers.
Submission re-validates through `can_act_on_license` inside the `verify-and-submit` edge function.

**Boundary verdict:** structurally sound. Ownership and eligibility are server-derived at both
creation and submission. Two defects are recorded below (GAP-F5-01 payload-trust on the submission
gate, GAP-F5-02 single-owner submission authority).

---

## 2. F5 SURFACE INVENTORY

| Surface | Component | Route | Hook / RPC | Class |
|---|---|---|---|---|
| New post-licence request | `NewPostLicenseApplication.tsx` | `/post-license/new` | `useLicenseEntitlements` → `entity_license_entitlements`; `create_application_draft` | ACTIVE |
| Request forms workspace | `PostLicenseApplicationForms.tsx` | `/post-licensee/applications/:id/forms` | `useResolveAppFormVersion`; `applicationDraftSave`; edge `verify-and-submit` | ACTIVE |
| Shared request workspace | `applications/ApplicationDetail.tsx` | `/applications/:id` | `workflowApprovalResolver`; governed workflow RPCs | ACTIVE |
| Regulator request queue | `applications/ApplicationQueue.tsx` | `/applications/queue` | workflow/queue hooks | ACTIVE (shared with F4) |
| Public service catalogue | `LicenseeServices.tsx`, `LicenseeServiceDetail.tsx` | `/licensee-services`, `/licensee-services/:slug` | `lib/publicServices/catalogue.ts` | ACTIVE |
| Post-licence form config | `admin/FormManagement.tsx` | `/admin/forms?tab=post_license` | form template hooks | ACTIVE |
| Service catalogue config | `admin/MasterConfiguration.tsx` | `/admin/masters/services` | master config hooks | ACTIVE |
| Legacy forms path | — | `/admin/forms/post-license` | — | COMPAT REDIRECT (intentional) |
| Admin post-licence forms list | `admin/PostLicenseForms.tsx` | none | — | UNREACHABLE / duplicate |
| Admin post-licensing queue | `admin/PostLicensingApplications.tsx` | none | hardcoded `initialApps` mock | UNREACHABLE + MOCK DATA |
| Post-licensee billing | `billing/PostLicenseeBilling.tsx` | none | — | UNREACHABLE |
| Post-licensee dashboard | `PostLicenseeDashboard.tsx` | none | — | UNREACHABLE (superseded by `Dashboard.tsx`) |
| Pre-licensee dashboard | `PreLicenseeDashboard.tsx` | none | — | UNREACHABLE (superseded by `Dashboard.tsx`) |
| Quick action "View Billing" | `QuickActions.tsx` | `/billing/post-licensee` — **route does not exist** | — | BROKEN ENTRYPOINT |
| Quick action "Post-License Services" | `QuickActions.tsx` | `/post-license` — **route does not exist** | — | BROKEN ENTRYPOINT |

There is **no regulator-facing post-licensing work queue distinct from F4's** — post-licence requests
are triaged through the same `/applications/queue` and `/applications/:id` surfaces, differentiated
only by the client-side heuristic `getApplicationCategory()` (`data.service_id` / `data.type`).

---

## 3. SERVICE CATALOGUE CENSUS

| Fact | Live value |
|---|---|
| `services` rows, `lifecycle_stage = post_license`, active | 128 |
| `services` rows, `lifecycle_stage = renewal`, active | 8 |
| **Total F5 catalogue rows** | **136** |
| Distinct service definitions | 17 (each fanned out across 8 sectors) |
| Bound to a workflow | 136 / 136 (0 unbound) |
| `requires_fit_and_proper` | 40 (5 definitions × 8 sectors) |
| `decision_type = approval` / `notification` | 112 / 24 |
| Rows with `fee_reference` populated | **0** |
| Rows with a non-empty `document_checklist` | **0** |
| Rows without `sla_days` | 8 (the `Renew` definition) |
| Rows without `code` | 16 (`Renew`, `Change of Registered Address`) |

**Definitions present:** Beneficial Owner Change, Branch Closure, Change of Address, Change of
Control, Change of Legal Name, Change of Registered Address*, Director Appointment, Director
Resignation, Entity Deregistration / Relationship Closure, External Auditor Change, Group
Restructure, Key Function Holder Change, Material Incident Notification, Material Outsourcing
Notification, New Branch, Renew*, Shareholding Change. (* uncoded rows.)

**Definitions absent from the catalogue:** licence **variation** (scope/condition change),
licence **surrender**, licence **reinstatement**, licence **expiry confirmation** — even though
`license_lifecycle_configs` and `license_lifecycle_config_resolve()` model all of these matter kinds.
Recorded as GAP-F5-05.

**"120+ services" claim:** the live catalogue is 136 rows over **17 business definitions**. The
120+ figure counts sector fan-out rows, not distinct regulatory services. Recorded as DR-F5-01
(reporting divergence, not a product defect).

---

## 4. CANONICAL F5 LIFECYCLE (AS IMPLEMENTED)

```text
eligible licence (F4)
   -> select licence + service            (/post-license/new)
   -> create_application_draft            (server-derived owner, duplicate lock)
   -> complete pinned form versions       (/post-licensee/applications/:id/forms)
   -> fee assessment + payment            (fee_components / payments)
   -> verify-and-submit (edge)            (ownership, entitlement, duplicate, completeness)
   -> approval_workflows / approval_steps (one of 4 canonical patterns)
   -> decision recorded on applications
   -> [MISSING] post-approval effect on licence / entity / register
```

Duplicate protection is enforced server-side by trigger
`trg_prevent_duplicate_post_license_request` → `prevent_duplicate_post_license_request()`, which
takes an advisory lock on `licence + service` and refuses a second request while one is in any
status returned by `post_license_open_statuses()`.

**Empirical state:** only **2** post-licence requests exist live, both in `draft`. **No post-licence
request has ever been submitted, decided, or effected in this environment.** The intake half of the
lifecycle is real; the decision and effect halves are unproven. Recorded as DR-F5-02.

---

## 5. POST-APPROVAL EFFECTS — PRINCIPAL FINDING

No server routine or edge function applies the regulatory effect of an approved post-licence
service. Evidence:

- No edge function references `post_license` except `verify-and-submit` (intake gate only).
- No trigger on `applications` produces a licence, entity, register or term change for a
  post-licence approval (`trg_applications_enqueue_provisioning` serves initial licensing only).
- Effect stores are empty or near-empty: `license_variations` 0, `license_variation_items` 0,
  `regulatory_service_tasks` 0, `license_renewals` 1, `license_lifecycle_matters` 5,
  `license_terms` with `term_kind <> 'original'` = 0.

Consequence: approving *Change of Legal Name*, *Director Appointment*, *New Branch*,
*Shareholding Change* or *Renew* changes an application row and nothing else — the licence, entity
record and licence term history remain untouched. This is the single largest F5 gap (GAP-F5-03) and
must lead the F5-B sequence.

---

## 6. FIT & PROPER INTEGRATION

40 catalogue rows carry `requires_fit_and_proper = true` (Change of Control, Beneficial Owner
Change, Director Appointment, Key Function Holder Change, Shareholding Change) and 40 rows bind to
the *Fit & Proper Post-License Approval* workflow. However nothing in the runtime consumes that
flag: no edge function or DB routine reads `services.requires_fit_and_proper`, and no post-licence
request creates or links an F&P declaration, screening or assessment case. The F&P requirement is
declarative configuration with no enforcement. Recorded as GAP-F5-04.

---

## 7. FORMS, DOCUMENTS AND FEES — SERVER TRUTH VS UI

- **Forms (server):** 139 `post_license` templates (137 published, all service-bound; 2 draft).
  Server resolver `application_resolve_form_set(..., 'post_license')` resolves package → category →
  sub-sector → sector.
- **Forms (UI):** `NewPostLicenseApplication.tsx` re-implements its own service → sub-sector →
  sector → name-match chain in TypeScript and writes the result into `data.form_template_ids`
  *before* the server resolver is consulted. Two resolvers, one authority. GAP-F5-06.
- **Documents:** `services.document_checklist` is empty for all 136 rows; document expectations
  exist only inside form templates. CFG-F5-02.
- **Fees:** `services.fee_reference` is empty for all 136 rows. Fee resolution happens through
  `fee_components` / `resolveApplicationFeeBreakdown`, and the governed completeness view marks the
  `fee` dimension `SATISFIED` via that path — but the catalogue column is dead weight and invites
  divergence. CFG-F5-03.
- **Completeness view:** `service_configuration_completeness` reports every F5 service complete;
  `decision_authority` is universally `SATISFIED_BY_FALLBACK` (no per-service authority anywhere).
  CFG-F5-01.

---

## 8. WORKFLOW ARCHITECTURE

Four canonical patterns carry all 136 services, with no fallback rows:

| Workflow | Services bound |
|---|---|
| Standard Post-License Approval | 56 |
| Fit & Proper Post-License Approval | 40 |
| Post-License Notification | 24 |
| Enhanced Post-License Approval | 16 |

Client-side, `workflowApprovalResolver.ts` reconstructs the taxonomy-matching algorithm of
`public._resolve_application_workflow` in TypeScript and cross-checks the attached
`applications.workflow_id` for staleness. Functionally useful, but it is a second implementation of
a governed rule. Recorded as GAP-F5-07 (consolidate to server truth).

`decision_type = 'notification'` (24 rows) routes through an approval workflow like everything else:
notifications are not modelled as acknowledge-and-file. CFG-F5-04.

---

## 9. CROSS-MODULE BOUNDARIES

| Boundary | State |
|---|---|
| F6 (returns) | Shares the entitlement resolver (`returns_entitlement_ok`, `can_act_on_license`). Clean. |
| F9 (payments/fees) | Post-licence fees flow through the shared `fee_components` / `payments` path; no F5-specific fee configuration exists. |
| F14 (supervision) | `trg_licenses_auto_supervisory_plan` seeds plans from licences only; post-licence changes never re-seed or notify supervision. |
| F15 (register / entity data) | No post-licence approval writes to the entity register or identifier register — direct consequence of GAP-F5-03. |
| F16 (notifications) | `applications` notification-event trigger fires generically; no post-licence service-specific templates. |
| F18 (audit) | `applications` audit triggers cover post-licence rows; the audit-contract gate from F4-B3 remains green. |

---

## 10. SECURITY / PRIVILEGE / WRITE-CONTRACT CENSUS

| Object | Finding | Severity |
|---|---|---|
| `regulatory_request_types` | `anon` **and** `authenticated` hold INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES; the only policy is `SELECT USING (true)` | **CRITICAL** — GAP-F5-08 |
| `license_lifecycle_configs` | `authenticated` holds INSERT/UPDATE/DELETE (admin-only RLS policy is the sole barrier); violates the config-lockdown standard | HIGH — GAP-F5-09 |
| `license_renewals` | `authenticated` holds direct INSERT/UPDATE — a lifecycle effect table mutable from the browser without a governed RPC | HIGH — GAP-F5-10 |
| `services` | read-only to `authenticated`, admin-gated writes | OK |
| `license_terms`, `license_variations`, `license_variation_items`, `license_lifecycle_matters` | SELECT only for external roles | OK |
| `applications` | SELECT only for `authenticated`; all writes governed | OK |
| Governed routines | `can_act_on_license`, `entity_license_entitlements`, `license_variation_operation`, `regulatory_service_task_execution` are SECURITY DEFINER with caller-derived identity | OK |
| Runtime write-contract | `verify:write-contract` gate remains green for F5 paths; no stale column references found | OK |

---

## 11. DISCOVERY REGISTERS

### GAP-F5 — product defects requiring remediation

| ID | Severity | Finding |
|---|---|---|
| GAP-F5-01 | HIGH | `verify-and-submit` calls `can_act_on_license` with sector/sub-sector/category taken from the **client-written** `applications.data` payload rather than derived from `data.license_id`. Entitlement must be resolved from the licence. |
| GAP-F5-02 | HIGH | `verify-and-submit` allows submission only when `applications.applicant_id = auth.uid()`. A PPOC or authorised secondary user of the same entity cannot submit a draft raised by a colleague. Authority must be entity-membership based. |
| GAP-F5-03 | CRITICAL | **No post-approval effect exists.** Approving any post-licence service mutates no licence, term, entity or register record. Effect stores are empty. |
| GAP-F5-04 | HIGH | `services.requires_fit_and_proper` is never read at runtime; no post-licence request creates or links an F&P case. |
| GAP-F5-05 | HIGH | Licence **variation**, **surrender**, **reinstatement** and **expiry confirmation** have schema and config support but no catalogue service and no intake surface. |
| GAP-F5-06 | MEDIUM | Form-set resolution is duplicated: TypeScript matching in `NewPostLicenseApplication.tsx` vs `application_resolve_form_set`. Server must be sole authority. |
| GAP-F5-07 | MEDIUM | Workflow matching is duplicated: `workflowApprovalResolver.ts` vs `_resolve_application_workflow`. |
| GAP-F5-08 | CRITICAL | `regulatory_request_types` grants full DML (including TRUNCATE) to `anon` and `authenticated`. |
| GAP-F5-09 | HIGH | `license_lifecycle_configs` grants INSERT/UPDATE/DELETE to `authenticated`, against the config-lockdown standard. |
| GAP-F5-10 | HIGH | `license_renewals` grants direct INSERT/UPDATE to `authenticated`; renewal effects must be RPC-governed. |
| GAP-F5-11 | MEDIUM | Duplicate-open-status list is hand-mirrored in `useOpenPostLicenseRequests.ts` instead of read from `post_license_open_statuses()`. |
| GAP-F5-12 | MEDIUM | `useLicenseStatusGate` recomputes status + grace client-side from `site_settings`, duplicating the canonical `entity_license_entitlements` resolver. |
| GAP-F5-13 | MEDIUM | Unreachable F5 surfaces retained in tree: `admin/PostLicensingApplications.tsx` (also mock-data), `admin/PostLicenseForms.tsx`, `billing/PostLicenseeBilling.tsx`, `PostLicenseeDashboard.tsx`, `PreLicenseeDashboard.tsx`. |
| GAP-F5-14 | MEDIUM | Broken entrypoints in `QuickActions.tsx`: `/billing/post-licensee` and `/post-license` resolve to no route. |
| GAP-F5-15 | LOW | Service list on `/post-license/new` filters only on sector/sub-sector — it does not filter by `lifecycle_stage`, so a non-F5 service row in scope would be offered. |
| GAP-F5-16 | LOW | No regulator-facing post-licensing queue view; post-licence requests are indistinguishable from F4 applications except by a client-side heuristic. |

### CFG-F5 — business configuration items (not product defects)

| ID | Item |
|---|---|
| CFG-F5-01 | `decision_authority` is `SATISFIED_BY_FALLBACK` for every F5 service — no per-service decision authority configured. |
| CFG-F5-02 | `services.document_checklist` empty for all 136 rows. |
| CFG-F5-03 | `services.fee_reference` empty for all 136 rows (fees resolved via `fee_components`). |
| CFG-F5-04 | 24 `notification` services route through approval workflows; no acknowledge-and-file pattern configured. |
| CFG-F5-05 | `Renew` (8 rows) has no `code` and no `sla_days`. |
| CFG-F5-06 | `Change of Registered Address` (8 rows) duplicates coded `PLS_CHANGE_ADDRESS`; already marked `NOT_APPLICABLE` for fees in `service_config_expectations`. |

### DR-F5 — data / reporting divergence

| ID | Item |
|---|---|
| DR-F5-01 | "120+ post-licensing services" counts sector fan-out rows; the live catalogue is 136 rows over 17 business definitions. |
| DR-F5-02 | Only 2 post-licence requests exist, both `draft`. Decision and effect paths have never executed in this environment. |
| DR-F5-03 | `LIC-2026-000033` still lacks an `original` term (carried forward from F4-B5 as a documented append-only exception). |
| DR-F5-04 | `license_lifecycle_matters` holds 5 rows with no corresponding post-licence applications — provenance unverified. |

---

## 12. RECOMMENDED F5-B REMEDIATION SEQUENCE

1. **F5-B1 — privilege lockdown (no behaviour change):** GAP-F5-08, GAP-F5-09, GAP-F5-10. Revoke
   external DML, add governed RPCs where a write is legitimately needed, extend
   `verify:hardening` with F5 assertions.
2. **F5-B2 — intake authority correctness:** GAP-F5-01, GAP-F5-02. Derive entitlement scope from
   `license_id` server-side; move submission authority to entity membership capability.
3. **F5-B3 — post-approval effect engine (largest item):** GAP-F5-03 plus GAP-F5-05. Introduce a
   governed, idempotent effect applier per service family (identity change, structural change,
   people change, branch change, renewal/variation/surrender) writing `license_terms`,
   `license_lifecycle_matters` and the entity register; add an outbox in the F4 provisioning style.
4. **F5-B4 — F&P integration:** GAP-F5-04. Make `requires_fit_and_proper` a real gate that creates
   and blocks on an F&P case.
5. **F5-B5 — single-authority consolidation:** GAP-F5-06, GAP-F5-07, GAP-F5-11, GAP-F5-12.
6. **F5-B6 — surface closure:** GAP-F5-13, GAP-F5-14, GAP-F5-15, GAP-F5-16.
7. **F5-B7 — configuration completion (business, with the regulator):** CFG-F5-01 … CFG-F5-06.

**Discovery exit criteria met:** boundary established, surfaces inventoried and classified,
catalogue and workflow architecture censused, lifecycle traced end to end, effect gap proven
empirically, security census complete, registers finite and prioritised.

**Verdict: F5 READY FOR REMEDIATION (F5-B).** No remediation was performed in this pass.

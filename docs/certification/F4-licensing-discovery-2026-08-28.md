# F4 — LICENSING DISCOVERY (Track-A Certification Charter)

**Mode:** DISCOVERY ONLY. No F4 remediation was performed in this pass.

| Item | Value |
|------|-------|
| Discovery date | 2026-08-28 |
| F3 product runtime baseline | `824c54a5be5275ffe6180464711d39dc62dab429` |
| F3 certification evidence HEAD | `5ad3595171876dfc64cb1411d7002686b4fbde1b` |
| F4 discovery HEAD (code read at) | `5ad3595171876dfc64cb1411d7002686b4fbde1b` |
| Frozen upstream | F0, F1, F2, F3 — CERTIFIED AND FROZEN |
| Doc-only housekeeping in this pass | `docs/certification/F3-registration-final-certification-2026-08-28.md` — the non-resolvable `17691627…` freeze/tested-SHA wording was replaced with the resolvable runtime (`824c54a5…`) / evidence (`5ad35951…`) pair. No F3 runtime source, schema, migration, RLS, grant, workflow or configuration was changed. |

**Boundary held throughout this discovery**

- F3 ends at `public.registration_licensing_handoffs` (governed approved-registration handoff).
- F4 starts from that handoff and owns the licensing application lifecycle through licence issuance/decision.
- F5 owns post-licensing services once a licence exists.
- F3/F4/F5 were not merged; findings that belong to F3 or F5 are marked as boundary observations only.

---

## 1. Actual licensing architecture (census)

### 1.1 Data model — licensing tables in scope (54 catalogued)

**Core spine**

| Table | Role |
|---|---|
| `applications` | The licensing case record. Owns status, applicant, entity, licence/service selection, form payload, priority, assignment. |
| `licenses` | The issued licence. `license_number` UNIQUE, `application_id` UNIQUE (`uq_licenses_application`). |
| `entity_licenses` | Canonical entity ↔ licence linkage (post-F2 identity model). |
| `licensees` | Legacy/operational licensee profile; still carries a single `license_id` column. |
| `registration_licensing_handoffs` | **F3→F4 contract table.** `registration_id` UNIQUE FK (CASCADE), `application_id` FK (SET NULL), `registration_reference`, `detail jsonb`. |

**Application satellites**

`application_documents`, `application_form_requirements`, `application_fp_links`, `application_ai_assessments`, `application_acknowledgements`, `application_remarks`/`approval_actions`, `application_sufficiency_findings`, `application_rfi_*`, `payments` (`application_id`).

**Licence satellites**

`license_terms` (append-only term history), `license_conditions`, `license_variations`, `license_renewals`, `license_decisions`, `license_decision_appeals`, `license_fee_assessments`, `license_fee_bindings`, `license_lifecycle_matters`, `license_lifecycle_configs`, `license_certificates`, `license_verification_templates`.

**Workflow / governance**

`approval_workflows`, `approval_steps`, `workflow_instances`, `approval_actions`, `decision_authority_rules`, `process_templates`, SLA stage tables, `audit_logs`, `notifications`.

**Read models (SECURITY INVOKER, RLS-respecting)**

`v_application_case_state`, `application_work_queue(...)`, `application_work_queue_counts(...)`, `application_case(...)`.

### 1.2 Frontend surface

Applicant: `/applications`, `/applications/new`, `/applications/:id` (draft/save/resume/submit), acknowledgement view.
Staff: applications list + work queue, `ApplicationDetail.tsx` (tabbed), `WorkflowPanel.tsx`, sufficiency/RFI panels, decision/consolidated decision view, certificate preview/dispatch.
Admin: licence lifecycle configuration, SLA manager, workflow builder, fee bindings.

**Dead / orphaned / competing screens found:** `ApplicationQueue.tsx` (superseded by the server-owned work-queue read model), `PreLicense.tsx`, `PostLicense.tsx` (legacy pre/post split), plus the retired `/admin/licensees/:id` identity workspace.

### 1.3 Edge functions (authz posture)

All licensing edge functions carry a canonical authz marker enforced in CI by `scripts/verify-edge-authz.mjs`:

| Function | Gate |
|---|---|
| `perform-workflow-action` | `requireUserPermission(application_management, workflow_action)` + in-code legal-stage and decision-gate enforcement |
| `add-application-remark` | `application_management.edit` (remark only; must not advance workflow) |
| `evaluate-application-sufficiency` | `application_management.edit` |
| `generate-application-ai-assessment` | user-permission OR service-role internal allowlist |
| `approve-pre-licensee` | `registration_management.approve` + in-code role re-check |
| `generate-license-certificate` / `sign-license-certificate` / `dispatch-license-certificate` | `license_management.manage_certificates` |
| `perform-license-action` | `license_management.workflow_action` |
| `license-expiry-sweep` / `license-expiry-reminders` | `requireWorkerInvocation(Async)` — worker only |
| `application-acknowledgement` | `requireAuthenticatedUser` |
| `get-licensee-registration` | `registration_management.view` (F3 boundary) |
| `register-pre-licensee` | `markPublicFunction` (OTP/CAPTCHA gated, F3) |

No unmarked or ungated licensing edge function exists.

### 1.4 Competing / legacy models identified

1. **`perform_final_workflow_approval` (governed spine)** vs **`perform_manual_application_approval` (bypass path)** — see GAP-F4-01.
2. **Historical inline licence INSERT** inside pre-2026-05-06 revisions of `perform_final_workflow_approval` — superseded by `provision_application_entity`; only one production licence-insert path remains.
3. **`licensees.license_id`** single-licence field (31 rows populated) vs **`entity_licenses`** many-to-many canonical linkage.
4. **`pre_application` / `post_application`** workflow `entity_type` vocabulary vs **`application`** on `workflow_instances`.
5. **`cert_v2_seed_entities`** fixture function inserting directly into `licenses` (cert fixtures only, not a production path).

---

## 2. Traced F4 lifecycle (as built)

```text
F3: registrations.status -> 'approved'
      | AFTER UPDATE trigger registrations_licensing_handoff
      v
public.registration_licensing_handoff(_registration_id)  [SECURITY DEFINER]
  - resolves taxonomy / licence type
  - finds-or-INSERTs a DRAFT applications row for the applicant
  - UPSERTs registration_licensing_handoffs (application_id populated)
  - emits onboarding_record_journey_event
      v
=========================== F3 | F4 BOUNDARY ===========================
      v
applications (draft)
  -> licence/service/type selection            (client-side; no server contract)
  -> forms + documents                          (application_documents; requirements table EMPTY)
  -> fee requirement                            (payments.application_id; checked only at provisioning)
  -> draft/save/resume                          (governed ops in src/lib/applicationGovernedOps.ts)
  -> submit                                     (status -> submitted; completeness client-evaluated)
  -> intake/assignment                          (application_work_queue read model)
  -> sufficiency  (evaluate-application-sufficiency) -> RFI -> resubmission
  -> review (workflow_instances, entity_type='application', approval_steps)
  -> decision gates (check_decision_gates: F&P / sufficiency / RFI)
  -> maker/checker via user_can_act_on_workflow_step + allowed_actions
  -> perform_final_workflow_approval  [governed, last-step only]
        - applications.status = 'approved'
        - workflow_instances.status = 'completed'
        - approval_actions (idempotent ON CONFLICT action='approve_final')
        - create_audit_log + create_notification
        - CALLS provision_application_entity(application_id)
              - payment check (payments.status)
              - renewal path: UPDATE existing licenses row + license_terms
              - new path: INSERT licenses (license_number via column DEFAULT
                          generate_license_number() -> LIC-YYYY-NNNNNN),
                          create/reuse licensees, entity_link_license()
  -> edge function perform-workflow-action then HTTP-calls approve-pre-licensee
        - Auth admin.createUser, profiles, user_roles,
          seed_external_portal_defaults, bootstrap_supervisory_profile,
          fire-and-forget generate-license-certificate
      v
=========================== F4 | F5 BOUNDARY ===========================
licenses + entity_licenses + license_terms  ->  F5 post-licensing services
```

### 2.1 Transition matrix (UI → permission → RPC → DB → workflow → audit → notification)

| Transition | UI | Permission | Server op | DB effect | History | Audit | Notify |
|---|---|---|---|---|---|---|---|
| Handoff → draft application | none (trigger) | n/a (DEFINER) | `registration_licensing_handoff` | `applications` insert, handoff upsert | journey event | yes | no |
| Create ad-hoc application | `/applications/new` | authenticated applicant | `create_application_draft` | `applications` insert | — | partial | no |
| Save/resume draft | ApplicationDetail | owner | governed ops | `applications` update | — | yes | no |
| Submit | ApplicationDetail | owner | governed submit | status → `submitted` | workflow start | yes | yes |
| Sufficiency | staff panel | `application_management.edit` | `evaluate-application-sufficiency` | findings / RFI | yes | yes | yes |
| Remark | WorkflowPanel | `application_management.edit` | `add-application-remark` | `approval_actions` | yes | yes | no |
| Step advance | WorkflowPanel | `application_management.workflow_action` | `perform_workflow_transition` | instance step | yes | yes | yes |
| Final approval | WorkflowPanel | same + gates | `perform_final_workflow_approval` → `provision_application_entity` | approved + licence | yes | yes | yes |
| Manual approval (bypass) | admin | **hardcoded role list** | `perform_manual_application_approval` | approved | partial | partial | partial |
| Reject / withdraw | WorkflowPanel | workflow_action | governed transition | status | yes | yes | yes |
| Certificate | licence view | `license_management.manage_certificates` | generate/sign/dispatch | `license_certificates` | yes | yes | yes |

### 2.2 Actual state machines

**applications.status** — `draft → in_progress → submitted → (approved | rejected | cancelled | withdrawn)`.
No DB CHECK constraint exists (confirmed: only `applications_priority_check`). UI adds label-level drift (`clarification_requested`).

**licenses.status** — observed values `active` (47), `revoked` (1), `surrendered` (2). Documented vocabulary also includes `active_grace, suspended, cancelled, expired, inactive, pending`. `surrendered` is **not** in the documented list and there is **no CHECK constraint**.

---

## 3. Non-destructive security / control probe results

| # | Probe | Result | Ref |
|---|---|---|---|
| 1 | Application without approved F3 handoff | **FAIL** — `create_application_draft` lets any authenticated applicant open a new-licence application with no handoff. 16 of 19 applications have no handoff row. | GAP-F4-02 |
| 2 | Duplicate handoff / duplicate application | **PASS (handoff)** — `registration_id` UNIQUE, upsert idempotent, find-or-insert draft. | — |
| 3 | Applicant accessing another entity | **PASS** — RLS on `applications` scopes to applicant/entity. | — |
| 4 | Direct application/licence DML | **PARTIAL** — `authenticated` INSERT/UPDATE/DELETE revoked on `licenses` and `application_form_requirements`; but full DML grants remain on 9 licensing satellite tables and `anon` retains DML grants on 6. RLS currently denies (no write policies), so exploitation is blocked by RLS alone — no defence in depth. | GAP-F4-06 |
| 5 | Applicant self-approval | **PASS** on governed path (`user_can_act_on_workflow_step`); **FAIL** on `perform_manual_application_approval`. | GAP-F4-01 |
| 6 | Unauthorized reviewer | **PASS** on governed path. | — |
| 7 | Wrong workflow step | **PASS** — last-step position check enforced. | — |
| 8 | maker = checker | **PASS** governed; **not enforced** in manual path. | GAP-F4-01 |
| 9 | Stale / duplicate decision | **PASS** — idempotent `approval_actions` ON CONFLICT + `uq_licenses_application`. | — |
| 10 | Missing mandatory documents | **FAIL** — `application_form_requirements` is EMPTY (0 rows); no server-side document-completeness gate is effective. | GAP-F4-04 |
| 11 | Unpaid fee where required | **WEAK** — only a `payments.status` existence check inside `provision_application_entity`; no fee assessment binding, no pre-decision gate. | GAP-F4-05 |
| 12 | Failed F&P dependency | **FAIL** — two defects: (a) `check_decision_gates` matches `individual_roles.licensee_id` against `applications.applicant_id` (an `auth.users` id), so the entity-inferred gate can never match; (b) `application_fp_links` is EMPTY (0 rows) and all non-draft applications lack links, so the explicit gate is never blocking. The F&P gate is silently inert. | GAP-F4-03 |
| 13 | Wrong-state issuance | **FAIL** — `perform_manual_application_approval` only blocks `rejected/cancelled/withdrawn`; a **`draft`, never-submitted** application can be approved and licensed. | GAP-F4-01 |
| 14 | Duplicate licence issuance | **PASS** — `uq_licenses_application` + provisioning guard. | — |
| 15 | Licence-number collision | **PASS** — single generation path (`generate_license_number()` column DEFAULT over `license_number_seq`), `license_number` UNIQUE, no TS-side generation. | — |
| 16 | Rejected/withdrawn producing licence | **PASS** governed; blocked in manual path too. | — |
| 17 | Direct URL / persona / RLS isolation | **PASS** for `applications`, `licenses`, `registration_licensing_handoffs` (`rlh_read`: internal staff or owning registrant; `anon` has no access). | — |
| 18 | Provisioning atomicity | **FAIL (resilience)** — RPC commits licence, then edge function HTTP-calls `approve-pre-licensee`; a failure leaves a licence with no portal user/certificate and there is no retry queue. | GAP-F4-08 |

### 3.1 Privilege census (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN)

- `authenticated` holds the **full eight-privilege set** on 9 licensing tables including `license_renewals`, `license_terms`, `entity_licenses`, `license_variations`, `license_decisions`, `license_fee_assessments`, `license_lifecycle_matters`.
- `anon` holds broad DML on 6 tables: `entity_licenses`, `license_decisions`, `license_fee_assessments`, `license_lifecycle_matters`, `license_terms`, `license_variations`.
- Most of these tables carry exactly **one SELECT policy** and no write policy, so RLS deny-by-default currently blocks every write. The grants are nonetheless excessive relative to the F2/F3 lockdown standard.
- `registration_licensing_handoffs`: `service_role ALL`; `authenticated` SELECT-via-policy only; `anon` nothing. Compliant.

---

## 4. Specific investigation answers

| Question | Finding |
|---|---|
| `perform_final_workflow_approval` vs `approve-pre-licensee` overlap | **No overlap in licence creation.** The RPC (via `provision_application_entity`) is the sole creator of `licenses`/`licensees`. `approve-pre-licensee` is post-approval provisioning only — it SELECTs the existing licence and 409s `NO_LICENSE` if absent; it creates only the Auth user, profile, roles, portal defaults and triggers the certificate. They are two halves of one pipeline split across the SQL/Deno boundary. |
| Which path creates licences | Exactly one production path: `perform_final_workflow_approval → provision_application_entity → INSERT INTO public.licenses`. Historical inline inserts were retired 2026-05-06. `cert_v2_seed_entities` is fixtures-only. |
| Is `licensees` created/reused correctly post-F2 | **Partially.** `provision_application_entity` creates/reuses `licensees` and calls `entity_link_license`, but `licensees.license_id` (31 rows) persists the pre-F2 one-licence-per-licensee assumption alongside canonical `entity_licenses`. One entity already holds multiple licences, so the legacy column is structurally unsound. |
| Is handoff `application_id` authoritative or transitional | **Transitional/traceability only.** No downstream SQL or edge function joins on it; the pipeline carries `applications.id`. `ON DELETE SET NULL` means the linkage can be silently lost. Current data: 3 handoffs, 0 with null `application_id`. |
| Application status vocabularies and drift | No CHECK constraint on `applications.status` or `licenses.status`; UI label drift (`clarification_requested`); `licenses.status = 'surrendered'` exists in data but not in the documented vocabulary. |
| Workflow resolution by licence/service/sector | **Client-side.** `src/lib/workflowApprovalResolver.ts` maps category → `pre_application`/`post_application` and selects a workflow; there is no server-side resolution contract keyed on licence type/service/sector. Config: 7 `pre_application` + 5 `post_application` workflows, 10 active / 6 inactive, 55 `approval_steps`, **0 workflows with `entity_type='application'`** while instances persist `entity_type='application'`. |
| Decision-authority integration | 10 `decision_authority_rules` exist, including `application.approve`, `application.approve_final`, `application.reject`, `license.suspend`, `license.revoke`. They are consulted by the governed path but **not** by `perform_manual_application_approval`. |
| Fee/payment gating | Existence-only check at provisioning time. `license_fee_bindings`/`_resolve`/`_simulate` exist but are not wired as a pre-decision gate for initial licensing. |
| Document/evidence gating | Requirements framework exists (`application_form_requirements`) but is unpopulated → no effective gate. |
| Licence conditions/restrictions | `license_conditions` exists with obligation semantics, but **0 rows** and **0 conditions attached at issuance** — the decision→conditions link is not exercised. |
| Effective/expiry/renewal fields | Present on `licenses` and in `license_terms` (append-only) plus `license_lifecycle_configs`; expiry transitions run only via the worker-gated `license_expiry_sweep()`. |
| Licence number generation/uniqueness | Single path, sequence-backed, UNIQUE. No collision exposure. |
| Multi-licence entities | Supported by `entity_licenses` (1 entity already holds >1 licence); contradicted by `licensees.license_id`. |
| Withdrawal/cancellation | Statuses exist and are honoured by both approval paths; no dedicated governed withdraw RPC with reason capture was found. |
| Orphan applications/licences | 48 licences with no `application_id`; 19 licences with no `entity_licenses` link; 4 applications with null `entity_id`; 16 applications with no handoff. |
| Legacy applications pre-F3 | The 17 draft applications and 48 application-less licences predate F3 remediation and cannot be reconstructed through the governed spine. |
| F4→F5 boundary | Clean: F5 consumes `licenses` + `entity_licenses` + `license_terms`. No F5 service writes back into `applications`. |

---

## 5. Surface Coverage Manifest

| Surface | Items | Covered by discovery | Notes |
|---|---|---|---|
| Applicant routes/screens | 6 | 6/6 | incl. acknowledgement |
| Staff queues/workspaces | 7 | 7/7 | 1 dead (`ApplicationQueue.tsx`) |
| Admin licensing config screens | 5 | 5/5 | |
| Legacy/orphan screens | 4 | 4/4 | `PreLicense`, `PostLicense`, `ApplicationQueue`, retired licensee workspace |
| Tables | 54 | 54/54 | |
| Read models/views | 4 | 4/4 | all SECURITY INVOKER |
| Licensing RPCs/functions | 14 key | 14/14 | incl. all superseded revisions traced |
| Triggers | 3 | 3/3 | handoff, updated_at, expiry sweep driver |
| Edge functions | 16 | 16/16 | all authz-marked |
| Workflows / steps | 12 / 55 | full | |
| Decision authority rules | 10 | 10/10 | |
| RLS/grant posture | all in-scope tables | full census | see §3.1 |
| Verification scripts | 10 | 10/10 | **no `verify-f4*` script exists** |
| Test suites touching F4 | workflow/type/resolver suites | inventoried | no end-to-end licensing journey test |

---

## 6. Gap register (finite)

### PRODUCT_GAP

| ID | Severity | Gap |
|---|---|---|
| GAP-F4-01 | **CRITICAL** | `perform_manual_application_approval` is an ungoverned approval bypass: hardcoded role list instead of permission checks, no maker≠checker, no last-step check, no decision-authority consultation, no decision-gate evaluation, and it permits approval of a **`draft`, never-submitted** application (it only blocks `rejected/cancelled/withdrawn`) — producing a real licence. |
| GAP-F4-02 | **CRITICAL** | F3→F4 boundary is not enforced: `create_application_draft` allows a new-licence application with no approved `registration_licensing_handoffs` row. |
| GAP-F4-03 | **CRITICAL** | Fit & Proper gate is silently inert. `check_decision_gates` compares `individual_roles.licensee_id` to `applications.applicant_id` (an `auth.users` id) so the inferred gate never matches; the explicit `application_fp_links` path has zero rows and falls back to non-blocking. |
| GAP-F4-04 | HIGH | No effective document/evidence completeness gate before decision (`application_form_requirements` unpopulated; no server-side enforcement). |
| GAP-F4-05 | HIGH | Fee gating is an existence check on `payments.status` at provisioning time only; `license_fee_bindings/_resolve/_simulate` are not wired as a pre-decision gate. |
| GAP-F4-06 | HIGH | Excessive grants: `authenticated` holds all 8 privileges on 9 licensing tables; `anon` holds DML on 6. Only RLS deny-by-default prevents exploitation — no defence in depth, inconsistent with the F2/F3 lockdown standard. |
| GAP-F4-07 | HIGH | No status CHECK constraints on `applications.status` / `licenses.status`; vocabulary drift confirmed (`surrendered` in data, `clarification_requested` in UI labels). |
| GAP-F4-08 | HIGH | Split-commit provisioning: licence is committed by SQL, portal user/certificate by a subsequent HTTP call with no retry queue or reconciliation sweep. |
| GAP-F4-09 | MEDIUM | Workflow resolution by licence type/service/sector is client-side only; no server-side resolution contract. |
| GAP-F4-10 | MEDIUM | Workflow `entity_type` dual vocabulary: `approval_workflows` uses `pre_application`/`post_application`, `workflow_instances` uses `application`; 0 workflows carry `entity_type='application'`. |
| GAP-F4-11 | MEDIUM | Handoff `application_id` is `ON DELETE SET NULL` and unconsumed downstream — the F3→F4 audit linkage can be silently severed. |
| GAP-F4-12 | MEDIUM | `licensees.license_id` legacy single-licence column coexists with canonical `entity_licenses`; unsound for multi-licence entities. |
| GAP-F4-13 | MEDIUM | Licence conditions are never attached at the decision (`license_conditions` 0 rows, 0 application-sourced); the decision→condition path is unexercised. |
| GAP-F4-14 | MEDIUM | No governed withdrawal/cancellation RPC with reason capture and audit. |
| GAP-F4-15 | LOW | Dead/legacy screens still resolvable: `ApplicationQueue.tsx`, `PreLicense.tsx`, `PostLicense.tsx`. |
| GAP-F4-16 | LOW | No `verify-f4*` certification script and no end-to-end licensing journey test exist. |

### BUSINESS_CONFIGURATION

| ID | Item |
|---|---|
| CFG-F4-01 | `application_form_requirements` is empty — mandatory forms/documents per licence type must be configured by the regulator. |
| CFG-F4-02 | `application_fp_links` is empty — the F&P linkage policy per licence type/role must be configured. |
| CFG-F4-03 | Fee bindings for initial licensing per licence type/sector are not configured as decision prerequisites. |
| CFG-F4-04 | Standard licence conditions per licence type are not defined. |
| CFG-F4-05 | 6 of 12 licensing workflows are inactive; the active-workflow-per-licence-type map is not asserted anywhere. |
| CFG-F4-06 | Licence effective/expiry/renewal parameters in `license_lifecycle_configs` are not confirmed per licence type. |

*No regulator policy has been invented. Each CFG item is recorded as an unconfigured control, not a prescribed value.*

### DATA_REMEDIATION

| ID | Item | Count |
|---|---|---|
| DR-F4-01 | Licences with no `application_id` (legacy/seeded) | 48 |
| DR-F4-02 | Licences with no `entity_licenses` link | 19 |
| DR-F4-03 | Applications with null `entity_id` | 4 |
| DR-F4-04 | Applications with no handoff (pre-F3 or ad-hoc) | 16 |
| DR-F4-05 | `licensees.license_id` populated rows to migrate to `entity_licenses` | 31 |
| DR-F4-06 | `VRF-EMPTY-ACTIONS` test-artifact workflows present in live configuration | 3 |
| DR-F4-07 | `licenses.status = 'surrendered'` rows outside the documented vocabulary | 2 |

---

## 7. Persona / permission matrix (as built)

| Persona | Create app | Save/submit | Intake/assign | Review/RFI | Final approve | Issue licence | Certificates | Licence actions |
|---|---|---|---|---|---|---|---|---|
| Applicant (external) | yes (unbounded — GAP-F4-02) | yes (own) | no | no | no | no | view own | no |
| Licensing officer | no | no | yes | yes | yes (if workflow step) | via approval | no | no |
| Supervisor | no | no | yes | yes | yes | via approval | no | yes |
| Admin / super_admin | no | no | yes | yes | yes + **manual bypass** | via approval + bypass | yes | yes |
| Certificates officer | no | no | no | no | no | no | yes | no |
| Worker/service role | n/a | n/a | n/a | n/a | n/a | n/a | generate | expiry sweep |
| `anon` | no | no | no | no | no | no | no | no (RLS denies despite grants) |

---

## 8. Contracts

**F3 → F4 contract (as built)**

- Producer: `tg_registration_approved_handoff()` → `registration_licensing_handoff(registration_id)`.
- Artifact: one `registration_licensing_handoffs` row per approved registration (`registration_id` UNIQUE), plus a `draft` `applications` row.
- Current data: 3 approved registrations, 3 handoffs, 0 approved registrations without a handoff, 0 handoffs with a null `application_id`.
- **Weakness:** the contract is producer-side only. F4 does not require it on the consumer side (GAP-F4-02), and the linkage is nullable (GAP-F4-11).

**F4 → F5 contract (as built)**

- Artifact: `licenses` row (UNIQUE number, UNIQUE per application) + `entity_licenses` link + `license_terms` opening term.
- Consumers: F5 post-licensing services, renewals, variations, adverse matters, appeals.
- **Weakness:** 19 licences lack the `entity_licenses` link, so the F5 entry contract is not satisfied for all existing licences (DR-F4-02).

---

## 9. Frozen F0–F3 impact assessment

| Frozen product | Impact of F4 remediation | Assessment |
|---|---|---|
| F0 Platform foundation | None expected; F4 fixes are licensing-domain RPCs, grants and constraints. | No change required. |
| F1 Master configuration | CFG-F4-01…06 will populate governed configuration through existing F1 frameworks — configuration data only, no F1 code change. | No F1 re-certification trigger. |
| F2 Identity/entity | GAP-F4-12 (retiring `licensees.license_id`) and DR-F4-05 touch F2-adjacent identity tables. Must be executed as F4-owned data migration honouring F2 canonical bindings; `entity_licenses` remains the canonical link. | **F2 re-verification of entity-binding gates required after DR-F4-05.** |
| F3 Registration | GAP-F4-02 and GAP-F4-11 are enforced on the **F4 consumer side** (require a handoff, harden the FK). No change to the F3 producer trigger, RPC or `registrations` behaviour. This pass changed only F3 documentation wording. | No F3 runtime change; re-run `verify:f3b` and `certify:f3c` as regression only. |

---

## 10. Maturity score

| Dimension | Score /5 | Basis |
|---|---|---|
| Data model completeness | 4 | Rich, canonical spine; legacy `licensees.license_id` residue |
| Governed write path | 3 | One licence-creation path, but a live approval bypass exists |
| Authorization / RBAC | 3 | Edge + governed RPCs strong; manual path and grant surplus weak |
| RLS / privilege hygiene | 2 | Grants far exceed policies; `anon` DML present |
| Decision gates (F&P/docs/fees/conditions) | 1 | F&P inert, documents/fees/conditions unconfigured or existence-only |
| Workflow governance | 3 | Strong step/maker-checker logic; client-side resolution, dual vocabulary |
| Licence issuance integrity | 4 | Unique number and per-application uniqueness proven; split-commit resilience gap |
| Audit / history | 4 | Audit, approval actions, append-only terms |
| Data integrity (live) | 2 | 7 recorded remediation classes |
| Test / certification coverage | 1 | No F4 verification script, no E2E journey test |
| **Overall** | **2.7 / 5** | Sound spine, ungoverned edges |

---

## 11. Recommended remediation sequence (for F4-B, not executed)

1. **GAP-F4-01** — retire or fully govern `perform_manual_application_approval` (permission checks, maker≠checker, submitted-state precondition, decision authority, gates).
2. **GAP-F4-02 / GAP-F4-11** — enforce the handoff precondition in `create_application_draft`; harden the handoff FK and make the linkage authoritative.
3. **GAP-F4-03** — fix the `check_decision_gates` entity binding and make the F&P gate blocking on explicit links.
4. **GAP-F4-06 / GAP-F4-07** — revoke surplus `authenticated`/`anon` DML on the 15 licensing tables; add status CHECK constraints.
5. **GAP-F4-04 / GAP-F4-05 / GAP-F4-13** + CFG-F4-01…04 — wire document, fee and condition gates to governed configuration.
6. **GAP-F4-08** — make provisioning reconcilable (outbox/retry sweep for `approve-pre-licensee`).
7. **GAP-F4-09 / GAP-F4-10** — server-side workflow resolution and a single `entity_type` vocabulary.
8. **GAP-F4-12 / GAP-F4-14 / GAP-F4-15** — retire `licensees.license_id`, add a governed withdrawal RPC, delete dead screens.
9. **GAP-F4-16** — author `scripts/verify-f4-remediation.sql` and an end-to-end licensing journey test.
10. **DR-F4-01…07** — data remediation, executed last and recorded separately from product gaps.

---

## Final verdict

**F4 READY FOR CONTROLLED REMEDIATION**

Discovery HEAD: `5ad3595171876dfc64cb1411d7002686b4fbde1b`.
Architecture, lifecycle, state machines, contracts, privilege posture and a finite 16-item gap register (plus 6 configuration items and 7 data-remediation classes) are established. No F4 remediation was performed. F5 was not started.

# Regulatory Convergence — Current-State Rebaseline & Gap Register

Pass type: **CERTIFICATION / REBASELINE ONLY** (read-only; no functional code changed)
Date: 2026-08-27 · Evidence hierarchy applied: LIVE DB → SOURCE → TESTS → MIGRATIONS → DOCS → PLANS

---

## SECTION 1 — CURRENT BASELINE

| Item | Evidence | Status |
|---|---|---|
| Current SHA | `1517d090ec7a3960b19bf96c544ebab4a707d4b2` — "Deleted 116 redundant PL workflows" | **HEAD UNCHANGED** from the known baseline |
| Working tree | `git status --porcelain` → empty | Clean |
| Migrations | 1170 files; latest `20260827105814_de7e2b0c…`; **zero untracked, zero uncommitted** migrations | Aligned |
| Live DB vs migrations | Canonical objects present: 24/24 do-not-touch tables, 10/10 canonical functions (incl. `convergence_decision_gate`, `convergence_work_gate`, `_resolve_application_workflow`) | Aligned |
| Build | `/tmp/observability/build-errors.log` → `build OK` | Green |
| Commits after previous convergence baseline | None — HEAD has not moved. No unapproved colleague commits exist in source control. | No new source delta |

Material change since prior convergence baseline is confined to the three deltas in Section 3 (all already in HEAD).

---

## SECTION 2 — CHECKPOINT STATUS

Test execution environment note (applies to all pgTAP): the sandbox `psql` role is **restricted — it cannot `EXECUTE` functions and cannot `SET ROLE`**. Structural assertions run; behavioural assertions abort. This is an **ENVIRONMENT_BLOCKER**, not a regression — `not ok = 0` across every suite.

| CP | Suite | Result here | State |
|---|---|---|---|
| A | — | Previously closed | CERTIFIED (carried) |
| B | `convergence/01_checkpoint_b_decision_authority.sql` | ok=3, **not_ok=0**, blocked at `resolve_decision_authority` | CERTIFIED (carried) · re-run BLOCKED |
| C | `convergence/02_checkpoint_c_work_model.sql` | ok=1, not_ok=0, blocked at `resolve_work_allocation_policy` | CERTIFIED (carried) · re-run BLOCKED |
| D/E | `convergence/03_checkpoint_d_e_services_providers.sql` | ok=11, not_ok=0, blocked at `regulatory_service_task_execution` | CERTIFIED (carried) · re-run BLOCKED |
| F | `convergence/04_checkpoint_f_people_access.sql` | ok=17, not_ok=0, blocked at `SET ROLE authenticated` | CERTIFIED 21/21 (carried) · re-run BLOCKED |
| **G** | `convergence/05_checkpoint_g_adoption.sql` (plan 23) | **ok=15 / 23, not_ok=0**, 8 behavioural assertions blocked at `resolve_decision_authority` | **IMPLEMENTED_NOT_CERTIFIED — BLOCKED_BY_ENVIRONMENT.** Cannot assert 23/23 from this environment. G structural contract verified: both gates exist with canonical signatures, SECURITY DEFINER, pinned `search_path`, anon denied, authenticated permitted. |
| H | — | Not executed — precondition (G closure) unmet | **NOT CLOSED** |
| I | — | Live licensing journeys not executable here | **NOT CLOSED** |
| PLS guard | `rbac/286_post_license_duplicate_guard.sql` | **ok=19 / 19, not_ok=0, errors=0** | **CERTIFIED 19/19** |
| Frontend suite | `vitest run` | **1231 passed / 1254; 23 failed across 8 files** | See GAP-05..08 |

**G is NOT certified 23/23 in this pass.** No assertion failed; 8 could not execute. Per instruction, an unexecuted assertion is never converted to PASS.

---

## SECTION 3 — INTERRUPTED-WORK DELTA

### 3.1 Post-Licensing Services consolidation — **ACCEPTABLE ARCHITECTURE, ONE GAP**

Live truth:

- Exactly **4 canonical active PLS patterns**: Standard (3 steps), Enhanced (3), Fit & Proper (4), Notification (2) — all `entity_type=post_application`, `is_active=true`.
- **Generic fallback present and active**: `Post Application Workflow` (3 steps).
- Workflow totals: 10 active / 6 inactive. No `PLS - %` duplicates remain.
- Referential integrity: `services` dangling `workflow_id` = **0**; services pointing at an inactive workflow = **0**; dangling `workflow_instances` = **0**; dangling `approval_actions.step_id` = **0**.
- Service mapping: Standard 40, Fit & Proper 40, Notification 24, Enhanced 16 = **120 mapped**.
- Routing certified by configuration: Change of Legal Name → Standard (30d, F&P false); Group Restructure → Enhanced (60d); Director Appointment / Change of Control / Shareholding Change / Beneficial Owner Change → Fit & Proper (45–60d, `requires_fit_and_proper=true`); Material Incident Notification → Notification (`decision_type=notification`, 10–20d). Decision types are internally consistent per pattern (single `decision_type` per pattern).
- Precedence: frontend `src/lib/workflowApprovalResolver.ts:150` — "EXPLICIT SERVICE MAPPING (highest precedence): services.workflow_id" — with taxonomy fallback retained; pre-licence routing untouched (`_resolve_application_workflow` still keys on `entity_type='application'` with regulator→category→sector→regulator prefix-tolerant fallback).
- Duplicate protection proven live: `post_license_open_statuses()`, `prevent_duplicate_post_license_request()`, trigger on `public.applications`, partial unique index `applications_post_license_open_uniq`; and behaviourally — same licence + same open service **blocked (23505)**, same licence + different service **allowed**, different licence + same service **allowed**, and approved/rejected/cancelled/withdrawn history **does not block** a new request. Pre-existing application rows unchanged.

**Gap:** 16 of 136 service rows carry `workflow_id IS NULL` — `Change of Registered Address` ×8 and `Renew` ×8. They fall through to taxonomy/generic fallback rather than an explicit canonical pattern. See GAP-01.

**No fee reference** is set on any tested representative service (`fee_reference IS NULL`). See GAP-02.

### 3.2 Entity 360 / identifier delta — **REQUIRES_BUSINESS_GOVERNANCE_DECISION**

Live RPCs, all SECURITY DEFINER, `anon` EXECUTE denied, `authenticated` permitted:
`entity_identifier_register`, `entity_identifier_verify`, `entity_identifier_reject_verification`, plus internal `entity_identifier_normalize` (denied to both browser roles — internal only). Identifier types carry `uniqueness_scope` (GLOBAL / REGULATOR / JURISDICTION) and `normalization_strategy`.

**Defect in the REN backfill migration** `20260827082100_d89517cd-…`:

```sql
verification_status = CASE st.label
  WHEN 'Verified' THEN 'VERIFIED' ... END
```

The migration derives an **identifier's** verification status from the **entity's** identity status. This couples two distinct facts that must remain separate:

- ENTITY IS VERIFIED (identity resolved), vs
- THIS IDENTIFIER HAS BEEN VERIFIED AGAINST AN AUTHORITATIVE SOURCE.

A `REN-XXXXXXXX` is **system-generated by this platform**; there is no authoritative external source to verify it against, so `VERIFIED` is not defensible provenance. Blast radius is small and precisely measurable: of 33 backfilled rows, `UNVERIFIED=29`, `PROVISIONAL=3`, **`VERIFIED=1`**. Source is stamped `LEGACY_BACKFILL` / `RDM-IDENTIFIER-BACKFILL-2026-08-27`, so provenance is auditable.

Classified **REQUIRES_BUSINESS_GOVERNANCE_DECISION**; rule deliberately **not changed** in this pass. See GAP-03.

### 3.3 Registration delta — **INTACT, WITH A REPRODUCIBILITY GAP**

- Both governed journeys intact: `/register` (journey selection), `/register/applicant` (FORM_FIRST), `/register/entity` (ENTITY_FIRST), plus `/register/account` and a legacy redirect (`src/routes/publicRoutes.tsx:43-52`).
- `Registration Processing WorkflowW`: **0 rows** — obsolete workflow is gone.
- Only one registration workflow exists live: `Registration Workflow`, active, **5 workflow instances** (4 pre-existing + the relinked Beacon Federal Credit Union registration). No instance or registration references a deleted workflow.
- **`rg "WorkflowW" supabase/migrations` → no matches.** The relink + delete were executed directly against the live database and are **not reproducible from repository migrations**. Classified **SOURCE_CONTROL_REPRODUCIBILITY_GAP**. See GAP-04.

---

## SECTION 4 — GAP REGISTER

| ID | Area | Gap | Evidence | Severity | Classification | Business impact | Recommended action | Block H/I? |
|---|---|---|---|---|---|---|---|---|
| GAP-01 | PLS | 16 services (`Change of Registered Address` ×8, `Renew` ×8) have `workflow_id IS NULL` | live `services` query | Medium | CONFIGURATION_GAP | These services route via taxonomy/generic fallback, not an explicit canonical pattern; routing is implicit and unasserted | Map each to a canonical pattern (or record an explicit decision that fallback is intended) in one idempotent migration | Yes — before H |
| GAP-02 | PLS | No `fee_reference` on any representative post-licence service | live `services` query | Medium | CONFIGURATION_GAP | Fee-blocking behaviour (Section I item 14) cannot be certified | Populate fee references or record fee-exempt decision | Yes — before I |
| GAP-03 | Entity identity | REN identifier verification status derived from entity identity status | migration `20260827082100`; 1 row `VERIFIED` | High | **REQUIRES_BUSINESS_GOVERNANCE_DECISION** | Overstates verification provenance for a self-issued identifier; weakens the identity-assurance audit trail | Obtain business ruling; then decouple (system-issued REN → `UNVERIFIED`/`PROVISIONAL`) and re-baseline the 1 affected row via governed RPC | Yes — decision before H |
| GAP-04 | Registration | Live relink + delete of `Registration Processing WorkflowW` has no corresponding migration | `rg WorkflowW supabase/migrations` → 0 | Medium | **SOURCE_CONTROL_REPRODUCIBILITY_GAP** | A fresh environment rebuilt from migrations will not match production; obsolete workflow could reappear | Add smallest idempotent repair-record migration (guarded delete-if-exists + relink-if-present). Do NOT recreate the obsolete workflow | Yes — before H |
| GAP-05 | RBAC (frontend) | `src/test/rbac/actionCoverage.test.ts` — 5 failures; **519 unguarded action sites** (floor is 0). Named sites include `settings/CaptchaSettings.tsx`, `settings/IntegrationSettings.tsx`, `supervision/ThematicClosureQueue.tsx` | vitest | High | REGRESSION (frontend guard coverage floors breached) | Destructive/export/submit actions render without permission guards; server-side RBAC still enforces, so it is a UX/least-privilege exposure, not a data breach | Restore guard coverage to the Slice 17/19/21/22 floors | Yes — before H |
| GAP-06 | Navigation/RBAC | `src/test/sidebarVisibility.test.tsx` — all 12 persona assertions fail with `No QueryClient set` | vitest | Medium | TEST_DEFECT (missing `QueryClientProvider` in harness) | Persona menu-visibility matrix is currently unverified | Wrap the harness in `QueryClientProvider`; re-run persona audit | Yes — before H |
| GAP-07 | Routing | `src/test/routeCoverage.test.ts` — 34 guarded routes `map=UNMAPPED` in `ROUTE_MODULE_MAP` (`/admin`, `/admin/config/*`, `/admin/workflow-engine*`, `/admin/notification-engine*`, `/admin/security-audit`, `/admin/regulatory-data-model`, …) | vitest | Medium | CONFIGURATION_GAP | Guard and module map disagree; module resolution for admin routes is ambiguous | Add the 34 routes to `ROUTE_MODULE_MAP` | Yes — before H |
| GAP-08 | Misc frontend | 5 further failures: `actionNotificationsEditorCrud` (2), `applicantFacingActions` (raw_action passthrough), `breadcrumbs` (id rendered as label), `reportsModule` (schedule source from slug), `returnNotificationTemplates` (branded email chrome), `useLicenseeMetrics` | vitest | Medium | PRE_EXISTING_DEBT / REGRESSION (mixed — needs per-test triage) | Assorted UX/content and metric-fallback defects | Triage individually; classify each before fixing | Triage before H |
| GAP-09 | Certification env | pgTAP behavioural assertions cannot execute (no function EXECUTE, no `SET ROLE`) | all convergence suites | High | **ENVIRONMENT_BLOCKER** | G/H/I cannot be certified from this environment; B–F cannot be re-certified | Run suites in the proper certification environment with a privileged role | Yes — hard blocker for G, H, I |
| GAP-10 | Licensing / EPR-05 | All 15 EPR-05 live journeys unexecuted (no live applicant/persona sessions, no provider credentials) | Section I not executable | High | ENVIRONMENT_BLOCKER | Licensing certification cannot be claimed on DB tests alone | Execute in certification environment; mark each journey explicitly | Yes — blocks I |
| GAP-11 | P08/P12 | Entity-side thread parity, internal-note invisibility, external-user isolation, real email/SMS provider, SLA scheduled transition, live RFI links — unexecuted | no external users/provider credentials | Medium | ENVIRONMENT_BLOCKER | Residual closure items remain open | Provide credentials/test users; do NOT redesign P08/P12 | Blocks final release only |

No gap was remediated in this pass. No code was changed to improve the report.

---

## SECTION 5 — DO-NOT-TOUCH CONFIRMATION

| Structure | Verified | Result |
|---|---|---|
| Canonical RBAC (roles, permissions, permission_modules/actions, role_permissions, user_dynamic_roles, user_roles, sec_scope_types, sec_role_scopes, sec_role_scope_values, sec_role_template_scopes, rbac_module_scopes, `has_role()`, `user_has_permission()`) | live catalogue | **PRESERVED** — all present, none replaced or duplicated |
| Canonical workflow engine (approval_workflows, _versions, _types, approval_steps, approval_step_actions, approval_actions, workflow_instances, delegation_rules) | live catalogue | **PRESERVED** |
| Canonical transitions (`perform_workflow_transition`, `perform_registration_workflow_transition`, `perform_return_workflow_transition`, `perform_final_workflow_approval`, `user_can_act_on_workflow_step`) | live catalogue | **PRESERVED** |
| Regulatory Operating Structure (regulators, regulatory_functions, regulator_mandates, teams/portfolios, entity_supervision_assignments) | live catalogue | **PRESERVED** |
| AI control plane (MC-08 governance registries, kill switches, thresholds, instructions, surfaces) | live table inventory | **PRESERVED** |
| Historic evidence (approval_actions, committee/panel snapshots, audit_logs, compliance_audit_logs) | zero dangling operational rows; application/workflow-instance hashes unchanged by the PLS deletion migration | **PRESERVED** |
| Notification / storage / security boundaries | `130_critical_rpc_hardening`, `150_storage_policy_hardening`, `110_fit_and_proper_rls` unchanged; `anon` denied on all identifier RPCs | **PRESERVED** |
| Core invariant (narrowing-only authority; permission ≠ coverage ≠ allocation ≠ decision authority ≠ ownership) | `convergence_decision_gate` / `convergence_work_gate` structural contract intact; no gate grants a permission RBAC does not | **UPHELD** |

---

## SECTION 6 — NEXT EXECUTION WAVE (ordered)

1. Stand up / access the proper certification environment with a privileged role (resolves GAP-09). Re-run all five convergence suites plus `286`. Target: **G = 23/23**.
2. Obtain the business ruling on GAP-03 (REN verification semantics). No code change until ruled.
3. Land the GAP-04 idempotent repair-record migration for the `Registration Processing WorkflowW` cleanup.
4. Close GAP-01 (16 unmapped services) and GAP-07 (34 route-map entries) — configuration only.
5. Fix the GAP-06 test harness, then triage GAP-08 test-by-test with explicit classification.
6. Restore frontend action-guard coverage floors (GAP-05).
7. Only then execute **Checkpoint H** integrated regression — no refactoring permitted during H.
8. Execute **Checkpoint I** / EPR-05 live journeys (GAP-10) and the residual P08/P12 items (GAP-11).

---

## SECTION 7 — RELEASE POSITION

### **NOT READY FOR RELEASE**

Evidence: Checkpoint G cannot be certified from the available environment (15/23 executed, 8 blocked); Checkpoints H and I are not closed; there is one open **REQUIRES_BUSINESS_GOVERNANCE_DECISION** on identity-verification semantics; a **SOURCE_CONTROL_REPRODUCIBILITY_GAP** exists between live DB and migrations; and the frontend RBAC action-guard coverage floor is breached with 519 unguarded action sites.

Not yet **READY FOR CHECKPOINT H** — H is gated on GAP-03, GAP-04, GAP-05 and GAP-09.

Positive certifications this pass: PLS consolidation architecture is correct and referentially clean (4 canonical patterns + active generic fallback, 120 explicit mappings, zero dangling references, `services.workflow_id` at highest precedence, taxonomy and pre-licence routing unchanged), and `286_post_license_duplicate_guard.sql` is **19/19 PASS** including real behavioural duplicate protection.

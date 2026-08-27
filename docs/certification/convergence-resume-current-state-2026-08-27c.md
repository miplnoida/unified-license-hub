# Regulatory Convergence — Resume, Current-State Certification & Gap Register

Pass type: **CERTIFICATION / REBASELINE ONLY** (read-only; no remediation performed)
Executed: 2026-08-27 14:37–14:45 UTC
Evidence hierarchy applied: LIVE DB → CURRENT SOURCE → CURRENT TESTS → MIGRATIONS → CERT DOCS → PLAN DOCS

---

## SECTION 1 — CURRENT BASELINE

| Item | Evidence |
|---|---|
| Current HEAD | `43ecf814c01769923a0bf86d6a611e6641fccfb5` — "Added delta rebaseline report" |
| Previous review baseline | `1517d090…` ("Deleted 116 redundant PL workflows") — **no longer HEAD** |
| Working tree | Clean |
| Build | `build OK` (2026-08-27T14:38:04Z) |
| Migrations | 1173 files; last two functional: `20260827120906_*` (triage first-confirmation fix), `20260827125424_*` (investigation task status casing fix) |
| Live DB alignment | Aligned with HEAD for all inspected objects. One exception: the `Registration Processing WorkflowW` deletion/relink exists in the DB only (see GAP-04). |

Material changes after the previous convergence baseline (all `gpt-engineer-app[bot]`, 2026-08-27):
1. `public.complaint_triage_confirm` — first supervisory confirmation no longer treated as a material override; `TriagePanel.tsx` hint added. **Acceptable, narrow, tested.**
2. `complaint_investigation_tasks_status_check` — normalised to canonical uppercase states (`NOT_STARTED, IN_PROGRESS, BLOCKED, COMPLETED, CANCELLED`); `complaint_task_create`, `complaint_task_set_status`, `my_work_queue` aligned. **Acceptable, narrow.**
3. Two rebaseline/delta documentation files. **Documentation only.**

No change touched RBAC, workflow engine, operating structure, or convergence gates.

---

## SECTION 2 — CHECKPOINT STATUS

| CP | State | Evidence (suite / count) |
|---|---|---|
| A | CERTIFIED | Prior certification; structures intact in live DB |
| B | IMPLEMENTED_NOT_CERTIFIED (ENVIRONMENT_BLOCKED) | `convergence/01_checkpoint_b_decision_authority.sql` → **3/9 ok**, 6 blocked: `permission denied for function resolve_decision_authority` |
| C | IMPLEMENTED_NOT_CERTIFIED (ENVIRONMENT_BLOCKED) | `convergence/02_checkpoint_c_work_model.sql` → **1/9 ok**; `permission denied for function resolve_work_allocation_policy` |
| D/E | IMPLEMENTED_NOT_CERTIFIED (ENVIRONMENT_BLOCKED) | `convergence/03_checkpoint_d_e_services_providers.sql` → **11/19 ok**; `permission denied for function regulatory_service_task_execution` |
| F | IMPLEMENTED_NOT_CERTIFIED (ENVIRONMENT_BLOCKED) | `convergence/04_checkpoint_f_people_access.sql` → **17/21 ok**; `permission denied to set role "authenticated"` |
| G | IMPLEMENTED_NOT_CERTIFIED (ENVIRONMENT_BLOCKED) | `convergence/05_checkpoint_g_adoption.sql` → **15/23 ok, 0 not-ok**; all 8 shortfalls are the same execute-privilege blocker. Structural adoption assertions (gate existence + adoption into the six entrypoints) all pass. |
| H | NOT STARTED / BLOCKED | Preconditions unmet (GAP-01, -04, -05, -09) |
| I | NOT STARTED / BLOCKED | Live licensing journeys not executable in this environment |

**Important:** no suite produced a single `not ok`. Every shortfall is a privilege blocker, not a failed assertion. Previously certified counts for B/C/D/E/F are therefore **not** contradicted — they simply cannot be re-proved here.

Root cause of the blocker (newly isolated this pass): the certification functions grant `EXECUTE` to `authenticated`, `service_role` and `sandbox_exec_sndfttzqmbkmkcnrvpfn`, but the psql session connects as role **`sandbox_exec`**, which is neither granted nor permitted to `SET ROLE` to the granted role. Classification: **ENVIRONMENT_BLOCKER** (not TEST_DEFECT, not regression).

Passing suite: `rbac/286_post_license_duplicate_guard.sql` → **19/19 PASS, 0 errors**.

---

## SECTION 3 — INTERRUPTED-WORK DELTA

### 3.1 Post-Licensing Services — ACCEPTABLE, largely verified

Live truth:

| Canonical pattern | Active | Services mapped |
|---|---|---|
| Standard Post-License Approval | yes | 40 |
| Fit & Proper Post-License Approval | yes | 40 |
| Post-License Notification | yes | 24 |
| Enhanced Post-License Approval | yes | 16 |
| `Post Application Workflow` (generic fallback) | yes | — |

Verified: exactly four canonical patterns active; generic fallback present and active; **0** services referencing a missing or inactive workflow; **0** orphaned `workflow_instances`; **0** workflows named `%WorkflowW%`; no `approval_actions` orphaned to deleted PLS steps. Duplicate protection proven behaviourally by suite 286 (19/19): same licence + same open service blocked (including direct backend insert), same licence + different service allowed, different licence + same service allowed, and terminal `approved / rejected / cancelled / withdrawn` history does **not** block a future request.

Resolver parity: backend `public._resolve_application_workflow(text,uuid,uuid,uuid,boolean,uuid,uuid)` reads `_service_id` → `services.workflow_id` first (highest precedence) before taxonomy fallback; frontend `src/lib/workflowApprovalResolver.ts:150` applies the same explicit-service-mapping-first rule, then the same scope fallback. Pre-licence routing paths (the 4-arg and 5-arg overloads) contain no service branch and are unchanged.

Remaining gap: **16 service rows have `workflow_id = NULL`** — 8× "Change of Registered Address", 8× "Renew". These fall through to taxonomy/fallback rather than an intended canonical pattern (GAP-01). Per-service depth certification (fee, form, first/terminal step, SLA, approver, decision type, F&P flag, audit trail) for the seven representative services was **not** executed as live journeys in this pass — blocked by the same execute-privilege and `SET ROLE` limitation (GAP-09).

### 3.2 Entity 360 / Identifiers — ARCHITECTURE ACCEPTABLE, one governance question

All three governed RPCs exist: `entity_identifier_register`, `entity_identifier_verify`, `entity_identifier_reject_verification`. `entity_identifiers` carries the full governance surface: `uniqueness_scope`, `jurisdiction_id`, `issuer_key`, `regulator_id`, `is_primary`, `verification_status`, `effective_from/to`, `source_type`, `source_reference`.

Live distribution for `regulatory_entity_number` (53 rows, 75 identifiers total):

| verification_status | source_type | primary | count |
|---|---|---|---|
| UNVERIFIED | LEGACY_BACKFILL | yes | 29 |
| PROVISIONAL | LEGACY_BACKFILL | yes/no | 3 |
| **VERIFIED** | **LEGACY_BACKFILL** | yes | **1** |
| UNVERIFIED | MANUAL | yes | 2 |
| VERIFIED | MANUAL | yes | 18 |

Finding: one machine-generated `REN-XXXXXXXX` is marked **VERIFIED** with provenance `LEGACY_BACKFILL` — i.e. it inherited the entity's identity status rather than being verified against an authoritative source. "The entity is verified" and "this identifier was verified against an authoritative source" must remain distinct. Recorded as **REQUIRES_BUSINESS_GOVERNANCE_DECISION** (GAP-06). Rule intentionally **not** changed in this pass.

### 3.3 Registration — INTACT

Both governed journeys present in `src/routes/publicRoutes.tsx`: `/register` (selection), `/register/applicant` (FORM_FIRST), `/register/entity` (ENTITY_FIRST). Live DB: `Registration Processing WorkflowW` **does not exist**; exactly one active registration workflow (`Registration Workflow`) holding **5** instances; zero dangling references. Business outcome is correct.

However the deletion + relink was executed as a live data operation with **no corresponding migration in source control** → **SOURCE_CONTROL_REPRODUCIBILITY_GAP** (GAP-04). A fresh install from `supabase/baseline` + migrations will not reproduce the executed change.

---

## SECTION 4 — GAP REGISTER

| ID | Area | Gap | Evidence | Severity | Classification | Business impact | Recommended action | Before H/I? |
|---|---|---|---|---|---|---|---|---|
| GAP-01 | PLS | 16 services unmapped to a canonical workflow ("Change of Registered Address" ×8, "Renew" ×8) | `services` query: 136 rows, 120 mapped | High | CONFIGURATION_GAP | Those requests route by taxonomy/fallback, not intended pattern | Map to Standard / Notification per policy in one guarded migration | **Yes** |
| GAP-02 | PLS | Per-service depth attributes (fee, form, SLA, decision type, F&P flag) not live-certified | Journeys not executable | Medium | ENVIRONMENT_BLOCKER | Certification claim incomplete | Re-run after GAP-09 | Yes |
| GAP-03 | Entity identity | 29 REN rows still `UNVERIFIED` from backfill; no verification campaign | identifier distribution | Medium | PRE_EXISTING_DEBT | Entity 360 shows unverified identity for legacy entities | Operational verification campaign via governed RPC | No |
| GAP-04 | Registration | `Registration Processing WorkflowW` deletion/relink not reproducible from source control | 0 rows live; no migration found | High | SOURCE_CONTROL_REPRODUCIBILITY_GAP | Fresh environments diverge from production | Add smallest idempotent repair migration (guarded delete + relink, no-op if absent) | **Yes** |
| GAP-05 | RBAC frontend | 519 unguarded action sites; coverage floor breached | `src/test/rbac/actionCoverage.test.ts` (5 failures) | High | PRE_EXISTING_DEBT | UI exposes actions the server would reject; poor least-privilege posture | Ratchet: wrap in `PermissionGate` / `GuardedButton` in batches | **Yes** |
| GAP-06 | Entity identity | Auto-generated REN inherited VERIFIED from entity status (1 row) | LEGACY_BACKFILL + VERIFIED | High | REQUIRES_BUSINESS_GOVERNANCE_DECISION | Overstates identifier assurance | Business decision, then downgrade to PROVISIONAL/UNVERIFIED if confirmed | **Yes** |
| GAP-07 | Routes | 34 admin routes unmapped in route registry | `src/test/routeCoverage.test.ts` (1 failure) | Medium | PRE_EXISTING_DEBT | Breadcrumb/nav gaps | Register routes | No |
| GAP-08 | Frontend tests | 23 failing tests / 8 files (`sidebarVisibility` 12 blocked by "No QueryClient set"; plus breadcrumbs, reportsModule, returnNotificationTemplates, useLicenseeMetrics) | `bunx vitest run`: 1231/1254 | Medium | TEST_DEFECT + PRE_EXISTING_DEBT | Persona menu-visibility matrix unproven | Fix harness provider, then triage remainder | Yes (sidebar matrix) |
| GAP-09 | Certification env | Runner role `sandbox_exec` lacks EXECUTE on convergence functions and cannot `SET ROLE authenticated` | 27 privilege errors across 5 suites; grants exist for `sandbox_exec_sndfttzqmbkmkcnrvpfn` | **Critical** | ENVIRONMENT_BLOCKER | B–G cannot be re-certified; H/I cannot start | Provide a certification role holding those grants (or connect as the already-granted role) | **Yes — top priority** |
| GAP-10 | Docs | Baseline/ledger docs still assert B–G certified counts not reproducible here | Section 2 vs cert docs | Low | STALE_DOCUMENTATION | Overstated position | Annotate with the ENVIRONMENT_BLOCKED qualifier | No |
| GAP-11 | P08/P12 | Entity-side thread parity, internal-note invisibility, external-user isolation, real provider transition, SLA scheduled transition, live RFI links unexecuted | No external users/providers in environment | Medium | ENVIRONMENT_BLOCKER | Closure certification incomplete | Execute once personas/providers exist; do not redesign | No |
| GAP-12 | Licensing EPR-05 | All 15 live journeys (sufficiency, RFI cycle, SLA pause/resume, ownership isolation, issuance idempotency, maker-checker, fee blocking, pinned form version) unexecuted | Environment | High | ENVIRONMENT_BLOCKER | Licensing cannot be certified | Mark **BLOCKED_BY_ENVIRONMENT**; execute in Checkpoint I | Yes for I |

---

## SECTION 5 — DO-NOT-TOUCH CONFIRMATION

| Structure | Status |
|---|---|
| Canonical RBAC (roles, permissions, modules/actions, role_permissions, user_dynamic_roles, user_roles, sec_* scope tables, rbac_module_scopes, `has_role()`, `user_has_permission()`) | **PRESERVED** — untouched by the newer commits |
| Workflow engine (approval_workflows/versions/types, approval_steps, approval_step_actions, approval_actions, workflow_instances, delegation_rules) | **PRESERVED** — no schema change; only PLS mapping data |
| Canonical transitions (`perform_workflow_transition`, `perform_registration_workflow_transition`, `perform_return_workflow_transition`, `perform_final_workflow_approval`, `user_can_act_on_workflow_step`) | **PRESERVED** |
| Regulatory Operating Structure (regulators, regulatory_functions, mandates, teams, portfolios, entity_supervision_assignments) | **PRESERVED** |
| Convergence gates (`convergence_decision_gate`, `convergence_work_gate`) and six adoption points | **PRESERVED** — structural assertions pass |
| AI governance control plane (MC-08 and dependents) | **PRESERVED** |
| Historic decisions, committee/panel snapshots, audit evidence | **PRESERVED** — no destructive DML this pass |
| Notification / storage / security boundaries | **PRESERVED** |
| Core invariant (authority may narrow, never widen RBAC) | **UPHELD** in code; behavioural proof blocked by GAP-09 |

---

## SECTION 6 — NEXT EXECUTION WAVE (ordered)

1. **GAP-09** — provision the certification DB role with EXECUTE on the convergence functions and `SET ROLE authenticated`; re-run the five convergence suites targeting **G = 23/23** and B/C/D/E/F at their certified counts.
2. **GAP-06** — obtain the business governance decision on auto-generated REN verification semantics; apply the decided rule in one migration.
3. **GAP-04** — add the smallest idempotent repair migration for the obsolete registration workflow deletion/relink.
4. **GAP-01** — map the 16 unmapped services to their intended canonical pattern (guarded migration, no new workflows).
5. **GAP-08 (sidebar)** — fix the `QueryClient` provider in the test harness so the persona menu-visibility matrix executes.
6. **GAP-05** — begin the RBAC guard ratchet in batches, raising the `BASELINE` constant as coverage improves.
7. **GAP-02** — PLS per-service depth certification for the seven representative services plus full 15-service mapping sweep.
8. Only then **Checkpoint H** (full integrated regression), then **Checkpoint I** (live licensing journeys, GAP-12) and **GAP-11**.

---

## SECTION 7 — RELEASE POSITION

**NOT READY FOR RELEASE.** Also **not yet ready for Checkpoint H**.

Evidence: no certification suite recorded a single failed assertion, and the four canonical PLS patterns, generic fallback, duplicate protection (19/19), registration journeys and identifier governance surface are all live and coherent — but Checkpoints B–G cannot be independently re-proved in this environment (GAP-09), one identifier assurance rule requires a business decision (GAP-06), a production data change is not reproducible from source control (GAP-04), 16 services are unmapped (GAP-01), and the frontend authorization guard floor is breached with 519 unguarded action sites (GAP-05).

Stopping here as instructed — no remediation performed in this pass.

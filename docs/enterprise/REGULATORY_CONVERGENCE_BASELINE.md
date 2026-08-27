# Regulatory Convergence Baseline (Checkpoint A — Current Truth)

Established: 2026-08-27. Source of truth: **live database** + current repository state.
This document is the efficiency contract for the convergence programme: an area
recorded here as canonical must **not** be rescanned or recertified unless the
active checkpoint modifies it, a dependency requires it, or a regression makes the
baseline untrustworthy.

Inspection order used: `LIVE DB → current callers → certification suites/docs → latest relevant migration`.

---

## 1. Canonical structures (REUSE)

### Regulatory authority / organisation
| Object | Role | Classification |
|---|---|---|
| `regulators` | Regulatory Authority master (code, settings jsonb) | REUSE |
| `regulatory_functions` | Generic Regulatory Function catalogue (`key`, `module_key`, `coverage_level`) | REUSE |
| `regulator_mandates` | Authority × function × sector/sub-sector, effective-dated, `responsibility_type` | REUSE |
| `regulator_mandate_enforcement` | Per-function enforcement state (`OFF/OBSERVE/ENFORCED` pattern already present) | REUSE |
| `regulatory_teams`, `regulatory_team_members`, `regulatory_team_mandates` | Teams and their mandate coverage, effective-dated | REUSE |
| `staff_portfolios`, `staff_portfolio_scopes` | Officer portfolios with sector/sub-sector/entity scope | REUSE |
| `entity_supervision_assignments` | Named entity supervision (lead + alternate, cycles, closure reasons) | DO_NOT_TOUCH (extend by reference only) |
| `regulatory_function_assignment_requirements` | Permission requirements per assignment role type | REUSE |

Key RPCs: `regulator_mandate_upsert`, `regulator_mandate_supports`,
`regulator_mandate_enforcement_active/_set`, `regulatory_team_member_add/_end`,
`regulatory_team_mandate_add/_end`, `assign_entity_supervision`,
`end_entity_supervision_assignment`, `esa_assert_assignment_authority`,
`regulatory_assignment_scope_allows`, `is_assignment_only_regulator`.

### RBAC and scoping (DO_NOT_TOUCH)
`roles`, `permissions`, `permission_modules`, `permission_actions`,
`role_permissions`, `user_dynamic_roles`, `user_roles`, `sec_scope_types`,
`sec_role_scopes`, `sec_role_scope_values`, `sec_role_template_scopes`,
`rbac_module_scopes`, `has_role()`, `user_has_permission()`, dependency and
orphan triggers. Certified by `supabase/tests/rbac/*` (10, 90, 100, 110, 130, 150, 295 suites).

### Workflow and decision paths
| Object | Role | Classification |
|---|---|---|
| `approval_workflows`, `approval_workflow_versions`, `approval_workflow_types`, `approval_steps`, `approval_step_actions`, `approval_actions`, `workflow_instances`, `delegation_rules` | Canonical workflow engine (processing/review/recommendation) | DO_NOT_TOUCH |
| `perform_workflow_transition`, `perform_registration_workflow_transition`, `perform_return_workflow_transition`, `perform_final_workflow_approval`, `user_can_act_on_workflow_step` | Canonical transition entrypoints, all audit denials | DO_NOT_TOUCH |
| `license_decisions` (`decision_type`, `authority`, `maker_id`, `checker_id`) | Licence final-decision record of truth | EXTEND (governance only) |
| `decision_options`, `decision_artifacts`, `decision_rationale_templates` | Decision configuration/output | REUSE |
| `fp_committees`, `fp_committee_members`, `fp_committee_votes`, `fp_committee_decision_snapshots`, `fp_sector_decision_rules` | F&P committee/quorum authority | REUSE |
| `license_appeal_panels`, `license_appeal_panel_members`, `license_appeal_panel_snapshots`, `appeal_panel_scopes` | Appeal bodies | REUSE |
| Lifecycle config `decision_authority` (text role key, per licence action) | Legacy per-action authority hint | COMPATIBILITY_ONLY |

### Entity / user relationships
`entities`, `entity_user_memberships`, `entity_membership_roles`,
`entity_membership_role_permissions`, `entity_data_authority_rules`,
`profiles`, `pre_license_users` — REUSE. Entity access =
membership + capability + scope + entitlement + workflow state (already enforced).

### Services, tasks, queues
`services` (thin: sector/sub-sector + name) — EXTEND, do **not** duplicate.
`regulatory_request_types`, `regulatory_requests`, `regulatory_request_form_requirements`,
`complaint_investigation_tasks`, `fp_manual_screening_tasks`, `fp_task_evidence`,
`engine_rule_tasks`, `examination_workpapers`, `supervisory_plans`,
`supervisory_plan_actions`, `conduct_supervisory_plans` — REUSE.
Infrastructure queues (`job_queue`, `notification_event_queue`,
`notification_outbox`, `integration_retry_queue`, `worker_invocation_tokens`) —
service-role only, DO_NOT_TOUCH (locked down in MC-12).

### AI governance (DO_NOT_TOUCH)
MC-08 control plane: model/instruction registries, versioning, global and module
kill switches, AI activity + assurance registers, mandatory confidence policy,
grounded citations. Certified 30/30. MC-07/09/10/11 advisory layers all route
through it (`conduct-intel-ai-advise`, reporting narratives).

---

## 2. Certification baseline (do not re-run unless touched)

| Suite | Result |
|---|---|
| MC-09 cross-entity intelligence | 23/23 PASS |
| MC-10 planning/intervention loop | 40/40 PASS |
| MC-11 reporting/MI/evidence packs | 42/42 PASS |
| RBAC `10_permission_dependencies` | 14/14 PASS |
| RBAC `90_approval_workflows_rls` | 24/24 PASS |
| RBAC `100_prudential_rls` | 22/22 PASS |
| RBAC `110_fit_and_proper_rls` | 23/23 PASS |
| RBAC `130_critical_rpc_hardening` | 32/32 PASS |
| RBAC `150_storage_policy_hardening` | 21/21 PASS |
| RBAC `295_workflow_step_authorization` | 6/6 PASS |
| MC-12 release debt RD-001…RD-008 | CLOSED |

---

## 3. Gap register (what the programme must add)

| # | Gap | Checkpoint | Approach |
|---|---|---|---|
| G1 | No generic hierarchical operating/jurisdiction scope (mandates carry sector only) | B | New generic effective-dated scope table, no deployment-specific fields |
| G2 | Final decision authority is per-module and partly a text role hint | B | Canonical server-side resolver with `OFF → OBSERVE_ONLY → ENFORCED` |
| G3 | No work-allocation policy (`TEAM_POOL / PORTFOLIO / CASE_ONLY / NAMED_ENTITY / HYBRID`) or pool claim | C | Policy configuration + claim RPC over existing assignment tables |
| G4 | `services` too thin for the Regulatory Service model; no task execution modes | D | Extend `services`, add task definitions with execution mode |
| G5 | No service-provider security context at all | E | New provider org/membership/engagement/work-package model, server-authorized |
| G6 | People & Access surfaces are split across admin pages | F | Aggregate over canonical security objects, no new permission system |
| G7 | No My Work aggregation | F | Read-only aggregation, no duplicated case state |

## 4. Areas marked DO_NOT_TOUCH
Workflow engine internals; canonical RBAC and its triggers; MC-07…MC-11 conduct
intelligence schema and RPCs; AI control plane; notification worker surface;
historic decision rows (`license_decisions`, committee/panel snapshots);
`entity_supervision_assignments` semantics; storage policies hardened in MC-12.

## 5. REQUIRES_REVIEW carried forward
- Lifecycle-config `decision_authority` text keys must be mapped to canonical
  decision-authority rules per deployment; unmapped values stay advisory.
- Historic `license_decisions.authority` free-text values are not back-classified.

---

## 6. Convergence checkpoint progress

| Checkpoint | Scope | Status | Evidence |
|---|---|---|---|
| A | Repository truth baseline + gap register | DONE | this document |
| B | Regulatory authority + decision authority resolver (`OFF / OBSERVE_ONLY / ENFORCED`) | CERTIFIED 9/9 | `supabase/tests/convergence/01_checkpoint_b_decision_authority.sql` |
| C | Small-regulator work model (allocation policy + coverage resolver) | CERTIFIED 9/9 | `supabase/tests/convergence/02_checkpoint_c_work_model.sql` |
| D | Regulatory service + task execution model | CERTIFIED | `supabase/tests/convergence/03_checkpoint_d_e_services_providers.sql` |
| E | External service provider security context | CERTIFIED | same suite (19 assertions incl. grant invariants) |
| F | People & Access + My Work aggregation surfaces (read models only) | CERTIFIED 21/21 | `supabase/tests/convergence/04_checkpoint_f_people_access.sql` |
| G | Module adoption of canonical resolvers | PENDING | — |
| H | Regression + full convergence certification | PENDING | — |
| I | Release decision | PENDING | — |

### Invariants proven so far
- Unconfigured deployments keep today's behaviour (allocation default
  `HYBRID`/`MANUAL`; unknown task defaults to `INTERNAL_ONLY`).
- Coverage never equals permission, and never equals decision authority.
- Every externally executable task must end in internal acceptance; providers
  cannot accept their own work or take any decision action.
- Provider visibility is bounded by active provider + active membership +
  in-date NDA-confirmed engagement + non-closed assigned work package.
- All convergence tables are read-only to signed-in users and invisible to
  anonymous callers; authoritative writes only via governed RPCs.

### Platform finding (applies beyond this programme)
This project's Postgres default privileges grant full DML on newly created
`public` tables to `anon` and `authenticated`. Every new table therefore needs an
explicit `REVOKE ALL ... FROM anon, authenticated` followed by the intended
narrow grants. Applied to all ten convergence tables.

**Permanent guardrail (added in F).** `04_checkpoint_f_people_access.sql` fails
certification if `anon` or `authenticated` holds direct `INSERT`/`UPDATE`/`DELETE`
on any governed convergence table, if RLS is off on one of them, if `service_role`
loses its write path, or if the approved governed RPC stops being executable.
Any new governed convergence table must be added to that suite's
`governed_tables` list. F did not alter privileges on pre-existing tables.

---

## 7. Checkpoint F — People & Access + My Work (read models)

F adds **no tables, no permission engine and no generic work store**. It adds four
read-only `STABLE SECURITY DEFINER` aggregations over existing truth, each
re-checking the caller's canonical permissions and each tagged
`is_authoritative_source: false`:

| Read model | Aggregates |
|---|---|
| `people_access_internal_profile(uuid)` | wraps canonical `staff_responsibility_profile` (roles, teams, coverage, entity ownership, examinations, panels, committees) and adds effective permissions, delegations in/out, work-allocation coverage via `work_allocation_can_take`, provider-identity flag, access history |
| `people_access_entity_overview(uuid)` | entity memberships + role capabilities, portal access, supervisory ownership, access history |
| `people_access_provider_overview(uuid)` | provider, engagements (NDA/expiry), provider users, assigned packages, work-package event history — staff see all, provider members only what `provider_can_access_work_package` allows |
| `my_work_queue(int)` | live union of assigned applications, investigated complaints, investigation tasks, conduct attention items, interventions, and provider submissions awaiting internal acceptance; provider identities see only their own scoped packages |

Surfaces: `/admin/people-access` (Internal People / Entity Access / Service
Providers) and `/my-work`. Both are read-only; every My Work row links back to the
owning module, which remains the source of truth.

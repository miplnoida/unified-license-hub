# Market Conduct — Workflow Architecture

Status: implemented for Consumer Complaint Case only. All other families are
architecture placeholders owned by later epics and MUST NOT be built yet.

## 1. Governing principle — one business authority per decision

| Layer | Owns |
| --- | --- |
| Domain command (e.g. `complaint_jurisdiction_decide`) | The business decision, its validation, its legal/policy basis, its audit record |
| Centralized workflow (`approval_workflows` / `workflow_instances`) | Phase, assignment, SLA, routing, approvals surface, history |

The centralized workflow is **not** a second state machine. A generic workflow
action must never mutate complaint domain state that a governed domain command
already owns. Workflow progression is a *consequence* of a successful domain
event, never a precondition for it.

## 2. Workflow families

| # | Family | Status | Owner epic |
| --- | --- | --- | --- |
| 1 | Consumer Complaint Case | **Implemented** | MC-01 / MC-02 / MC-03 (+ MC-04 outcome) |
| 2 | Conduct Signal / Alert Assessment | Placeholder | MC-05+ |
| 3 | Conduct Risk / Supervisory Planning | Placeholder | MC-07+ |
| 4 | Thematic Review | Placeholder | MC-08+ |
| 5 | Formal Conduct Investigation | Placeholder | MC-09 |
| 6 | Remediation / Enforcement Referral | Placeholder | MC-10 |
| 7 | Effectiveness / Recurrence | Placeholder | MC-11 |

### Deferred blueprints (not implemented)

- **Conduct Signals** — Input → Signal Assessment → Monitor / Escalate / Close
- **Formal Conduct Investigation** — Open → Plan → Evidence / Interviews → Findings → Decision / Referral
- **Thematic Review** — Proposal → Scope → Evidence → Assessment → Findings → Actions → Closure
- **Remediation / Enforcement** — Referral → Review → Action → Remediation Monitoring → Completion
- **Effectiveness** — Review Due → Effectiveness Assessment → Effective / Recurrence / Reopen

Each must reuse the centralized engine for orchestration only; the domain tables
stay authoritative. No business tables or workflow actions may be created for
them ahead of their epic.

## 3. Canonical Consumer Complaint workflow

Workflow: **Market Conduct — Consumer Complaint** (`entity_type = 'complaint'`,
published version 1). Intake/filing happens *before* the internal workflow.

| Order | Phase | `step_key` | Business authority | Held by |
| --- | --- | --- | --- | --- |
| 1 | Jurisdiction Assessment | `mc_jurisdiction_assessment` | `complaint_jurisdiction_*` | Investigator |
| 2 | Triage Review | `mc_triage_review` | `complaint_triage_confirm` | Market Conduct Supervisor |
| 3 | Investigation Setup | `mc_investigation_setup` | `complaint_investigation_open`, plan operations | Investigator |
| 4 | Investigation Casework | `mc_investigation_casework` | allegation / evidence / RFI / representation operations | Investigator |
| 5 | Outcome Review | `mc_outcome_review` | MC-04 (not yet built) | Market Conduct Supervisor |
| 6 | Closure & QA | `mc_closure_qa` | MC-04 | Market Conduct Supervisor |
| 7 | Closed (terminal) | `mc_closed` | MC-04 | Market Conduct Supervisor |
| 8 | Referred / Outside Jurisdiction (holding) | `mc_referred_pending_outcome` | MC-04 outcome policy | Market Conduct Supervisor |

Eight phases only. Internal tasks are never promoted to phases.

## 4. Substate rule

The following are **work states / blockers inside a phase**, never phases:

waiting for complainant information · waiting for entity RFI · RFI approval ·
evidence gathering · representation window open/submitted · blocked task ·
awaiting document · internal note · correspondence sent.

Example: while in `mc_investigation_casework` the workspace may show three open
allegations, one outstanding entity RFI, a representation window closing Friday
and two incomplete mandatory tasks. The phase stays `Investigation Casework`
until the deterministic readiness gate is satisfied.

## 5. Domain event → workflow transition map

Implemented by `public.mc_complaint_workflow_sync(complaint_id, event)`, invoked
server-side by database triggers on the authoritative domain tables. It is
idempotent, never regresses a phase, and writes `complaint.workflow.*` audit
entries. There is no client-side "advance workflow" call.

| Domain event | Trigger source | Resulting phase |
| --- | --- | --- |
| `complaint.created` | `complaints` AFTER INSERT | Jurisdiction Assessment |
| `complaint.jurisdiction.accepted` | `complaint_jurisdiction_assessments.decision_outcome` | Triage Review |
| `complaint.jurisdiction.partially_accepted` | same | Triage Review (accepted scope preserved on the assessment) |
| `complaint.jurisdiction.referred` | same | Referred / Outside Jurisdiction (holding) |
| `complaint.jurisdiction.out_of_jurisdiction` | same | Referred / Outside Jurisdiction (holding) |
| jurisdiction information requested | `complaint_jurisdiction_info_requests` | stays Jurisdiction Assessment, waiting blocker shown |
| `complaint.triage.confirmed` | `complaints` AFTER UPDATE, gated by `complaint_triage_gate_ok` | Investigation Setup |
| `complaint.investigation.plan_approved` | `complaint_investigation_plans.status = APPROVED` | Investigation Casework |
| `complaint.investigation.ready_for_outcome_review` | readiness re-check on allegations / tasks / RFIs / representations | Outcome Review |
| `complaint.outcome.ready_for_qa` | MC-04 | Closure & QA (deferred) |
| `complaint.closed` | MC-04 | Closed (deferred) |

Referred and out-of-jurisdiction complaints are **never** auto-closed; formal
outcome and closure policy belongs to MC-04. The holding phase is sticky — the
bridge refuses to move a complaint out of it automatically.

## 6. Readiness oracle

`public.complaint_investigation_readiness` remains the single deterministic
readiness oracle. Advancement to Outcome Review requires
`readiness = 'READY_FOR_OUTCOME_REVIEW'`. Blockers: plan missing or still draft,
investigation not opened, no allegations, unassessed allegations, open required
RFIs, open representation windows, incomplete mandatory work items, plus MC-02
gate blockers. No redress/closure requirements are invented in MC-03.

## 7. Versioning and migration

New complaints pin to `approval_workflows.current_published_version_id` at
instance creation (`workflow_instances.workflow_version_id`). Configuration
changes follow Draft → Validate → Publish; in-flight instances stay pinned.
Moving an in-flight instance to a new version requires an explicit governed
migration recording old workflow, old step, old history, mapping reason, new
instance/version, actor and timestamp. Historical instances of retired
workflows are never repointed to new step IDs.

## 8. Lifecycle governance — retire vs delete

`public.workflow_retire(workflow_id, reason)` — admin-only; deactivates the
workflow, stamps `retired_at` / `retired_by` / `retirement_reason`, preserves the
definition, versions, steps, actions and every instance, and audits
`workflow.retired`.

`public.workflow_hard_delete(workflow_id)` — permitted only when the server
proves zero `workflow_instances` and zero `approval_actions`; otherwise it raises
`WORKFLOW_HAS_HISTORY_USE_RETIRE`. The browser holds no DELETE privilege on
`approval_workflows`.

## 9. Assignment authority

Workflow roles route work only. Server-authoritative authorization stays with
canonical RBAC permissions plus regulator mandate and ROS scope
(`mc03_guard`). A case officer cannot approve their own investigation plan; a
generic System Administrator is not automatically a complaint decision-maker;
auditors are read-only. The legacy generic "regulator" compatibility role is not
used as the Market Conduct authorization model.

## 10. Current step UI contract

`public.complaint_workflow_state(complaint_id)` returns the phase, holder,
start, operational target, SLA status, blockers, the next action label and what
happens next. The UI renders domain-specific actions (Open jurisdiction
assessment, Review triage recommendation, Prepare / review investigation plan,
Continue investigation) — never generic workflow Approve/Start Triage buttons.

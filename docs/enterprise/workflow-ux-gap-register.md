# Workflow & UX Gap Register

**Mode:** discovery only. Each row is a recorded gap, not a change.

Reference implementation for all workflow gaps: `/prudential/examinations/:id`
(`ExaminationWorkspace` + `ExaminationStageActions` + `src/lib/examinationWorkflow.ts`) —
current step owns progression, blockers are listed as prerequisites, supporting tabs are
local-actions only.

## 1. Case workspace header completeness

Legend: ✔ present · ✖ missing.

| Element | Examination | Application | Complaint | Investigation | Thematic | Enforcement | Filing (canonical) | Prudential Assessment | Coordination | Inspection |
|---|---|---|---|---|---|---|---|---|---|---|
| Case reference | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Subject / Entity | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Current stage | ✔ | ✖ (status only) | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| Current status | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Owner | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✔ | ✔ |
| Team | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| Priority | ✖ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| SLA | ✖ | ✔ (weak) | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✔ | ✔ |
| Waiting-on | ✔ | ✔ (weak) | ✖ | ✖ | ✖ | ✖ | ✔ | ✖ | ✖ | ✖ |
| Blocking conditions | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✔ | ✖ |
| Next required action | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| Available actions | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ (borrowed) | ✔ | ✔ | ✔ | ✔ |
| Evidence completeness | ✔ | ✖ | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| Related cases | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| Communications | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✔ | ✖ |
| Decision history | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ |
| Audit / timeline | ✔ | ✔ | ✔ | ✔ | ✖ | ✔ | ✖ | ✖ | ✖ | ✖ |

**Case workspaces without current-stage UX: 9 of 10** (only Examination has it).
**Related-cases affordance: missing on all 10.**

## 2. Workflow control pattern

| Screen | Pattern today | Gap |
|---|---|---|
| `ExaminationWorkspace` | Current step → blockers → eligible action → governed RPC | none (reference) |
| `ApplicationDetail` | tabbed status-centric; actions listed without prerequisite gating | no current-step panel, no blocker list |
| `FpaScreening`, `ConductActions`, `CoordinationDetail`, `FormManagement`, `UserManagement` | direct `update({ status … })` from a control | arbitrary status selection — must move behind governed transitions |
| `ComplaintDetail` | `execute_complaint_workflow_action` (governed) but no stage/blocker presentation | presentation gap only |
| `InvestigationDetail`, `ThematicReviewDetail` | action buttons, no stage model | no current step, no prerequisites |
| `EnforcementDetail` | borrows complaint workflow panel | no own lifecycle (see §4) |

## 3. Work queue completeness

Columns audited: Entity/subject, reference, stage, status, owner/team, priority, SLA,
waiting-on, blocker, last activity, next action.

| Queue | Missing |
|---|---|
| `/applications/queue` | stage, waiting-on, blocker, next action |
| `/returns/queue` | owner/team, priority, next action |
| `/returns/obligations` | owner/team, SLA state, next action |
| `/returns-management` (legacy) | owner/team, SLA, blocker, next action |
| `/admin/returns/queue` | duplicate of the above; same gaps |
| `/complaints` | stage, blocker, next action |
| `/complaints/escalations`, `/complaints/duplicates`, `/complaints/rfi-approvals` | owner/team, SLA, next action |
| `/conduct/alerts`, `/conduct/investigations`, `/conduct/closure-approvals` | owner/team, SLA, next action |
| `/supervision/breaches` | owner/team, next action |
| `/prudential/actions`, `/prudential/escalations` | SLA, next action |
| `/fpa/processes`, `/fpa/screening`, `/fpa/determinations`, `/fpa/manual-tasks`, `/fpa/findings`, `/fpa/appeals`, `/fpa/monitoring` | stage, owner/team, SLA, blocker, next action |
| `/inspections`, `/prudential/examinations` | next action |
| `/enforcement` | owner/team, SLA, stage, next action |
| `/correspondence/inbox` | owner/team, SLA, next action |
| `/admin/registration-review` | SLA, next action |
| `/coordination` | priority, next action |
| `/alerts` | owner/team, next action |
| `/supervision/thematic-closure-approvals` | owner/team, SLA, next action |

**Queues without a next-action column: 21 of 21.**
**Queues without both owner and SLA: 14.**

Filtering/KPI parity: not guaranteed on any analytics-bearing queue — see
`screen-data-source-audit.md` §3.

## 4. Enforcement source coupling — **GAP**

`src/pages/enforcement/EnforcementDetail.tsx` resolves a linked row from `complaints`,
renders `components/complaints/WorkflowActionPanel`, and explicitly states: *"This
enforcement case has no linked complaint. Lifecycle actions are driven by the Complaint
Management Workflow — link a complaint to enable them."*

Consequence: enforcement cannot be raised from conduct investigation, thematic finding,
prudential breach/action, examination finding, licensing violation, F&P matter, or a manual
authorised referral.

Proposed generic model (not implemented):

```text
enforcement_cases
  source_kind  enum(complaint, conduct_investigation, thematic_finding,
                    prudential_breach, prudential_action, examination_finding,
                    licensing_violation, fp_matter, manual_referral)
  source_id    uuid          -- polymorphic, validated per kind
  entity_id    uuid          -- canonical Entity, always required
  workflow_type 'enforcement' -- own approval_workflow_type + approval_steps
```

with its own stage machine (`referral → assessment → notice of intent → representations →
decision → sanction/directive → obligations → monitoring → closure`), its own governed
transition RPC, and complaint linkage demoted to one possible `source_kind`.

## 5. F&P case-context ambiguity — **9 surfaces**

`FpaIndividualProfile` resolves `fp_latest_assessment` and passes `latestAssessmentId`
into `FpScreeningPanel`. The following process screens operate as global registers with no
required `assessment_id` in the route or filter context:

`/fpa/screening`, `/fpa/findings`, `/fpa/findings/:id`, `/fpa/determinations`,
`/fpa/committee`, `/fpa/conditions`, `/fpa/appeals`, `/fpa/monitoring`,
`/fpa/declarations`.

`/fpa/assessments/:id` exists only as a **redirect** (`FpaAssessmentRedirect`) — there is
no Fit & Proper *Assessment Case* workspace. Every screening, finding, committee,
determination, condition, appeal and monitoring record must be bound to one explicit
assessment process instance; "latest assessment" must never be the binding rule.

## 6. Duplicate operational surfaces

| Cluster | Members | Recommendation |
|---|---|---|
| Applications | `/applications` (ApplicationsList, 1643 ln), `/applications/queue` (ApplicationQueue, 788 ln) | `/applications/queue` = CANONICAL internal queue; `ApplicationsList` = REGISTER_ONLY for external audience |
| Entity detail | `/entities/:entityId` (Entity 360), `/prudential/entities/:id`, `/conduct/entities/:id`, `/admin/licensees/:id` | Entity 360 = CANONICAL; prudential/conduct profiles = MERGED as Entity 360 process tabs; `/admin/licensees/:id` = REDIRECT |
| Returns queue | `/returns/queue` (canonical), `/returns-management`, `/admin/returns/queue` | `/returns/queue` = CANONICAL; other two = COMPATIBILITY_ONLY then RETIRED_FROM_NAVIGATION |
| Return detail | `/returns/filings/:filingId`, `/returns-management/:id`, `/admin/returns/queue/:id` | `/returns/filings/:filingId` = CANONICAL; others REDIRECT |
| Licensee returns | `/entity/returns` (canonical), `/entity/returns/legacy`, `/compliance/returns` | `/entity/returns` = CANONICAL; legacy + `/compliance/returns` = COMPATIBILITY_ONLY |
| F&P | `/fpa/*` process pages vs `/fpa/individuals/:id` tabs vs `/admin/fp-*` | individual = REGISTER_ONLY (master record); new assessment-case workspace = CANONICAL; `/admin/fp-*` = CONFIGURATION |
| Conduct | `/conduct` (analytics) vs `/conduct/alerts`, `/conduct/investigations`, `/conduct/actions` | dashboard = PORTFOLIO_ANALYTICS only; operational truth stays in queues |
| Correspondence | `/correspondence`, `/correspondence/dashboard`, `/correspondence/manager`, `/correspondence/inbox`, `/correspondence/records` | `/correspondence/inbox` = CANONICAL queue, `/correspondence` = dashboard, `manager` + `records` = MERGED |
| Admin hub runtime mixing | `/admin` links to `/admin/returns/queue`, `/admin/registration-review`, `/admin/license-appeals`, `/admin/escalations`, `/admin/case-audit` | move these 5 runtime surfaces out of the admin hub into their process navigation |

**Duplicate operational surface clusters: 9 (25 routes involved).**
**Admin runtime/config mixing sites: 5.**

# Enterprise Process Operating Model

**Mode:** discovery / analysis only. Nothing was implemented.

The platform passed BRD/FRD functional certification. This document answers a different
question: *does it behave as one coherent regulatory case-management system?*

Short answer: **functionally yes, operationally no.** The capabilities exist, but they are
exposed as 283 independently designed screens rather than 15 processes. The dominant
structural problem is that the same regulated object (Entity, Return, Case) is reachable
through several non-equivalent surfaces with different truth sources.

## 1. The 15 process families and their current spine

| Process | Entry surface | Queue | Case workspace | Governed transition source | Coherence |
|---|---|---|---|---|---|
| P01 Onboarding | `/register`, `/register/entity` | `/admin/registration-review` | `/admin/registration-review/:id` | registration governed RPCs | Good |
| P02 Entity Resolution & Registry | `/entities` | `/licensing/entity-resolution` | `/entities/:entityId`, `/licensing/entity-resolution/:caseId` | entity change-set RPCs | Good, but 4 competing entity detail pages |
| P03 Licensing | `/applications` | `/applications/queue` | `/applications/:id` | `approval_steps` + workflow RPCs | Weak — status-centric, no current-step UX |
| P04 Licence Lifecycle | `/licenses` | none | `/licenses/:id`, `/admin/licensees/:id` | licence RPCs | Weak — no lifecycle queue (renewals/expiry live in config + alerts) |
| P05 Fit & Proper | `/fpa` | `/fpa/processes` | `/fpa/assessments/:assessmentId` | `fp_assessment_case` read model + governed F&P ops | **CLOSED (EPR-04)** — canonical assessment case, server-owned person/appointment register, FP_MATTER enforcement referral |
| P06 Returns | `/returns/queue` | `/returns/queue`, `/returns/obligations` | `/returns/filings/:filingId` | return workflow RPCs | **CLOSED (EPR-01)** — single canonical spine, legacy retired |
| P07 Prudential | `/prudential/dashboard` | `/prudential/work-queue` | `/entities/:entityId`, `/prudential/assessments/:id` | prudential governed RPCs + read models | **CLOSED (EPR-02)** — canonical returns truth only |
| P08 Conduct & Complaints | `/conduct`, `/complaints` | `/complaints`, `/conduct/alerts`, `/conduct/investigations` | `/complaints/:id`, `/conduct/investigations/:id` | `execute_complaint_workflow_action` | Mixed |
| P09 Thematic | `/supervision/thematic-reviews` | `/supervision/thematic-closure-approvals` | `/supervision/thematic-reviews/:id` | thematic closure RPCs | Weak header |
| P10 Examination / Inspection | `/prudential/examinations`, `/inspections` | both lists | `/prudential/examinations/:id` | **reference implementation** (`ExaminationStageActions`) | Best in platform |
| P11 Enforcement | `/enforcement` | `/enforcement` (server-backed queue) | `/enforcement/:id` | `enforcement_referral_create` + `enforcement_case_action` | **CLOSED (EPR-03)** — independent process, 9 referral sources, maker/checker enforced |
| P12 Correspondence & RFI | `/correspondence` | `/correspondence/inbox` | `/correspondence/:id` | dispatch RPCs | 4 near-duplicate surfaces |
| P13 Supervisory Intelligence | `/executive`, `/analytics` | n/a | n/a | read models (partial) | Mixed truth |
| P14 Regulatory Configuration | `/admin/config/*`, `/settings` | n/a | n/a | config tables | Good after hub work |
| P15 Platform Operations | `/admin`, audit surfaces | `/coordination` | `/coordination/:caseId` | coordination RPCs | Admin hub mixes runtime + config |

## 2. Structural findings

1. **Process is implicit.** No screen tells the user which process they are in, which stage
   the case is at, or what must happen next. Only Examination does.
2. **Two returns spines.** Wave-C canonical (`return_filings`, `return_filing_versions`,
   `return_metric_values`, `reporting_periods`) and legacy (`returns_filed`) are both live
   and both linked from navigation; 17 non-test source files still read `returns_filed`.
3. **Four entity identities.** `/entities/:entityId` (canonical Entity 360),
   `/prudential/entities/:id`, `/conduct/entities/:id`, `/admin/licensees/:id`. Links pass
   *different id domains* (`entity_id`, `licensee_id`) into the same route shapes.
4. **Enforcement has no own lifecycle.** `EnforcementDetail` mounts
   `components/complaints/WorkflowActionPanel` and refuses lifecycle actions when no
   complaint is linked — so prudential, examination, thematic, licensing and F&P
   consequences cannot be enforced.
5. **F&P conflates person and case.** Screening/findings/determination/appeals are global
   registers; assessment context is recovered by "latest assessment" lookup.
6. **Admin hub mixes runtime and configuration.** `/admin` links to operational queues
   (`/admin/returns/queue`, `/admin/registration-review`, `/admin/license-appeals`) beside
   pure configuration, so operational work is discovered through an admin surface.
7. **No cross-domain "My Work".** Every domain has its own queue; a supervisor has ~12
   inboxes and no single prioritised worklist.

## 3. Target operating model (proposal, not implemented)

Every process gets exactly one spine:

```text
PROCESS DASHBOARD → WORK QUEUE → CASE WORKSPACE → CURRENT STEP → DECISION → HISTORY
```

with a single canonical object route per regulated object (see
`canonical-route-register.md`), a server-owned case header contract, and one read-only
cross-domain My Work model (see `process-ux-target-architecture.md`).

## 4. Recommended first implementation process

**P06 Regulatory Returns.** It is the only process with two live, navigable spines and the
largest active legacy-read footprint, it feeds P07 detection (so its truth defects
propagate into breaches, EWIs and analytics), and it already has a certified canonical
data model to converge on — making it the highest-value, lowest-invention first move.

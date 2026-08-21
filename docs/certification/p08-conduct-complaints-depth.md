# P08 — Conduct & Complaints Deep Build (Phase B)

## B.1 Canonical conduct case state and unified work queue — IMPLEMENTED

### Server authority

| Object | Purpose |
| --- | --- |
| `public.v_conduct_investigation_state` (SECURITY INVOKER) | Canonical investigation state: stage, stage label/sequence, terminality, SLA state from the target completion date, owner, entity, evidence/interview/open-action counts, closure status. |
| `public.conduct_investigation_blockers(uuid)` | What genuinely prevents progression (no owner, no scope/legal basis, no target date, no evidence before analysis, no proposed outcome). |
| `public.conduct_investigation_available_actions(uuid)` | The single authority for permitted next steps and their payload schema. Returns `[]` for terminal cases and for users without `market_conduct.initiate_investigation`. |
| `public.conduct_investigation_case(uuid)` | Case read model: header contract, scope, counts, blockers, available actions and server-built timeline. Enforces `can_view_conduct_investigation`. |
| `public.conduct_investigation_step(uuid, text, jsonb)` | The only lifecycle mutation entry point. Re-derives availability, re-validates every field, writes a `WORKFLOW_TRANSITION` compliance audit row. |
| `public.conduct_work_queue(...)` / `public.conduct_work_queue_counts()` (SECURITY INVOKER) | One ranked queue over complaints, conduct alerts, investigations and supervisory actions with server paging, filters and counts. |

Stage model: `INTAKE → EVIDENCE → ANALYSIS → PROPOSED_OUTCOME → CLOSED / DISCONTINUED`.
Closure and discontinuation are **not** reachable through `conduct_investigation_step` — they remain with the
existing closure determination gate (`conduct_closure_*`) and its supervisory approval.

### Actions and prerequisites

| Action | Stage | Prerequisites enforced server-side |
| --- | --- | --- |
| `ASSIGN_OWNER` | any open, unassigned | investigating officer required |
| `RECORD_PLAN` | INTAKE | scope ≥ 20 chars, legal basis ≥ 10 chars, target completion date |
| `BEGIN_EVIDENCE` | INTAKE | zero outstanding blockers (owner, scope, legal basis, target date) |
| `BEGIN_ANALYSIS` | EVIDENCE | at least one evidence item |
| `PROPOSE_OUTCOME` | ANALYSIS | proposed outcome ≥ 20 chars |
| `RETURN_TO_ANALYSIS` | PROPOSED_OUTCOME | reason ≥ 10 chars |

### Frontend

| Surface | Role |
| --- | --- |
| `/conduct/work-queue` (`ConductWorkQueue.tsx`) | The single conduct work queue. Reads only; routes to canonical case workspaces. |
| `src/components/conduct/InvestigationCurrentStepPanel.tsx` | Sole lifecycle controller; renders the server-declared payload schema. |
| `src/pages/conduct/InvestigationDetail.tsx` | Case workspace on the shared `CaseHeader` contract; free status editing retired. |
| `src/hooks/useConductProcess.ts`, `src/lib/conductProcessOps.ts` | Typed read/mutation layer over the governed RPCs. |

Browser DML on `conduct_investigations` for lifecycle purposes is zero: all stage movement goes through
`conduct_investigation_step`, and casefile edits continue through the governed `conduct_investigation_update`.

## Deferred / next increments

1. Complaint case read model (`complaint_case`) convergence onto the same header contract.
2. Canonical conduct findings store and remediation action panel.
3. Retirement of `/conduct/entities/:id` in favour of Entity 360 conduct summary.
4. Integrated live certification scenarios — recorded in
   `docs/certification/deferred-enterprise-certification-register.md`.

## B.2, B.9–B.19, B.27 — Findings, remediation, alerts, complaint case, overview — IMPLEMENTED

| Object | Purpose |
| --- | --- |
| `public.v_conduct_action_state` (SECURITY INVOKER) | Canonical remediation state: stage, SLA, evidence status, waiting-on, next action. |
| `conduct_action_register` / `_counts` / `_case` / `_available_actions` / `_step` | Governed remediation obligations. Evidence must be submitted and reviewed before completion; return, escalate, waive and cancel all require a rationale. Direct browser DML on `conduct_actions` is revoked. |
| `conduct_alert_register` / `_counts` | Alert register with full signal lineage (source, rule + version, observation window, threshold, explanation). |
| `conduct_alert_dispose`, `conduct_alert_promote_to_investigation` | Governed dispositions. Promotion copies the exact alert lineage onto the new investigation and links both records. |
| `public.v_conduct_work_items` (SECURITY INVOKER) | The single work-item spine: complaints, alerts, investigations, remediation, findings. Queue and counters are computed from the same set, so totals are no longer capped. |
| `complaint_case`, `complaint_blockers` | Complaint read model on the shared case header contract, with genuine blockers and cross-domain counts. |
| `conduct_overview`, `entity_conduct_summary` | Server-owned conduct posture for the overview and the Entity 360 conduct section. |

### Frontend

| Surface | Role |
| --- | --- |
| `/conduct/actions`, `/conduct/actions/:id` | Remediation register (server paged) and case workspace on `CaseHeader` + `GovernedStepPanel`. |
| `/conduct/findings`, `/conduct/findings/:id` | Findings register and case workspace. |
| `/conduct/alerts` | Alert register with acknowledge / dispose / promote dialogs. |
| `src/components/conduct/GovernedStepPanel.tsx` | Shared server-declared step controller for conduct objects. |
| `src/hooks/useConductRegisters.ts` | Typed read/mutation layer for the registers above. |

Legacy "Complete" buttons that closed a remediation requirement with one click are retired; completion now requires
submitted evidence and a recorded supervisory review.

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

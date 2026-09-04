# Platform Master Implementation Plan

Baseline HEAD: `302538690e0ad0090fc64cfaea31d7df52c864cb` ("Fixed shared listing state").
Mode: **analysis / architecture lock**. No code, no migrations, nothing deleted.

Companion documents:
- `docs/architecture/canonical-object-register.md` — one canonical source per object
- `docs/architecture/shared-platform-services.md` — the nine platform kernels
- `docs/dms/03_document-control-master-architecture.md` — document control target

Measured baseline: 704 tables, 55 views, 3,249 routines (1,846 `SECURITY DEFINER`),
1,260 RLS policies, 58 permission modules / 419 permissions, 145 routes,
2 workflow templates / 60 workflow instances, 17 document groups / 18 versions / 19 files,
89 entities, 136 parties, 44 persons, 156 remaining direct client write sites.

## A. Platform maturity by layer

| # | Layer | Classification | Basis |
|---|---|---|---|
| 1 | Entity / Party / Person / Licence | **CANONICAL** (person sub-model PARTIAL) | one entity key, typed identifiers, resolution + merge lineage, `entityRegistry.ts` contract |
| 2 | Security / RBAC / Scope / Membership | **CANONICAL** | `sec_*`, `sec_get_user_context()`, role templates, 100% action coverage, membership-based external access |
| 3 | Workflow / Task / Assignment / Delegation / SLA | **STRONG_BUT_NEEDS_CONVERGENCE** | rich machinery (approval workflows, SLA stages, escalation tiers, delegation, rule engine) but only 2 workflow templates in use and several module-local queues |
| 4 | DMS / Documents / Versions / Evidence | **STRONG_BUT_NEEDS_CONVERGENCE** | canonical repository + 34 governed RPCs; controlled documents absent; 6 module evidence stores outside |
| 5 | Communications / Notifications / Correspondence | **STRONG_BUT_NEEDS_CONVERGENCE** | full event/template/outbox/dispatch chain; correspondence attachments not canonical documents |
| 6 | Forms / Configuration / Rule engines | **STRONG_BUT_NEEDS_CONVERGENCE** | versioned forms, metric-bound fields, rule engine with versions/tests; builder still writes tables from the browser |
| 7 | Licensing / Registration | **STRONG_BUT_NEEDS_CONVERGENCE** | 51 tables, decisions/appeals/conditions/renewals complete; two parallel journeys (`applications` vs `registrations`) |
| 8 | Returns | **STRONG_BUT_NEEDS_CONVERGENCE** | canonical filing/version/metric model + governed RPCs; legacy returns family still live and client-written |
| 9 | AML/CFT | **PARTIAL** | closed-loop certified operationally; calculation policy pack NOT READY, 0/80 dimension links, module NOT CERTIFIED |
| 10 | Prudential | **STRONG_BUT_NEEDS_CONVERGENCE** | assessments, ratios, EWI, PFMI, payment systems; PFMI assessment model separate from `supervisory_assessment` |
| 11 | Conduct / Complaints | **STRONG_BUT_NEEDS_CONVERGENCE** | largest surface (105 tables, 24 screens); own findings/intervention/work-queue representations |
| 12 | Fit & Proper | **STRONG_BUT_NEEDS_CONVERGENCE** | 25 screens, committees, screening, determinations; own person, task, finding and evidence notions |
| 13 | Examinations / Investigations | **CANONICAL** (examinations) / PARTIAL (investigations) | canonical `/supervision/examinations/:id`, scope from approved dimensions; `inspections` retired; conduct investigations separate |
| 14 | Findings / Remediation | **STRONG_BUT_NEEDS_CONVERGENCE** | canonical finding workspace with full provenance; `fp_findings` + conduct findings parallel |
| 15 | Enforcement | **PARTIAL** | stages/transitions and referral exist; decision artefacts, notices and publication thin |
| 16 | Entity 360 | **CANONICAL** | cross-domain, legacy AML block retired, certified (W3) |
| 17 | Dashboards / Analytics / AI | **STRONG_BUT_NEEDS_CONVERGENCE** | W5 certified read models; AI governance surfaces exist; report definitions still client-written |
| 18 | External Portal | **STRONG_BUT_NEEDS_CONVERGENCE** | membership-capability access is correct; document/evidence experience not yet canonical |
| 19 | Public Registry | **PARTIAL** | registry pages + publication policies exist; no publication workflow, `publication_status` only ever `not_requested` |
| 20 | Audit / Reporting | **STRONG_BUT_NEEDS_CONVERGENCE** | immutable audit + domain journals; no single cross-domain audit read model; 2 client-side `return_audit_log` inserts |
| — | Controlled Documents | **FUNCTIONAL_GAP** | no controlled revision, review/approval policy, effective-dating or acknowledgement anywhere |

## B. Top 10 architectural risks

1. **Controlled documents do not exist.** Policies, methodologies and circulars have no approved,
   effective, superseded revision — the regulator cannot evidence which instrument was in force.
2. **156 non-governed client writes**, including `return_audit_log`, `notifications`,
   `workflow_instances`, `licensees` and the whole form builder — bypasses RPC authority and audit.
3. **Coordination fragmentation**: five module-local work queues alongside `supervisory_work_item`;
   "my work" means different things per module.
4. **Evidence fragmentation**: six module evidence stores outside the DMS; evidence completeness
   cannot be asserted platform-wide.
5. **Two intake journeys** (`applications` vs `registrations`) with separate form submission,
   workflow and handoff paths.
6. **Legacy Returns family still live** while the canonical filing model is authoritative — dual
   truth about what was filed.
7. **Parallel assessment models** (`supervisory_assessment`, `pfmi_*`, `fp_assessments`) prevent one
   supervisory assessment read model and one calculation authority.
8. **Parallel findings models** (canonical findings, `fp_findings`, conduct findings) — remediation
   and closure rules will drift.
9. **AML calculation policy unapproved** (0/80 dimension links, pack NOT READY) — a certified UI over
   an unapproved methodology.
10. **Listing debt**: ~132 bespoke tables outside the server-paging contract; unbounded/bounded reads
    will fail at 20+ entity certification scale.

## C. Work / workflow / decision architecture (rebaselined)

Existing assets: `workflow_templates`/`workflow_instances` + publish/pin/retire RPCs and a
transition guard; `approval_workflows`/`_versions`/`approval_steps`/`approval_step_actions`;
`decision_authority_rules` + `decision_artifacts` + `decision_options`; `delegation_rules`;
`sla_configurations` + `sla_stage_instances`/`_events` + `sla_escalation_tiers`/`_dispatches` +
`sla_process_team_leads`; `escalations` + `escalation_rules` + tier/ownership events;
`engine_rules` (+ versions, tests, executions, tasks, alerts, suppressions);
`supervisory_work_item` / `_assignment` / `_type` with `supervisory_work_queue`.

**Verdict: this is sufficient as the platform-wide coordination layer.** Nothing new needs to be
invented; what is needed is one stated contract and the retirement of module-local variants.

Definitions to be locked:

| Concept | Canonical meaning |
|---|---|
| assignment | `supervisory_work_assignment` — owner (+ team) of a work item at a point in time |
| workbasket | a saved filter over `supervisory_work_item`; never a separate table |
| review | a recorded review outcome on a domain object (no lifecycle of its own) |
| approval | a decision recorded by an authority resolved from `decision_authority_rules` |
| maker-checker | actor of the submitted change ≠ actor of the approval, enforced server-side |
| delegation | time-boxed authority transfer via `delegation_rules`, always visible in provenance |
| decision authority | configuration (module × object × materiality × scope), never a role name in code |
| SLA | stage-based clock (`sla_stage_instances`) on the domain object, surfaced on the work item |
| escalation | tiered ownership change driven by `escalation_rules`, recorded as events |
| completion | closure of the **domain** object; the work item closes as a consequence |

Hard boundary: workflow/task state must never become the lifecycle of Application, Filing,
Document, Assessment, Finding or Enforcement Action. Domain business state stays authoritative.

Non-governed operations to close in W1: the direct client writes listed in
`canonical-object-register.md` §3, with `workflow_instances`, `notifications`,
`return_audit_log`, `licensees` and `delegation_rules` first.

## D–I. Documents, decisions, lifecycle, shared experience, UX

Fully specified in `docs/dms/03_document-control-master-architecture.md`:
three separated layers (repository / controlled documents / records & evidence), the controlled
revision model, the 12-state lifecycle with justification for every state kept and every state
refused, the ten configurable document roles with maker-checker and administration-vs-authority
separation, the shared component set, the `Documents` + `Administration ▸ Document Management`
UX model, and the per-module integration map.

## J. Implementation waves

Rules for every wave: additive migrations only; nothing dropped; new writes governed by RPC;
RLS + GRANTs in the same migration as any new table; a verifier script and an explicit
acceptance gate; certified areas (W5, W6, Entity 360, examinations, findings workspace) are
regression-only.

### W0 — Architecture lock
- Deps: none. Objects: all. Backend/frontend: none.
- Output: this document set + roadmap reference. Gate: the two verdicts below recorded and accepted.

### W1 — Workflow / decision hardening
- Deps: W0. Objects: Work Item, Task, Decision, assignment, SLA, escalation, delegation.
- Backend: state the coordination contract; governed RPCs for the remaining non-governed writes;
  project module queues into `supervisory_work_item`; maker-checker assertion helper.
- Frontend: one work-queue component; module queues become saved filters.
- Migrations: additive views/RPCs + grants. Security: no new definer without an authority check.
- Tests: work-item projection parity per module, maker-checker refusal, delegation provenance,
  SLA clock continuity. Legacy: module queue tables become read-only. 
- Gate: zero client writes to coordination tables; every module queue reconciles 1:1 with the canonical queue.

### W2 — Document Control backend
- Deps: W1. Objects: Controlled Document, Controlled Revision, Document Decision.
- Backend: control layer over `document_groups`; revision + review + approval + effective-window
  model; approval policy resolution (type × unit × domain × jurisdiction × classification ×
  materiality); numbering series; acknowledgement records; governed RPCs only.
- Migrations: new tables + GRANTs + RLS + policies in the same migration.
- Tests: exactly-one-effective-revision invariant, maker-checker refusal, administrator has no
  approval authority, scheduled effective date, supersede chain, withdrawal.
- Gate: no controlled state reachable without an RPC; invariants proven by verifier.

### W3 — Document Control UX
- Deps: W2. Frontend only: `Documents` hub (My Document Work, Controlled Documents,
  Review & Approvals, Document Register), `ControlledDocumentWorkspace`, and
  `Administration ▸ Document Management`. All listings on the server-paging contract.
- Tests: listing state integrity, permission-driven action visibility, browser flows for
  draft → review → approval → effective. Gate: no module renders its own document UI.

### W4 — Records & Evidence
- Deps: W2. Objects: Document, evidence relationship, retention, holds.
- Backend: evidentiary roles + requirement satisfaction on `document_relationships`; retention
  inheritance; hold precedence; `EvidencePanel` read model.
- Gate: evidence completeness computable for any business record; no dual-written evidence.

### W5 — Licensing + Returns integration
- Deps: W3, W4. Backend: application/RFI/licence/condition and filing evidence requirements onto
  the canonical model; certificates and notices as canonical documents.
- Legacy: legacy Returns family frozen for writes; `returns_legacy_mappings` classification honoured
  (ambiguous/legacy-only never transformed). Gate: both modules use only canonical documents.

### W6 — Supervision integration (AML + Prudential + Examinations + Findings)
- Deps: W5. Blocked by the open AML calculation policy decisions and the 0/80 dimension linkage.
- Backend: assessment/examination/finding/remediation evidence packs; controlled methodologies.
- Gate: AML methodology governed as a controlled document; evidence packs complete.

### W7 — Conduct / F&P / Enforcement integration
- Deps: W6. Backend: complaint, investigation, determination and enforcement evidence;
  enforcement orders as controlled + publishable documents; F&P sensitivity classification honoured.
- Gate: `complaint_evidence`, `conduct_evidence`, `fp-evidence` linked (not copied) and read-only.

### W8 — Enterprise UX migration
- Deps: W3. Frontend: remaining ~132 bespoke registers onto the server-paging + listing contract;
  ~12 high-row workspaces bounded. Gate: no unbounded or fixed-limit listing fetch remains.

### W9 — Legacy convergence
- Deps: W5–W8. Objects: legacy `documents`, legacy Returns family, `registrations` vs
  `applications`, parallel assessment/finding models, pre-`sec_` role tables.
- Rule: classify → freeze writes → migrate only exactly-mappable records → keep the rest readable.
- Gate: every legacy object has an explicit disposition; zero dual-truth writes.

### W10 — Whole-platform certification
- Deps: all. 20+ entity dataset, persona matrix, Playwright suites, RLS/RBAC certification,
  performance, reconciliation, security baseline, regression matrix.
- Gate: one signed verdict per layer plus one platform verdict.

## K. Output summary

**Shared platform kernels**: K1 Identity/Entity · K2 Security · K3 Work & Coordination ·
K4 Document & Records · K5 Communication · K6 Forms & Rules · K7 Audit & Evidence ·
K8 Read-Model/Listing · K9 Configuration & Master Data.

**Duplicate / legacy areas**: legacy `documents`; legacy Returns family; `registrations` vs
`applications`; `pfmi_*` and `fp_assessments` vs `supervisory_assessment`; `fp_findings` and
conduct findings vs canonical findings; five module work queues; six module evidence stores;
pre-`sec_` role/permission tables; `inspections`/`inspection_findings` (already RETIRED_EMPTY).

**What should stop now**
1. Any new module surface that introduces its own document, evidence, work-queue, task or
   finding representation.
2. Any new client-side table write.
3. Any further AML calculation/methodology work until decisions A–O are approved and the
   80-dimension linkage is repaired.
4. Building document features inside individual modules.
5. New bespoke `<Table>` registers.

**What can continue in parallel**
1. Listing/server-paging migration of existing registers (W8 is independent of W2).
2. Entity/Person model tightening and identifier normalisation.
3. Notification/correspondence template and routing configuration.
4. Read-only analytics, dashboards and reporting on certified read models.
5. Test, persona and dataset work for W10.
6. Bug fixes and regressions in certified areas.

**First implementation wave after architecture lock**: **W1 — Workflow/decision hardening**.
It is the prerequisite for document review/approval routing, it removes the largest integrity
risk (non-governed writes), and it needs no new domain model.

## Verdicts

- **PLATFORM ARCHITECTURE READY FOR CONTROLLED CONVERGENCE — YES** (canonical spine exists for
  identity, security, examinations, findings, Entity 360 and read models; convergence is
  additive and wave-sequenced).
- **DOCUMENT CONTROL READY FOR IMPLEMENTATION — YES** (repository layer is canonical and
  governed; the control layer is a clean additive overlay with a locked lifecycle and
  decision-authority model).

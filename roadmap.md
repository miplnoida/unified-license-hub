# Roadmap

## AML-CLOSE-08 — conditional certification resumption (2026-10-07)
- [x] Validate 16:47 upload only and document ten UNKNOWN facts plus F1 comparison in report EI; no concrete platform evidence supplied. PREREQUISITE NOT SATISFIED; freeze retained, no gates executed.
- [x] Record 16:44 evidence-intake-only instruction and ten-field UNKNOWN matrix in report EH; PREREQUISITE NOT SATISFIED. Stop after documentation; even future satisfaction requires separate owner resumption.
- [x] Record preliminary read-only health, Git and deployment/backend evidence in report EG; healthy idle snapshot does not prove stall remediation.
- [ ] Establish qualifying platform/request-path change, resolver and timestamp — BLOCKED: no support/change evidence supplied or found; owner clarification skipped. Shared infrastructure change history and hosted security change history remain unverified.
- [ ] Outstanding certification gates — BLOCKED by the prerequisite above: Spec 12 ×3, Spec 15 ×3, complete isolated AML suite, currentness-dependent regression/security scan, residue/protected-state verification, gated publish and safe live smoke. No notification-producing sweep or AML-CLOSE-09; CONDITIONAL PASS retained.

## AML-CLOSE-08F2 — authorised scope only
- [x] Inventory all three orphaned TEST runs and inspect server-offered lifecycle capabilities before cleanup: 2 profiles, 9 components.
- [x] Retire eligible TEST profiles first, then their components, through normal browser controls only: 9 retired; 2 returned to inactive draft with no retirement capability.
- [x] Verify historical pinning, zero new-work TEST authority, real FSRA policy and protected AML state.
- [x] Create infrastructure support pack and append DU–EF evidence; retain CONDITIONAL PASS. No tests, publish, capacity/code/schema/security changes or AML-CLOSE-09.

## EPIC 4 — Enterprise SupTech Convergence & Final Certification

- [x] W0 Rebaseline: HEAD `c093c519783bc29f3319a697c1f295914b463f0e`, clean tree, migration head `20260902213053`, Epic 2 + Epic 3 gates green
- [x] W1 Canonical enterprise work model (`supervisory_work_item`) + My Work as a filter — CERTIFIED (docs/enterprise/suptech-convergence/W6-legacy-retirement-route-convergence.md)
- [x] W2 One enterprise supervisory timeline read model — CERTIFIED (docs/enterprise/suptech-convergence/W6-legacy-retirement-route-convergence.md)
- [x] W3 Final Entity 360 (cross-domain) + retire legacy `entity360_section` AML block — CERTIFIED (docs/epic4/W3_entity_360_certification.md)
- [ ] W4 Escalation convergence (Q-C), conduct investigation decision (Q-D), Governance/F&P feed (Q-E)
  - [x] W4 P0 supervisory question governance: single question catalogue, domain-specific edit authority, assessment-following response RLS, split gap RPC — CERTIFIED (docs/epic4/W4_question_governance.md)
  - [x] W4-A1 Canonical examination route `/supervision/examinations/:id` (domain-derived authorization) + AML examination register enrichment (provenance, risk focus, team, RFIs, workpapers, findings, next action)
  - [x] W4-A2 Plan → intervention (`supervisory_intervention_open`) and intervention → examination (`supervisory_examination_open`) UI flows
  - [x] W4-A3 Examination scoping from approved AML dimensions (`examination_scope_from_assessment`, `EXAMINER_AMENDED` rationale) + exact `examination_origin` provenance on the assessment workspace (no entity+domain inference) — CERTIFIED under W4-A6 closed-loop evidence (`scripts/verify-w4-a6-aml-closed-loop.sql`, 25/25; docs/enterprise/suptech-convergence/EPIC-4-aml-operational-ux-closure.md)
  - [x] W4-A4 AML RFI / workpaper / finding creation from the canonical workspace (`supervisory_finding_create` full provenance) — CERTIFIED (13/13 reconciliation gates R1–R13; closure now blocked while any corrective action is outstanding)
  - [x] W4-A5 Canonical finding workspace `/supervision/findings/:id` (domain-derived authorization, multi corrective action with exact `remediation_action_id`, officer-recorded management response with receipt provenance, closure readiness from every action, independent validation, escalation, enforcement referral, reassessment requirement, merged history) — CERTIFIED (`scripts/verify-epic4-w4a5-residual-response.sql`, 15/15)
  - [x] W4-A6 AML/CFT closed-loop certification (25/25 gates) — CERTIFIED (docs/enterprise/suptech-convergence/EPIC-4-aml-operational-ux-closure.md)
  - [x] AML/CFT persistent demonstration/QA dataset — 24 governed cases, 18/18 verification gates, 6/6 browser specs (docs/enterprise/suptech-convergence/AML-demonstration-dataset.md)
  - [x] AML/CFT calculation configuration architecture + pre-policy closure (docs/enterprise/suptech-convergence/AML-calculation-configuration-implementation.md, AML-calculation-pre-policy-closure.md)
  - [x] AML/CFT calculation policy decision pack — correctness closure (AMLH-09 governed-outcome semantics, CALC-07 half-open boundary, non-calculable provenance, documented engine formula, OUTC-01..10 fixtures) — pack verdict **NOT READY** (docs/enterprise/suptech-convergence/AML-methodology-calculation-decision.md)
  - [ ] AML/CFT inherent question polarity is mixed (decision I blocked) — re-word `BUSINESS_MODEL_RISK/Q1` via a new methodology version, or add per-question polarity
  - [ ] AML/CFT approved assessment dimensions carry no `methodology_dimension_id` (0/80) — governed linkage repair required before any backfill
  - [ ] AML/CFT calculation policy **awaiting supervisory decisions A–O**, maker/checker approval, activation and the 80-dimension recalculation; AMLH-09 + CALC-05/06/09/11 stay open until then — AML FULL MODULE NOT CERTIFIED
- [x] W5 Global dashboard, executive view, portfolio/sector supervision, read-model re-sourcing — CERTIFIED (18/18 gates, `scripts/verify-w5-enterprise-portfolio.sql`; verdict: [docs/supervision/epic-4-w5-a3b-final-verdict.md](docs/supervision/epic-4-w5-a3b-final-verdict.md); convergence record: [docs/enterprise/suptech-convergence/W5-enterprise-dashboard-portfolio-convergence.md](docs/enterprise/suptech-convergence/W5-enterprise-dashboard-portfolio-convergence.md))
- [x] W6 Legacy retirement census + route convergence + enterprise next action + team capacity — CERTIFIED
  - [x] W6-A0 `sup_team_performance` re-sourced onto `supervisory_work_item` (workload facts only, `capacity_methodology = NONE_APPROVED`); Team workload page + dashboard priority widget read the canonical work queue
  - [x] W6-A1 Route convergence: canonical `/supervision/examinations/:id` (legacy `/prudential/examinations/:id` = redirect alias), examination links via `objectRoute`, SLA return links via the canonical filing route, breadcrumb coverage restored to 360/360
  - [x] W6-A2 W1 (work model) and W2 (supervisory timeline) certified as-is; legacy census (14 objects classified) and 24/24 gates in `scripts/verify-w6-legacy-route-convergence.sql`
  - [x] W6-A3 `supervisory_work_item` view now `security_invoker=true` (was owner-rights); permission catalogue snapshot resynced; `enforcement.create` → `enforcement_management.refer`
  - [x] W6-A4 RBAC action coverage restored to 100.0% (2171/2171, 7/7 tests) — mutating sites mapped to real backend permissions, presentation/navigation sites explicitly allow-listed
  - [x] W6-A5 Inspection convergence to the canonical examination engine, `inspections`/`inspection_findings` reclassified RETIRED_EMPTY (writers dropped, write grants revoked), verifier W6-05 hardened beyond row_count, documentation `docs/enterprise/suptech-convergence/W6-legacy-retirement-route-convergence.md`, browser evidence captured
  - [x] W6-A6 Authorization closure: one stated authority for the enterprise supervisory surfaces (`supervisory_spine.view` OR a genuine domain view) enforced identically in `SupervisoryEnterpriseRoute`, `sec_routes`, `sec_navigation_items` and `sup_team_performance`; navigation leak on `nav_sup_portfolio` closed; legacy `app_role` reduced to an audience projection with a canonical internal fallback (Executive Management no longer served the external shell); gates W6-17..W6-24 added → 24/24
- [ ] W7 Certification: 20+ entity dataset, `scripts/verify-epic-4-enterprise-convergence.sql`, personas, Playwright, reconciliation, performance, security, regression matrix
- [ ] W8 Final document `docs/enterprise/suptech-convergence/EPIC-4-enterprise-convergence-final-certification.md` + single verdict

## Proposed programme — Master Platform Convergence & Document Control (architecture locked, not started)

Reference only. Only the items marked complete below are implemented.

- [ ] W0 Architecture lock — [platform master implementation plan](docs/architecture/platform-master-implementation-plan.md), [canonical object register](docs/architecture/canonical-object-register.md), [shared platform services](docs/architecture/shared-platform-services.md), [document control master architecture](docs/dms/03_document-control-master-architecture.md)
- [x] W1A Work / decision architecture lock + central document access & linking contract — [access, linking and search contract](docs/dms/04_document-access-linking-search-contract.md); record picker delivered; five client write families closed by governed operations; maker-checker kernel added
- [ ] W1B Workflow / authority convergence
- [ ] W1C Assignment, delegation, SLA and escalation convergence
- [ ] W1D Enterprise work projection (module-wide work items)
- [ ] W2 Document Control backend — includes the governed "register an uploaded document" operation W1A could not deliver

- [ ] W3 Document Control UX
- [ ] W4 Records & Evidence
- [ ] W5 Licensing + Returns document integration
- [ ] W6 Supervision integration (blocked by the open AML calculation policy decisions A–O)
- [ ] W7 Conduct / F&P / Enforcement integration
- [ ] W8 Enterprise UX / listing migration
- [ ] W9 Legacy convergence
- [ ] W10 Whole-platform certification


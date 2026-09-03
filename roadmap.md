# Roadmap

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
- [x] W5 Global dashboard, executive view, portfolio/sector supervision, read-model re-sourcing — CERTIFIED (18/18 gates, `scripts/verify-w5-enterprise-portfolio.sql`; verdict: [docs/supervision/epic-4-w5-a3b-final-verdict.md](docs/supervision/epic-4-w5-a3b-final-verdict.md); convergence record: [docs/enterprise/suptech-convergence/W5-enterprise-dashboard-portfolio-convergence.md](docs/enterprise/suptech-convergence/W5-enterprise-dashboard-portfolio-convergence.md))
- [ ] W6 Legacy retirement census + route convergence + enterprise next action + team capacity
  - [x] W6-A0 `sup_team_performance` re-sourced onto `supervisory_work_item` (workload facts only, `capacity_methodology = NONE_APPROVED`); Team workload page + dashboard priority widget read the canonical work queue
  - [x] W6-A1 Route convergence: canonical `/supervision/examinations/:id` (legacy `/prudential/examinations/:id` = redirect alias), examination links via `objectRoute`, SLA return links via the canonical filing route, breadcrumb coverage restored to 359/359
  - [x] W6-A2 W1 (work model) and W2 (supervisory timeline) certified as-is; legacy census (14 objects classified) and 16/16 gates in `scripts/verify-w6-legacy-route-convergence.sql`
  - [x] W6-A3 `supervisory_work_item` view now `security_invoker=true` (was owner-rights); permission catalogue snapshot resynced; `enforcement.create` → `enforcement_management.refer`
  - [ ] W6-A4 BLOCKER: repo-wide RBAC action-coverage floor (`src/test/rbac/actionCoverage.test.ts`) is at 99%, not 100% — residual unmarked non-mutating action sites (executive dashboard presentation controls, AI feedback, entity-360 view toggles) still need `data-rbac` audit markers
  - [ ] W6-A5 Remaining: legacy object retirement decision (`inspections`, `inspection_findings`), documentation `docs/enterprise/suptech-convergence/W6-legacy-retirement-route-convergence.md`, browser evidence, final verdict
- [ ] W7 Certification: 20+ entity dataset, `scripts/verify-epic-4-enterprise-convergence.sql`, personas, Playwright, reconciliation, performance, security, regression matrix
- [ ] W8 Final document `docs/enterprise/suptech-convergence/EPIC-4-enterprise-convergence-final-certification.md` + single verdict

# Roadmap

## EPIC 4 — Enterprise SupTech Convergence & Final Certification

- [x] W0 Rebaseline: HEAD `c093c519783bc29f3319a697c1f295914b463f0e`, clean tree, migration head `20260902213053`, Epic 2 + Epic 3 gates green
- [ ] W1 Canonical enterprise work model (`supervisory_work_item`) + My Work as a filter
- [ ] W2 One enterprise supervisory timeline read model
- [x] W3 Final Entity 360 (cross-domain) + retire legacy `entity360_section` AML block — CERTIFIED (docs/epic4/W3_entity_360_certification.md)
- [ ] W4 Escalation convergence (Q-C), conduct investigation decision (Q-D), Governance/F&P feed (Q-E)
  - [x] W4 P0 supervisory question governance: single question catalogue, domain-specific edit authority, assessment-following response RLS, split gap RPC — CERTIFIED (docs/epic4/W4_question_governance.md)
  - [x] W4-A1 Canonical examination route `/supervision/examinations/:id` (domain-derived authorization) + AML examination register enrichment (provenance, risk focus, team, RFIs, workpapers, findings, next action)
  - [x] W4-A2 Plan → intervention (`supervisory_intervention_open`) and intervention → examination (`supervisory_examination_open`) UI flows
  - [x] W4-A3 Examination scoping from approved AML dimensions (`examination_scope_from_assessment`, `EXAMINER_AMENDED` rationale) + exact `examination_origin` provenance on the assessment workspace (no entity+domain inference) — IMPLEMENTED, not yet certified
  - [x] W4-A4 AML RFI / workpaper / finding creation from the canonical workspace (`supervisory_finding_create` full provenance) — CERTIFIED (13/13 reconciliation gates R1–R13; closure now blocked while any corrective action is outstanding)
  - [x] W4-A5 Canonical finding workspace `/supervision/findings/:id` (domain-derived authorization, multi corrective action with exact `remediation_action_id`, officer-recorded management response with receipt provenance, closure readiness from every action, independent validation, escalation, enforcement referral, reassessment requirement, merged history) — IMPLEMENTED, not yet certified
  - [x] W4-A6 AML/CFT closed-loop certification (25/25 gates) — CERTIFIED (docs/enterprise/suptech-convergence/EPIC-4-aml-operational-ux-closure.md)
- [ ] W5 Global dashboard, executive view, portfolio/sector supervision, read-model re-sourcing
- [ ] W6 Legacy retirement census + route convergence + enterprise next action + team capacity
- [ ] W7 Certification: 20+ entity dataset, `scripts/verify-epic-4-enterprise-convergence.sql`, personas, Playwright, reconciliation, performance, security, regression matrix
- [ ] W8 Final document `docs/enterprise/suptech-convergence/EPIC-4-enterprise-convergence-final-certification.md` + single verdict

# 20 — Next EPICs Roadmap

This EPIC 0 delivered documentation only. Below is the recommended sequence.

## EPIC 0.1 — Enterprise Guardrails (2–3 weeks)
- `platform/logger` + ESLint `no-console` outside logger.
- `platform/errors` + `AppError` hierarchy + toast mapper.
- `platform/http/invokeFn` + standard EF result contract (adopted per new EF).
- Correlation-ID propagation (UI → EF → audit).
- ESLint `boundaries` rule enforcing layer imports (warn-only initially).
- CI: coverage threshold (report), security scan (report).
**Exit criteria**: New feature work must use the new abstractions.

## EPIC 0.2 — Returns Feature Carve-Out (Pilot) (3 weeks)
- Move `returns/*` into `features/returns/` with services + repositories.
- Migrate hooks to thin wrappers.
- Add contract tests for repository.
- Prove the pattern; write ADR "How to migrate a feature".

## EPIC 0.3 — Unified Audit Platform (3 weeks)
- Create `audit_events` table + `audit_events_v` view.
- `platform/audit` facade dual-writes.
- Migrate admin AuditExport UI to unified view.
- Central `platform/exports.download` (audit-enforced).

## EPIC 0.4 — Rules Engine Consolidation (3 weeks)
- `platform/rules` façade with pluggable evaluators.
- Migrate `sufficiency_rules`, `field_conditions`, `delegation_rules`, `return_validation_rules` first.
- Admin UI: shared rule editor primitive.

## EPIC 0.5 — Permission Model Hardening (2 weeks)
- Close dynamic-role bypass (TD-010).
- RLS parity tests.
- Complete `permissionRegistry` coverage sweep.

## EPIC 0.6 — Test & CI Uplift (2 weeks)
- Reorganise tests under `features/`.
- Playwright E2E for top 5 journeys.
- Coverage gates blocking.

## EPIC 1 — Feature Deepening (parallel, per domain)
- Licensing, Registration, Fit & Proper, Prudential, Market Conduct, Complaints, Inspections, Investigations, Enforcement — each adopts the new layout by default and closes remaining functional gaps against FRD.

## EPIC 2 — Reporting & Dashboards v2
- Adopt unified audit view.
- Cross-domain analytical dashboards.
- Scheduled report distribution.

## EPIC 3 — AI Layer
- Consolidate AI-assisted flows (application AI assessments, RFI auto-suggest, notification drafting) behind `platform/ai` with Lovable AI Gateway.
- Prompt registry + evaluation harness.

## EPIC 4 — Multi-Regulator & Multi-Tenant Review
- Before onboarding a 3rd regulator, revisit RegulatorContext + RLS + branding.

## Dependency Graph
```text
0 (docs) ──► 0.1 (guardrails) ──► 0.2 (pilot) ──► 0.3 (audit)
                     │                              │
                     ├──► 0.4 (rules) ──────────────┤
                     ├──► 0.5 (permissions) ────────┤
                     └──► 0.6 (tests) ──────────────┴──► EPIC 1..N
```

## Estimated Total to "Enterprise Baseline"
~12–14 engineering weeks for EPIC 0.1 → 0.6 with 2 senior + 2 mid engineers, before feature EPICs proceed at full velocity.

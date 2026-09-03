# EPIC 4 / W6 — Legacy retirement, route convergence, inspection convergence

Verdict: **W6 — NOT CERTIFIED** (2 authorization blockers found by browser certification; all other gates green).

## 1. W1 / W2 certification

- **W1 canonical work model** — CERTIFIED. `supervisory_work_item` carries 8 work scopes, unique `work_key`, every item routable; My Work is a filter over it (gates W6-09, W6-11).
- **W2 supervisory timeline** — CERTIFIED. One read model with full provenance (155 events on the reference entity, gate W6-12).
- Evidence: `scripts/verify-w6-legacy-route-convergence.sql` W6-01 … W6-16 → **16/16 PASS**.

## 2. Legacy census (14 objects)

| Object | Disposition |
| --- | --- |
| `inspections` | RETIRED_EMPTY (was wrongly DEAD_RETIRABLE) |
| `inspection_findings` | RETIRED_EMPTY (was wrongly DEAD_RETIRABLE) |
| `entity_risk_scores` | HISTORICAL |
| `prudential_actions`, `prudential_escalations` | LEGACY_STILL_READ |
| `examination_findings` | HISTORICAL |
| `conduct_interventions`, `supervisory_plans` | COMPATIBILITY_ADAPTER |
| `supervisory_work_item`, `supervisory_timeline_event` | CANONICAL_READ_MODEL |
| `supervisory_finding`, `supervisory_remediation_action`, `examinations`, `entity_risk_state` | AUTHORITATIVE |

## 3. Inspection reader / writer census (before convergence)

READERS: `pages/inspections/InspectionsList.tsx`, `InspectionsCalendar.tsx`, `InspectionDetail.tsx`, `components/entity-detail/InspectionsTab.tsx`, `hooks/useSupervisoryMetrics.ts` (3 counts), `pages/analytics/AlertCenter.tsx`, `components/prudential/RiskScoreExplainer.tsx` (link).
WRITERS (UI): `inspectionCreate`, `inspectionLifecycleSave`, `inspection_finding_save`, `inspection_finding_escalate`.
DB WRITERS: `inspection_create`, `inspection_lifecycle_save`, `inspection_finding_save`, `inspection_finding_escalate`.
ROUTES: `/inspections`, `/inspections/schedule`, `/inspections/:id` (`<M module="inspection_management">`).
STORED LINKS: none in the work model / timeline (gates W6-06, W6-16 emit canonical routes only).
DATA: `inspections` = 0 rows, `inspection_findings` = 0 rows.

## 4. Convergence performed

- Canonical activity engine only: `examinations` (engagement taxonomy `FULL_SCOPE_ONSITE / TARGETED_ONSITE / OFFSITE_REVIEW / FOLLOW_UP_REVIEW / JOINT_EXAMINATION / THEMATIC_EXAMINATION`) → scope → RFI / evidence / workpaper → `supervisory_finding` → remediation → validation → reassessment. No examination-v2 / inspection-v2 was created.
- Legacy inspection pages deleted; Entity 360 inspection tab replaced by `EntityExaminationsTab`.
- New canonical `/supervision/examination-schedule` (scheduled examinations by fieldwork start) replaces the inspection calendar.
- Compatibility routes: `/inspections` → `/prudential/examinations`; `/inspections/schedule` → `/supervision/examination-schedule`; `/inspections/:id` → explicit **read-only retirement notice** (never silently resolves a legacy id against an unrelated canonical record).
- Re-sourced readers: supervisory metrics and Alert Center overdue activity now read `examinations`; risk-score explainer links to the canonical register.
- Writers retired: all four `inspection_*` database functions dropped; INSERT/UPDATE/DELETE/TRUNCATE revoked from `anon`, `authenticated`, `service_role` on both tables; no dual write, no sync trigger.
- Enforcement: no automatic referral from finding severity. `inspection_finding_escalate` was removed rather than retained; inspection-derived referral is only the governed human action on the canonical finding workspace (`enforcement_management.refer`).
- Retirement classification: **RETIRED_EMPTY** — zero rows, zero code readers, zero code writers, zero DB writers, zero write grants, no route dependency beyond documented compatibility routes. Physical `DROP` deferred.

## 5. Verifier hardening (item 10)

`scripts/verify-w6-legacy-route-convergence.sql` W6-05 no longer accepts `row_count = 0` as retirement proof. It now requires: zero rows, zero DB writer functions targeting either table, zero write privileges for `anon`/`authenticated`/`service_role`, and populated canonical replacements (`examinations`, `supervisory_finding`). Re-run: **16/16 PASS**.

## 6. RBAC action coverage

`src/test/rbac/actionCoverage.test.ts` → **2171/2171 protected (100.0%)**, 7/7 tests pass. Residual sites were classified A (business/mutating → real backend permission, e.g. `supervisory_spine.edit`, `aml_supervision.approve`, `enforcement_management.refer`), B (authorized view → `module.view`; AI feedback mutations mapped to `report_management.view`, the permission the `ai_insights` feedback policies actually require), C/D (presentation & navigation → explicit benign allow-list / scoped-class entries in `src/lib/rbac/audit.ts`). No invented business permissions; the floor was not lowered.

## 7. Other W6 fixes

- Security defect: `supervisory_work_item` view ran with owner rights → now `security_invoker = true` (gate W6-14).
- Permission catalogue corrected: `enforcement.create` → `enforcement_management.refer`.
- `sup_team_performance` re-sourced onto the canonical work model (workload facts only, `capacity_methodology = NONE_APPROVED`).
- Route convergence: canonical `/supervision/examinations/:id`; `/prudential/examinations/:id` is a documented redirect alias; SLA return links use the canonical filing route.

## 8. Browser certification (real evidence, `/tmp/browser/w6/result.json`)

Routes probed per persona: `/my-work`, `/supervision/portfolio`, `/entities/:id`, `/supervision/examinations/:id`, `/supervision/findings/:id`, `/supervision/team-performance`, `/prudential/payment-systems`, legacy `/prudential/examinations/:id`, `/inspections`, `/inspections/schedule`, `/inspections/:id`, `/supervision/examination-schedule`.

| Persona | Result |
| --- | --- |
| Prudential Supervisor | all routes render; legacy exam route redirects to canonical; `/inspections` → `/prudential/examinations`; `/inspections/schedule` → `/supervision/examination-schedule` |
| AML/CFT Supervision Officer | all routes render, redirects correct |
| Conduct Supervisor | conduct surfaces render; prudential examination / team workload / payment systems correctly denied |
| Payment Systems Supervisor | payment systems, portfolio, schedule render; prudential finding & entity 360 denied |
| Read-only internal | every supervisory surface denied except `/my-work` |
| Unauthorized internal (Returns Officer) | **BLOCKER** — `/supervision/portfolio` and `/supervision/team-performance` render although the server reports `has_permission(prudential_supervision, view) = false` |
| Executive Management | **BLOCKER** — account has no internal role mapping, so it is served the external portal shell; every executive/supervisory route is denied |
| External licensee (Primary User) | supervisory portfolio, examination, finding, team workload, `/inspections`, `/supervision/examination-schedule` all denied on direct URL entry |

No runtime/page errors and no non-warning console errors on any persona.

## 9. Regression matrix

| Suite | Result |
| --- | --- |
| W6 gates (`verify-w6-legacy-route-convergence.sql`) | 16/16 PASS |
| W5 enterprise portfolio | 18/18 PASS |
| W4-A5 residual response | 15/15 PASS |
| W4-A6 AML closed loop | 25/25 PASS |
| RBAC action coverage | 2171/2171 (100.0%) |
| Breadcrumb route coverage | 360/360 |
| Typecheck / build | clean |
| Security linter | baseline unchanged (no new findings from the retirement migration) |

## 10. Deferred / open

1. Physical `DROP TABLE public.inspections`, `public.inspection_findings` (RETIRED_EMPTY, safe once a full release cycle passes with no compatibility hits).
2. Navigation labels `nav_sup_inspections*` still point at the compatibility routes; relabelling requires a `sec_navigation_items` migration plus snapshot regeneration.
3. **Blocker A** — route authorization for `/supervision/portfolio` and `/supervision/team-performance` admits internal users without `prudential_supervision` permission (`SupervisoryPortfolioGate` module resolution / `ModuleRoute` module-access fallback).
4. **Blocker B** — the Executive Management identity has no internal role mapping and is served the external portal, so the certified W5 executive surfaces are unreachable for that persona.

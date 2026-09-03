# EPIC 4 / W5 — Enterprise dashboard, portfolio & sector supervision convergence

Status: **IN PROGRESS** (census complete, read models implemented, certification pending)

Baseline: Epic 2 certified, Epic 3 certified, W3 certified, W4 (P0, A1–A6) certified,
AML demonstration dataset certified. W1 (`supervisory_work_item` / `supervisory_work_queue`)
and W2 (`supervisory_timeline`) are live and are treated as canonical inputs here.

---

## 1. Source census — every dashboard figure, before any change

### 1.1 Executive dashboard (`executive_dashboard_snapshot` → `..._capture`)

| Figure | Source before W5 | Canonical? | Disposition |
|---|---|---|---|
| open/total applications | `application_work_queue_counts` | yes (licensing module truth) | keep |
| active/issued licences | `licenses` | yes | keep |
| open/current breaches | `v_prudential_current_breaches` | yes (returns metric truth) | keep |
| open enforcement, penalties | `enforcement_actions` | yes | keep |
| upcoming inspections | `inspections` | **legacy** — parallel to `examinations` | superseded by canonical engagement counts |
| open complaints | `complaints_dashboard_counts` | yes | keep |
| fit & proper active | `fp_individuals` | yes | keep |
| critical/high risk entities | `entity_risk_scores (is_current)` | **legacy** — parallel to `entity_risk_state` | superseded: risk distribution now from `entity_risk_state` per domain |
| open prudential actions | `prudential_actions` | **legacy** — parallel to `supervisory_attention` / `supervisory_remediation_action` | superseded by canonical attention + remediation |
| open prudential escalations | `prudential_escalations` | **legacy** — parallel to `supervisory_attention` | superseded by canonical attention |
| open conduct alerts | `conduct_alerts` | yes (conduct signal truth) | keep |
| returns pending/overdue | `returns_supervisory_summary` | yes | keep |
| risk band chart | `entity_risk_scores` | **legacy** | superseded |

Conclusion: the executive KPI strip is *licensing/returns/complaints correct* but its
**supervisory** figures (risk, actions, escalations, engagements) were read from the
pre-spine tables. W5 does not delete the strip — it adds one canonical enterprise
supervisory position block sourced only from the spine, and marks the legacy figures
as legacy provenance in the snapshot itself.

### 1.2 Supervisory (operational) dashboard

| Panel | Source before W5 | Canonical? |
|---|---|---|
| summary strip | `useSupervisoryMetrics` (module counts) | module truth, keep |
| supervisory truth strip | `sup_dashboard_summary` | yes |
| prudential tiles | `prudential_dashboard_metrics` | legacy-parallel |
| conduct tiles | `conduct_mi_dashboard` | yes |
| F&P tiles | `fpa_dashboard_metrics` | yes |
| priority queue | `SupervisoryPriorityQueueWidget` | module-derived |

W5 adds the canonical **enterprise work position** (from `supervisory_work_queue`)
so an officer's dashboard and `/my-work` can never disagree.

### 1.3 Portfolio / sector supervision

No enterprise portfolio read model existed. Portfolio-like screens were
domain-siloed: `/supervision/aml/entities` (`aml_portfolio`), `/prudential/entities`
(`prudential_dashboard_portfolio`), `prudential_sector_risk_distribution`.
Neither respected the AML applicability perimeter for non-AML domains, and neither
could answer "which entities are of concern in more than one domain".

---

## 2. What W5 implements

### 2.1 `public.sup_domain_readable(_uid, _domain_code)`
Domain-level read authority. `supervisory_spine.view` grants the enterprise
cross-domain view; otherwise each domain requires its own module view permission
(`prudential_supervision.view`, `aml_supervision.view`, `market_conduct.view`,
`fit_and_proper.view` for GOVERNANCE). Every W5 read model filters domains through it,
so an AML officer never receives prudential supervisory content and vice versa.

### 2.2 `public.supervisory_portfolio(...)` — entity-level enterprise portfolio
One row per entity the caller may see (RLS applies — `SECURITY INVOKER`), each with:
per-domain applicability (`supervisory_domain_applicable`), residual rating and trend
from `entity_risk_state` / `entity_risk_state_movement`, open/high/critical findings,
overdue remediation, validation pending, active examination / plan / intervention,
open attention priority, reassessment requirement, active enforcement, plus the
canonical next action from `supervisory_work_item`. Filters: domain, sector, rating,
priority, team, concern-in-multiple-domains, overdue remediation, reassessment due,
assessment overdue, search. No figure is derived in the browser.

### 2.3 `public.supervisory_sector_overview(_domain)` — sector supervision
Per sector and domain: perimeter denominator (entities in perimeter vs excluded),
assessed vs unassessed, rating distribution, overdue assessments, open findings,
overdue remediation, open attention, active engagements, enforcement.

### 2.4 `public.enterprise_supervisory_overview(_sector_id, _window_days)`
The enterprise supervisory position for the executive view: risk distribution by
domain, cross-domain concern count, programme delivery (plans / interventions /
examinations), findings and remediation health, reassessment backlog, enforcement,
payment systems & PFMI oversight, and the work position (open / overdue / unassigned /
decision points) — every figure attributed to its canonical source object.

### 2.5 UI
* `/supervision/portfolio` — Enterprise Supervisory Portfolio (entity and sector tabs).
* Executive dashboard gains the canonical **Enterprise supervisory position** block.
* Supervisory dashboard gains the canonical **work position** strip.
* Every figure drills through to the canonical record route.

---

## 3. Verification

`scripts/verify-w5-enterprise-portfolio.sql` — gates W5-01 … W5-18 (perimeter
denominators, rating provenance, cross-domain concern, RBAC domain isolation,
reconciliation against Entity 360 and the work queue, PFMI coverage, performance).

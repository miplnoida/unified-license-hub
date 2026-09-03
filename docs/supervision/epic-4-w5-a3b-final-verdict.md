# EPIC 4 — W5 ENTERPRISE PORTFOLIO CONVERGENCE
## W5-A3B — Performance, Browser Certification, Final Verdict

Date: 2026-09-03

## 1. Blockers closed this wave

| Blocker | Root cause | Fix |
|---|---|---|
| Intervention case file failed to open | The `conduct_interventions` compatibility view was missing spine columns (`domain_code`, `examination_id`, `thematic_review_id`, `investigation_id`) that `conduct_intervention_case()` selects. | View realigned to the spine projection. |
| View lost row level security | The column realignment replaced the view and silently dropped `security_invoker = true`, which every sibling `conduct_*` view carries. | `ALTER VIEW public.conduct_interventions SET (security_invoker = true)`. |
| Portfolio latency | `public.supervisory_portfolio` used correlated per-entity subqueries. | Rewritten as set-based CTE aggregation. |
| **Licensee users could read supervisory truth (W3-17)** | `sup_read_guard()` fell back to a permission check for internal officers who hold only granular business permissions. Licensee portal roles legitimately hold `returns_management.view` / `license_management.view` for their own records, so a `licensee_primary` account was classified as internal. | The permission fallback now applies only to accounts that are not external portal identities (no mapped regulated entity, no `applicant` / `pre_licensee` / `licensee_primary` / `licensee_secondary` role). Role-based internal staff are unaffected. |

The access-control defect was pre-existing and is not a W5 regression, but it invalidated the internal-only guarantee behind every W5 read model, so it is closed here.

## 2. Performance (W5-17, budget 4000 ms)

| Surface | Latency |
|---|---|
| Enterprise dashboard | 131 ms |
| Portfolio — entity grain | 1533 ms |
| Portfolio — sector grain | 510 ms |
| Multi-domain entity | 1501 ms |
| Entity 360 | 30 ms |

Every surface answers in one governed round trip.

## 3. Certification results

| Suite | Result |
|---|---|
| `verify-w5-enterprise-portfolio.sql` | 18/18 PASS |
| `verify-epic-4-w3-entity-360.sql` | PASS (incl. W3-17 external denial) |
| `verify-epic-2-supervisory-spine.sql` | 18 PASS |
| `verify-epic-3-aml-closed-loop.sql` | 22 PASS |
| `verify-w4-a6-aml-closed-loop.sql` | 25 PASS |
| `verify-epic4-w4a4-examination-finding.sql` | 16 PASS |
| `verify-epic4-w4a4-reconciliation.sql` | 14 PASS |
| `verify-epic4-w4a5-residual-response.sql` | 15 PASS |
| `verify-w4-question-governance.sql` | 8 PASS |
| `verify-aml-demo-dataset.sql` | 18 PASS |
| `verify-f8-w2a-payment-incidents.sql` | 19 PASS |
| `verify-f8-w2b-pfmi-assessment.sql` | 25 PASS |
| `verify-f8-w3a-stress-events.sql` | 21 PASS |
| `verify-f8-w1d-prudential-config-governance.sql` | 9 PASS |
| DMS Phase 4 / audit contract | PASS |
| Typecheck + build | clean, `build OK` |
| Security linter | 1591 issues / 6 types — identical to the pre-wave baseline, no new findings |

## 4. Browser certification (internal supervisor persona)

| Route | Result |
|---|---|
| `/supervision/portfolio` | renders, no console errors |
| `/conduct/interventions/:id` | renders the full case file (SI-2026-00231, decision trail, canonical examination link) |
| `/entities/:entityId` (Entity 360) | renders, no console errors |
| `/supervision/aml/work-queue` | renders, no console errors |

## 5. Verdict

**EPIC 4 — W5 ENTERPRISE PORTFOLIO CONVERGENCE: CERTIFIED.**

No enterprise supervisory KPI depends on legacy supervisory truth (W5-18 census: all seven legacy sources non-participating).

## 6. Related records

- Convergence record: [docs/enterprise/suptech-convergence/W5-enterprise-dashboard-portfolio-convergence.md](../enterprise/suptech-convergence/W5-enterprise-dashboard-portfolio-convergence.md)
- Roadmap: `roadmap.md` — EPIC 4 / W5 marked CERTIFIED
- Browser evidence executed for the internal supervisor persona only (see section 4).

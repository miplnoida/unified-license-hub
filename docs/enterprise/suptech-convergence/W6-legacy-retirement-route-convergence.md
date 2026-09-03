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
| W6 gates (`verify-w6-legacy-route-convergence.sql`) | 24/24 PASS |
| Unit / integration suites (`src/test`) | 1324/1324 PASS (149 files) |
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
3. Relabelling of the `/inspections*` compatibility navigation entries (cosmetic).

---

## 11. W6-A6 — Authorization closure (both blockers resolved)

### 11.1 Blocker A — enterprise supervisory route authority

**Reproduced parity table** (before the fix):

| Surface | Route guard authority | Navigation authority | Backend read-model authority |
| --- | --- | --- | --- |
| `/supervision/portfolio` | first of `prudential_supervision` / `aml_supervision` / `market_conduct` / `fit_and_proper` with module access, **falling back to `prudential_supervision`** | `nav_sup_portfolio` — **no required permission at all** | `supervisory_portfolio` (domain-scoped) |
| `/supervision/team-performance` | `prudential_supervision.view` | `nav_supervision_team_performance` → `prudential_supervision.view` | `sup_team_performance` → super_admin **or `admin_dashboard.view` or `report_management.view` or `employee_management.view`** |

Two genuine defects, both stated (not guessed):

1. **Navigation leak.** `nav_sup_portfolio` carried no `required_permission_id`, so
   "Portfolio & Sector Supervision" rendered in the sidebar and command search for
   *every* internal identity, including a Returns Officer with no supervisory
   authority. The route itself denied them — the leak was in the menu, not the data.
2. **Backend / route divergence.** `/supervision/team-performance` required
   `prudential_supervision.view`, but the `sup_team_performance` read model accepted
   *generic reporting or staff-directory* authority. Two different answers to the
   same authorization question.

The `?? 'prudential_supervision'` module fallback in `SupervisoryPortfolioGate` was a
latent defect of the same family: an identity with no supervisory authority was
silently evaluated against a domain it has nothing to do with.

**Closure — one stated authority, three enforcement points:**

```
super_admin / break-glass
OR supervisory_spine.view                     (enterprise supervisory read)
OR one genuine domain view: prudential_supervision | aml_supervision
                          | market_conduct | fit_and_proper
```

- Frontend: `src/routes/SupervisoryEnterpriseRoute.tsx` — explicit predicate, internal
  audience required, **no default-module fallback**; `AccessDenied` otherwise. Both
  routes in `dashboardRoutes.tsx` now use it.
- Route registry: `sec_routes` rows for both paths (the portfolio path had none) gated
  on `supervisory_spine.view`, `audience = internal`, `is_protected`.
- Navigation: `nav_sup_portfolio` and `nav_supervision_team_performance` gated on
  `supervisory_spine.view` — the leak is closed at source, then regenerated into
  `src/lib/breadcrumbs/navigationSnapshot.ts`.
- Backend: `public.sup_team_performance` re-guarded in place on the *same* predicate;
  `admin_dashboard` / `report_management` / `employee_management` authority removed.
- `ROUTE_MODULE_MAP` now states `supervisory_spine` for both paths (and the previously
  unmapped `/supervision/examination-schedule`), so `canAccessPath` agrees with the guard.

Access was **not** widened to make screens green: Executive Management was granted the
read-only enterprise permission through the governed catalogue (template **and** live
role), and nothing else changed.

### 11.2 Blocker B — Executive Management served the external shell

**Root cause (stated, not guessed):** `resolveUserRole` in `src/lib/authHelpers.ts`
returns `applicant` when an identity has **no row in the legacy `public.user_roles`
table**. The Executive Management certification identity is assigned only in the
canonical catalogue (`sec_user_roles`), so its legacy audience projection collapsed to
`applicant` and the app rendered the **external licensee shell** (My Licences / My
Returns / My Payments), making the certified W5 executive surfaces unreachable.

**Fix:** `app_role` is now treated explicitly as an *audience projection*, not as
authority. When no legacy row exists, the resolver consults
`sec_get_user_context()`; if any canonical role is `role_type = 'internal'` it projects
the **least-privileged** internal role (`analyst`). Permissions still come exclusively
from the canonical context. No user, email or UUID is special-cased, and a
non-internal identity still projects to `applicant`.

### 11.3 New verifier gates

`scripts/verify-w6-legacy-route-convergence.sql` — W6-17..W6-24:

| Gate | Assertion |
| --- | --- |
| W6-17 | `supervisory_spine.view` exists in the permission catalogue |
| W6-18 | both enterprise supervisory routes registered, internal, protected, gated on it |
| W6-19 | no navigation leak — both nav entries carry the same permission as the route |
| W6-20 | `sup_team_performance` requires supervisory authority and no longer accepts reporting / staff-directory / admin-dashboard authority |
| W6-21 | `executive_management` holds `supervisory_spine.view` on template **and** live role |
| W6-22 | negative parity — a Returns Officer identity is refused by the same predicate |
| W6-23 | executive enterprise supervisory authority is read-only (no mutating action) |
| W6-24 | no protected `/supervision/*` route is left without a required permission |

Result: **24/24 PASS**.

### 11.4 Browser evidence (re-certification)

| Identity | `/dashboard` | `/supervision/portfolio` | `/supervision/team-performance` | Sidebar |
| --- | --- | --- | --- | --- |
| Executive Management | internal shell (My Work, Supervision, Insights & Reporting, Executive Dashboard) | renders | renders | Portfolio & Team Performance present |
| Returns Officer (non-supervisory internal) | internal returns shell | **Access Denied** | **Access Denied** | neither entry present |

No console or runtime errors beyond the two pre-login `401`s from the anonymous
bootstrap requests (present on the certified baseline).

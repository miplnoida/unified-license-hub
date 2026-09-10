# AML-10 — Server-Authoritative AML Portfolio Risk and Management Reporting

## Architecture reuse

No new risk, assessment, monitoring, consequence or reporting source table was created. AML-10 is a
read model only: `supervisory_portfolio_internal` derives everything from canonical records —
`entity_risk_state` / `entity_risk_state_movement`, AML-07 `supervisory_assessment_risk_publication`,
AML-08 `supervisory_consequence_decision`, AML-09 `supervisory_risk_monitoring_view`,
`supervisory_reassessment_requirement`, and `supervisory_finding` / `examinations` /
`supervisory_intervention` / `enforcement_actions` for exposure.

`supervisory_portfolio_report` serves the screen and `supervisory_portfolio_export` serves the
management export; both call the same internal read model, so export and screen totals cannot
diverge for the same filters and as-of date.

## Authority and scope

Authentication is required. Authority is the existing `aml_supervision.view` or
`supervisory_spine.view` permission (or super admin). Visibility is decided server-side by
`supervisory_monitoring_scope_admits` — regulator, domain and supervisory perimeter. The internal
helper is revoked from `PUBLIC`, `anon` and `authenticated`; only the two governed entry points are
executable by signed-in users.

## Provenance buckets

`CALCULATED`, `APPROVED_OVERRIDE`, `LEGACY`, `NOT_CALCULABLE`, `NO_RISK`. Legacy and not-calculated
records are reported in their own buckets and are never placed in a calculated risk band. Where no
risk-of-record exists no rating or band is inferred, and a reason code is published instead.

## Review status

Read from the AML-09 monitoring model, never re-derived: `CURRENT`, `DUE`, `OVERDUE`,
`EVENT_TRIGGERED`, `UNSCHEDULED`, `BLOCKED`, `LEGACY`. An as-of request restates `CURRENT` / `DUE` /
`OVERDUE` against the requested date using the same server rule; no review interval is assumed.

## Trends

Movement counts and rows come only from the immutable `entity_risk_state_movement` history within
the requested period. Historical positions are never reconstructed from current records. Direction
is mapped from the recorded trend (`DETERIORATING` → `UPWARD`, `IMPROVING` → `DOWNWARD`, `STABLE` →
`UNCHANGED`, otherwise `UNCLASSIFIED`).

## Confidentiality

Restricted or confidential supervisory matters are excluded from every count and reported as
presence only (`restricted_matter_present`) with a `RESTRICTED_SOURCE_WITHHELD` reason code. No
restricted content is disclosed.

## Filters

Domain, as-of date, trend period, regulator, sector, risk code, provenance, monitoring state,
assessment status, programme, consequence action type, effective-from/to and review-from/to are all
applied server-side. Row output is capped (default 500, max 2000) and truncation is disclosed while
totals still cover the full scoped population.

## Surface

`/supervision/aml/portfolio` — `AmlPortfolio` page with `AmlPortfolioReport`. Reporting only: it
creates no supervisory record and takes no supervisory decision. Operational work stays on the AML
work queue, the AML-09 due review list and the entity AML view.

## Certification results

- UI suite `src/test/amlPortfolioReporting.test.tsx`: 27 passed / 0 failed.
- Frontend boundary `scripts/verify-aml-portfolio-frontend-boundary.mjs`: 33 passed / 0 failed
  (SOURCE 4, VISIBILITY 3, TOTALS 5, CLASSIFY 5, DATES 2, FILTERS 3, EXPORT 4, SURFACE 4, SINGLE 3).
- Typecheck clean; build OK.
- Canonical risk digest unchanged: `8385b6c8f7ba2b4102ab054c8f5ac686`.

## Outstanding certification (not yet run)

- `scripts/verify-aml-portfolio-reporting.sql` (AML10CERT rollback-scoped behavioural SQL verifier).
- Action/RBAC coverage, security linter delta review and the full two-worker integration suite.
- Three-run release certification remains deferred to the final AML module release lock.

## Preservation

Risk ratings, risk history, publications, monitoring decisions, consequence decisions, programme
configuration and v1.0 / v1.1 methodology state are untouched. No calculation policy, risk band,
review interval or portfolio threshold was authored.

## Final certification evidence (fast certification lock)

- SQL behavioural verifier `scripts/verify-aml-portfolio-reporting.sql`, one transaction, `ON_ERROR_STOP`, AML10CERT fixtures, final ROLLBACK: **46/46 passed, 0 failed** — PORT 8, EXPO 7, TREND 5, FILTER 9, EXPORT 7, SEC 8, ROLLBACK 2.
- Rollback proof: zero surviving AML10CERT consequence decisions, monitoring decisions, reassessments, findings, plans, assessments, methodologies, risk movements and audit events; zero older certification fixtures. Assessments, risk states/movements, monitoring schedules, consequences, supervisory actions, policies and regulators unchanged.
- Genuine defects corrected during certification: server-side spreadsheet-formula neutralisation for governed exports (`supervisory_export_text_safe`, `csv_injection_neutralised`).
- Frontend gates: AML-10 UI 27/27; AML-10 boundary 33/33. React calculates no totals, buckets, trends, monitoring states, exposure, filter results or export values.
- RBAC and security: backend hardening verifier passed; RBAC parity OK (46 scope tuples); authorisation/RBAC suites 14 files / 119 tests; action governance 11/11. No new AML-10 finding; remaining advisories are inherited/shared.
- One canonical two-worker integration suite: 173 files, 1678 passed, 0 failed, 0 skipped, 315.9s.
- Typecheck clean; production build `build OK`. No new warnings.
- Preservation: risk rating changed NO; risk history rewritten NO; assessment changed NO; monitoring schedule changed NO; supervisory action created NO; calculation policy authored NO; portfolio threshold invented NO; cross-regulator data exposed NO; v1.0 changed NO; v1.1 changed or activated NO; LINK-11 rewritten NO; AML data deleted NO. Canonical digest remains `8385b6c8f7ba2b4102ab054c8f5ac686`.
- Final three-run release certification: deferred to the AML module release lock.
- AML-11 readiness: YES.

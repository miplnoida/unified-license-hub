# OS-02C — Continuous Monitoring: canonical scope convergence closure

Scope: `supervisory_monitoring_register` / `..._options` and the Continuous
Monitoring screen. No monitoring business table, monitoring case, second work
queue or second risk model was created. Methodology Administration untouched.

## Convergence position

| Question | Authority |
| --- | --- |
| Which domains may the reader see? | `sup_read_guard` / `sup_domain_readable` |
| Which entity × domain pairs? | `public.regulatory_scope_allows` (permission → role scope → portfolio → mandate) via `public.supervisory_domain_modules` |
| Is the domain applicable to the entity? | `public.supervisory_domain_applicable` |
| Who owns the entity for this domain? | `public.supervisory_domain_assignment` (function-scoped assignment first, then a permitted function-unscoped legacy row) |

The register re-implements none of these: it holds no local copy of role scope,
portfolio, mandate, assignment or team logic. The filter option lists are built
from the same authorised population as the rows, so a picker can never name a
regulator, sector or team the reader may not read.

## Truthfulness

- Ownership is domain-specific; an assignment held for another regulatory
  function is never displayed or used for filtering. Where only a legacy
  entity-level assignment exists, the row is marked
  `ENTITY_LEVEL_UNSCOPED` and the UI states it is not specific to the
  supervisory area.
- Filing measures are entity-level and de-duplicated
  (`entities_with_filing_issues`, `filing_metrics_basis = ENTITY_LEVEL_ONLY`);
  the domain-multiplied `returns_late` / `returns_missing` measures are gone.
- Ratings, assessments, reassessment dates, signals, attention, engagements,
  findings, remediation and work items are rendered only where a canonical
  record exists. `active_offsite_reviews` is genuinely `0` — production holds
  28 examinations and no `OFFSITE_REVIEW`.

## Verification

`scripts/verify-supervisory-monitoring-register.sql`, executed against the live
database inside a transaction that rolls back: **MON-01…35 — 35 PASS / 0 FAIL.**

OS-02C gates added by this closure:

| Gate | Proves |
| --- | --- |
| MON-26 | Scope is a thin delegation; 192 persona × domain × entity probes identical to `regulatory_scope_allows` |
| MON-27 / MON-28 | `assigned` scope is regulatory-function specific; another function's assignment never admits |
| MON-29 | Team coverage is function specific |
| MON-30 | Staff portfolio narrowing enforced (regulator-wide grant narrowed to the portfolio sector) |
| MON-31 | Mandate narrowing: inert before activation, fail-closed once `ACTIVE`, restored to the mandated dimensions |
| MON-32 | Option lists drawn from the authorised population only |
| MON-33 | Domain owner precedence is function-correct |
| MON-34 | Filing counts remain entity-level and never track the domain-multiplied row count |
| MON-35 | Scope evaluation performs zero persistent writes |

Typecheck and build clean.

# PCOMP-R2B — Judgement & Rating Override Policy Runtime

Baseline HEAD at start of wave: `8049a02df43975aeed50413a76dd4faadee89cc5` (clean tree).

## Scope

JUDGEMENT_POLICY is now the second generic policy family with runtime behaviour,
after EVIDENCE_POLICY. The remaining eight (sector overlay, facts, sources,
materiality, response, SLA, dashboard, notification) stay configuration-only.

No policy values, ratings, published risk, historical assessments, demo records
or active regulator policy content were changed.

## Server contract

- Rating ordering is methodology-owned (`supervisory_methodology_rating_order`),
  taken from the methodology's own scoring scale, not from a global list.
- `supervisory_judgement_policy_rules()` normalises direction, governed ratings,
  prohibited targets, movement limit and rationale minimum, and clamps nonsense
  values. Independent approval cannot be switched off by policy.
- `supervisory_judgement_policy_content_errors()` refuses indeterminate rule
  sets (two rules for one calculated rating, two catch-all rules, duplicate rule
  references) and self-contradictory rules.
- `supervisory_judgement_policy_compatibility()` reports unknown ratings,
  impossible movement limits and rules under which no target is reachable; the
  profile compatibility check delegates to it.
- The evaluator `supervisory_assessment_judgement_policy_internal()` is
  service-role only and resolves policy exclusively through the assessment's
  immutable policy basis snapshot. It returns `EVALUATED`, `NOT_GOVERNED` or
  `UNAVAILABLE`, the applicable rule and each candidate target rating with a
  server-decided `permitted` flag.
- `supervisory_calculation_override_propose()` refuses departures the policy
  does not permit: wrong direction, too many rating steps, prohibited target,
  rationale shorter than the policy minimum. Each proposal permanently records
  the policy version, profile version, rule reference, direction, step count,
  limit and rationale minimum it was judged against.
- `supervisory_calculation_override_decide()` enforces independent approval,
  approval or configuration authority in the domain, finality of a decision and
  a written reason on rejection.
- Direct insert, update and delete on the override register are refused; a guard
  trigger admits only the governed operations.

## Read models

- `supervisory_assessment_judgement_policy_view(uuid)` — evaluation, override
  history with policy provenance and server-owned capabilities.
- `supervisory_judgement_policy_authoring_options(uuid)` — platform directions
  plus the methodology-owned rating vocabulary.

## Certification evidence

| Gate set | Result |
|---|---|
| `scripts/verify-pcomp-r2b-judgement-policy.sql` | **63/63 PASS**, 9/9 rollback preservation checks (components, assessments, overrides, calculation runs, movements, publications, risk digest, no fixture survivors) |
| `scripts/verify-pcomp-r2a-evidence-policy.sql` | 50/50 PASS |
| `scripts/verify-pcomp-r1-effective-policy-spine.sql` | 51/51 PASS |
| `scripts/verify-supervisory-policy-components.sql` | 22/22 PASS |
| `scripts/verify-aml-calculation-policy-engine.sql` (AML-06) | PASS |
| `scripts/verify-aml-assessment-review-risk-publication.sql` (AML-07) | PASS |

## Inherited verifier corrections made in this wave

- Legacy calculation-policy fixtures in seven verifier scripts did not state
  `completeness_mode`, which a previous wave made a required policy decision.
  The fixtures now state it. No production policy value was set.
- The AML-07 rollback gate demanded zero review, approval-decision and
  publication rows globally, which contradicts the genuine published SCEN-06
  record. It now compares against a pre-transaction census.
- The R1C and R2A capability gates now expect eight configuration-only areas.
- Override decision authority previously resolved an action name the permission
  catalogue does not publish; it now uses the domain's real approval permission
  with configuration authority as an alternative.

## Capability state

| Area | Runtime consumed |
|---|---|
| EVIDENCE_POLICY | true |
| JUDGEMENT_POLICY | true |
| SECTOR_OVERLAY, FACT_CONFIG, SOURCE_BINDING, MATERIALITY_POLICY, RESPONSE_POLICY, SLA_POLICY, DASHBOARD_POLICY, NOTIFICATION_POLICY | false |

## Honest limitations

- The preserved calculated assessment `SUP-AML_CFT-2026-00744` has no policy
  basis, so it correctly reports `NOT_GOVERNED / NO_POLICY_BASIS`; the
  platform's own override controls continue to apply to it.
- No judgement policy screen work is included in this wave; the governed read
  models exist and the existing generic component editor authors the content.
- Project-wide security linter findings (~1790) remain, dominated by inherited
  SECURITY DEFINER, search-path and definer-view categories. Not claimed clean.
- No browser walkthrough was run in this wave.

## Classification

PASS for PCOMP-R2B judgement and rating override policy runtime.
RESPONSE_POLICY runtime (PCOMP-R2C) not started.

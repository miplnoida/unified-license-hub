# AML/CFT methodology calculation — configuration decision table

Status: **AWAITING SUPERVISORY APPROVAL.** Nothing in section 3 has been written
to the database. No methodology version has been created or edited. No
calculated rating has been produced or fabricated.

## 1. Rebaseline (read-only, H2B step 1)

| Item | Value |
| --- | --- |
| HEAD | `ca7864e17990342f739dc6bef2e7fe60a404712a` |
| Migration head | `20260903173352_e112f0cd-5eb4-4879-8fec-2c75a0a72a7b.sql` |
| Working tree | clean |
| AMLH verifier | 15 PASS / 1 FAIL — AMLH-09 only (77 approved AML dimensions with no calculated residual rating) |
| Active AML methodology | `AML-CFT-RBA` v1.0, id `1e248dc0-c559-48d7-bcf3-70d6ec5db99a`, status `ACTIVE` |
| Effective dates | `effective_from = 2026-01-01`, `effective_to = NULL` (open) |
| `definition` | `{"control_scale":["STRONG","SATISFACTORY","NEEDS_IMPROVEMENT","WEAK"],"residual_matrix":"inherent x control","rating_scale_ref":"supervisory_rating_scale"}` |
| `scoring_scale` | LOW(1), MODERATE(2), MEDIUM_HIGH(3), HIGH(4), SEVERE(5) |
| `override_threshold` | `MEDIUM_HIGH` |
| `calculation_guidance` | "weighted inherent risk is combined with weighted control effectiveness to recommend residual ML/TF risk … advisory only" |
| Dimensions | 26 active: 6 `INHERENT` (weights 20/18/18/14/18/12 = 100) and 20 `CONTROL` (weights sum to 100) |
| Dimension scoring config | `scoring_guidance` NULL on all 26; `mandatory_questions` `[]`; `min_evidence_count` 1 |
| Questions | 41, all `mandatory`, single response vocabulary `{YES, PARTIALLY, NO, NOT_APPLICABLE}`, unscored |
| Missing parameters | question→score mapping, dimension aggregation, inherent banding, control banding, residual matrix cells, overall recommendation policy |

## 2. Methodology effective-date rule (H2B step 2)

Evidence:

- `supervisory_methodology_resolve(_domain_code, _sector_id, _as_of)` selects the
  `ACTIVE` version whose `[effective_from, effective_to]` window contains
  `COALESCE(_as_of, current_date)`.
- `supervisory_assessment_create` accepts `_methodology_id` and records
  `methodology_version` at creation; it never re-resolves later.
- The AML UI (`useResolvedAmlMethodology`, `AmlNewAssessmentDialog`) calls
  `supervisory_methodology_resolve` with `_as_of = null` — i.e. the date the
  assessment is being created — and blocks creation when nothing applies. No
  screen resolves on `period_end` or on the trigger date.

**Authoritative rule (single, platform-wide): option E constrained to option A/B —
resolution is by _assessment execution date_ (the as-of date on which the
assessment is created / the supervisory decision is taken), defaulting to
`current_date`, never by the review period. The binding is frozen at creation and
is not re-resolved when a new version is published.**

Consequence for the demonstration data: 25 of 27 AML assessments have a
`period_start` before `2026-01-01`, but **all** have an `assessment_date` (or
creation date) inside the v1.0 window. Under the approved rule the existing
v1.0 bindings are correct and **no retrospective binding and no invented
historical methodology version is required.** The deteriorating case
(`SUP-AML_CFT-2026-00129`, period 2025) is a 2026-executed reassessment of a 2025
review period — legitimate under the rule.

AMLH-03 will be hardened to assert this temporal rule (execution date inside the
bound version's effective window, and version immutable after approval), not
merely `domain_code = 'AML_CFT'`.

## 3. Configuration decisions requiring supervisory approval

Proposals below are **candidates for decision, not defaults.** Nothing is
implemented until the supervisory owner approves them.

### A. Question response scoring

| Response | Proposed score | Meaning | Requirements |
| --- | --- | --- | --- |
| `YES` | 100 | control present and effective | observation required |
| `PARTIALLY` | 50 | control present with material gaps | observation required |
| `NO` | 0 | control absent or ineffective | observation + evidence required |
| `NOT_APPLICABLE` | excluded from numerator **and** denominator | not applicable to the entity's business | rationale required (`na_requires_rationale`) |

Open decision: whether `PARTIALLY` is 50 or a lower value (e.g. 40), and whether
`NO` on a designated critical question floors the dimension irrespective of the
mean.

### B. Dimension aggregation (control dimensions)

Proposal: dimension score = unweighted mean of the scored responses in the
dimension (0–100). Minimum-answer rule: at least one applicable answered
question, otherwise the dimension is **not calculable** (no calculated rating is
produced — never a default rating). All questions `NOT_APPLICABLE` → dimension
not applicable. Evidence insufficiency (`min_evidence_count` unmet) → dimension
calculable but flagged `evidence_insufficient` in the trace. Rounding: half-up
to one decimal for the score, banding on the rounded value.

Open decision: unweighted mean vs per-question weights (no per-question weight
column exists today), and whether critical-question overrides apply.

### C. Inherent risk banding

Inherent dimensions carry the same 41-question vocabulary, so the proposal maps
the response scale in the risk direction (`YES` = risk factor present = higher
risk): inherent dimension score = mean of (100 − response score).

| Score range | Band |
| --- | --- |
| 0–19 | `LOW` |
| 20–39 | `MODERATE` |
| 40–59 | `MEDIUM_HIGH` |
| 60–79 | `HIGH` |
| 80–100 | `SEVERE` |

Open decision: band edges, and whether the inherent direction inversion above is
the supervisory intent.

### D. Control effectiveness banding

Vocabulary is fixed by `definition.control_scale` — `STRONG`, `SATISFACTORY`,
`NEEDS_IMPROVEMENT`, `WEAK`. No mixed vocabulary.

| Score range | Band |
| --- | --- |
| 85–100 | `STRONG` |
| 70–84 | `SATISFACTORY` |
| 50–69 | `NEEDS_IMPROVEMENT` |
| 0–49 | `WEAK` |

Open decision: band edges.

### E. Residual matrix (5 inherent × 4 control = 20 explicit cells)

Proposal (`residual_matrix` replaces the descriptive string):

```json
{
  "LOW":         { "STRONG": "LOW",         "SATISFACTORY": "LOW",         "NEEDS_IMPROVEMENT": "MODERATE",    "WEAK": "MEDIUM_HIGH" },
  "MODERATE":    { "STRONG": "LOW",         "SATISFACTORY": "MODERATE",    "NEEDS_IMPROVEMENT": "MEDIUM_HIGH", "WEAK": "HIGH" },
  "MEDIUM_HIGH": { "STRONG": "MODERATE",    "SATISFACTORY": "MEDIUM_HIGH", "NEEDS_IMPROVEMENT": "HIGH",        "WEAK": "HIGH" },
  "HIGH":        { "STRONG": "MEDIUM_HIGH", "SATISFACTORY": "HIGH",        "NEEDS_IMPROVEMENT": "HIGH",        "WEAK": "SEVERE" },
  "SEVERE":      { "STRONG": "HIGH",        "SATISFACTORY": "HIGH",        "NEEDS_IMPROVEMENT": "SEVERE",      "WEAK": "SEVERE" }
}
```

### F. Overall assessment recommendation

Options, one must be chosen:

1. Weighted score — dimension weights applied to residual ordinals, banded back.
2. Highest material dimension — the worst residual across calculable dimensions.
3. Weighted score with critical floor — weighted, but never lower than the worst
   residual on a dimension marked critical.

Proposal: option 3, with `override_threshold = MEDIUM_HIGH` retained as the point
at which a judged rating below the calculated one requires senior sign-off.

## 4. Implementation contract (only after approval)

- New `AML-CFT-RBA v1.1` created via `supervisory_methodology_new_version`
  (DRAFT → REVIEW → APPROVED → ACTIVE with maker/checker); v1.0 is never edited
  in place; existing assessments stay bound to v1.0.
- New governed operation computes and stores `calculated_inherent_rating`,
  `calculated_control_rating`, `calculated_residual_rating`, `calculated_score`,
  the methodology version used, and a full calculation trace.
- `supervisory_assessment_dimension_upsert` stops trusting caller-supplied
  `calculated_*`; the values are recomputed server-side and caller input ignored.
- Override discipline evaluated against the server value only; reason,
  `overridden_by`, `overridden_at` and an audit event required on divergence.
- Tamper gates CALC-01 … CALC-08 and hardened AMLH-03 / AMLH-09.

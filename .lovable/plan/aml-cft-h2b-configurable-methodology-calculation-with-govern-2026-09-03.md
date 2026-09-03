# AML/CFT H2B — configurable methodology calculation, with governed approval

Your four answers change the shape of H2B: no scoring value, band edge, matrix
cell, aggregation policy or effective-date rule gets hardcoded by me. Each one
becomes **configuration a supervisory owner sets in an Administration screen**,
and the configuration only becomes usable after it passes a **maker/checker
approval workflow**. The calculation engine then reads the approved
configuration — never a constant in code, never anything the browser sends.

Nothing is written to the live methodology until the configuration is approved
through that workflow, and no historical/calculated rating is fabricated at any
point.

## What gets built

### 1. Calculation configuration, versioned with the methodology

The calculation parameters are stored **on a methodology version**, so v1.0 keeps
having no calculation and a new v1.1 carries the approved one. Existing
assessments stay bound to their own version.

Configurable, in the screens:

- **Effective-date rule** — which date resolves the methodology: assessment
  execution date, assessment/decision date, period end, trigger date, or an
  explicit as-of date. One value, platform-wide per domain, and every screen and
  the database read the same setting.
- **Question response scoring** — a row per permitted response
  (`YES`/`PARTIALLY`/`NO`/`NOT_APPLICABLE`): numeric score, meaning, whether it
  is excluded from the denominator, whether observation/evidence is mandatory,
  and whether it acts as a critical floor.
- **Dimension aggregation** — mean vs weighted, per-question weights, minimum
  answered questions, N/A denominator handling, critical-question override,
  evidence-insufficiency handling, rounding.
- **Inherent bands** and **control bands** — band rows with score ranges, using
  only the methodology's own vocabularies (5-point risk scale; STRONG /
  SATISFACTORY / NEEDS_IMPROVEMENT / WEAK). No mixed vocabulary.
- **Residual matrix** — an editable grid with a cell for every inherent × control
  combination (20 cells), saved only when complete.
- **Overall recommendation policy** — weighted score, highest material dimension,
  weighted with critical floor, worst-of-N, or weighted with a configurable
  threshold; plus the override threshold.

### 2. Approval workflow for calculation configuration

- Configuration draft is edited freely while `DRAFT`.
- Submit for approval → `REVIEW`, routed as a workflow item that appears in the
  approver's queue with the full parameter diff against the version in force.
- Approver (different identity from the maker) approves or returns with reasons →
  `APPROVED`, then activation makes it the version in force from its effective
  date.
- Every transition recorded as a methodology event with actor, timestamp and
  rationale; completeness is validated server-side before `REVIEW` is allowed
  (all responses scored, all bands contiguous and non-overlapping, all 20 matrix
  cells present, aggregation and recommendation policy chosen).

### 3. Administration menu placement

New Administration entries, permission-gated on the existing
`aml_supervision.manage_config` / `supervisory_spine.manage_config` rights:

- Administration → Supervisory methodology → **Calculation configuration**
- Administration → Supervisory methodology → **Calculation approvals** (the queue)

Both registered in the navigation/route tables so breadcrumbs and RBAC coverage
stay at 100%.

### 4. Server-side calculation engine

One governed database operation computes, for each assessment dimension:
calculated inherent rating, calculated control rating, calculated residual
rating, calculated score, the methodology version and configuration version
used, and a full trace (per-question scores, weights, aggregation, band edges
applied, matrix cell hit, recommendation policy). The trace answers "why did the
system recommend HIGH?" without reading code, and omits confidential evidence
content.

Where a dimension is not calculable (no applicable answered question), **no
rating is produced** — never a default.

### 5. Caller loses authority over `calculated_*`

`supervisory_assessment_dimension_upsert` stops trusting caller-supplied
calculated values: they are recomputed server-side and caller input ignored, so
sending nothing, or sending calculated = judged, can no longer suppress an
override. Override discipline (reason, `overridden_by`, `overridden_at`, audit
event) is evaluated only against the server value.

### 6. Gates and regression

- Tamper gates CALC-01 … CALC-08 (no calculated fields sent, forged values,
  judged = calculated, judged differs without rationale, response change moves
  the result deterministically, old assessment stays on the old version, new
  assessment resolves the new version per the configured date rule, version
  immutable after approval).
- AMLH-03 hardened to assert the **configured** temporal rule and version
  immutability; AMLH-09 hardened to require a server-produced calculated
  recommendation for every applicable dimension of every current approved
  assessment on a calculation-declaring methodology, with configuration/version
  match and complete override discipline.
- Demo rebuild: dedicated calculation certification cases define question answers
  **first**, run the server calculation, then assert the recommendation. The
  existing rating-derived answers remain for display only, documented as
  synthetic and excluded from calculation certification.
- Full regression: AMLH, AML demo, question governance, Epic 3, W4-A5/A6, W5,
  W6 24/24, Entity 360, RBAC coverage, unit/integration, typecheck, build,
  security baseline.

## Sequence

1. Configuration schema + governed save/lifecycle operations + grants/RLS.
2. Administration configuration screens (per-section editors, validation).
3. Approval workflow + approvals queue screen + navigation/route registration.
4. Calculation engine reading the approved configuration.
5. Remove caller authority; override contract; traceability.
6. **You approve a real configuration through the new screens** — that is the
   supervisory decision; I do not choose the values.
7. Create v1.1 with the approved configuration, activate, recalculate, harden
   AMLH-03/09, add CALC gates, rebuild demo calculation cases.
8. Regression, documentation, verdict.

Steps 1–5 need no supervisory value decisions and proceed immediately. AMLH stays
15/16 until step 6 happens, and the module verdict stays **AML FULL MODULE
HARDENING — NOT CERTIFIED** until H3/H4/H5 regardless. W7 is not started.

## Technical notes

- New tables: methodology calculation configuration (one row per methodology
  version, with lifecycle + effective dates), response scoring rows, band rows,
  matrix cells, aggregation/recommendation policy, and the domain-level
  effective-date rule setting. Each with GRANTs, RLS and manage_config-gated
  policies; all writes through `SECURITY DEFINER` governed operations with
  maker/checker and event logging.
- `supervisory_methodology_resolve` gains the configured date rule instead of an
  implicit `current_date`; callers pass the date the rule names.
- Calculation is a `SECURITY DEFINER` function invoked inside the dimension
  upsert and by a recalculate operation; it never accepts ratings as input.

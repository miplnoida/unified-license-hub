# AML/CFT full-module hardening — defect register and verdict

Verifier: `scripts/verify-aml-full-module-hardening.sql` (16 gates: **15 PASS, 1 FAIL**).

**Verdict: AML FULL MODULE HARDENING — NOT CERTIFIED.**

One blocker remains (AMLH-09) and it is not implementable from the methodology
configuration as published. Nothing in W6 was touched; W6 remains certified
(24/24 gates).

## Defects fixed

| Id | Severity | Defect | Fix |
| --- | --- | --- | --- |
| A | P2 | The new-assessment dialog offered a trigger vocabulary that did not match the canonical one, so a supervisor could pick a trigger the spine rejects. | Options are now exactly `PERIODIC`, `REASSESSMENT`, `EVENT_DRIVEN`, `FOLLOW_UP`, `THEMATIC` (`AmlNewAssessmentDialog.tsx`). |
| B | P1 | Any internal user reaching the AML assessment register was offered the "New assessment" dialog; only the server refused the write. | The dialog renders only for `aml_supervision.create` (`useCan`); the server check is unchanged. |
| C | P1 | AML finding counters were read from the historical `examination_findings` store, so open/critical counts diverged from the canonical register. | AML hooks count `supervisory_finding` scoped to `domain_code = 'AML_CFT'`, excluding closed/withdrawn/superseded (`useAmlSupervision.ts`). |
| D | P1 | An AML assessment header was fetched by id alone, so an id from another domain rendered inside the AML workspace. | The header query is scoped to `domain_code = 'AML_CFT'`. |
| E | P0 | `entity360_overview` read two retired AML tables, one of which no longer exists — the Entity 360 overview raised `relation "aml_findings" does not exist` for every user allowed the AML section. | The legacy AML block is retired; AML truth is served only by `aml_entity_panel()`. Examination open findings count `supervisory_finding`. |
| F (AMLH-31) | P1 | `entity360_section` still counted examination open findings from `examination_findings`, so the Examinations section disagreed with the overview and with the AML registers. | Patched in place to count `supervisory_finding`, excluding closed/withdrawn/superseded, via a migration that rewrites the existing definer function and asserts the definer/`search_path` attributes and the absence of every retired AML table. |
| G (AMLH-02) | P1 | No AML assessment had a recorded AML/CFT perimeter determination — an assessment with no perimeter basis has no recorded reason to exist. | The demonstration seed now records an applicable perimeter determination for every in-perimeter entity through `supervisory_domain_perimeter_set`, before any assessment exists (the out-of-perimeter case is unchanged). The three non-demonstration entities were back-recorded through the same governed operation; the entity with no assigned supervisor was determined by the regulator administrator, and the basis records why. |
| H (AMLH-03) | P1 | AML assessments carried no methodology version binding, so ratings could not be attributed to a methodology. | The seed resolves the AML/CFT methodology version in force once and binds it to every AML assessment it creates, and refuses to run when no active version is published. |
| I | P1 | Binding the methodology exposed that no assessment answered the methodology's mandatory questions — the completeness guard only fires on submission, so the previous dataset had bypassed it by carrying no methodology at all. | The seed now answers all 41 mandatory questions per AML assessment through `supervisory_assessment_question_upsert`, with an observation and, where the question requires it, evidence; conclusions are polarised with the recorded residual rating (LOW → YES, MODERATE → PARTIALLY, otherwise NO). |

## Open blocker

| Gate | Blocker | Nature |
| --- | --- | --- |
| AMLH-09 | 77 of 80 approved AML dimensions carry no methodology-calculated residual rating, so calculated-vs-judged override discipline cannot be evidenced for them. | Configuration. See below. |

### Why AMLH-09 is not fixable as configured

The published AML/CFT methodology declares that a calculation exists
(`calculation_guidance`: "weighted inherent risk is combined with weighted
control effectiveness to recommend residual ML/TF risk … advisory only") and
supplies part of the inputs: per-dimension weights, a 5-point residual scale
with ordinals, a 4-band control scale, and an override threshold. It does **not**
supply the two parameters a deterministic calculation needs:

1. **No mapping from question responses to a dimension rating.** Mandatory
   question `response_options` are unscored labels (`YES`, `PARTIALLY`, `NO`,
   `NOT_APPLICABLE`); `scoring_guidance` is null on every dimension, and there
   are no band thresholds.
2. **No residual matrix.** `definition.residual_matrix` is the string
   `"inherent x control"` — a description, not cells. No rating-matrix table
   exists anywhere in the schema.

Consequently there is **no authoritative calculation to run**. A related P1
control defect is recorded rather than fixed: in
`supervisory_assessment_dimension_upsert`, `calculated_inherent_rating`,
`calculated_control_rating`, `calculated_residual_rating` and `calculated_score`
are caller-supplied parameters that are stored verbatim, with no server-side
producer and no validation. Override discipline (`is_overridden`,
`override_reason`) is therefore evaluated only against whatever the caller chose
to send, and is defeated by sending nothing. No UI path sends them.

Closing AMLH-09 requires a supervisory decision that publishes the missing
methodology parameters (question response scoring and the inherent × control
residual matrix); the calculation must then be computed server-side inside the
governed operation, not accepted from the caller. That decision is not one an
implementer may take, and no calculated rating was fabricated.

## Not executed, therefore not claimed

No result is asserted for: driven end-to-end persona journeys, the >300-record
scale test against the 300-row client truncation in the AML registers, the
authorization matrix and attack suite, performance and accessibility passes, and
the Playwright AML suite. The 300-record truncation in `AmlSupervisedEntities`,
`AmlRiskHeatmap`, `AmlAssessments`, `AmlExaminations`, `AmlFindings`,
`AmlWorkQueue` and `AmlNewAssessmentDialog` remains an open defect.

## Regression

| Suite | Result |
| --- | --- |
| `scripts/verify-aml-full-module-hardening.sql` | 15 PASS, 1 FAIL (AMLH-09) |
| `bunx tsgo --noEmit` | clean |
| `bunx vitest run src/test` | 1323 passed; one pre-existing unrelated timeout flake (`actionNotificationsEditorCrud`) which passes in isolation |
| Security linter | 1586 issues, no new issue types (unchanged baseline) |

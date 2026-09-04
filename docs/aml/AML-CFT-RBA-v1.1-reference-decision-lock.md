# AML-CFT-RBA v1.1 — MIPL reference decision lock and governed draft creation

Date: 2026-09-04. Wave: reference decision lock + governed draft creation.
Verifier: `psql -f scripts/verify-aml-v11-reference-draft.sql` — **18 PASS, 0 FAIL** (REF-01…REF-18).

## 1. What was decided, and by whom

The AML-METH-01…10 content decisions are now recorded as **MIPL reference
approvals** — the platform methodology owner's approval of a reference design.
They are stored in `supervisory_methodology_reference_decision` with
`approval_scope = 'MIPL_REFERENCE_APPROVAL'`, `regulator_approval_recorded = false`
and `customer_adoption_recorded = false`.

Two layers, never conflated:

| Layer | Who | Effect |
| --- | --- | --- |
| Reference approval | MIPL, as methodology owner | Fixes the reference catalogue and vocabulary; produces a DRAFT methodology version |
| Regulator approval | The adopting regulator | Required before the version can be reviewed, approved, activated or used in any assessment |

The governed operation that records reference decisions **refuses** a payload
claiming `REGULATOR_APPROVAL` or `CUSTOMER_POLICY_APPROVAL` (gate REF-18), and a
table constraint prevents a reference row from carrying a regulator or customer
approval flag. A reference approval therefore cannot be misread, or later
rewritten, as a regulator decision.

## 2. What was written

`AML-CFT-RBA` **v1.1**, status **DRAFT**, superseding v1.0:

| Object | State |
| --- | --- |
| Questions | 70 active — 48 CORE (mandatory), 16 CONDITIONAL, 6 ENHANCED |
| Axis split | 17 inherent exposure, 14 design, 27 operating, 12 design and operating |
| Calculation participation | 69 `SCORED`, 1 `CONTEXTUAL_NOT_SCORED` (`IR-GEO-03`) |
| Response semantics | 5 published profiles: `INHERENT_SEM`, `CONTROL_SEM_DESIGN`, `CONTROL_SEM_OPERATING`, `CONTROL_SEM_DESIGN_AND_OPERATING`, `CONTEXT_FACT_SEM` |
| Evidence basis | Every question declares accepted evidence-basis types from the 11-type vocabulary |
| N/A discipline | 26 questions permit N/A, each with an enumerated condition; rationale required on all 70 |
| Fact contract | 87 fact requirements, 88 question-to-fact links |
| Materiality parameters | 8 registered, **all valueless and `UNAPPROVED`** |
| Predecessor lineage | Every non-`NEW` question records its v1.0 mapping and a change classification |

v1.0 remains **ACTIVE** with its 41 questions untouched, and refuses structural
change (gate REF-16). No assessment is bound to v1.1 (gate REF-17).

## 3. Generic, not AML-specific

Every field added serves any supervisory methodology, prudential included:
question class, axis and effectiveness focus, response-semantics profile,
calculation participation, trigger condition and applicability rule, evidence
basis types, judgement/auto-prefill flags, standards reference with strength and
review outcome, sector applicability, change classification and predecessor
mapping — plus three domain-neutral registers: fact requirements, methodology
parameters and reference decisions.

Governed operations (all `SECURITY DEFINER`, all gated on
`aml_supervision.manage_config` / `supervisory_spine.manage_config` /
`prudential_supervision.manage_config`, all refusing a frozen version):
`supervisory_methodology_semantic_profile_set`,
`supervisory_methodology_parameter_set`,
`supervisory_methodology_fact_requirement_set`,
`supervisory_methodology_question_attributes_set`,
`supervisory_methodology_question_purge`,
`supervisory_methodology_reference_decision_record`.

## 4. Reproducibility

The draft is built from the catalogue by generator, not by hand:

```
python3 scripts/aml/build-aml-v11-reference-draft.py     # regenerates the SQL
psql -f scripts/aml/aml-v11-reference-draft.generated.sql # idempotent re-apply
psql -f scripts/verify-aml-v11-reference-draft.sql        # REF-01..REF-18
```

The generator refuses to run outside a non-production environment, asserts 70
questions and 10 decisions before emitting SQL, and asserts exactly 70 active
questions after applying. Fact `data_type` and `unit` are derived only from the
fact code's own naming convention (`attribute_source =
DERIVED_FROM_FACT_CODE_CONVENTION`); every fact row stays
`definition_status = ATTRIBUTES_PENDING` because numerator/denominator bases and
source bindings are not yet authored. No score, band, weight, threshold or
materiality value was invented.

## 5. What is still not done

- No regulator approval, so v1.1 stays DRAFT and unusable for assessment.
- No materiality parameter value; no calculation configuration
  (CALC-05, CALC-06, CALC-09, CALC-11 remain FAIL — unchanged baseline).
- AML-METH-08 (`STR_SAR_GOVERNANCE` → `STR_GOVERNANCE` relink) is
  reference-approved but **not executed**: LINK-11 remains FAIL for its 22 rows.
- No fact ingestion, no auto-prefill, no assessment-time trigger evaluation.
- No UI for the new registers in this wave.

## 6. Regression (this wave)

| Suite | Result |
| --- | --- |
| `scripts/verify-aml-v11-reference-draft.sql` | 18 PASS, 0 FAIL |
| `scripts/verify-aml-v11-catalogue-design.py` | 61/61 PASS |
| `scripts/verify-aml-full-module-hardening.sql` | 15 PASS, 1 FAIL (AMLH-09 — unchanged) |
| `scripts/verify-aml-calculation-governance.sql` | 20 PASS, 0 FAIL |
| `scripts/verify-aml-calculation-integrity.sql` | 7 PASS, 4 FAIL (CALC-05/06/09/11 — unchanged) |
| `scripts/verify-aml-dimension-linkage.sql` | 11 PASS, 1 FAIL (LINK-11 — unchanged) |
| `scripts/verify-aml-authority-ux-parity.sql` | 10 PASS, 0 FAIL |
| `scripts/verify-aml-assessment-structural-integrity.sql` | 724 dimensions / 984 responses / 0 defects — unchanged |
| `bunx tsgo --noEmit` | clean |

**Verdict: AML/CFT remains NOT CERTIFIED.**

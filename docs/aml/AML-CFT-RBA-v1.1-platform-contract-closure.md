# AML-CFT-RBA v1.1 — platform-contract final closure

Wave: version-stable semantics + axis normalisation + regulator adoption boundary.
Verifier: `psql -f scripts/verify-supervisory-platform-contract.sql` — **17 PASS, 0 FAIL** (CONTRACT-01…CONTRACT-17).

Nothing in this wave changed a question, a prompt, a classification, an
AML-METH-01…10 decision, a materiality value, a score, a band, the residual
matrix, the effective-date policy, the `STR_SAR_GOVERNANCE` relink, or the
status of v1.1. No certification is claimed.

## 1. Configuration authority is domain-specific — and regulator-scoped

`supervisory_domain_authority` maps each supervisory domain to its own
`manage_config_permission` and `methodology_approval_permission`.
`supervisory_domain_require_manage`, `supervisory_methodology_require_manage`
and `supervisory_methodology_require_regulator_approval` derive authority from
that row alone. Every governed methodology writer — `parameter_set`,
`semantic_profile_set`, `fact_requirement_set`, `question_attributes_set`,
`question_purge`, `question_sync`, `dimension_save`, `supervisory_methodology_save`,
`new_version`, `lifecycle`, `reference_decision_record` — now resolves through it,
so the previous three-permission array is gone.

A later wave added the regulator dimension: adoption and approval also prove that
the actor may act **for the target regulator**, methodology approval is its own
permission, and the approval register is regulator-scoped on read. That contract
is documented in
[`supervisory-methodology-regulator-authority.md`](../architecture/supervisory-methodology-regulator-authority.md)
and verified by `scripts/verify-supervisory-regulator-methodology-authority.sql`
(REG-AUTH-01…16, 16 PASS).

| Domain | Configure | Methodology approval |
| --- | --- | --- |
| `AML_CFT` | `aml_supervision.manage_config` | `aml_supervision.methodology_approve` |
| `PRUDENTIAL` | `prudential_supervision.manage_config` | `prudential_supervision.methodology_approve` |
| `MARKET_CONDUCT` | *(unregistered — super administrator only)* | *(unregistered — approval refused)* |

Executed negative tests: a prudential configuration officer is refused AML
methodology configuration (CONTRACT-03), and an unauthenticated caller is
refused outright (CONTRACT-04).

**Open gap:** no `market_conduct.manage_config` and no market-conduct methodology
approval permission exist, so market conduct methodology configuration remains
super-administrator-only and its approval is refused. Generic platform backlog;
does not block AML/CFT.


## 2. Response semantics are owned by the version

`supervisory_methodology_semantic_profile` now carries `methodology_id` and
`profile_version`. v1.1 owns its own five published profiles
(`INHERENT_SEM`, `CONTROL_SEM_DESIGN`, `CONTROL_SEM_OPERATING`,
`CONTROL_SEM_DESIGN_AND_OPERATING`, `CONTEXT_FACT_SEM`) and all 70 questions bind
to them by profile id, not by code lookup. Consequences, each executed:

- a question of one version cannot adopt another version's profile (CONTRACT-08);
- a profile belonging to a version outside `DRAFT`/`REVIEW` is immutable, insert,
  update and delete alike (CONTRACT-09).

A future v1.2 can therefore restate what "Largely effective" means without
retrospectively changing what a v1.1 answer meant.

## 3. Axis and effectiveness focus are separate dimensions

`axis` answers *what is measured*; `effectiveness_focus` answers *which part of a
control is in scope*. They were conflated in one column.

| Axis | Count | Focus | Count |
| --- | --- | --- | --- |
| `INHERENT_EXPOSURE` | 17 | `INHERENT_EXPOSURE` | 17 |
| `CONTROL_EFFECTIVENESS` | 53 | `DESIGN` | 14 |
| | | `OPERATING` | 27 |
| | | `DESIGN_AND_OPERATING` | 12 |

`smq_axis_focus_coherence_chk` refuses any incoherent pair — an inherent-exposure
question cannot take a control focus (CONTRACT-11). The generator refuses to emit
a control question without a valid focus, and the applied SQL asserts both splits
before committing.

## 4. Reference approval never becomes regulator policy

- `supervisory_methodology.origin` ∈ `REGULATOR_AUTHORED` | `MIPL_REFERENCE` |
  `REGULATOR_ADOPTED`, with `adopted_from_id` lineage.
- `sm_reference_never_operational_chk`: an `MIPL_REFERENCE` version may only be
  `DRAFT`, `REVIEW`, `SUPERSEDED` or `RETIRED` (CONTRACT-13).
- `supervisory_methodology_lifecycle` refuses to approve or activate a reference
  template in place and names the adoption route instead (CONTRACT-12).
- `supervisory_methodology_adopt_reference(reference_id, regulator_id, rationale)`
  produces `1.1+<regulator_code>`, origin `REGULATOR_ADOPTED`, carrying dimensions,
  the semantic snapshot, fact requirements, parameter **definitions** (still
  `UNAPPROVED`, still valueless), questions and question-to-fact links.
- Reference decisions now carry `methodology_id` and cannot be re-pointed at a
  different version (CONTRACT-05, CONTRACT-06).

## 5. Lifecycle, approval and maker/checker

`DRAFT → REVIEW → APPROVED → ACTIVE → RETIRED`, with `REVIEW → DRAFT` return.

- `APPROVED` requires the domain's regulator-approval permission and records a row
  in `supervisory_methodology_regulator_approval` (one current row per version).
- The author of a version can never approve it, and the reviewer who submitted it
  cannot approve it either — with no super-administrator escape (CONTRACT-15).
- `ACTIVE` is refused unless a current `APPROVED` regulator decision exists
  (CONTRACT-14).

## 6. Nothing invented, nothing rewritten

8 materiality parameters, all `UNAPPROVED` with no value. 87 fact requirements,
all `ATTRIBUTES_PENDING`. No assessment is bound to the draft; v1.0 remains
`ACTIVE` with its 41 questions untouched (CONTRACT-16, CONTRACT-17).

Two defects in governed operations were repaired in passing: the question-purge
guard referenced a non-existent responses table (making the operation unusable),
and the version-scoped semantics uniqueness rule was conditional, which blocked
in-place profile updates.

## 7. Reproducibility

```
python3 scripts/aml/build-aml-v11-reference-draft.py      # regenerate
psql -f scripts/aml/aml-v11-reference-draft.generated.sql # idempotent re-apply
psql -f scripts/verify-aml-v11-reference-draft.sql        # REF-01..REF-18
psql -f scripts/verify-supervisory-platform-contract.sql  # CONTRACT-01..CONTRACT-17
psql -f scripts/verify-supervisory-regulator-methodology-authority.sql # REG-AUTH-01..16
```

## 8. Regression (this wave)

| Suite | Result |
| --- | --- |
| `scripts/verify-supervisory-platform-contract.sql` | 17 PASS, 0 FAIL |
| `scripts/verify-supervisory-regulator-methodology-authority.sql` | 16 PASS, 0 FAIL |
| `scripts/verify-aml-v11-reference-draft.sql` | 18 PASS, 0 FAIL |
| `scripts/verify-supervisory-authority-boundary.sql` | 17 PASS, 0 FAIL |
| `scripts/verify-aml-v11-catalogue-design.py` | 61/61 PASS |
| `scripts/verify-aml-calculation-governance.sql` | 20 PASS, 0 FAIL |
| `scripts/verify-aml-full-module-hardening.sql` | 15 PASS, 1 FAIL (AMLH-09 — unchanged) |
| `scripts/verify-aml-calculation-integrity.sql` | 7 PASS, 4 FAIL (CALC-05/06/09/11 — unchanged) |
| `scripts/verify-aml-dimension-linkage.sql` | 11 PASS, 1 FAIL (LINK-11 — unchanged) |
| `scripts/verify-aml-assessment-structural-integrity.sql` | 724 dimensions / 984 responses / 0 defects — unchanged |

## 9. What is still not done

- No regulator approval and no adoption, so v1.1 stays `DRAFT` and unusable for assessment.
- No materiality value, no calculation configuration (CALC-05/06/09/11).
- AML-METH-08 (`STR_SAR_GOVERNANCE` → `STR_GOVERNANCE`) still not executed (LINK-11).
- No fact ingestion, no auto-prefill, no assessment-time trigger evaluation.
- No `market_conduct.manage_config` and no market-conduct methodology approval permission.
- Revocation does not deactivate an already `ACTIVE` methodology — a policy decision, not an engineering default.
- No UI for the new registers, adoption or regulator-approval surfaces.

**Verdict: AML/CFT remains NOT CERTIFIED.**

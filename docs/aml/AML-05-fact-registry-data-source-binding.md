# AML-05 — Governed evidence basis, structured facts and server-authoritative readiness

Status: **PASS** (certified 2026-09-09)
Scope: generic supervisory platform capability, exercised by AML/CFT. Nothing in
this wave is AML-specific in the schema, the operations or the screens.

---

## 1. What this wave establishes

Before AML-05, evidence on a supervisory question was a free-text array on the
answer (`evidence_refs`) and submission readiness was partly recomputed in the
browser. AML-05 replaces both with governed platform contracts:

- an **evidence basis** — one governed record per source per assessment, reused
  across questions and dimensions, always pointing at a record the platform
  already holds or a governed non-document basis with its own reference and date;
- a **structured fact register** — typed, dated, sourced values defined by the
  methodology version attached to the assessment;
- a single **readiness contract** — the same calculation the platform runs when
  the assessment is submitted, read by the officer's screen.

## 2. Evidence-kind catalogue

`public.supervisory_evidence_basis_type` is the governed catalogue of evidence
kinds. Each kind states whether it must point at an existing platform record
(`requires_source_object`), which table holds that record (`source_table`), and
which columns carry its entity and its reference. Live kinds include registered
documents, regulatory returns, prior examinations, supervisory findings,
remediation records and governed officer sample reviews. The catalogue is
read-only to signed-in staff; the browser never carries its own list.

## 3. Reuse of existing platform records

Evidence is never a file held by the browser. When a kind requires a source
object, the governed link operation resolves that object in its own table,
confirms it belongs to the assessed entity, and confirms the calling officer is
authorised to see it. An unresolvable or unauthorised source is refused.

## 4. Deduplication and reuse

`supervisory_assessment_evidence_basis` holds **one record per source per
assessment**. Linking the same source again reuses the existing record and adds
a link, rather than creating a second copy. Links live in two separate stores:

- `supervisory_assessment_question_evidence` — the record supports a question;
- `supervisory_assessment_dimension_evidence` — the record supports a dimension.

Both are distinguishable everywhere: the register returns `questions[]` and
`dimensions[]` as separate arrays, and the working file only counts a record
against a question when a question link exists.

## 5. Source visibility and non-disclosure

The evidence register never discloses a record the officer may not see. It
returns `source_accessible = false` and withholds the title and reference; the
screen states "Restricted source — you are not authorised to see this record".
Visibility is decided by the platform. The browser only displays the flag; it
never filters for security.

## 6. Cross-assessment and cross-regulator protection

Every link, unlink, fact write and fact override re-checks the assessment, its
entity, its regulator scope, its editable state and the exact methodology
version. Evidence created for one assessment can never be linked to another, and
evidence or facts belonging to another assessment can never satisfy readiness.
Submitted assessments accept no further evidence or fact writes.

## 7. Structured facts

`supervisory_assessment_fact` records typed values against
`supervisory_methodology_fact_requirement`, which is owned by the methodology
version. Each fact carries:

- `data_type` and `unit`, validated against the requirement;
- `numerator` / `denominator` where the requirement defines a ratio basis, with
  `numerator_basis` and `denominator_basis` stating what each side means;
- `period_start`, `period_end` and `as_of_date`;
- `source_type`, `source_reference` and `extraction_timestamp` — the retrieval
  provenance.

A fact is never an answer, a rating or a conclusion.

## 8. Proposed values, officer values and rationale

Where the requirement allows it, the platform may propose a value
(`auto_prefilled = true`, proposal kept in `system_value`). An officer change
keeps the proposal untouched, sets `officer_overridden`, stamps `overridden_at`
and **requires a written reason** (`override_reason`). The screen shows the
platform's proposed value and the officer's value side by side, together with the
explanation. The override operation refuses an empty rationale.

## 9. Authoritative readiness and submission

`public.supervisory_assessment_readiness(_assessment_id)` returns the complete,
reasoned result: methodology binding, question plan mode, answers, observations,
governed evidence, required facts, dimension ratings and fact provenance — each
with a status, a blocking flag, a count, a plain-language detail and the exact
outstanding items. It also returns `can_submit`, `submission_gate`,
`blocking_check_count`, `outstanding_question_count` and
`outstanding_fact_count`.

Submission calls the **same** completeness functions. The workspace and
submission therefore cannot disagree for the same committed state, and a stale
client result changes nothing.

## 10. Required facts — configuration position

The engine supports required facts, but no live methodology fact is currently
configured as required.

Required-fact behaviour is therefore certified through **rollback-only**
fixtures: the certification marks a fact requirement as required inside the
verification transaction, proves that readiness blocks while it is missing and
clears once a valid sourced fact is recorded, then rolls back. Neither v1.0 nor
v1.1 was changed to remove this statement.

## 11. Legacy compatibility

Historical `evidence_refs` on answers are still counted towards a methodology's
evidence requirement, so no historical assessment became incomplete when AML-05
was installed. Nothing was backfilled and no fact provenance was fabricated. The
working file states legacy references honestly: "N earlier evidence reference(s)
recorded on this answer before the evidence register existed. They still count
towards the methodology's requirement."

## 12. Direct-write security defect and fix

The certification run found that the new AML-05 stores had inherited broad
default table privileges for signed-in users. A follow-up migration:

- revoked `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES` and `TRIGGER`
  from `authenticated` on the evidence basis, the question and dimension link
  stores, the fact store and the evidence-kind catalogue;
- revoked all access from anonymous callers;
- granted `authenticated` `SELECT` only;
- retained `service_role` access for governed server-side execution.

Row-level security is enabled on every store, execution on every AML-05 function
is revoked from `PUBLIC` and anonymous callers, and every function pins its
`search_path`. All mutation therefore happens through governed operations that
re-check authority and write the audit trail.

## 13. Audit trail

Every governed evidence and fact operation appends to
`supervisory_assessment_event` with the actor, the assessment, the operation, the
affected record and the rationale where one is required. Evidence records keep
`origin`, `created_at` and `retrieved_at`; facts keep the proposal, the officer
value, the reason and the override timestamp.

## 14. UI surfaces

| Surface | File | Purpose |
| --- | --- | --- |
| Submission readiness | `src/components/supervision/aml/AmlReadinessPanel.tsx` | Renders the server readiness result, its reasons and its counts |
| Fact register | `src/components/supervision/aml/AmlFactRegisterPanel.tsx` | Typed facts with unit, period, source, proposal, officer value and rationale |
| Question evidence | `src/components/supervision/aml/AmlQuestionEvidencePanel.tsx` | Links governed evidence to one question; states restricted sources and legacy references |
| Working file | `src/components/supervision/aml/AmlAssessmentGovernance.tsx` | Mounts readiness, facts and the dimension worksheet |
| Actions | `src/components/supervision/aml/AmlAssessmentActions.tsx` | Submission consumes the server `can_submit` only |
| Contract | `src/hooks/useAssessmentEvidenceBasis.ts` | The only client access path — governed RPCs, no table writes |

## 15. Certification

| Layer | Artefact | Result |
| --- | --- | --- |
| Database | `scripts/verify-aml-evidence-fact-readiness.sql` | EV 16/16, FACT 15/15, READY 12/12, LEGACY 6/6, SEC 8/8, plus preservation census |
| Screens | `src/test/amlAssessmentEvidenceFactsReadiness.test.tsx` | UI-EFR-01…20, 20/20 |
| Boundary | `scripts/verify-evidence-fact-frontend-boundary.mjs` | FEB-01…12, 12/12 |

The database certification runs as a single rolled-back transaction under real
authenticated personas: an authorised supervisory officer, a checker and an
outsider with no AML authority. No fixture survives.

## 16. Preservation

Nothing was migrated, deleted or rewritten. Existing assessments, historical
evidence, question-plan snapshots, risk of record, methodology v1.0 and v1.1,
reference programmes, calculation policy, risk bands, the residual matrix,
materiality values and regulator records are all unchanged. v1.1 remains a draft
`MIPL_REFERENCE` version and was not activated.

## 17. Remaining configuration and policy blockers

These are regulator policy decisions, not engineering gaps:

- no live methodology fact is configured as required (section 10);
- calculation configuration remains unauthored — risk bands, the residual matrix
  and materiality values are still regulator decisions (CALC-05/06/09/11);
- 22 legacy `STR_SAR_GOVERNANCE` question links remain unresolved (LINK-11);
- v1.1 remains a draft reference version pending regulator adoption.

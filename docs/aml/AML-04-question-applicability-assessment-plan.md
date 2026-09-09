# AML-04 — Enterprise Question Applicability & Assessment Question Plan

Status: **implemented and certified** (database, backend contract, frontend, verification).
Scope: generic supervisory architecture, applied first to AML/CFT. No AML-05 work is included.

## 1. What this wave establishes

An assessment no longer answers "every question in the methodology". Each assessment now
carries a **server-resolved question plan**: an immutable snapshot recording, for every
question in the bound methodology version, whether it is in scope, why, and on what facts
that decision was taken.

Canonical plan states (the only ones that exist):

```text
INCLUDED_CORE
INCLUDED_CONDITIONAL
INCLUDED_ENHANCED
NOT_TRIGGERED
OUT_OF_SCOPE
```

`NOT_APPLICABLE` is **not** a plan state. It remains a response-level answer recorded by an
officer against an in-scope question, with rationale where the methodology requires it. This
separation is enforced in the database, in the frontend boundary verifier and in the UI tests.

## 2. Applicability and trigger rules

- Rules are **structured data**, never code: `{op, source, value|values}` conditions combined
  under `ALL` / `ANY` / `NOT`. There is no expression evaluator and no client-side execution.
- The rule vocabulary (`supervisory_question_rule_vocabulary`) is server-owned: the available
  fact sources, their data types, their allowed values and the permitted operators
  (`EQ`, `NEQ`, `IN`, `NOT_IN`, `EXISTS`, `NOT_EXISTS`, `TRUE`, `FALSE`) all come from the server.
  Authoring surfaces can only offer what the vocabulary declares available.
- Rule kinds are constrained to `APPLICABILITY` (does this question apply at all) and
  `TRIGGER` (does this conditional question fire).
- Rules are validated recursively on save, versioned, and summarised by the server
  (`supervisory_question_rule_describe`). Readiness is `EXECUTABLE` / `NOT_EXECUTABLE`.
- A conditional question with no executable trigger is a **blocking validation finding** on the
  methodology version — it is never silently included or silently dropped.

## 3. Resolution and immutability

- Resolution happens server-side against the **exact** methodology version, assessment
  programme and trigger bound to the assessment, plus entity facts read at resolution time.
- Where a required input is not recorded for an entity, resolution **refuses**
  (`APPLICABILITY_UNRESOLVED`). An unknown fact is never treated as false.
- Plans are append-only snapshots. A rebuild is possible only on a draft with no recorded
  answers, and requires a rationale; every resolution and override is audited.
- Scope overrides are recorded alongside the resolved state (never in place of it), require a
  supervisory justification, and may only move a question to
  `INCLUDED_CONDITIONAL`, `INCLUDED_ENHANCED` or `OUT_OF_SCOPE`.
- Historical assessments created before this architecture existed remain
  `LEGACY_UNMATERIALISED` with zero plan rows. Nothing was back-invented for them.

## 4. Governed contract

Read models:

```text
supervisory_assessment_question_plan(assessment, search, dimension, class, state, limit, offset)
supervisory_assessment_question_plan_context(assessment)
supervisory_assessment_question_plan_summary(assessment)
supervisory_question_rule_vocabulary()
supervisory_methodology_question_rules(question)
```

Actions:

```text
supervisory_assessment_question_plan_materialize(assessment, rationale)
supervisory_assessment_question_plan_override_apply(assessment, question, to_state, reason)
supervisory_methodology_question_rule_save(methodology, question, kind, definition, rationale, provenance)
supervisory_methodology_question_rule_remove(rule, rationale)
```

All are `SECURITY DEFINER`, authenticated-only, permission- and scope-checked, and are the
only write path. Direct table writes are revoked.

## 5. Frontend

| Surface | Purpose |
|---|---|
| `src/hooks/useAmlQuestionPlan.ts` | Typed governed reads/actions; exports the canonical plan and override state lists |
| `src/components/supervision/aml/AmlQuestionPlanPanel.tsx` | "Question scope" tab: server summary tiles, evaluated facts, per-question state/reason/rule, resolve or rebuild, justified override (draft only) |
| `src/pages/supervision/aml/AmlAssessmentWorkspace.tsx` | Mounts the scope tab in the assessment workspace |
| `src/components/admin/supervisory-methodology/studio/QuestionRuleSection.tsx` | Studio rule authoring/withdrawal from the server vocabulary, with readiness and findings |
| `src/hooks/useSupervisoryMethodologyAdmin.ts` | Rule vocabulary and rule list/save/remove hooks |

The browser renders decisions; it never makes them. Filtering, searching and paging are server
arguments, and the plan view keeps the previous snapshot while a narrowed query resolves.

## 6. Verification

| Gate suite | Command | Result |
|---|---|---|
| Database certification, PLAN-01…50 | `psql -f scripts/verify-assessment-question-plan.sql` | 50/50 PASS, fixtures rolled back, assessment count unchanged (28) |
| Frontend boundary, FE-01…07 | `node scripts/verify-question-plan-frontend-boundary.mjs` | 7/7 PASS |
| UI closure, UI-PLAN-01…15 | `bunx vitest run src/test/amlAssessmentQuestionPlan.test.tsx` | 15/15 PASS |
| Fixture capture | `psql -f scripts/capture-question-plan-fixtures.sql` | Real payloads captured in a rolled-back transaction |

The UI fixtures in `src/test/fixtures/questionPlanReadModels.json` are **captured server
output**, not hand-written expectations: a transaction-scoped methodology, programme set and
programmed assessment are created, the governed read models are asked for their payloads, and
the transaction is rolled back.

## 7. Defect fixed during certification

- The question scope view blanked to a loading skeleton on every keystroke while filtering,
  losing input. The plan query now retains the previous snapshot while the server answers.

## 8. Preservation

No AML table, function or business record was deleted, renamed or rewritten. Methodology v1.0
remains ACTIVE, v1.1 remains DRAFT / MIPL_REFERENCE, and the 28 existing assessments are
untouched apart from carrying `LEGACY_UNMATERIALISED` scope, which is a truthful absence.

## 9. Final closure (action governance, UI-PLAN-16…18)

| Gate | Result |
|---|---|
| Database certification PLAN-01…50 | 50/50 PASS, fixtures rolled back, 28 assessments unchanged |
| Frontend boundary FE-01…07 | 7/7 PASS |
| Question-plan UI, UI-PLAN-01…18 | 18/18 PASS |
| Typecheck | PASS |

Action governance:

- `AmlQuestionPlanPanel.tsx` — "Adjust scope" and "Resolve/Rebuild question plan" already carried
  `data-rbac` markers (`aml_supervision.approve` / `aml_supervision.edit`). The coverage scanner
  missed them because `findWrappingGate` delimited the opening tag with a naive `indexOf('>')`,
  which stops inside an arrow handler. The scanner now uses the brace/quote-aware
  `findOpeningTagEnd`. This is a detector defect, not an AML-04 authorisation defect.
- `QuestionRuleSection.tsx` — "Add rule", "Save rule", "Withdraw" carry
  `aml_supervision.manage_config`. "Add condition" only appends an empty row to the unsaved rule
  draft and is registered in the scoped classification register as `non-mutating`.

New gates:

- UI-PLAN-16 — no frontend applicability policy: no question-class, sector, trigger or entity
  comparison, and no rule evaluation, in the panel, hook, working file or Studio rule surface.
- UI-PLAN-17 — a governed resolve refetches the plan through React Query invalidation; no surface
  in the creation or scope path reloads the browser.
- UI-PLAN-18 — `NOT_TRIGGERED` and `OUT_OF_SCOPE` rows expose no answer control, and the working
  file (`AmlDimensionWorksheet`) now offers only the questions the server marked `included`
  (assessments with no resolved plan keep the full methodology set).

Preservation: no assessment, plan, risk of record, methodology version, programme reference,
calculation or materiality value was changed, invented or backfilled; no AML business data or
regulator row was deleted.

Remaining blockers are inherited and outside AML-04: unguarded action sites in the AML-03
programme/Studio surfaces, monitoring and portfolio screens; two source-string assertions in
`amlMethodologyAuthorityUx.test.ts` left stale by the AML-03 new-assessment refactor; two
`actionNotificationsEditorCrud` failures; and 5s test timeouts in the methodology admin/Studio UI
suites under full-suite load (both suites pass in isolation).

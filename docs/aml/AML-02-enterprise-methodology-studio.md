# AML-02 — Enterprise Supervisory Methodology Studio

Baseline HEAD: `e4355e23b138a1304159b3b554c87d15dedbe0a9` (matched expected; tree clean).
Preserved contracts: `docs/aml/AML-00-enterprise-baseline-preservation-lock.md`,
`docs/aml/AML-01-enterprise-policy-profile-kernel.md`.

## 1. Scope

AML-02 turns the existing read-only `supervisory_methodology_*` review workspace into a governed
authoring Studio. It is generic: nothing added is AML-specific. It reuses the existing canonical
tables and existing governed writers — no parallel schema, no editor-only table, no new route family.

Not in scope, deliberately: calculation policy, materiality values, assessment programmes,
runtime binding of assessments to a Policy Profile, AML-03.

## 2. One authoring authority boundary

`supervisory_methodology_require_authoring(methodology_id)` is the single gate every new Studio
write passes through. In order it:

1. resolves domain and regulator authority through the existing
   `supervisory_methodology_require_manage` (which itself uses `user_has_regulator_authority`);
2. refuses any version whose status is not `DRAFT` or `REVIEW` (`methodology_immutable`);
3. refuses authoring of a `MIPL_REFERENCE` template unless the actor is a platform administrator
   (`reference_authoring_denied`) — a regulator changes reference content by adopting it first.

## 3. Governed authoring operations (new)

| Operation | Behaviour |
| --- | --- |
| `supervisory_methodology_question_save` | Creates or updates one question in a draft version. Requires a prompt of ≥ 10 characters and an existing dimension in the same version. Honours `expected_updated_at` for optimistic concurrency (`concurrent_update`). Refuses a code that already exists in another dimension. |
| `supervisory_methodology_question_retire` | Deactivates a question; rationale ≥ 10 characters. History and comparison keep the row. |
| `supervisory_methodology_dimension_retire` | Deactivates a dimension; refused while it still holds active questions (`dependency_blocked`). |
| `supervisory_methodology_question_fact_link` / `_unlink` | Links or unlinks a fact requirement to a question inside the same version only. |
| `supervisory_methodology_fact_requirement_delete` | Removes a fact requirement; refused while any question link remains. |

Existing writers (`_save`, `_dimension_save`, `_question_attributes_set`, `_question_sync`,
`_semantic_profile_set`, `_fact_requirement_set`, `_parameter_set`, `_reference_decision_record`,
`_lifecycle`, `_new_version`, `_adopt_reference`) are unchanged and still carry their own guards.

Every new operation writes a `supervisory_methodology_event` row (`QUESTION_CREATED`,
`QUESTION_UPDATED`, `QUESTION_RETIRED`, `DIMENSION_RETIRED`, `QUESTION_FACT_LINKED`,
`QUESTION_FACT_UNLINKED`, `FACT_REQUIREMENT_REMOVED`).

## 4. Validation

`supervisory_methodology_validate(methodology_id)` returns blocking and advisory findings and is
`SECURITY INVOKER`, so it sees only what the caller may see. It is informational: the action RPCs
remain the enforcement point.

Blocking: `DIMENSION_WEIGHT_SUM`, `DIMENSION_WITHOUT_QUESTION`, `QUESTION_WITHOUT_SEMANTICS`,
`SCORED_QUESTION_WITHOUT_AXIS`, `PARAMETER_UNAPPROVED`.
Advisory: `QUESTION_WITHOUT_CLASS`, `EVIDENCE_WITHOUT_MINIMUM`, `NA_WITHOUT_CONDITIONS`,
`FACT_DEFINITION_INCOMPLETE`, `REQUIRED_FACT_UNLINKED`.

## 5. Server-authoritative capabilities

`supervisory_methodology_studio_capabilities` extends the existing
`supervisory_methodology_action_capabilities` payload with `can_author`, `can_author_dimensions`,
`can_author_questions`, `can_author_semantics`, `can_author_facts`, `can_author_parameters` and
`requires_retirement_rationale`. Each carries the server's own refusal reason. The screen renders
those reasons; it never derives authority.

## 6. Write-path hardening (defect closed this wave)

Signed-in users could still write six methodology content tables directly, bypassing the governed
writers. `INSERT/UPDATE/DELETE` for `authenticated` was revoked on
`supervisory_methodology_semantic_profile`, `_fact_requirement`, `_question_fact`, `_parameter`,
`_reference_decision` and `_regulator_approval` (read access unchanged, `service_role` unchanged).
All ten methodology tables are now read-only to `authenticated`; the approval register is
immutable in privilege as well as in policy.

## 7. UI

`/admin/supervisory-methodology` and `/:methodologyId` (unchanged routes). The detail workspace now
has ten tabs — the new one is **Validation**. Dimensions & Questions gained governed authoring:
"Add question", "Edit question" and "Retire question" (rationale required), all gated by the server
capability payload, all writing through the RPCs above.

## 8. Verification

| Suite | Result |
| --- | --- |
| `scripts/verify-aml-methodology-studio.sql` (METH-STUDIO-01..24) | authored this wave; existence, DEFINER/search_path, anon denial, direct-write denial, RLS, authority boundary, history, concurrency, dependency guards, rationale, validation coverage, preservation — all executed read-only against the live database and PASS |
| `src/test/supervisoryMethodologyStudio.test.tsx` (METH-STUDIO-UI-01..06) | 6/6 PASS |
| `src/test/supervisoryMethodologyAdminUi.test.tsx` + `amlMethodologyAuthorityUx` | 33/33 PASS (no regression) |
| `tsgo --noEmit` | clean |
| Supabase linter | 1674 findings, 6 types. Baseline was 1667/6; the delta is the 7 new signed-in-callable DEFINER routines, which is the existing platform pattern. Anonymously callable DEFINER routines fell from 9 to 8. |

## 9. Preservation (verified after the wave)

`AML-CFT-RBA` v1.0 still `ACTIVE`; v1.1 still `DRAFT` / `MIPL_REFERENCE` with 70 active questions,
26 dimensions, 87 fact requirements, 8 unapproved parameters, 5 semantic profiles. No question,
dimension, fact, parameter or assessment row was created, changed or deleted. No table or function
was dropped or renamed. No calculation or materiality policy was invented.

## 10. Open blockers (unchanged, honestly classified)

`PRE_EXISTING_POLICY_OR_METHODOLOGY_BLOCKER`: CALC-05/06/09/11, AMLH-09, LINK-11 (22 legacy
`STR_SAR_GOVERNANCE` links), Epic-3 G/H — all awaiting an approved calculation configuration, a
supervisory-owner decision.
`INHERITED_NON_AML_REGRESSION`: unapproved `ChartNetwork` icon, missing Detection and Management
Assurance breadcrumbs, Portfolio Intelligence action coverage.

## 11. Completed authoring surfaces

Every methodology authoring action is available in the product; no SQL is required:

- methodology details (code, version, origin, ownership and approval status are never editable);
- dimensions: add, edit, reorder (display order is persisted server-side), retire with rationale and
  a server refusal while active questions remain;
- questions: add, edit, retire, with classification, semantics, applicability, evidence, N/A rules,
  standards and lineage;
- response semantics: add, edit, retire (refused while active questions depend on the profile);
- facts: definitions plus question/fact linking and unlinking;
- parameter definitions only — values and approval status stay outside the Studio and remain a
  regulator policy decision in the calculation and materiality layer;
- reference decisions, where governance permits.

Structural validation is server-owned and is executed inside the lifecycle operation, so blocking
errors genuinely refuse DRAFT to REVIEW and REVIEW to APPROVED. Unapproved materiality values are
advisory, not structural defects. The Validation tab groups errors, warnings and information, names
the affected object, explains remediation and links to the tab that fixes it.

## 12. AML-03 readiness

Ready: single authoring authority boundary, governed content operations with dependency guards and
concurrency, server-enforced validation gating, capability contract, hardened write paths, complete
Studio UI.
Not started: assessment programme / applicability architecture, bulk import authoring, and any
calculation or materiality policy.

## 13. Regulator context & selection contract (AML-02 addition)

Three concepts were previously conflated in supervisory configuration screens. They are now
distinct, and the distinction is owned by the server, not by React:

| Concept | Meaning | Source |
| --- | --- | --- |
| Regulator master / history | every regulator row ever recorded, including inactive ones | `useRegulatorMaster`, Regulator Management only |
| Authorised active scope | regulators the signed-in officer may configure or adopt for | `public.supervisory_authorised_regulator_options(_domain_code, _capability)` |
| Platform / MIPL reference | content with `regulator_id = NULL` | rendered as "MIPL Reference — not regulator-owned" |

`supervisory_authorised_regulator_options` is generic (domain + optional capability, usable by
Prudential and Market Conduct later) and returns only regulators whose `status = 'active'` that pass
`user_has_regulator_authority`, plus `selectable_count`, `active_regulator`,
`cross_regulator_allowed` and an explicit empty-scope `reason`. `supervisory_methodology_register_options`
and `supervisory_policy_profile_register_options` embed that same contract instead of listing the
regulators table, and `supervisory_methodology_adoption_targets` filters to active regulators.
`supervisory_domain_require_manage_for_regulator` now refuses an inactive or retired regulator as the
owner of new supervisory configuration, so adoption cannot create work for a non-operational
regulator, while historical rows and their lineage are preserved untouched.

UI behaviour (`RegulatorScopeFilter`, `useAuthorisedRegulatorOptions`):

- 0 selectable — "No active regulator is available in your authorised scope." Never widened.
- 1 selectable — contextual `Regulator: <name>` badge, no dropdown; adoption dialogs resolve the sole
  target automatically and read "Adopt for <name> (<code>)".
- 2+ selectable — a real selector; "All regulators" appears only when the server grants
  cross-regulator oversight. It is an enterprise-oversight value, never a configuration owner and
  never a label for platform reference content.

`RegulatorContext` treats `localStorage` as a preference only and ignores any stored id outside the
active regulator set; every read and write is re-authorised server-side.

Verification: `scripts/verify-regulator-scope-contract.sql` (REG-SCOPE-01, 01b, 02, 02b, 03, 04, 09,
10, 12, 13, 14 — all PASS, transactional and rolled back) and
`src/test/regulatorScopeContract.test.tsx` (REG-SCOPE-05, 06, 07, 08, 09, 11, 14 — 7/7 pass).
Current environment: 3 regulator rows, 1 active (`FSRA`), 2 inactive retained for history.
No regulator row, methodology, policy profile, assessment or AML business record was changed.

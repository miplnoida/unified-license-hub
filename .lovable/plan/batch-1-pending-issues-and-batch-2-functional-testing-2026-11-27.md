# Batch 1 Pending Issues and Batch 2 Functional Testing

Batch 1 results and fixes are accepted as-is. Completed tests, security reviews and privilege reviews are not repeated.

## 1. Workflow creation defect (proposal only)
- Read the live definition of `create_approval_workflow_with_steps` and the related type definitions, columns and casts (read-only catalogue queries).
- Name the exact root cause (expected: a cast to `workflow_action_type[]`, a type that doesn't exist or is in another schema, against the real column type).
- Write the exact correction (`CREATE OR REPLACE FUNCTION`, same signature, grants and business logic) and a full rollback that restores the current definition word for word.
- Impact: existing workflows, steps, versions and active applications. Checked by counting the affected rows.
- Regression and browser verification steps. Saved to `.lovable/reviews/workflow-create-fix-approval.md`. Not executed.

## 2. Employee creation notification (investigation only)
- Trace `create-web-user` and the notification event config to find out why an internal employee triggers "Portal access granted", and whether it is intentional (shared licensee path) or a defect.
- Look for an existing authorized QA account or supported provisioning path that sends nothing. If none exists, propose the exact backend change and its impact on employee vs licensee provisioning. Nothing is modified or deployed.

## 3. Fee Configuration
- Check the intended behaviour from the code and requirements:
  - Calculation-type rules saving without an expression.
  - The Fee Configs counter not following the selected regulator.
- If either is a frontend defect, fix it, add a focused test and retest in the browser (save is blocked, so only the validation is checked). Anything that needs a database change or a new business rule is reported separately.

## 4. Form Builder rendering tests
- Isolated, mocked Vitest tests on the real form renderer: required fields, conditional visibility, dependent fields, field-type validation, imported-field rendering, invalid submission and compatibility with existing (legacy JSONB) forms.
- Preview stays read-only. The QA form stays an unpublished draft.

## 5. Batch 1 record updates
- Regulator retire message: source-verified, not browser-verified.
- Update feature results and the workbook mapping. Ordinary-role testing and workflow create, steps, routing and publishing stay BLOCKED.

## 6. Batch 2 functional testing (read-only first)
- Modules: Entity Registry, Entity Resolution, Entity 360, Person 360, Public Registration, Application Processing, Fit & Proper. Every required feature and case comes from the certification workbook.
- Browser tests use the signed-in session, with all writes, functions, OTP, email and payment calls blocked. They cover screens, navigation, search, filters, paging, form validation, document visibility, status displays and related-module panels.
- Confirmed frontend defects get fixed, with tests and a retest.
- Results go to `.lovable/reviews/batch2-functional-results.md`. One grouped write-test approval request lists the exact QA records, dependencies and side effects.

## Regression
Full network-isolated Vitest, TypeScript, build and lint on changed files, compared with commit `0d397ad8b`.

## Restrictions kept
No SQL execution, no changes to the database, its functions or backend functions, no deploy or publish, no changes to records or demo data, no real communications or payments, no AML/CFT work. SEC-01 A, B and C and all holds stay unchanged. I stop before any unapproved write or Batch 3.

## Final report
1. Batch 1 resolutions and approval proposals
2. Batch 2 results
3. Defects fixed and retested
4. Blockers
5. Grouped write approval request
6. Regression results

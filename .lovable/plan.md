# Batch 1 Closure and SEC-01 Package A Approval Preparation

Scope is limited to the uploaded brief. No SQL execution, database or backend function changes, deployments, publishing, AML/CFT changes, demo data changes or changes to approval holds. Earlier assessments are not repeated.

## 1. Final Batch 1 verification
- Record the actual HEAD (expected `eaa4ee804`) and run the full Vitest suite once with the network cut off.
- Confirm the 8 permission-coverage issues added in Batch 1 are gone, and that the only failures left are the 4 already failing at e2e1017e2.
- Run TypeScript, a production build, and lint on the changed files only. Compare lint counts with e2e1017e2.
- Add mocked Form Builder tests for create, edit, save and import (button state and direct handler calls), for both allowed and refused users. They test the current rule: edit is needed to save.
- Read-only check: can an ordinary admin without `settings.view` still open Settings? Keep the super-admin override and report any mismatch with RBAC. No change to the rule yet; it goes into the section 3 proposals.

## 2. SEC-01 Package A approval pack (read-only)
- Regenerate Package A from current live privileges and check it against the existing files. Fix any statement or count mismatch, for example 661 removals against 355 tables.
- Write `.lovable/reviews/sec01/package-a-approval.md` with:
  - the complete SQL and complete rollback SQL
  - the exact affected tables and counts per role
  - all 92 retained tables, each with its exclusion reason (frozen AML/CFT, or a shared AML/CFT dependency)
  - confirmation of the AML/CFT freeze boundary
  - current effective privilege checks (direct grants, PUBLIC, role membership)
  - single-transaction handling with a 5-second lock timeout
  - evidence from searching the code, backend functions, workers and scheduled jobs that nothing uses TRUNCATE
  - backup and recovery readiness (the rollback script and the platform's point-in-time recovery status, as far as it can be read)
  - exact read-only checks to run before and after
- Packages B and C stay on hold. Package C is all-or-nothing: if one owner role cannot be changed, none of it runs.

## 3. Business-rule proposals (approval only)
Update `.lovable/reviews/batch1-permission-proposals.md` with exact frontend, SQL and backend changes for:
- Access-request review and decision: explicit permissions plus regulator/entity scope, with independent approval for privileged changes.
- Institution panels: keep Primary User and approved membership. Adjust the coverage-test expectation.
- Receipt issuance: a separate authority beyond viewing payments.
- Workflow `manage_config`: add it to the configured permission catalogue.
- Forms: create lets you save new forms; edit covers existing ones (RLS policy change).
- Settings: follow configured RBAC, with the super-admin override kept.
Existing permission definitions are reused wherever possible. Every new permission and every database or backend change is listed for approval and not carried out.

## 4. Next batch sequence
Add a short ordered sequence to the roadmap, reusing the existing proposals: SEC-06, then SEC-15, then SEC-02, SEC-04 and SEC-05. Each item lists its dependencies and approval gates.

## Deliverables
- Commit the tests, review documents and roadmap. Audit the diff to confirm there are no migration or function files, so committing deploys nothing.
- Give a concise chat report, then stop and wait for Package A execution approval.

## Approval conditions (2026-11-27)
- Do all remaining verification in one execution cycle. Run the final full regression after every new test has been added.
- Use current live privilege counts; never reuse earlier counts.
- If scheduled-job definitions, backup status or point-in-time recovery cannot be verified, say so plainly as a limitation.
- The rollback SQL must restore exactly the privileges Package A removes (one table/role pair per line), and nothing more.
- Keep the full AML/CFT freeze boundary and every existing approval hold.
- Do not implement the business-rule proposals. Do not expand scope or repeat earlier assessments.
- Include the complete Package A execution and rollback SQL in the report, then stop before any SQL execution, database change, backend deployment or publishing.

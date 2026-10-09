# Security remediation plan and tracker (analysis only)

## What you get
1. **Security Remediation Plan** (Word document): the full plan for Phases 0 to 10, covering:
   - findings with severity, evidence and proposed fix;
   - module-by-module and screen-by-screen coverage;
   - affected routes, roles, tables and APIs;
   - implementation order and dependencies;
   - manual and automated test steps, acceptance criteria;
   - regression and rollback strategy, effort estimates and phase checklists.
2. **Security Remediation Tracker** (Excel): one row per finding, with ID, phase, module, screen URL, severity, priority, evidence (file:line, table, function), proposed fix, dependencies, effort, test case, expected result, status and verification result. Sheets have filters, severity colours and a summary dashboard.

Nothing is changed while producing these. No code, data, migrations, access rules, functions, settings or publishing changes. Phase 1 starts only after your explicit approval.

## How findings are gathered (read-only)
- **Current reports:** re-check, not trust, the saved security scan, the database linter, earlier security reports in the repository, and the database audit workbook. Each old finding is labelled Confirmed open, Fixed, Partially fixed or Unverified.
- **Database:** tables without row-level security or with permissive rules, and tables signed-out users can read or write. Also:
  - privileged functions callable by signed-out or any signed-in user, with what they change;
  - helper functions that accept another user's ID;
  - storage bucket rules, audit-table write protection, and notification tables.
- **Code:**
  - routes without a permission guard; buttons with no matching server check;
  - direct browser writes to sensitive tables (approvals, licences, payments, returns, complaints);
  - edge functions: sign-in check, input validation, use of the service key, CORS and error leakage;
  - hardcoded role checks; secrets or personal data in the app or in logs.
- **Sign-in:** password rules, leaked-password check, OTP limits, forced password change, session expiry, logout, recovery, and MFA availability (read from auth settings and code).
- **Deployment:** dependency scan, security headers, environment files, backups and CI notes. Where the evidence is not accessible, the item is marked Unverified.

## Phases (as in your brief)
| Phase | Focus | Typical outcomes in tracker |
|---|---|---|
| 0 | Baseline and impact | Inventory, severity, order, regression risk |
| 1 | Sign-in and sessions | Lockout, OTP rate limits, MFA, session timeout |
| 2 | Roles, permissions, routes | Unguarded routes and actions, scope checks |
| 3 | Row-level security | Permissive or over-broad rules, entity and sector isolation |
| 4 | Direct-write bypass | Move sensitive writes behind governed server steps |
| 5 | APIs, edge functions, functions | Grants, input checks, cross-entity calls |
| 6 | Audit and monitoring | Coverage of key actions, tamper protection |
| 7 | Notifications | Recipient scoping, template data exposure, retries |
| 8 | Files and data | Bucket rules, signed links, ownership |
| 9 | Configuration and deployment | Secrets, headers, dependencies, backups |
| 10 | Regression and certification | Full browser and test suites, PASS/FAIL report |

Each phase in the plan lists:
- **Before work starts:** entry criteria, steps, dependencies and the migration safety checklist (dependency analysis, backward compatibility, test, rollback).
- **To finish:** verification, acceptance criteria and exit checklist.

## Rules applied
- Findings need evidence: exact file:line, table, function or URL, and how each was confirmed.
- No assumed issues. Each control is marked Implemented, Partial, Missing or Unverified.
- Fixes respect the configured roles and scopes (no hardcoded permissions). Only confirmed gaps are proposed.
- Testing uses TEST accounts and non-production data only.

## Technical details
- Evidence collection uses SELECT-only catalog queries, static code scans with `rg`, the saved scan results, the linter and a dependency scan.
- Generation runs in `/tmp`. The deliverables are `/mnt/documents/security-remediation-plan.docx` and `/mnt/documents/security-remediation-tracker.xlsx`.
- Effort is estimated in person-days per finding and rolled up per phase.

## Additional requirements (approved by you)
- **Full coverage, not samples.** Every screen, route, role, permission, table, access rule, database function, edge function and storage bucket is enumerated. The Summary shows total identified versus total reviewed for each object type, plus a list of uncovered areas and why.
- **Coverage matrix:** Role × Route × Action × Table with create/read/update/delete flags, from route guards, button permission checks, code table calls and access rules. Each row is marked as code-reviewed or not.
- **Manual test cases:** each has an ID, prerequisites, test role (TEST accounts), URL, exact steps, expected result, a read-only database check, and an evidence field.
- **Two separate result columns:**
  - Code Review Result: Confirmed Open, Fixed, Partial or Unverified.
  - Test Execution Result: PASS, FAIL, NOT TESTED or BLOCKED. Every test starts as NOT TESTED; no result is invented.
- **Historical findings:** each item from the earlier security, access-control and audit reports is re-checked against the current code and database, with old status, new status and evidence.
- **Counts and effort:** issues by severity, effort per finding rolled up per phase, and a production release blocker list.
- **Per phase:** measurable acceptance criteria.
- **Per fix:** dependency analysis, backward compatibility, rollback steps and named regression tests.
- **Additional tracker sheets:** Summary, Findings, Coverage Matrix, Test Cases, Historical Revalidation, Object Inventory (reviewed vs identified), Release Blockers, Phase Plan and Effort.
- After delivery, a short chat summary covers Critical/High findings, effort per phase and recommended order. No fixes start without your explicit approval.

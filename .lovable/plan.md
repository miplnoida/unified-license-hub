# OLRAS – Complete Functional Gap Assessment (assessment and planning only)

This plan covers the assessment only. No code, database, permission, record, email or publish changes are made. The findings and phased plan go to chat and to a review file, and then I wait for your approval.

## Step 1 – Check existing evidence against current state
- Read roadmap.md, docs/gaps/2026-11-25-gap-closure-status.md, the three pending SQL memos (correction saves, report registers, returns write grants), RBAC and security reports, the QA tracker, and the current Project monitoring findings.
- Check each claim against the current code and read-only database queries. Drop items that are already verified, and mark stale findings as stale.

## Step 2 – Inventory the whole application (read-only)
- List all routes, pages, hooks, RPCs, the 87 server functions, tables, RLS policies, grants, triggers and scheduled jobs.
- Map each one to the 24 modules in your brief.
- Run parallel read-only investigations by module group: access/auth/packages; licensing/post-licence/entity/F&P/UBO; returns/payments; supervision/examinations/complaints/enforcement/appeals; documents/correspondence/notifications/AI/integrations/audit/reports.

## Step 3 – Functional verification
- For each feature, check every applicable operation in the code. Operations cover create/edit/delete, draft/resume, submit/resubmit, review/return/approve, assign/escalate/close, search/filter/paginate, upload/download/export, configure/publish, and notifications/audit.
- Compare each write path with its grants and policies. A page that loads does not prove that saving works.
- Browser checks are read-only navigation with existing accounts. No form submissions, test data, emails or OTPs.
- Read-only queries confirm whether an empty screen is a real defect or just missing data.

## Step 4 – Security and data integrity (high priority)
- Check institution capability checks, backend post-licence and package enforcement, anonymous write/TRUNCATE grants, and missing SELECT/DML grants.
- Check that submitted records cannot be changed. Also check appeal event authorization, scheduled reports that run with service-role access, maker-checker controls, missing audit entries, and orphaned or inconsistent records.
- Wherever possible, name an existing governed RPC that could be reused instead of a direct table grant.

## Step 5 – Deliverables
- A gap register at `.lovable/reviews/functional-gap-register.md` with every field you asked for: ID, module, URL, file/function, expected/current behaviour, root cause, evidence, impact, priority, solution, whether a database change is needed, dependencies, effort, acceptance criteria, tests and status.
- The register uses your seven status values.
- A phased plan, Phases 1–8, with tasks, files, dependencies, effort, database changes, tests and completion criteria.
- A separate AML/CFT backlog that stays frozen.
- Held items (correction saves, report-register grants, returns write grants) are listed as ON HOLD and not re-proposed.
- A chat summary of the top findings and priorities, then a wait for your approval.

## Restrictions honoured
- No code edits, migrations, write queries, RLS or grant changes, record changes, notifications or deployment.
- Rodney Bay records are preserved. The AML-CLOSE-08 freeze stays in place.
- Nothing is marked VERIFIED WORKING without cited evidence.
- Any future database change will come with exact SQL, its security impact and rollback for approval.

## Note
Writing the register file is the only file this needs. If you want the findings in chat only, say so and I'll skip the file.

# Demo readiness: Sessions 2-4 (Rodney Bay, CU-DEMO-2026)

## Scope
I will reuse only the existing records:
- Rodney Bay Community Credit Union Ltd (cc331000-...0001)
- Applicant rodneybay.registration@yopmail.com
- Application APP-2026-002011
- Existing payment TXN-1792648603-2B7B7D (XCD 2,500)

Nothing new is created. That means no new organisation, application, payment, approval, licence, return, AML assessment, enforcement decision or appeal.

I make no code, schema or settings changes and do not touch the AML/FSRA protected records.

## Step 1 - Existing data inventory (read-only database)
Locate and link every listed record, and mark each one Usable, Incomplete, Inaccessible or Not linked.

**Session 2**
- Registration and entity link
- APP-2026-002011 and its pinned form version
- Published form versions
- Payment and receipt
- Governance and Fit & Proper records
- Documents
- Workflow assigned to the application

**Session 3**
- Prudential assessment
- Supervisory plan SP-CU-DEMO-2026-01
- Examination EXM-CU-DEMO-2026-01 with its findings and corrective actions
- Credit Union return configuration
- AML configuration and existing assessments, read only

**Session 4**
- Complaints CMP-2026-000126 to CMP-2026-000130
- Investigation CI-CU-DEMO-2026-01
- Conduct findings CF-CU-DEMO-2026-01 and CF-CU-DEMO-2026-02
- Enforcement referral ENF-CU-DEMO-2026-01
- Audit records

## Step 2 - Browser walkthrough (read-only viewing)
- Open each page in the runbooks as the right role: applicant, licensing officer, supervisor, AML lead, conduct officer and executive. Record what loads and what is linked.
- Business actions are not performed. "Ready" is given only where the page actually rendered the Rodney Bay record in the browser. Anything else is marked "backend verified only".
- If a staff role has no usable session, I will say so rather than claim the page was checked.

## Step 3 - Configuration review
For fees, forms, workflows, returns, risk/AML methodology, complaint rules and notifications, I will record:
- The configuration screen and its URL
- What can be configured
- The business screen where the effect shows
- Whether it is full or partial

No live configuration is changed.

## Step 4 - Deliverables (in Files, under `demo/`)
1. `readiness-matrix.md`: every feature with its URL, role, record, configuration dependency, status, evidence type, blocker, fix, owner, effort and date.
2. `demo-data-inventory.md`: records and how they relate to each other.
3. `session-2-runbook.md`, `session-3-runbook.md` and `session-4-runbook.md`: timed, step-by-step video scripts with the role, URL, record, action, expected result, talking point, configuration-to-effect moment, cross-module links, fallback and a dry-run checklist.
4. `blockers-and-dependencies.md`: Session 2 blockers first. Already known:
   - The draft is pinned to the old form version and needs a separately approved re-pin.
   - Approval and licence issuance need authorised staff.
5. `schedule-and-owners.md`: a dependency-ordered, accelerated schedule by role (Licensing Lead, Configuration Admin, Prudential Lead, AML/CFT Lead, Conduct Lead, QA Lead, Presenter). Names and dates are marked "to confirm".
6. `executive-summary.md`: what is genuinely demo-ready today.

## Technical details
- Data checks use read-only queries only.
- Browser viewing uses Playwright with injected or minted sessions. Each check is recorded with a screenshot reference kept in /tmp, not in Files.
- No credentials appear in any document.

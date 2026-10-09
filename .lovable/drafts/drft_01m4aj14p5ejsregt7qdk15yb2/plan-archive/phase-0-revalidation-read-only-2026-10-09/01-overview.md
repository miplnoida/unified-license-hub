## Phase 0 revalidation (read-only)

Re-check all 24 findings from the existing plan and tracker against the current code and live database settings. Then produce updated versions of both documents. Nothing in the app or database changes.

### Steps
1. **Gather the current state (read-only).** Use read queries to collect function access rights, security settings, policies and table permissions. Search the code for routes, direct writes and calls into backend functions. List Edge Functions, storage buckets and the latest saved scan without starting a new scan.
2. **Check the priority findings in detail.** For SEC-001 to SEC-008, confirm who can call each function and how the call actually reaches it. Read each function's code and test only whether access is refused. Never call reset, seed, wipe, token, audit or notification functions. Each finding is recorded as Confirmed Open, Fixed, Partial or Unverified, with evidence (file:line, policy, permission or function). False positives get flagged and their severity corrected.
3. **Revalidate the other 16 findings** the same way.
4. **Impact analysis** for each confirmed finding:
   - the fix
   - affected modules, tables, screens and APIs (registration, forms, licensing, approvals, payments, PPOC, returns, complaints, notifications)
   - what could break
   - migrations needed
   - rollback
   - effort
5. **Verification cases.** Write manual and automated test cases using TEST roles, URLs, steps, expected allow/deny results, read-only SQL checks and acceptance criteria. Every case stays NOT TESTED.
6. **Order the work.** Containment for confirmed Criticals comes first, then the reordered remaining phases. The plan ends with a GO / NO-GO call.

### Deliverables
- Updated `/mnt/documents/security-remediation-plan.docx` (v2) with these sections:
  - revalidated findings
  - critical priority matrix
  - module impact
  - phase plan
  - risk and rollback
  - Phase 0 checklist
  - GO / NO-GO
- Updated `/mnt/documents/security-remediation-tracker.xlsx` with these sheets:
  - Revalidation
  - Critical Matrix
  - Impact
  - Test Cases
  - Rollback
  - Checklist
  - Change log against v1

### Guardrails
- Every query is read-only.
- No fixes, migrations, deploys or new scans.
- Automated-scan evidence is labeled separately from manual verification.
- Work stops after delivery and waits for approval.

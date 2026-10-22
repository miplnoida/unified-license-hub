## Fix Session 2 and 3 demo blockers (one pass)

Investigate all five Session 3 failures in one pass, apply the code-only fixes your brief already approves, and verify each one in the browser as the intended role. Session 2 is checked and unblocked only through legitimate actions.

**Session 3, investigated together**
- Step 3, prudential assessment: trace the route guard, permission module, assessment query and scope for the Prudential Supervisor. Then fix the guard or query mismatch.
- Step 6, plan SP-CU-DEMO-2026-01: compare the list page's data source and filters (status, type, sector, regulator) with the stored record. Then fix the filter or source mismatch. No duplicate plan is created.
- Step 9, EXM-CU-DEMO-2026-01: trace the route module (domain-based guard), the Inspection Supervisor's permissions and the examination list scope. Then fix the guard or query logic.
- Step 10, findings: check the finding URL parameter against the table the detail page reads. The three existing findings must open. No new findings are created.
- Step 11, corrective actions: trace the list query and entity scope for the Prudential Supervisor, and fix the filter. Statuses and history stay as they are.

**Session 2**
- Confirm that APP-2026-002011 is on form v2.0, the XCD 2,500 payment is unchanged, and the state of Kendall's case (FPA-CU-DEMO-2026-0004): who owns it, which action is pending, and which page it is on.
- List the other final-approval prerequisites (sufficiency blockers). No decision is made on Kendall's case on anyone's behalf. Licence issuance and creation of the primary web user go ahead only after the authorized officer acts.

**Rules**
- Code-only fixes go in directly.
- If a root cause needs a change to permissions, grants, row-level security rules or the database structure, stop and show you the exact change for approval.
- The AML freeze is respected.

**Verification**
- Run the existing tests for each module I touch.
- Check each step in a Playwright session signed in as the intended role.
- Deliver the final completion table in the format you asked for. No new planning documents.

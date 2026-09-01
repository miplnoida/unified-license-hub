# Fix "Licensing prerequisites are not satisfied" on admin final approval

## What is actually happening (verified)

The backend refusal is genuine, not a crash. The last blocked attempt on application `APP-2026-001932` recorded exactly three failing gates in the audit log:

| Gate | Recorded state | Verified cause |
|------|----------------|----------------|
| Forms / documents | `REQUIRED_AND_INCOMPLETE` (1 of 1 outstanding) | The pinned requirement row is still `PENDING` with no linked response, even though the applicant's form response for the same template/version is `submitted`. Nothing in the submission path ever reconciles the requirement row. |
| Workflow | `BUSINESS_CONFIGURATION_REQUIRED` | The readiness check re-resolves a workflow from configuration and finds none, because the application's licence type text is `Money Services Business - Money Services Business - Money Services Business` while the only active pre-application workflows are typed `general` / `Insurance`. The application is nonetheless *already running* the "Pre License Approval Workflow" at its final step. |
| Fit & Proper | `BUSINESS_CONFIGURATION_REQUIRED` | The `licensing_gate_configs` table is completely empty, so no regulator declaration exists for whether Fit & Proper applies. |

Registration handoff, fees, conditions and coordination gates already pass.

So the approval is blocked by two system defects (stale requirement status, workflow gate ignoring the live instance) plus one genuine missing configuration (Fit & Proper declaration).

## Fix

### 1. Reconcile form requirements on submission (real defect)
- Add a governed database routine that marks pinned `application_form_requirements` rows as satisfied — setting `status` and `response_id` — from the matching submitted `form_responses` row (same application, same template, same pinned version).
- Call it from the submission path so every future submission leaves requirements consistent, and run a one-off backfill for already-submitted applications whose requirements are stale.
- Requirements with no submitted response stay outstanding; the gate keeps its blocking power.

### 2. Make the workflow gate trust the live workflow instance
- When an application already has an active workflow instance whose workflow has steps, the workflow gate reports `PASS` and names that workflow. Configuration re-resolution stays as the fallback for applications with no instance yet.
- Rationale: the engine has already validated the step, approver and action; a second, stricter re-resolution that disagrees with the running instance can only ever produce an unactionable dead end.

### 3. Declare the Fit & Proper gate (configuration, not code weakening)
- Seed the missing `licensing_gate_configs` declarations for the licence types in use so `fit_and_proper` has an explicit `REQUIRED` / `NOT_APPLICABLE` answer instead of "undeclared".
- Default proposed: Fit & Proper `NOT_APPLICABLE` for licence types with no Fit & Proper cases bound, `REQUIRED` where cases exist. Tell me if you want it forced `REQUIRED` for Money Services Business instead.

### 4. Licence-type text defect (flagged, contained)
The tripled licence label on this application is a separate data-composition defect. This change does not depend on it, and I will not rewrite the stored value as part of this fix unless you ask.

### 5. Verify
- Re-evaluate readiness for `APP-2026-001932` and confirm all gates pass, then confirm the admin approve action completes.
- Confirm an application with a genuinely missing form still blocks.
- Add `scripts/verify-licensing-readiness-reconciliation.sql` covering: stale requirement backfill, live-instance workflow gate, and the negative (incomplete forms) case.

## Technical notes
- Touched: one new migration (requirement reconciliation routine + backfill, `application_licensing_readiness` workflow gate, gate-config seed), `supabase/functions/verify-and-submit/index.ts` (invoke reconciliation after `submit_application`), one verification script.
- No change to ratio calculation, group supervision, CAMELS, PFMI, navigation or RBAC.
- The 422 remains fail-closed for real blockers; the UI already surfaces per-gate detail.

## Fix approach (low impact)

The stored status values and the workflow engine stay the same. Reports, filters, regulator queues, final approval and reject/cancel checks all rely on `in_progress` today, so changing the value could break them. Instead, add one shared rule: **an application that has been submitted is never applicant-editable unless it was returned to the applicant** (returned / resubmission / query / info-requested statuses, which keep working as they do now).

### 1. Shared rule (frontend)
In `src/lib/applicationStatus.ts`, add:
- `isUnderRegulatorReview(app)`: true when the status is submitted, or the status is `in_progress` and the submission time is set.
- `isApplicantEditable(app)`: true for draft/in_progress only when the application is not under review, plus the existing returned-to-applicant statuses.
- `getApplicationDisplayStatus(app)`: shows **"Under Review"** for a submitted `in_progress` application. Otherwise it uses the existing labels.

### 2. Use the rule wherever editing or "Continue" is offered
Replace the raw `['draft','in_progress',…]` checks with the helper in these places only:
- `src/pages/applications/ApplicationDetail.tsx`: form `editable` (2 places), `canPay`, taxonomy edit, the draft-only action block, and the status badge label.
- `src/pages/applications/ApplicationsList.tsx`: applicant Edit/Continue/Delete actions and the status label.
- `src/pages/PreLicenseeDashboard.tsx`, `src/components/dashboard/applicant/RequiredFormsList.tsx`, `ApplicationTimeline.tsx`, `RecentActivityPanel.tsx`, `src/components/dashboard/widgets/index.tsx` (drafts widget): no "Continue" or "Draft" label for submitted applications.
- `src/pages/NewApplication.tsx` and `ApplicationForms.tsx` continue routes: if a submitted application under review is opened, show it read-only and send the user to the detail page. Do not show the wizard.

### 3. Server-side guard (needed, because client checks are not a boundary)
Stage one additive database change. It applies when you accept the draft:
- `application_draft_save`: refuse applicant edits when the status is `in_progress` and the submission time is set (error `APPLICATION_UNDER_REVIEW`). Staff edit paths are unchanged.
- `mark_application_in_progress`: no change needed. It only acts on `draft`.

Edge function `verify-and-submit`: refuse re-submission of an `in_progress` application that already has a submission time. This stops duplicate workflow starts. It needs an edge-function deploy, which I will confirm with you first.

### 4. Not changed
Workflow engine (`perform_workflow_transition`), final approval, reject/cancel rules, status values in the database, reports and filters, payments, roles, permissions, RLS, the Role Not Found work, and the cross-institution work. No existing records are rewritten. APP-2026-000163 fixes itself because the new rule reads its submission time.

## Tests
- Unit tests for the new helpers: draft, unsubmitted in_progress (editable), submitted in_progress (locked, "Under Review"), returned/resubmission (editable), approved/rejected (locked).
- SQL check, after acceptance: an applicant draft save on a submitted in_progress application is refused, and an unsubmitted draft save still works.
- Browser: as the applicant on APP-2026-000163, the page shows "Under Review" with no edit, pay or continue controls. An existing unsubmitted draft can still be edited. As the regulator, workflow actions still work.

Nothing is published without your approval.

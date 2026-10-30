## Results of the requested checks (read-only)

1. **The submission time is reliable.** It is set only by the submit step. No function clears it on return, resubmission or decision. All 0 returned/resubmission applications lack it. The only non-draft application without it is one withdrawn record (`APP-2026-002014`), and withdrawn is never editable anyway.
2. **Applicant edit paths found:**
   - The draft save command (`application_draft_save`) allows `in_progress`. **It reopens.**
   - Direct record updates are governed by `can_mutate_application`. Its applicant branch allows `in_progress`, so a direct API update is possible today. **It reopens.**
   - The detail page, list actions, dashboards and continue wizard all use raw `draft/in_progress` checks. **It reopens.**
   - Form answers (`form_responses`) and file uploads are "own rows" rules with no application status check. This is pre-existing and affects every submitted status, not only this bug. I am noting it and leaving it unchanged (see "Not changed").
3. **Returned / RFI / resubmission paths** use their own statuses (`resubmission_requested`, `resubmission_required`, `query_raised`, `returned_for_correction`, `info_requested`) and the RFI response permission. All are left exactly as they are.
4. **Payments:** payment is mandatory before submission. No payment exists that was created after a submission. The payment control is **left unchanged**, so any legitimate later fee request keeps working.
5. **Intermediate approvals:** the step-transition function sets only `in_progress` and moves the step. Final approval goes through a separate final-approval command. This application has no approval time, which confirms it was not finally approved. No change is needed.

## Fix (no workflow engine change, no status value change, no record rewrites)

**Rule:** an `in_progress` application that has a submission time is "Under Review". It is never applicant-editable.

### Frontend files
- `src/lib/applicationStatus.ts`: add `isUnderRegulatorReview`, `isApplicantEditable` and `getApplicationDisplayStatus` (shows "Under Review").
- `src/pages/applications/ApplicationDetail.tsx`: form `editable` (2 places), taxonomy edit, the draft-only action block, and the badge label. `canPay` is unchanged.
- `src/pages/applications/ApplicationsList.tsx`: applicant Edit/Continue/Delete visibility and the status label (applicant view only).
- `src/pages/PreLicenseeDashboard.tsx`, `src/components/dashboard/applicant/RequiredFormsList.tsx`, `ApplicationTimeline.tsx`, `RecentActivityPanel.tsx`, `src/components/dashboard/widgets/index.tsx`: show "Under Review" with no Continue for submitted applications.
- `src/pages/NewApplication.tsx`, `src/pages/ApplicationForms.tsx`: opening the continue wizard for an application under review redirects to the read-only detail page.
- New test file `src/lib/__tests__/applicationStatus.underReview.test.ts`.

Regulator screens, queues, filters and reports keep their current labels and queries.

### Database (one additive staged change, applied only when you accept the draft and approve)
- `application_draft_save`: refuse an applicant save when the status is `in_progress` and the submission time is set (`APPLICATION_UNDER_REVIEW`). Staff permission paths are unchanged.
- `can_mutate_application`: the applicant-owner branch excludes `in_progress` with a submission time. Staff, super admin, and the external submit/RFI-response branches are unchanged.

No tables, columns, status values, RLS policies, permissions or records change.

### Edge function `verify-and-submit` (deploy only with your approval)
Refuse re-submission of an `in_progress` application that already has a submission time. This prevents a second workflow start. The resubmission statuses are unchanged.

## Not changed
Workflow engine, final approval/rejection/cancel, notifications, audit triggers, queues, reports, payments, the form-answer/upload "own rows" rules (pre-existing; can be reviewed separately), RBAC/RLS, the Role Not Found work and the cross-institution work (both on hold).

## Regression tests
- Unit tests for each status, with and without a submission time: draft, unsubmitted in_progress, submitted, submitted in_progress, the 5 returned statuses, approved, rejected, withdrawn, cancelled. They cover editability and the label.
- SQL checks inside a rolled-back transaction, after acceptance:
  - Applicant draft save refused on a submitted in_progress application.
  - Allowed on an unsubmitted draft.
  - Allowed on a returned application.
  - Direct applicant update refused.
  - Staff update still allowed.
- Existing application list/detail Vitest suites rerun.
- Browser:
  - As the applicant on APP-2026-000163: "Under Review", no edit/continue controls.
  - An unsubmitted draft is still editable.
  - As the regulator: the next workflow action still works and final approval is unchanged.

## Rollback
- Frontend: revert the files listed above.
- Database: re-apply the current definitions of the 2 functions (captured verbatim in the staged change's rollback note).
- Edge function: redeploy the previous version.

No data needs reverting, because no records are rewritten.

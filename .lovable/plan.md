## Scope

The Applicant Portal enhancement is functionally in place. Code review against the spec identified two concrete gaps and one verification gap. This plan closes them without rebuilding anything.

## Remaining Gaps to Fix

### 1. Track Application button missing on Registration Success
`src/pages/registration/RegistrationSuccess.tsx` does not pass `trackHref` to `SubmissionAcknowledgement`, so the "Track Application" CTA never renders.

**Fix:** pass `trackHref="/registration/status"` (existing route) so the button appears.

### 2. Recent Activity is single-event-per-application
`RecentActivityPanel.tsx` derives one row per application from `recent_applications`. The spec lists multi-event verbs (Draft Saved, Submitted, Info Requested, Returned, Resubmitted, Approved, Rejected, License Issued).

**Fix:** switch the panel's data source to the existing `audit_logs` table (already used elsewhere), filtered by the current applicant's user_id, ordered `created_at desc`, limit 15. Map known `action` values to friendly verbs. Keep the existing empty state. No new tables, no edge functions, no schema changes.

### 3. Live verification on an applicant session
Previous verification ran as `super_admin` (which routes to SupervisoryDashboard). The applicant-side dashboard, Continue Draft, Action Required → Continue, RegistrationSuccess, and responsive layout were not exercised against the running app.

**Fix:** run a Playwright pass once an applicant/pre-licensee session is available, capturing screenshots of:
- `/` applicant dashboard (banner, 7 cards, Required Forms, Action Required, Timeline, Recent Activity, My Licenses)
- Continue Draft → `/applications/:id/continue`
- Action Required Continue → `/applications/:id`
- `/registration/success` showing all CTAs incl. Track Application
- Tablet (768) and mobile (390) viewports for layout regression
- Console + network panels for errors / duplicate requests

## Files To Change

- `src/pages/registration/RegistrationSuccess.tsx` — add `trackHref` prop.
- `src/components/dashboard/applicant/RecentActivityPanel.tsx` — swap data source to `audit_logs` (read-only query via existing supabase client), add action→verb map, keep empty state.

No other files are touched. No DB migrations. No new routes. No permission changes.

## Out of Scope (intentionally not changed)

Registration form builder, workflow engine, RFI/resubmission/return-for-correction actions, renewal flow, document upload, permissions, route guards, edge functions, `useApplicantMetrics`, `useApplicantLicenses`, `LicenseStatusList`, `ApplicantDashboard` layout, `RequiredFormsList`, `ActionRequiredList`, `ApplicationTimeline`, `SubmissionAcknowledgement` shared component.

## Verification & Final Report

After the two edits, run the Playwright pass above (requires applicant session — if `LOVABLE_BROWSER_AUTH_STATUS` is `signed_out`, will request the user sign in as an applicant in preview). Then produce the 6-section report (Implemented / Connected to Live Data / Manual Tests / Regression / Remaining Gaps / Completion Status) and only mark COMPLETE if every Playwright check passes with no console errors, no failed requests, and no layout breakage.

## Goal
Extend the existing Applicant / Pre-Licensee Portal so it visually and functionally matches the uploaded LIC-APP spec — without rebuilding it, duplicating workflow logic, or touching backend/permissions/routes.

All data continues to flow through the existing hooks (`useApplicantMetrics`, `useApplicantLicenses`, `useLicenseExpiryStatus`, `useRegistrationApprovalStatus`, `useExternalPortalAccess`) and existing pages (`/applications`, `/applications/:id`, `/applications/new`, `/billing/pre-licensee`, renewal in `LicenseStatusList`).

## Scope by Phase

### Phase 1 — Welcome Banner + Summary Cards (extend existing)
Extend the banner already in `ApplicantDashboard.tsx` to also surface:
- Entity Name (from `applicant_metrics` / latest application `data.entity_name` or `data.applicant_name`)
- Applicant Type (pre-licensee vs licensee via `EffectivePortalContext`)
- Current Status chip (registration status when no licenses; license status otherwise)

Summary cards already exist; add **Rejected** to the top strip and ensure every card links to the existing filtered list route (no new pages).

### Phase 2 — Required Forms as Cards
New presentation-only component `src/components/dashboard/applicant/RequiredFormsList.tsx`.
- Source: existing `useApplicantMetrics` recent applications **plus** existing `useFormTemplates`/registration required-forms hook already used inside `PreLicenseeDashboard` and registration flow (reuse, do not refetch).
- Each card: Form Name, Description, Status badge, Progress (steps completed / total from existing draft data), Last Updated, primary CTA = Start / Continue / Resume routed to existing `/applications/:id/continue` or `/applications/new`.

### Phase 3 — Action Required (reuse workflow statuses)
The current `ApplicantDashboard` already lists `action_required` rows. Promote it into a richer card grid `src/components/dashboard/applicant/ActionRequiredList.tsx` showing:
Application Number · Request Type (mapped from status: Info Requested / Resubmission Requested / Returned for Correction / Clarification / Needs Changes) · Requested Date (`updated_at`) · Status badge · **Continue** → existing `/applications/:id` route.
No new tables, no new workflow calls.

### Phase 4 — Application Timeline
New display-only component `src/components/dashboard/applicant/ApplicationTimeline.tsx`.
- Input: the latest active application from existing metrics (or "most recent non-draft").
- Renders fixed milestone steps (Draft → Submitted → Under Review → More Info Requested → Resubmitted → Approved / Rejected) and marks the reached step based on `status`. No workflow IDs exposed.

### Phase 5 — Recent Activity
New display-only component `src/components/dashboard/applicant/RecentActivityPanel.tsx`.
- Reuse the existing `recent_applications` list already returned by `useApplicantMetrics` (already includes `updated_at`).
- Map status → friendly verb (Draft Saved / Submitted / Returned / More Info Requested / Resubmitted / Approved / License Issued).
- Empty state: "No recent activity".
- Replaces the inline "Recent activity" section currently inside `ApplicantDashboard.tsx`.

### Phase 6 — My Licenses
Keep using existing `LicenseStatusList` (already wired with `renewMode="expired-only"`).
- Add Issue Date and License Type columns by passing the values already on the row (`license_number`, `status`, `valid_until` are present; extend `useApplicantLicenses` select list with `issued_at, license_type` only — no schema change).

### Phase 7 — Submission Acknowledgement
Enhance `src/pages/registration/RegistrationSuccess.tsx` and (if present) the post-submit screen used by application submit. New shared component `src/components/applications/SubmissionAcknowledgement.tsx`:
- Success banner, Reference Number, Submitted Date, Current Status, Expected Next Step (derived from status text).
- Buttons: Return to Dashboard, Track Application (`/applications/:id`), Download Acknowledgement (placeholder button that triggers `window.print()` fallback when no backend endpoint).
- Wire into `RegistrationSuccess` and the existing application-submit success screen (search call sites of `RegistrationSuccess` / submit redirect; do not change submit logic itself).

### Phase 8 — Layout
Reorganize `ApplicantDashboard.tsx` only:
```text
Row 1 (full): Welcome Banner
Row 2 (full): Summary Cards (existing strip)
Row 3:       [ Applications / Required Forms ]  [ Action Required ]
Row 4:       [ Recent Activity ]                [ My Licenses ]
```
Responsive: stacks on mobile/tablet via existing Tailwind `lg:grid-cols-2`.

## Technical Notes
- All new files live under `src/components/dashboard/applicant/` plus `SubmissionAcknowledgement.tsx`. Pure presentation — no new queries except a light extension of `useApplicantLicenses` select fields.
- No edits to: routes, edge functions, RLS/migrations, permissions, registration submit, OTP, signature, workflow engine, `PreLicenseeDashboard.tsx` table logic, `LicenseStatusList` renewal logic.
- Reuses existing tokens/shadcn primitives — no hardcoded colors.

## Verification Checklist (will be re-produced in final reply)
- [ ] Welcome banner shows name, entity, registration #, applicant type, status
- [ ] Summary cards: Draft, Submitted, Under Review, Approved, Rejected, Action Required, Pending Payments — all link to existing routes
- [ ] Required Forms render as cards with Start/Continue/Resume → existing routes
- [ ] Action Required cards built from existing workflow statuses; Continue opens existing edit page
- [ ] Application Timeline derived from existing status field
- [ ] Recent Activity sourced from existing `recent_applications`
- [ ] My Licenses uses existing `LicenseStatusList` with Renew (expired-only)
- [ ] Submission Acknowledgement shown after registration + application submit
- [ ] Layout matches spec rows; responsive
- [ ] No existing workflow/registration/permission/route/db changes

## Out of Scope
New RFI module, new renewal flow, permission changes, route changes, edge function changes, database migrations, registration submit logic, signature/OTP flow.
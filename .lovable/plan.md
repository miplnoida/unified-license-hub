# Timestamp Consistency — Show Date + Time Across Core Modules

Display-only change: event timestamps in Registration, Pre-Application, Post-Application, Returns and Complaints views currently render as date-only in most places. They will show date and time using one shared formatter.

## Current state (verified)

- There is no shared date/time utility. `src/lib` has only scoped helpers (`formatAppealDate`/`formatAppealDateTime` in `licenseAppeals.ts`, `formatCertificateDate` in `licensing/decisionDocuments.ts`).
- 132 files call `toLocaleDateString()` directly; others call date-fns `format(..., 'PP')`, `'MMM d, yyyy'`, `'dd MMM yyyy'`.
- One good local pattern already exists: `ApplicationQueue.tsx` defines a private `Intl.DateTimeFormat` datetime helper with `'—'` fallback. That becomes the basis for the shared helper.

## Approach

1. **Add one shared formatter** at `src/lib/datetime.ts`:
   - `formatDateTime(value)` → `08 Aug 2026, 12:34 PM` (browser locale/timezone via `Intl.DateTimeFormat`, no manual offset math).
   - `formatDateOnly(value)` → for genuine date-only business fields.
   - Both return `'—'` for null/empty/unparseable input (never `Invalid Date`, `NaN`, or 1970).
2. **Replace date-only rendering of event timestamps** in the module surfaces below, keeping the exact field each view already reads (`created_at`, `submitted_at`, `raised_at`, `received_at`, `responded_at`, `dispatched_at`, `submitted_for_approval_at`, `reviewed_at`, `closed_at`, etc.).
3. **Leave date-only business fields alone**: due dates, period start/end, effective/expiry dates, DOB, reporting periods, calendar/holiday dates. Where those are touched at all it is only to route them through `formatDateOnly` for consistent output.
4. **Sorting untouched** — all sorting/filtering continues to use raw ISO values; only the rendered string changes.
5. **Responsive safety** — timestamp cells get `whitespace-nowrap` where a table cell could wrap awkwardly; no table redesign.

## Surfaces to update

Registration
- `src/pages/admin/RegistrationReview.tsx` (review queue rows)
- `src/pages/registration/RegistrationPortal.tsx`
- `src/pages/registration/RegistrationStatusPage.tsx`, `RegistrationSuccess.tsx` (submitted-at display)
- registration review detail/history panel timestamps

Pre-Application / Post-Application
- `src/pages/applications/ApplicationsList.tsx`
- `src/pages/applications/ApplicationQueue.tsx` (switch its local helper to the shared one)
- `src/pages/applications/ApplicationDetail.tsx`
- `src/components/dashboard/ApplicationCard.tsx`
- `src/components/applications/`: `ApplicationRfiTab.tsx`, `ConsolidatedCaseTab.tsx`, `ApproverDecisionView.tsx`, `LegalReferralPanel.tsx`, `LicenseConditionsPanel.tsx`, `PaymentVerificationDialog.tsx`, `RaiseRfiDialog.tsx`, `StatusTimeline.tsx`
- `src/pages/admin/PostLicensingApplications.tsx` (submitted column)

Returns
- `src/pages/returns-mgmt/ViewReturns.tsx`, `ReturnDetail.tsx` (filing/history/version panels)
- `src/pages/entity/returns/MyReturnsPage.tsx`, `FillReturnPage.tsx` (submission timestamps only; due date stays date-only)
- `src/components/entity-detail/ReturnsTab.tsx` (submitted column)
- return version/amendment history drawer timestamps

Complaints
- `src/pages/complaints/ComplaintsList.tsx`, `ComplaintDetail.tsx`, `ComplaintTracking.tsx`
- `src/pages/complaints/rfi-approvals/RfiApprovalQueue.tsx`, `escalations/EscalationCaseDrawer.tsx`
- `src/components/complaints/`: `ComplaintRfiTab.tsx`, `ComplaintInvestigationTab.tsx`, `ComplaintEvidenceRow.tsx`, `duplicates/ClusterDetailDialog.tsx`, `ClusterGroupsPanel.tsx`
- `src/pages/entity/complaint-rfis/MyComplaintRfis.tsx`

Column labels stay as-is unless a header becomes ambiguous.

## Explicitly not changed

Workflows, SLA definitions/runtime, lifecycles, RLS/RBAC, notifications, audit, integrations, decision gates, database schema and stored values. No edge functions, no migrations.

## Verification before reporting done

- Playwright pass over each module's list/queue and one detail/history panel in the running preview, with screenshots, confirming date + time and no `Invalid Date`.
- Console error check on each visited route.
- `tsgo` typecheck, existing vitest suite, and production build.
- Spot-check that sorting, filtering, pagination and detail navigation still work on the touched lists.

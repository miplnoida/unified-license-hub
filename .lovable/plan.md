## Goal
Scope the pre-licensee dashboard so counts, recent list, and the "View all" link only reflect pre-licensee applications (no post-licensee leakage).

## Changes

### 1. `src/hooks/useApplicantMetrics.ts`
- Accept a second arg `scope: 'all' | 'pre' | 'post'` (default `'all'`, keyed into queryKey).
- When scope is `'pre'`, add filters to every `applications` query (count queries + recent list):
  - `.is('data->>service_id', null)` (post-license apps always carry a `service_id`)
  - `.neq('data->>type', 'post_license')`
- When scope is `'post'`, the inverse (kept for symmetry; not used yet).
- Payments queries are unchanged.

### 2. `src/components/dashboard/ApplicantDashboard.tsx`
- Read `useEffectivePortalContext()` to detect `isPreLicensee`.
- Compute `scope = isPreLicensee ? 'pre' : 'all'`; pass it into `useApplicantMetrics(user?.id, scope)`.
- Set application-related navigation targets to `/applications?type=pre` when `isPreLicensee`:
  - All `MetricCard` `to` props that currently point to `/applications` or `/applications?status=draft`
  - `PriorityListCard` "Recent applications" `viewAll.to`
  - Row-level `to: /applications/${a.id}` is unchanged (detail page is shared).
- Non-pre-licensee applicants keep current `/applications` targets.

### 3. No change to `/applications` list page
- `ApplicationsList` already derives header stats from the filtered (`typeFilter`) rows from the prior fix, so visiting `/applications?type=pre` shows correct counts and rows. No further work needed there.

### 4. Out of scope (untouched)
- LicenseeDashboard, SupervisoryDashboard.
- `PreLicenseeDashboard.tsx` page (already filters out post-license).
- Workflow, renewal, resubmission, and other prior fixes.

## Verification
- Sign-in as a pre-licensee: dashboard metric tiles (Drafts / Submitted / Under review / Approved / Action required) match the count shown on `/applications?type=pre`.
- "View all" / "All" from Recent Applications and metric tiles navigates to `/applications?type=pre`, listing only pre-license rows with matching header counts.
- Applicants who are not pre-licensee still see all their applications and links to `/applications`.

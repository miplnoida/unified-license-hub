## Root cause
The prudential pages are accessible, but they render as standalone page content. They do **not** wrap their content in `DashboardLayout`, which is the component that renders the left sidebar and header.

This is not primarily an auth-session timing issue: the route guard allows the page, but the page component itself bypasses the app shell.

## Plan
1. **Wrap prudential pages with the app shell**
   - Add `DashboardLayout` around the existing content for all prudential pages:
     - `PrudentialDashboard`
     - `PrudentialEntitiesList`
     - `PrudentialEntityProfile`
     - `AssessmentsList`
     - `AssessmentDetail`
     - `ActionsList`
     - `EscalationsList`
     - `StressIndicatorsAdmin`
     - `PrudentialTaxonomyAdmin`

2. **Preserve existing feature logic**
   - Do not change queries, mutations, forms, filters, dialogs, or prudential workflows.
   - Only adjust page layout/wrapping so the left sidebar and header appear consistently.

3. **Avoid duplicate page padding/header issues**
   - Replace each top-level `p-6` wrapper with normal inner spacing compatible with `DashboardLayout`, since the layout already provides page padding.
   - Keep each page’s existing H1/title content unless it already duplicates the layout title awkwardly.

4. **Verify in preview**
   - Open `/prudential/entities` and confirm the left sidebar is visible.
   - Smoke-test the other prudential URLs to confirm the sidebar appears and content still renders.

5. **Report result**
   - If sidebar still does not appear after layout wrapping, classify the remaining issue as either sidebar permission visibility or auth/session readiness; otherwise classify it as fixed layout omission.
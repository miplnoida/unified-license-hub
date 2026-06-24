
## 1. Dynamic Approval Workflow Resolution (Pre-Licensee, Post-Licensee, Compliance)

Goal: internal-user workflow on application/return detail screens is matched strictly from backend configuration scoped to Sector → Sub-Sector → Category (→ Service). No static/synthetic fallbacks. Registration workflow is untouched.

**Application resolver — `src/lib/workflowApprovalResolver.ts`**
- Keep existing hierarchical matching (service > category > sub_sector > sector > regulator-wide) but **drop the license_type-only/global fallback block** that picks any workflow with a similar `license_type` regardless of sector scope. If no scoped match exists, return `no_matched_workflow` (UI already handles this).
- Stop treating empty `license_type` rows as catch-alls when the application has a specific license_type; only match when scopes match.

**Compliance resolver — `supabase/migrations/<new>.sql` + `src/lib/returnWorkflowResolver.ts`**
- Rewrite `public.resolve_return_workflow(_return_id)` to read `sector_id`, `sub_sector_id`, **and** `category_id` from `returns_filed` / `compliance_returns` (currently it incorrectly compares the return's subsector against `approval_workflows.category_id`).
- Match priority: regulator + sector + sub_sector + category → … → sector only → regulator-wide. No global fallback when sector is set.
- Update `ReturnApprovalContext` typing to include `category_id`.

**Cleanup**
- Mark the "Application Review (Default)" catch-all workflow (and any equivalent return catch-all) inactive via migration so it cannot mask scope mismatches. Internal Workflow Management UI already lets admins re-activate if intended.

**WorkflowPanel**
- No behaviour change needed beyond consuming the stricter resolver result; existing "no_matched_workflow" branch shows the manual-review notice.

## 2. Resubmission Edit — Pre-fill missing data (Licensee panel)

Symptom: when an application is `resubmission_requested` / `query_raised`, the licensee opens the form tab on `ApplicationDetail`, fields render blank instead of showing previously submitted values.

Fix in `src/components/applications/SubmittedForms.tsx` + `src/pages/applications/ApplicationDetail.tsx`:
- `SingleFormViewer` currently sets `resolvedVersionId = versionId || latestVersion?.id`. When the latest published version differs from the version the applicant originally filled, the field-id keys in `formData` no longer match the sections being rendered → blank fields. Force the **submitted version** (`versionId` from `form_version_ids[templateId]`) whenever it exists; only fall back to latest when there is no submitted version.
- Ensure `formsData[templateId]` is passed as `initialData` even when the object exists but has falsy keys; today `formsData` is derived once from `appData.forms_data` — re-read after any save and pass a stable, defined object so `FormRenderer` resets via `initialData` on status change.
- In `FormRenderer`, accept and react to `initialData` changes when the application status transitions into a resubmission state (only when the key changes), so values are repopulated when re-opening the tab.
- Keep `editable={...}` whitelist as-is (already includes `resubmission_requested` / `query_raised`).

## 3. Hide Renew Button when a renewal application is already in progress

Symptom: user can click Renew repeatedly and create duplicate renewal applications.

Fix:
- `src/pages/licenses/LicenseDetail.tsx`: add a query for `applications` where `data->>renewal_of_license_id = license.id` and status not in `('approved','rejected','cancelled','withdrawn')`. If a row exists, hide the Renew button (both header and inline) and instead show "Renewal in progress" with a link to that application.
- `src/components/dashboard/cards/LicenseStatusList.tsx`: extend `useApplicantLicenses` (or add a sibling query) to fetch pending renewal application ids per license; replace the per-row Renew button with a "Continue Renewal" link when one exists, otherwise show Renew. `canRenew` stays gated on grace-period rules.
- Server guard (defence in depth): in the renewal insert path, check for an existing non-terminal renewal application for the same `license.id` and short-circuit with a toast "A renewal request is already pending review" instead of inserting a duplicate.

## Out of scope
- No changes to registration approval workflow, registration forms, or registration submission paths.
- No UI redesign — only behavioural fixes.
- No changes to SLA/Decision-Ready panels beyond what falls out of resolver behaviour.

## Technical notes
- New migration will contain only `CREATE OR REPLACE FUNCTION` + an `UPDATE approval_workflows SET is_active = false WHERE ...` for the synthetic default; no new tables, so no GRANT block needed.
- All client-side changes are typed against existing tables (`applications`, `approval_workflows`, `returns_filed`).
- Add/extend tests: `workflowApprovalResolver.test.ts` (no global fallback), a new return-workflow resolver test, and a renewal-duplicate guard test.

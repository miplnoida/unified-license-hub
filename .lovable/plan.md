# Fix renewal/resubmission/workflow bugs

## 1. Dynamic approval workflow (Pre-Licensee, Post-Licensee, Compliance)

Goal: matching strictly follows backend config scoped to Sector → Sub-Sector → Category → Service. No static or stale snapshot ever wins. Registration approval workflow untouched.

**`src/lib/workflowApprovalResolver.ts`**
- `resolveAttachedActiveWorkflow` currently short-circuits on `applications.workflow_id` if the row is active + has steps. This is the "static" leak: an application keeps an old workflow even after admin changed sector/sub-sector/category routing. Re-validate the attached workflow by re-running scope match — accept it only when it equals the workflow returned by `matchWorkflowForApplication`. Otherwise fall through to fresh match.
- Keep current strict hierarchy in `matchWorkflowForApplication` (service > category > sub_sector > sector > regulator-wide) and the existing rule that returns `no_matched_workflow` when scope mismatches (no global fallback).

**Compliance — new migration `supabase/migrations/<ts>_strict_return_workflow_match.sql`**
- `CREATE OR REPLACE FUNCTION public.resolve_return_workflow(_return_id uuid)` so it reads `sector_id`, `sub_sector_id`, `category_id` from `returns_filed` (with fallback through `return_configurations` / `compliance_returns`) and matches `approval_workflows` rows where `entity_type IN ('return','compliance')` with priority: regulator + sector + sub_sector + category → … → sector only → regulator-wide. Drop the existing buggy `subsector_id = category_id` comparison. Never return a workflow whose sector/sub_sector/category is set to something different from the return's.
- `UPDATE approval_workflows SET is_active = false` for any seeded "Application Review (Default)" / equivalent return catch-all row that has no scope set (regulator/sector/sub_sector/category all NULL) so it cannot mask mismatches.

**`src/lib/returnWorkflowResolver.ts`**
- Extend `ReturnApprovalContext.return` with `category_id`. Pass through to the RPC (RPC reads from DB so no payload change needed, just typing).
- After RPC returns a workflow id, ignore any `ctx.return.workflow_id` fallback when the RPC said null — this kills stale attachments on returns.

**No UI changes** beyond consuming stricter result; `WorkflowPanel` / `ReturnWorkflowPanel` already render the "no matched workflow" branch correctly.

## 2. Edit application — prefilled data missing (resubmission)

The applicant edits via `/post-licensee/applications/:id/forms` (`PostLicenseApplicationForms.tsx`) and `/applications/:id/forms` (`ApplicationForms.tsx`), NOT via the SubmittedForms accordion in ApplicationDetail.

**`src/pages/PostLicenseApplicationForms.tsx` and `src/pages/ApplicationForms.tsx`**
- Bug: both pages load `formsData[tid]` once into `formProgressMap` state then pass it as `initialData`. When the user has just been routed in from a "Request Resubmission" action the `formProgressMap` is built from a stale `appJson` snapshot, and after switching tabs the `initialData={formProgressMap[activeTemplate.id]?.data || {}}` returns `{}` because the entry was keyed by previously-active template id state.
- Fix:
  - Build `formProgressMap` from a freshly fetched `applications.data.forms_data` on every mount AND when `id` changes; key strictly by `tid` from `form_template_ids`.
  - When `formsData[tid]` is absent fall back to the latest `form_responses` row for `(application_id, form_template_id)` to recover any partial save that wasn't merged back into `applications.data.forms_data`.
  - Use `form_version_ids[tid]` to pin `useVersionSections(versionId)` so the section field names match the saved keys (avoid silent fallback to latest published version which renames/removes fields → blank).
  - Pass a memoized object identity per `tid` so `FormRenderer`'s `initialData` re-sync effect fires exactly once after async load.

**`src/components/form-renderer/FormRenderer.tsx`**
- Existing re-sync effect only updates when `Object.keys(initialData).length > 0`. Keep that guard (prevents wiping during interaction) but also re-init on `formVersionId` prop change so switching between versions during resubmission doesn't keep stale state.

## 3. Dashboard "Renewal in progress" opens renewal form instead of submitted view

Root cause: `LicenseStatusList` includes `'draft'` and `'in_progress'` in `PENDING_RENEWAL_STATUSES` and links to `/applications/<id>`. For draft renewals this lands on `ApplicationDetail` which (correctly) renders the form in editable mode because the applicant is the owner of a draft. The user expects this button to only appear for renewals that have been submitted and to open a read-only view + activity log.

**`src/components/dashboard/cards/LicenseStatusList.tsx`**
- Narrow `PENDING_RENEWAL_STATUSES` to `['submitted','under_review','query_raised','resubmission_requested']`. A `draft`/`in_progress` renewal is treated as not yet started → show `Renew` (which routes the user back into the in-flight draft via the duplicate-guard in `LicenseDetail.startRenewal`).
- Change the link destination to `/applications/${appId}?tab=form&view=submitted` to land on the submitted forms tab. Also fetch and stash the renewal application's `status` so the button label can be `Renewal submitted` / `Under review` / `Resubmission requested` instead of a generic "in progress".

**`src/pages/applications/ApplicationDetail.tsx`**
- Read `?view=submitted` from the URL. When present and `app.status` is in the submitted/under-review/resubmission set, force `editable={false}` for the Forms / Documents / Fees panels even when `isOwner` is true. Default tab → `form` when `?tab=form` is supplied, and auto-select the `Activity` tab is still one click away (no behaviour change there).
- This produces the "view form with submitted data + history" UX the user asked for, without breaking the existing edit-on-resubmission flow that goes through `/post-licensee/applications/:id/forms`.

**`src/pages/licenses/LicenseDetail.tsx`**
- Mirror the dashboard fix: the three `Renewal in progress` buttons should link to `/applications/${pendingRenewalAppId}?tab=form&view=submitted`. The `PENDING_RENEWAL_STATUSES` constant local to this file (line 99 area) should match the narrower set above so a half-started draft doesn't suppress the Renew button.

## Out of scope
- Registration approval workflow, registration forms, registration submission.
- SLA / Decision-Ready panels.
- Any UI redesign — behavioural fixes only.

## Verification
- `vitest run` on `workflowApprovalResolver.test.ts` plus a new test asserting an attached workflow with mismatched scope is rejected.
- New `returnWorkflowResolver` test covering category/sub-sector/sector cascade.
- Manual: open a resubmission-requested application as licensee from both `/post-licensee/applications/:id/forms` and dashboard; confirm previously entered fields are populated.
- Manual: start a renewal, leave it draft, return to dashboard — button should say `Renew`, clicking re-opens the same draft. Submit the renewal, return to dashboard — button should say `Renewal submitted` and open the read-only view + activity tab.

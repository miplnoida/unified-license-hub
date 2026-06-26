# Plan

Three independent fixes. I'll investigate each, implement, and verify before claiming done.

## 1. Workflow resolution by sector/sub-sector/category (Pre/Post Licensee + Compliance)

**Goal:** Internal approval workflows for Pre Licensee, Post Licensee, and Compliance approvals must resolve dynamically from backend configuration based on the application's sector → sub-sector → category. No hardcoded/static workflow fallback. Registration approval workflow stays untouched.

**Approach:**
- Audit `src/lib/workflowApprovalResolver.ts`, `useWorkflowEngine.ts`, `workflowService.ts`, and any callers in pre-license, post-license, and compliance review screens.
- Replace any static workflow ID lookups or "default workflow" fallbacks with the taxonomy resolution rule already documented in mem://architecture/taxonomy (Category > Sub-Sector > Sector hierarchy match against `approval_workflows`).
- Ensure entity_type filter distinguishes `pre_license`, `post_license`, `compliance` (do not touch `registration`).
- When no workflow matches, surface an explicit error in the internal reviewer UI instead of silently using a default — matches existing manual-processing fallback memory.

**Verify:** Load a pre-license, post-license, and compliance application as internal reviewer; confirm the steps panel reflects the workflow configured for that exact taxonomy, and a different taxonomy yields a different workflow. Confirm registration approval still works unchanged.

## 2. Edit application not showing prefilled data after resubmission request

**Goal:** When internal user requests resubmission, the licensee opening "Edit" must see all previously submitted field values prefilled.

**Approach:**
- Inspect `src/pages/NewApplication.tsx` and `ApplicationForms.tsx` resume path (`/applications/:id/continue`), and how `form_responses` / `applications.data` is loaded into `FormRenderer`.
- Check that on resubmission status, the loader hydrates from the latest `form_responses` snapshot (not a blank draft) and passes initial values into FormRenderer.
- Fix the data-hydration path so resubmission opens with prior answers + uploaded files intact (file persistence per mem://tech/form-field-file-persistence).

**Verify:** Reviewer requests resubmission → licensee opens edit → all fields and uploaded files render with prior values; user can modify and resubmit.

## 3. Renewal-in-progress button opens form instead of view

**Goal:** On Licensee Dashboard, the "Renewal in progress" button must open the renewal application's **view** page (submitted data + action/history log), not re-open the editable renewal form.

**Approach:**
- Locate the renewal tile in `LicenseeDashboard.tsx` / `cards/`.
- Change its target from `/applications/:id/continue` (or equivalent edit route) to `/applications/:id` (ApplicationDetail), which already renders submitted forms accordion + history.
- Only change the in-progress state; "Start renewal" for not-yet-started renewals stays as-is.

**Verify:** Click "Renewal in progress" → ApplicationDetail loads with submitted form data accordion and full action log; no form edit screen appears. Other dashboard buttons unchanged.

## Technical notes

- Files likely touched: `src/lib/workflowApprovalResolver.ts`, `src/hooks/useWorkflowEngine.ts`, `src/components/dashboard/LicenseeDashboard.tsx` (+ cards), `src/pages/NewApplication.tsx`, `src/pages/applications/ApplicationDetail.tsx`, possibly `src/components/form-renderer/FormRenderer.tsx` for initialValues wiring.
- No DB migrations expected; if a workflow row is missing for a taxonomy, that's a config gap, not a code fix.
- Registration workflow code paths (`registrationWorkflowClient`, `perform-registration-workflow-action`) will not be modified.

Approve to proceed and I'll implement + verify each fix end-to-end before reporting back.

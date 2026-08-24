# Workflow SLA, action labels and applicant CTA fixes

## What is wrong today (verified)

1. **Submitted application shows "Resume"** — confirmed in data: application `APP-2026-000159` has `status = in_progress` while `submitted_at` is set (submitted 10:41, later edited/advanced). The applicant dashboard card (`RequiredFormsList`) decides its button purely from `status`, so `in_progress` → "Resume" and the link points at the draft continue route, even though the case is already submitted and under review.
2. **Raw technical action key shown** — a configured step action of type `save_comment` exists in the workflow configuration. Neither the history label map nor the button fallback in `WorkflowPanel` covers it, so the fallback prints the raw key ("save_comment" / "save comment").
3. **Step SLA start time can fall back to submission time** — per-step start resolution in `WorkflowPanel` and in `workflowSlaResolver` falls back to the workflow instance `started_at`/`created_at` (effectively submission) whenever the previous step has no decisive action recorded. That makes a later step's clock appear to have been running since submission.

## Fixes

### 1. Applicant CTA reflects real state
- Include `submitted_at` in the recent-applications query used by the applicant dashboard.
- `RequiredFormsList` decides its CTA from canonical status helpers plus `submitted_at`:
  - draft (never submitted) → **Continue**
  - action-required statuses (query raised, info requested, resubmission, returned for correction) → **Resume**
  - anything submitted-like, approved, rejected or with a `submitted_at` value → **View Application** linking to `/applications/:id` (never the continue route).

### 2. Human-readable action labels
- Extend the label map with `save_comment` ("Comment added") and the remaining configured action types.
- Replace both raw fallbacks (history label and action-button label) with a humanizer that converts any unknown key to sentence case words, so no technical key can ever reach the UI.
- Backend-configured `approval_step_actions.label` still wins when set.

### 3. Strictly sequential step SLA
- Per-step start becomes: step 1 → submission time; step N → timestamp of the most recent decisive action on any earlier step; if none exists, fall back to the workflow instance's last advance (`updated_at`) rather than submission/creation.
- Upcoming steps keep returning `null` so no SLA badge or countdown is rendered for steps that have not started.
- Same fallback ordering applied in `src/lib/workflowSlaResolver.ts` so list, dashboard and detail views agree.

## Verification
- Query the workflow steps and approval actions for `APP-2026-000159` and confirm each step's computed start equals the prior step's decisive action time (step 2 = 12:15 approval, not 10:41 submission).
- Load the application detail workflow panel in the preview and confirm no raw keys appear on buttons or in step history.
- Load the applicant dashboard as the applicant and confirm the submitted application shows "View Application" while drafts still show "Continue".

## Technical notes
Files touched: `src/hooks/useApplicantMetrics.ts`, `src/components/dashboard/applicant/RequiredFormsList.tsx`, `src/components/dashboard/ApplicantDashboard.tsx`, `src/components/applications/WorkflowPanel.tsx`, `src/lib/workflowSlaResolver.ts`. Presentation and client-side resolution only — no schema, RLS, RPC or workflow-engine changes, and no status is rewritten in the database.

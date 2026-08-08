# Remove "Commercial Bank Pre Licensee" workflow and relink its applications

## What I confirmed in the database

- The workflow `Commercial Bank Pre Licensee` (pre-application, Commercial Bank, sector + category scoped) is **already inactive** and has **2 steps** ("Step 1", "Step 2"). It has **no published versions**, so nothing is version-pinned to it.
- **7 application workflow instances** still point at it:
  - 6 completed / approved: APP-2026-000079, 000109, 000112, 000115, 000117, 000131
  - 1 live: APP-2026-000135 (submitted, sitting on "Step 1")
- The same 7 applications also carry `workflow_id` / `current_step_id` pointers to this workflow on the application record itself.
- **11 historical approval actions** are attached to its two steps.
- Deleting the workflow row cascades: its steps, its step action config, its step notification config, **and all 7 workflow instances** would be deleted, and the 11 audit actions would lose their step link. So the relink must happen first, and the audit rows must be re-pointed.
- Target workflows that will take over:
  - `Pre License Approval Workflow` (general, active, 3 steps: Analyst Review → Licensing Officer → Final Approval)
  - `Post Application Workflow` (general, active, 3 steps: Legal/Compliance Review → Licensing Officer → Final Approval)

## Plan

### 1. Relink the 6 approved applications (pre-application history)
Move their workflow instances and application pointers to `Pre License Approval Workflow`, parked on its **Final Approval** step, keeping status `completed`. Their approval history, dates and decisions are untouched.

### 2. Relink the live application APP-2026-000135
Move its instance and application pointers to `Pre License Approval Workflow`, positioned on its **first step (Analyst Review)**, status stays `active`.

Note: that Analyst Review step is currently configured with only the non-advancing "Save Comment" action, so the case will show no forward action until that step's configuration is corrected. That is the separate defect already raised — I will not silently change step configuration here.

### 3. Preserve the 11 audit actions
Re-point their `step_id` from the deleted workflow's Step 1 / Step 2 to the equivalent first / final steps of `Pre License Approval Workflow`, so the audit trail keeps a valid step reference instead of being blanked by the cascade.

### 4. Link the approved applications to the Post Application Workflow
Create one `Post Application Workflow` instance per approved application (6 total), active on its first step, so post-licensing activity for those licensed entities runs through the general post-application workflow. Say the word if you'd rather not have these six appear in the Legal/Compliance Review queue and I'll skip this step.

### 5. Delete the workflow
Remove the `Commercial Bank Pre Licensee` workflow row. Its 2 steps and their step-action / notification configuration are removed with it. Nothing else references it at that point.

### 6. Verify
Re-query to confirm: zero instances, zero applications and zero audit actions referencing the deleted workflow; the 7 applications resolve to the general pre-application workflow with the correct step and status; the 6 post-application instances exist; and APP-2026-000135 opens in Application Detail showing the 3-step workflow.

## Technical notes

- Steps 1-4 are data changes (`UPDATE` / `INSERT`) applied with the data tool; step 5 is a single `DELETE` of the workflow row.
- Instance `workflow_version_id` / `version_snapshot` stay null for these rows, matching how they exist today, so the panel reads live step configuration from the target workflow.
- No frontend code changes are needed — Application Detail already derives its step list from the instance's workflow.

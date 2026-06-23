## Cause
The backend data for `APP-2026-000096` is valid:
- Attached workflow: `Registration Workflow`
- Workflow has exactly 2 configured steps
- Step 1 has enabled email bindings for approve/reject/send back/request resubmission
- Templates are active

The warning still appears because the Application Detail screen mounts `WorkflowPanel` without the attached workflow's real `entity_type`. It defaults to `application`, while this application is attached to a workflow configured as `registration`. The previous change only loosened the preview filter, but it did not fix the source context mismatch end-to-end.

## Plan
1. **Resolve workflow context on Application Detail**
   - Fetch the attached workflow's `entity_type` along with the application.
   - Treat only registration-backed application workflows as notification-preview `registration` context, while keeping the actual review entity/action target as the application record where required.

2. **Separate notification entity type from action entity type**
   - Keep `WorkflowPanel` runtime action execution on `perform-workflow-action` for application rows.
   - Add a separate `notificationEntityType` prop for the preview dialog so it uses `registration.*` bindings/templates when the attached workflow is a registration workflow.
   - This avoids breaking workflow instance lookup or approval action execution.

3. **Harden preview lookup**
   - Query bindings by the actual `currentStep.id + action_type` first.
   - If no rows are returned, query the step’s workflow/action bindings as a diagnostic fallback and show the real mismatch details instead of the misleading “not configured” message.
   - Update the warning copy so it no longer says “with an active email template” when the real issue is no binding row returned.

4. **Verify against live data**
   - Check `APP-2026-000096` opens Step 1 with the configured 2-step workflow.
   - Confirm approve/reject/send back/request resubmission preview shows the active configured email template instead of the warning.
   - Confirm no fake workflow, hardcoded steps, or manual fallback changes are introduced.
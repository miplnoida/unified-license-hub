Plan to fix the remaining notification warning without disrupting other workflow behavior:

1. Resolve the workflow entity type dynamically
   - In the Application Detail workflow mount, read the attached workflow’s `entity_type`.
   - If the attached workflow is `registration`, pass `entityType="registration"` into `WorkflowPanel` even though the page URL is `/applications/:id`.
   - Keep existing `application` behavior for normal pre/post application workflows.

2. Preserve correct entity IDs for registration workflows attached to application rows
   - Add a safe mapping so `WorkflowPanel` can still use the application id for backend actions when the workflow instance is stored against the application row.
   - Do not switch to the standalone registration review route unless the source record is truly a `registrations` row.

3. Make notification preview use backend/source-of-truth bindings only
   - Keep the current step/action lookup against `approval_action_notifications`.
   - Ensure the preview dialog does not infer `application.*` event keys when the attached workflow is `registration`.
   - Keep the diagnostic message only as a real missing-config warning, not a false warning caused by entity mismatch.

4. Align runtime dispatch with the workflow’s configured entity type
   - Update action execution so per-action notification dispatch uses the attached workflow entity type for event keys/payload context, while preserving existing application transition RPC behavior where instances are application-backed.
   - Do not add fake workflows, hardcoded steps, or fallback direct approval paths.

5. Validate against live backend data
   - Verify the current Registration Workflow has 2 steps and enabled templates for the exact step/action.
   - Verify the specific application currently attached to Registration Workflow no longer shows “No email notification is configured” when the configured action is opened.

Technical notes:
- The database already has enabled bindings and active email templates for Registration Workflow step 1 and step 2.
- The observed cause is UI/entity routing drift: `ApplicationDetail` mounts `WorkflowPanel` without passing `entityType`, so it defaults to `application` even for `approval_workflows.entity_type = 'registration'`.
- The fix should be scoped to entity routing and notification preview/runtime; no workflow configuration data should be changed.
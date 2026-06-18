Why it was not created: the last change added SLA fields and dropdowns to choose templates, but it did not seed any `notification_templates` records. I checked the database and there are currently 0 templates with SLA event types.

Plan:

1. Add default SLA notification templates
   - Create seed records in `notification_templates` for:
     - `sla.warning` email template
     - `sla.breach` email template
     - `sla.warning` in-app template
     - `sla.breach` in-app template
   - Use consistent naming and variables like `workflow_name`, `step_name`, `sla_hours`, `elapsed_percent`, `entity_name`, `app_url`.
   - Keep them active by default.

2. Keep existing workflow behavior unchanged
   - Do not change action notifications, workflow routing, approval logic, or existing templates.
   - Only add SLA-specific template records and improve SLA template selection.

3. Improve the SLA template dropdowns
   - Ensure the SLA warning dropdown shows the seeded `sla.warning` templates clearly.
   - Ensure the SLA breach dropdown shows the seeded `sla.breach` templates clearly.
   - Keep `— use default —` available so admins can leave the step unbound if needed.

4. Optionally auto-bind defaults when creating/selecting SLA config
   - If a step has no warning/breach template selected, the UI can still show the matching default template as the effective default.
   - Saving a manual selection will continue storing the selected template ID on the step.

5. Verify
   - Confirm the new SLA templates appear in the template list.
   - Confirm the step edit SLA warning/breach dropdowns show the new templates.
   - Confirm existing workflow step save/load behavior is unchanged.
   - Confirm no TypeScript errors.
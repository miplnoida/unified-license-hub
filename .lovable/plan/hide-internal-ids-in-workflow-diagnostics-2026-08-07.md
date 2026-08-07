# Hide internal IDs in Workflow diagnostics

In the application workflow panel's internal "Workflow diagnostics" box, remove the two rows that print raw identifiers:

- Remove: `Instance: <uuid>`
- Remove: `Workflow ID: <uuid>`

Keep: Workflow name, Steps loaded, Entity type, Current step. The workflow-mismatch warning banner above it is unchanged (it is already worded without IDs).

## Technical notes
- Single file touched: `src/components/applications/WorkflowPanel.tsx` (diagnostics grid).
- No backend, schema, or behaviour changes.

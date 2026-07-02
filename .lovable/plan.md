## Change

In `src/pages/returns-mgmt/ReturnDetail.tsx`, move the `ReturnWorkflowPanel` (and the legacy Approve / Request Edit fallback card it renders when no workflow is configured) out of the right-hand sidebar and place it **below the form tabs** inside the main column (`lg:col-span-2`), matching the layout used by `ApplicationDetail.tsx` for pre-/post-application workflows.

- The right sidebar keeps the "Status" card and `ReturnValidationAndRatiosPanel`.
- The workflow / manual-actions block is rendered right after the `<Tabs>` block in the main column.
- No changes to props, hooks, resolver, or workflow behavior — this is a layout move only.

## Change

In `src/components/returns/ReturnWorkflowPanel.tsx`, replace the "Workflow has not started yet. Initialize it to begin review. [Start workflow]" card with a passive message that mirrors the application `WorkflowPanel` behavior:

> "Workflow has not started yet. It will be created automatically when the return is submitted."

The manual `Start workflow` button and its `start_return_workflow` RPC click handler are removed from this component. Auto-start is already handled server/client-side by the existing `useEffect` in `ReturnDetail.tsx` that calls `start_return_workflow` whenever a submitted return has no active instance — so no functionality is lost, the manual button was just a redundant fallback UI.

Nothing else in `ReturnWorkflowPanel`, `ReturnDetail`, resolver, or the perform-action edge function changes.

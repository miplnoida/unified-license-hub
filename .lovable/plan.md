## Diagnosis

- Preview (lovable.app) shows the Approval Workflows correctly.
- Published site (boj.skntreasury.com / "BOJ") shows an empty Workflows page.
- Data + code are fine — the DB has 7 active workflows for your regulator and `/workflows` renders them in preview.

The gap is a **publish/deploy mismatch**: recent changes to `src/pages/workflows/WorkflowList.tsx`, `src/hooks/useWorkflowEngine.ts`, and related workflow files have not yet been pushed to the published build. Your custom domain is still serving an older bundle whose queries/filters don't line up with the current schema (e.g. new `entity_type` values like `pre_application` / `post_application` / `return`), so the old build fetches nothing and shows "No workflows yet".

## Fix

Re-publish the project so the custom domain (BOJ) picks up the current build.

No code changes are needed for this.

## Optional follow-up (only if it still fails after publish)

If, after publishing, BOJ still shows an empty Workflows page while preview is fine, we would:

1. Read `approval_workflow_types` and `approval_workflows` from the browser under the BOJ session to confirm RLS/roles resolve the same way.
2. Confirm the header shows the same active regulator as preview.
3. Check console/network errors on the deployed BOJ page.

No app code would change unless one of those checks surfaces a real bug.

## Action

Publish the project:

<presentation-actions>
<presentation-open-publish>Publish your app</presentation-open-publish>
</presentation-actions>

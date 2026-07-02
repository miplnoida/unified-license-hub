## Problem

The return you are viewing (`/admin/returns/queue/b48b4be7-…`) never shows the configured approval workflow on the frontend. The UI silently falls back to the legacy "Approve / Request Edit" buttons and the configured multi-step workflow is ignored.

## Root cause

`resolveReturnWorkflow` (used by `ReturnDetail.tsx`) calls the Postgres RPC `resolve_return_workflow(_return_id)`. That function currently runs:

```sql
SELECT rf.sector_id, rf.subsector_id, rc.category_id, s.regulator_id
  FROM public.returns_filed rf
  LEFT JOIN public.return_configurations rc ON rc.id = rf.return_configuration_id
  ...
```

But `return_configurations` has no `category_id` column (its columns are `sector_id`, `sub_sector_id`, `regulator_id`, …). So the RPC throws `42703: column rc.category_id does not exist` on **every** call, the resolver returns `null`, `workflowEnabled` becomes `false`, and the configured workflow is never rendered — regardless of what is configured in the backend.

I confirmed this directly against the database.

## Fix (database-only, no frontend behavior changes)

Rewrite `resolve_return_workflow(_return_id)` so it:

1. Reads scope only from columns that actually exist:
   - `returns_filed.sector_id`
   - `returns_filed.subsector_id` (falling back to `return_configurations.sub_sector_id` when null on the row)
   - `sectors.regulator_id` for the regulator
2. Drops the non-existent `category_id` join entirely. Category-scoped matching stays available at the `approval_workflows` level (that table's own `category_id` column is untouched); we simply pass `NULL` for the return's category since returns are not category-scoped in this schema, which correctly means "match any category".
3. Preserves the existing "most-specific match wins" ordering and the rule that a fully-unscoped workflow is rejected.

Everything else — the resolver TS, `ReturnDetail.tsx`, `ReturnWorkflowPanel`, `start_return_workflow`, and `perform-return-workflow-action` — stays as-is. This is a surgical fix to a single SQL function.

## Verification

After the migration:
- Re-run `SELECT resolve_return_workflow('b48b4be7-669f-4c64-afb4-0ae38bf5ff3d')` — must return a UUID (or `NULL` cleanly, never an error).
- Reload the return page; the configurable workflow panel with the approval steps should render, and the legacy Approve/Request Edit fallback should disappear when a matching workflow exists.

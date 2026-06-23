## Goal

Add optional **Sub-Sector**, **Category**, and **Services** dropdowns to the Approval Workflow create/edit dialogs (keeping the existing **Sector** dropdown), and make the runtime workflow resolver pick the most specific matching workflow on the frontend.

## Scope (what changes)

Affected files:
- `supabase/migrations/...` — add `sub_sector_id` and `service_id` columns to `approval_workflows`
- `src/hooks/useWorkflowEngine.ts` — extend `Workflow` type and create/update payloads
- `src/pages/workflows/WorkflowList.tsx` — add dropdowns in Create & Edit dialogs + persist
- `src/lib/workflowApprovalResolver.ts` — extend hierarchical match
- `src/lib/workflowDuplicateCheck.ts` — include new fields in uniqueness key

Not changed: workflow step editor, action notifications, registration/return workflow logic, sidebar, fee management, or any other module.

## Detailed changes

### 1. Database (migration)
Add two nullable columns to `approval_workflows`:
- `sub_sector_id uuid` referencing `sub_sectors(id)`
- `service_id uuid` referencing `services(id)`

Both nullable (backwards compatible — existing rows keep working). Index both. No RLS changes (existing policies cover the table).

### 2. Workflow create/edit dialog (`WorkflowList.tsx`)

In **both** Create Workflow and Edit Workflow dialogs, after the existing Sector dropdown, add three optional dropdowns in this order:

```text
Sector       (optional, existing)
Sub-Sector   (optional, filtered by selected Sector)
Category     (optional, filtered by selected Sub-Sector → falls back to Sector)
Services     (optional, filtered by selected Sector/Sub-Sector)
```

Rules:
- All four are optional, default `"none"`.
- Clearing a parent (e.g. Sector → none) clears its dependent values.
- Each dropdown shows "All <parent>" / "Any" as the none option.
- Persist non-`none` values; persist `null` for `none`.
- Display selected values as small badges on the workflow list card (next to the existing sector chip).

### 3. Save / duplicate guard

Extend the duplicate-workflow uniqueness key from `(regulator, sector, entity_type)` to `(regulator, sector, sub_sector, category, service, entity_type)`. Same warning copy.

### 4. Runtime resolver (`workflowApprovalResolver.ts`)

Update `matchWorkflowForApplication` to read `sub_sector_id` and `service_id` from the application data and rank candidates from most-specific to least-specific:

```text
1. service match
2. category match
3. sub_sector match
4. sector match
5. regulator + license_type only
6. license_type prefix fallback (unchanged)
```

A workflow with `service_id = X` only matches an application whose data has the same service; a workflow with all four fields null is the broadest fallback. Existing behavior for sector/category preserved.

### 5. Out of scope
- No changes to backend RPCs that don't reference these fields.
- No changes to `WorkflowConfig.tsx` (legacy/demo page).
- No changes to step approver roles or per-step routing.

## Acceptance
- Create dialog shows 4 optional dropdowns; saving with any combination works.
- Edit dialog pre-fills all 4 dropdowns from the workflow row.
- Two workflows with same sector but different sub-sector/category/service can coexist.
- Submitting an application whose data has a specific `service_id` routes to the service-scoped workflow when present; otherwise falls back to category → sub-sector → sector → regulator-wide workflow.
- Existing single-sector workflows continue to match as before.

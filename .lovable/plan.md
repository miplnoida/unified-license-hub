## Read-only root-cause findings

I inspected the live database and code paths. No code/data changes have been made yet.

### Affected application inspected

The current affected pre-license application is:

- **Application number:** `APP-2026-000119`
- **Application ID:** `da9028ff-16e3-4c54-bb1e-144eab362a64`
- **Status:** `submitted`
- **Regulator:** `8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3` / `Regulator 1`
- **Sector:** `641bdf7f-005a-47b8-83f5-8894fdc6c073` / `Building Society`
- **Sub-sector:** `9fef5788-efe0-4f05-861c-8a489012e16a` / `Building Society`
- **Category:** `82d0473b-69cd-44cf-a430-17857a55d3e6` / `Building Society`
- **Service:** `null`
- **License type:** `Building Society - Building Society - Building Society`

### Application workflow linkage

- **applications.workflow_id:** `490130a8-90d6-457b-baf3-7926ef08b645`
- **Application workflow name:** `Building Society Pre License Workflow`
- **applications.current_step_id:** `686877e8-eb4e-459b-8800-6d54ed4c57c6`
- **Application current step:** `Step 1`, order `1`

### Workflow instance linkage

- **workflow_instances.id:** `caa254f1-d9ff-4ae5-8f7f-ac4d5b202289`
- **workflow_instances.workflow_id:** `490130a8-90d6-457b-baf3-7926ef08b645`
- **Workflow instance workflow name:** `Building Society Pre License Workflow`
- **workflow_instances.entity_type:** `application`
- **workflow_instances.entity_id:** `da9028ff-16e3-4c54-bb1e-144eab362a64`
- **workflow_instances.current_step_id:** `686877e8-eb4e-459b-8800-6d54ed4c57c6`
- **Current step name:** `Step 1`
- **Current step order:** `1`
- **workflow_instances.status:** `active`
- **workflow_instances.workflow_version_id:** `null`
- **workflow_instances.version_snapshot:** `null`
- **Snapshot step count:** `0`

### Workflow versions / snapshots

For both relevant workflows:

- `490130a8-90d6-457b-baf3-7926ef08b645` / `Building Society Pre License Workflow`
- `10238551-a025-41e2-9ac2-8a39199eddbc` / `Pre License Approval Workflow`

There are **no rows** in `approval_workflow_versions`.

Also:

- `approval_workflows.current_published_version_id` is `null` for both.
- The `trg_pin_workflow_instance_version` trigger exists on `workflow_instances`, but it cannot pin anything because no workflow version is published.
- Therefore, **workflow versioning/snapshot is not the cause** of the 2-step display for this application.

### Actual workflow step counts and names

#### Workflow currently used by the application

`490130a8-90d6-457b-baf3-7926ef08b645` — `Building Society Pre License Workflow`

- **Step count:** `2`
- **Steps:**
  - `1` — `Step 1` — ID `686877e8-eb4e-459b-8800-6d54ed4c57c6`
  - `2` — `Step 2` — ID `955743c8-9574-4dbb-9b4b-32fa1a15631a`

#### Configured 4-step workflow the user expects

`10238551-a025-41e2-9ac2-8a39199eddbc` — `Pre License Approval Workflow`

- **Step count:** `4`
- **Steps:**
  - `1` — `Quality Assurance` — ID `ba7d415f-0f7b-49b4-8c01-8167a41d90b2`
  - `2` — `Analyst Review` — ID `9dae2be2-f03f-404b-9b67-de5b7ff13235`
  - `3` — `Licensing Officer` — ID `59e3644c-896b-44e7-8fc1-e1406a72990c`
  - `6` — `Final Approval` — ID `61b9c779-a009-44b5-8e77-64d8157dad6a`

The `step_order` gap from `3` to `6` is not why only 2 steps show. The 4-step workflow has 4 rows; the app is not using that workflow.

### Matching workflows for this application

The resolver sees more than one active pre-license workflow for the same regulator:

1. **Sector-specific match**
   - ID: `490130a8-90d6-457b-baf3-7926ef08b645`
   - Name: `Building Society Pre License Workflow`
   - Scope: sector `Building Society`
   - Step count: `2`
   - Steps: `Step 1`, `Step 2`

2. **Global regulator-level match**
   - ID: `10238551-a025-41e2-9ac2-8a39199eddbc`
   - Name: `Pre License Approval Workflow`
   - Scope: regulator-level/global for pre-license
   - Step count: `4`
   - Steps: `Quality Assurance`, `Analyst Review`, `Licensing Officer`, `Final Approval`

The backend resolver `public._resolve_application_workflow(...)` is taxonomy-first and ranks:

```text
service > category > sub_sector > sector > regulator/global
```

Because the Building Society application has a sector-specific workflow (`490130a8...`), the resolver correctly chooses that older sector workflow before the global 4-step workflow (`10238551...`).

## Exact root cause

### Why only 2 steps are shown

The page is showing 2 steps because the application is actually assigned to workflow:

```text
490130a8-90d6-457b-baf3-7926ef08b645
Building Society Pre License Workflow
```

That workflow has only two steps, and those step names are literally stored in `approval_steps.name` as:

```text
Step 1
Step 2
```

So this is not a React-only display issue. The UI is displaying the workflow that the backend assigned.

### Which failure category applies

From the user's list, the applicable causes are:

- **A) The application is still attached to an old two-step workflow** — yes.
- **B) The workflow instance references an old workflow** — yes.
- **H) Workflow assignment selected the wrong workflow for the intended configuration** — yes.
- **I) More than one workflow matches the application** — yes.

The following are not the primary cause for this affected record:

- **C) approval_steps are missing** — no; each workflow has its own rows. The selected workflow has exactly 2 rows.
- **D) workflow version points to old snapshot** — no; version/snapshot is null.
- **E) workflow query is filtering rows** — not the primary cause; the query loads all rows for the effective workflow, but the effective workflow is the 2-step one.
- **F) step_order filtering is wrong** — no.
- **G) workflow instance entity_type mismatch** — not the primary cause for the 2 steps; the instance is `entity_type='application'`, and current code already checks legacy application entity type for collab. It is still a consistency issue to normalize in the shared resolver.

### Why Collaborative Review is hidden

`review_step_permissions` has **zero rows in the entire table**:

```text
total_review_step_permission_rows = 0
```

For current step `686877e8-eb4e-459b-8800-6d54ed4c57c6`, there are no permissions, so `useCollabReview` computes:

```text
perms.enabled = false
perms.can_view = false
stepId = 686877e8-eb4e-459b-8800-6d54ed4c57c6
```

Then `CollaborativeReview.tsx` returns `null` here:

```ts
if (!collab.perms.enabled || !collab.perms.can_view || !collab.stepId) {
  return null;
}
```

So Collaborative Review is hidden because backend configuration rows are missing, not because the component merely fails to render.

## Fix plan for approval

### 1. Backend: make workflow assignment unambiguous and safe

Create a migration that adds/updates a server-side resolver/helper so application workflow assignment can be diagnosed and corrected safely:

- Keep source of truth as active `workflow_instances.workflow_id` for already-started workflows.
- Do not overwrite completed/cancelled workflow instances.
- For active/paused instances, only repair when the mismatch is unambiguous and the expected workflow is active with steps.
- Preserve historical workflows.
- Include version fields when creating new instances:
  - `workflow_version_id`
  - `version_snapshot`
  - `current_step_key`

For this specific case, the safe correction is to stop the stale sector-specific 2-step workflow from winning new assignments, then repair only eligible active Building Society applications whose instance is still on the old 2-step workflow.

The data condition is unambiguous because:

- The current active instance is on `Building Society Pre License Workflow` with 2 generic steps.
- The configured expected active workflow is `Pre License Approval Workflow` with 4 named steps.
- The affected application has no decisive workflow approvals yet; only remark actions exist on Step 1.
- Completed workflows must not be changed.

### 2. Backend: add/ensure Collaborative Review permissions

Because `review_step_permissions` is empty, Collaborative Review cannot be visible for any workflow step.

Add a safe migration to seed permissions for the configured 4-step workflow only, using existing internal dynamic roles where present:

- Enabled: `true`
- `can_view`: `true`
- Appropriate comment/reply/suggest/accept/reject/resolve/blocking permissions for internal reviewer/admin roles.
- Keep permissions role-based; do not bypass permissions in React.

If no dynamic role rows exist for the current super-admin user, support app-role fallback in the effective permission resolver, but do not grant external users access.

### 3. Frontend: one shared workflow context resolver

Create one shared resolver/hook used by all application review surfaces:

- `WorkflowPanel`
- `CollaborativeReview`
- approval actions
- approval blocking
- workflow history
- SLA
- admin diagnostics

The resolver will return:

```ts
workflowInstanceId
workflowId
workflowName
workflowVersionId
versionSnapshot
currentStepId
currentStepKey
entityType
regulatorId
steps
stepCount
collabPermissionSummary
inconsistencies
```

It will:

- Prefer active/paused `workflow_instances.workflow_id`.
- Fall back to `applications.workflow_id` only when no instance exists.
- Check both legacy `application` and canonical `pre_application` where needed.
- Load all `approval_steps` for the effective workflow.
- Never hide future/unassigned/no-activity steps.

### 4. Frontend: display workflow names and step names from backend

Update `WorkflowPanel` to show:

```text
Workflow Review
Pre-License Approval Workflow
Level 1 of 4
```

Using:

- `approval_workflows.name`
- `approval_steps.name`
- `approval_steps.step_order`

Do not generate generic names. If names are generic, the diagnostics panel will show that the backend names themselves are generic.

### 5. Frontend: admin-only diagnostics panel

Add an admin-only diagnostics panel on the application review page showing:

- Application Workflow ID
- Workflow Instance ID
- Workflow Instance Workflow ID
- Workflow Version ID
- Workflow Name
- Workflow Instance Status
- Entity Type
- Current Step
- Approval Step Count
- Loaded Step Count
- Collaborative Review enabled/can_view
- Matching workflow candidates
- Any mismatch or stale assignment warning

This will never render for external users.

### 6. Frontend: live invalidation after admin workflow/config edits

Invalidate/refetch the shared resolver and dependent queries when these tables change:

- `approval_workflows`
- `approval_steps`
- `approval_step_actions`
- `approval_workflow_versions`
- `workflow_instances`
- `review_step_permissions`
- `review_role_display_settings`

This covers immediate updates after admin step rename/order/permission/color/config changes.

### 7. Tests to add/update

Add automated coverage proving:

- Active workflow instance overrides stale `applications.workflow_id`.
- Legacy `entity_type='application'` instances are resolved for pre-license applications.
- The effective workflow renders all 4 configured steps.
- Future/upcoming steps remain visible.
- Step names come from `approval_steps.name`.
- Workflow name comes from `approval_workflows.name`.
- Version snapshot is used/preserved where present.
- No completed workflow instance is modified by repair logic.
- Collaborative Review is visible only when `review_step_permissions.enabled=true` and `can_view=true`.
- Admin diagnostic panel appears only for admins.

## Implementation evidence I will return after approval/build

After implementation, I will return:

1. Root cause.
2. Why only two steps were shown.
3. Why Collaborative Review was hidden.
4. Which workflow the application was actually using.
5. Which workflow it should use.
6. Whether data migration was required.
7. Exact files changed.
8. SQL migration, if any.
9. Tests added.
10. Build/test result.
11. Screenshot/evidence showing:
   - 4 workflow steps
   - correct backend step names
   - Collaborative Review visible
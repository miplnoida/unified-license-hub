# Pre-License Workflow Routing Fix — APP-2026-000096 (Building Society)

## What's actually wrong

Investigated APP-2026-000096 end-to-end against the backend:

- **Application** `b7496054-...`
  - `license_type` = `"Building Society - Building Society - Building Society"` (the taxonomy triple — this is how every NewApplication writes it)
  - `data.sector_id` / `sub_sector_id` / `category_id` all point to Building Society
  - `regulator_id` = `8dd8ac87-...`
  - `workflow_id` on the row = `aceb712a-...`

- **Workflow `aceb712a-...` attached to the application is**:
  - name: **"Registration Workflow"**, `entity_type = 'registration'`, `license_type = 'Domestic Insurance'`
  - i.e. the application is bound to a **registration workflow for a different sector** — completely wrong workflow type.

- **The correct configured workflow for Building Society pre-license exists**:
  - `490130a8-...` "Building Society Pre License Workflow", `entity_type = 'pre_application'`, `regulator_id` matches, `sector_id` = Building Society, `license_type = 'general'`, `is_active = true`, has steps.

- **`workflow_instances`** also points to the wrong `aceb712a-...` (status: active).

So the symptom "pre-licensee workflow isn't following sector/sub-sector/category config" is real and reproducible on this record.

## Root causes

1. **Resolver license_type filter is too strict for pre/post-license workflows.**
   `src/lib/workflowApprovalResolver.ts` requires `eq('license_type', licenseType)` on `approval_workflows`. Pre/post-application workflows in the admin UI are always created with `license_type: 'general'` (see `src/pages/workflows/WorkflowList.tsx:361,383`), while applications carry the full taxonomy triple string as their `license_type`. The two strings never match, so `matchWorkflowForApplication` returns `null` for every pre/post-application — even when sector/sub-sector/category are configured correctly. The resolver then reports `no_matched_workflow`.

2. **Stale / wrong `applications.workflow_id` + `workflow_instances` row.**
   This application has the wrong workflow attached (a `registration` entity_type workflow for Domestic Insurance). Likely a legacy/seed leak. Even after the resolver is fixed, the stored row needs to either (a) be re-bound to the correct workflow or (b) be ignored because the resolver's "attached workflow only honoured when it equals fresh match" gate now rejects it — which means the UI will fall back to creating a fresh instance through `verify-and-submit` on the next submission, but for this *already-submitted* record the instance must be rebound manually.

## Fix plan

### A. Resolver — taxonomy-first matching (frontend only)

`src/lib/workflowApprovalResolver.ts` → `matchWorkflowForApplication`:

- For `entity_type IN ('pre_application','post_application')`, drop the `license_type` equality filter entirely. Query approval_workflows by `regulator_id` + `entity_type IN (primary, legacy)` only, then rank candidates by most-specific taxonomy match: `service_id > category_id > sub_sector_id > sector_id > regulator-wide`. (Today the code already does the ranking, but never gets candidates because of the license_type filter.)
- Keep strict `license_type` matching for legacy `entity_type='application'` rows where `license_type != 'general'` — back-compat for any old configs.
- No behaviour change for `registration` / `return` / `complaint` workflows (they're not touched by this resolver).

### B. Same fix in the server-side resolver used by `verify-and-submit`

Workflow attach happens server-side in `supabase/functions/verify-and-submit/index.ts`. Mirror the same taxonomy-first match there so newly-submitted pre/post-license applications get bound to the correct workflow from the start. This is the critical fix that prevents future records from inheriting the same broken state.

### C. Data repair migration for this one bad record (and any siblings)

One-off SQL migration:

- For each `applications` row whose attached `approval_workflows.entity_type = 'registration'` but `applications.data` lacks a registration context (i.e. it's actually a pre_application / post_application), null out `applications.workflow_id` / `current_step_id` and mark the orphan `workflow_instances` row as `status='cancelled'`. The next time the user opens the application, the fixed resolver will pick the correct pre-license workflow and the next workflow action through `perform-workflow-action` will create a fresh instance.
- Scope tight: only flip rows where the attached workflow's `entity_type` clearly disagrees with the application's category. Do not touch registration approval workflows themselves.

### D. Tests

- Extend `src/test/workflowApprovalResolver.test.ts` with a Building-Society-style case: workflow has `license_type='general'`, `sector_id=X`; application has `license_type='Building Society - …'`, `data.sector_id=X` → resolver returns `enabled: true` and picks that workflow.
- Add a sub-sector and a category specificity case to lock in the ranking.

## Out of scope (per your earlier instruction)

- Registration approval workflow code paths — unchanged.
- The two other issues from the earlier turn (resubmission prefill, renewal-in-progress button) — already addressed / waiting on a separate example.

## Verification

1. Run the resolver test suite — new Building Society case passes.
2. Re-run the read query for APP-2026-000096 after the migration: `applications.workflow_id` is null, the old `workflow_instances` row is cancelled.
3. Open APP-2026-000096 in the internal-user UI: WorkflowPanel renders against `490130a8` (Building Society Pre License Workflow), not the registration workflow. Take the first workflow action → new `workflow_instances` row created on the correct workflow_id.
4. Submit a brand-new Building Society pre-license application end-to-end → `applications.workflow_id` is set to `490130a8` by `verify-and-submit` immediately on submission.

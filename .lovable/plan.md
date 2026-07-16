## Two fixes

### 1. Licensee picker returns "No licensees found"

**Root cause:** The picker queries `licensees.license_number`, but that column does not exist on `licensees`. Network shows every request returning `400: column licensees.license_number does not exist`. License numbers live on the `licenses` table (linked via `licensees.license_id`). The 400 causes the query to error out and render zero results.

**Fix in `src/pages/complaints/ComplaintDetail.tsx`:**
- Change the two `licensees` selects (`licenseeSearchQ` and `linkedLicenseeQ`) to embed the licenses relation for the license number:
  - `select('id, name, license_id, licenses:license_id(license_number)')`
- Update the `.or(...)` search filter to search by `name` and by the embedded `licenses.license_number` via a foreign-table filter (or drop the license-number branch of `.or` and keep name-only search — safer given PostgREST or-across-embed limits). Recommended: name-only ilike search, plus a separate ilike on a fetched `licenses.license_number` field client-side.
- Update the render (`l.license_number`) and `stagedLicensee`/`linkedLicenseeQ` display to read `l.licenses?.license_number`.

### 2. "Collaborative Review is not enabled for this step" on complaints

**Root cause:** The Complaint Management Workflow's Step 1 (`2299e262…`) has **0 rows** in `review_step_permissions`. The client fold requires at least one enabled row that matches the user's role, so review is disabled everywhere on this workflow. No workflow's complaint steps were ever seeded with review permissions.

**Fix (migration):** Seed default `review_step_permissions` rows for every `approval_steps` row that belongs to a complaint-entity workflow and currently has no permissions. Grant a sensible default set of roles view+comment+reply+suggest+resolve, and admin/super_admin the full set including accept/reject/mark_blocking. Concretely, for each such step insert one row per role in `{super_admin, admin, legal_compliance, analyst, supervisor, licensing_officer}` with `enabled=true`, appropriate flags, and `block_approval_on_unresolved_blocking=true` on the admin rows.

No functional code change needed for review — once rows exist, the existing `useCollabReview` fold picks them up.

### Files touched
- `src/pages/complaints/ComplaintDetail.tsx` (frontend query + render)
- One new migration to backfill `review_step_permissions` for complaint workflow steps

### Out of scope
- No change to the review permissions UI or the picker's other behaviors.
- No change to RLS.

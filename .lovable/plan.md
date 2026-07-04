## Goal
On Application Detail → Details tab, show Sector / Sub-Sector / Category as always-visible cascading dropdowns (same look as the New Application "Select Licensing Category" step) whenever the application is in `draft` or `in_progress`. No separate Edit or Save button. Changing sector must also refresh the sector-linked forms shown for the application, so a user who switches sector mid-draft sees the correct form(s).

## Current state (after last change)
`src/pages/applications/ApplicationDetail.tsx` currently renders an `Edit` button that toggles cascading Select dropdowns with a Save/Cancel bar. User rejects that UX.

## Changes (frontend only)

### 1. Replace the Details-tab taxonomy block
- Remove the `Edit` button, the `editingTaxonomy` toggle, Save/Cancel buttons, and the read-only fallback branch when `taxonomyEditable` is true.
- Render three Shadcn `Select`s always (Sector, Sub-Sector, Category), styled to match `NewApplication.tsx` lines 1815–1856:
  - Same labels, popper positioning, disabled cascades, "Select a sector first" placeholder pattern.
- When app is NOT editable (internal reviewer / `forceReadOnlyView` / submitted+), keep the existing read-only labels (unchanged behavior).

### 2. Persist changes automatically
- When the user changes any of the three selects:
  - Sector change → clear sub-sector + category locally.
  - Sub-sector change → clear category.
  - Category change (or any change that leaves all three set) → persist `sector_id/sub_sector_id/category_id/sector_name/sub_sector_name/category_name` to `applications.data`.
- Also persist intermediate changes so a partial re-selection is not lost (write whatever is currently chosen; leave the cleared ones empty in `data`).
- Show a light inline saving indicator (spinner next to the group) and a `sonner` toast on error only.

### 3. Refresh sector-linked forms
- After sector / sub-sector / category is fully re-selected AND the triple actually changed from what's stored:
  - Resolve matched form templates using the same priority ladder as `NewApplication.tsx` `matchedTemplates` memo (category → sub-sector → sector → legacy name fallback). Extract into a small local helper inside `ApplicationDetail.tsx` (no shared refactor to keep blast radius small).
  - Update `applications.data.form_template_ids` to the new matched template IDs.
  - Clear `applications.data.forms_data` entries whose keys no longer belong to the new template set (drop only removed template keys; retain data for templates that are still matched).
  - Also clear `applications.data.form_version_ids` for removed templates.
  - Refresh local `app` state and invalidate `['application', app.id]`.
- The existing "Submitted Forms" tab reads from `form_template_ids`, so it will now reflect the new sector's forms without further changes.

### 4. Explicitly out of scope
- No changes to fees, payments, RFI, workflow assignment logic, documents, permissions, or RLS.
- No changes to `NewApplication.tsx` or any other file.
- No confirmation dialog before switching sector (user asked for the New Application-style flow; that flow has no confirmation either while in `selection` step).

## Files to edit
- `src/pages/applications/ApplicationDetail.tsx` — replace taxonomy state/UI + add template-resolution helper + auto-save logic.

## Manual verification
1. Open a draft/in_progress application as its applicant → Details tab shows three dropdowns preselected to current sector/sub-sector/category (no Edit button).
2. Change Sector → Sub-Sector and Category reset; page persists partial change.
3. Pick full triple → toast-free auto-save; refresh page → new selection retained.
4. If new triple maps to different form templates → Submitted Forms tab reflects new forms; retained forms keep their prior data, removed forms are dropped.
5. Open the same application as an internal reviewer or when submitted → read-only labels as before.

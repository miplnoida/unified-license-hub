## Goal
On the Application Detail page, allow the applicant to change **Sector / Sub-Sector / Category** while the application is in `draft` or `in_progress` status. Everything else stays as-is.

## Current behavior
In `src/pages/applications/ApplicationDetail.tsx` (Details tab, lines ~714-740), `appData.sector_name`, `sub_sector_name`, and `category_name` are rendered as read-only labels. The underlying IDs (`sector_id`, `sub_sector_id`, `category_id`) live inside `applications.data` (JSONB), matching how `NewApplication.tsx` writes them at creation.

## Change (frontend only)
1. **Details tab — inline editor**
   - Replace the three static Sector / Sub-Sector / Category rows with cascading Shadcn `Select`s when:
     - `isApplicationEditable(app.status)` is true AND status is `draft` or `in_progress`, AND
     - the viewer is the applicant/licensee (not internal reviewer view, not `forceReadOnlyView`).
   - Reuse `useSectors`, `useSubSectors`, `useCategories` from `@/hooks/useMasterConfig` (same pattern as `SectorSelectionSection.tsx`).
   - Show current selection preloaded from `app.data.sector_id / sub_sector_id / category_id`.
   - Changing sector clears sub-sector + category; changing sub-sector clears category (cascading, same as registration).
   - Add a small "Save taxonomy" button (disabled unless all three selected and something changed). Cancel button reverts local state.
   - Internal staff / read-only viewers keep seeing the current read-only labels — no behavioral change for them.

2. **Persist to database**
   - On save: `supabase.from('applications').update({ data: { ...app.data, sector_id, sub_sector_id, category_id, sector_name, sub_sector_name, category_name } }).eq('id', app.id)`.
   - Names come from the loaded master-data lists so the read-only label continues to render after save.
   - Refresh local `app` state and invalidate any `['application', id]` queries that already exist.
   - Show success/error toast (existing `sonner` toast pattern used elsewhere in the file).

3. **Out of scope (explicitly not touched)**
   - `license_type`, workflow assignment, form templates, fees, RFI, documents, permissions, RLS, or any other tab.
   - No changes to `NewApplication.tsx`, registration flow, or edge functions.
   - Editing remains blocked for `submitted`, `under_review`, `approved`, etc.

## Files to edit
- `src/pages/applications/ApplicationDetail.tsx` — add local editing state, cascading selects, save handler within the Details tab section only.

## Manual verification
1. Open an application in `draft` or `in_progress` as its applicant → Details tab shows editable Sector/Sub-Sector/Category selects.
2. Change Sector → Sub-Sector and Category reset. Change Sub-Sector → Category resets. Save enabled only when all three chosen.
3. Click Save → toast confirms, labels re-render with new values, page reload retains them.
4. Open same application as internal reviewer → fields remain read-only.
5. Open a `submitted` / `approved` application → fields remain read-only for everyone.

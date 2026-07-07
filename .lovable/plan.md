## Problem
Admin Return Detail page (`/admin/returns/queue/:id`) groups forms by `tab_name`, so multiple forms end up rendered together in a single tab (long scrolling page). The Licensee view (`ViewReturnPage.tsx`) already shows one tab per form with the form name as the tab label — a better UX.

## Fix
Update `src/pages/returns-mgmt/ReturnDetail.tsx` to mirror the licensee tab pattern:

1. Replace the `tab_name`-based tab list with **one tab per form** (`form_id`), ordered by `display_order`.
2. Use `form_templates.name` (fallback to `tab_name`) as the tab label.
3. Each tab renders exactly one `ReadOnlyFormBlock` plus its reviewer comments.
4. Keep the `activeTab` bootstrap effect aligned with the new `tabs` array (first `form_id`).

No changes to:
- Data fetching (`configForms`, `fallbackConfigForms`, `submittedConfigForms`, merge logic).
- Workflow panel, approval actions, header, banners, or any business logic.
- Licensee view (already correct).
- Backend / schema / hooks.

## Files
- `src/pages/returns-mgmt/ReturnDetail.tsx` — swap tab construction + render block (lines ~174–179 and ~489–521).

Purely a presentation-layer change to bring the admin view in line with the licensee panel.
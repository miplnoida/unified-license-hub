# Application Detail — Tab Cleanup & Full-Width Layout

Admin application detail currently renders the tab set inside a 2/3-width column, with a permanently duplicated Activity Log card in the right sidebar, and with the workflow/review panels repeated *below* the tabs so they appear no matter which tab is open.

## What changes

1. **Full-width tabs**
   - Drop the `lg:grid-cols-3` split. Tabs and their content span the full page width; no blank right column.

2. **New "Workflow" tab**
   - Move the workflow review panel (and, for internal staff, the "Edit Request Pending" admin panel plus the manual "Review Actions" / resubmission-pending fallbacks) into a dedicated **Workflow** tab.
   - These stop rendering under every tab — they only show when Workflow is selected.
   - Deep-link support kept: when a workflow action is expected, Workflow becomes the default tab for internal reviewers.

3. **Activity in one place only**
   - Delete the right-sidebar Activity Log card (duplicate of the existing **Activity** tab).
   - Stop the top "Application Progress" card from also printing an activity list — it keeps only the status progress bar; the full trail lives in the Activity tab.

4. **Remove repeated info**
   - Remove the "Decision-ready view" promo card that showed on every non-Decision tab (the Decision tab is already in the tab strip).
   - Keep only one instance of each panel; no panel appears in more than one tab.

5. **Applicant actions stay put**
   - Submit / Resubmit / Request-Edit action blocks for the applicant remain as a single action bar below the tab content (they are actions, not duplicated info), now full width.

## Technical notes

- Single file for layout: `src/pages/applications/ApplicationDetail.tsx`
  - Replace the `grid grid-cols-1 lg:grid-cols-3` wrapper with a full-width container.
  - Add `<TabsTrigger value="workflow">` (internal only) + matching `TabsContent` hosting `WorkflowPanel`, the edit-request admin card, manual `ConfigurableDecisionActions` fallback, and the resubmission-pending notice — all mounted lazily via the existing `activeTab === 'workflow'` guard pattern.
  - Remove the sidebar `<div className="space-y-4">` Activity Log block and the "Decision-ready view" card.
- `src/components/applications/StatusTimeline.tsx`: add an `showActivityLog` prop (default `true`) and pass `false` from the detail page, so the component stays reusable elsewhere.
- No backend, RLS, or data-fetching changes; `events` remains loaded for status/edit-request logic.

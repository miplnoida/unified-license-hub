## Hide Returns & Inspections tabs on Entity Detail

Edit `src/pages/admin/LicenseeDetail.tsx`:

1. Remove the `returns` and `inspections` entries from the `tabs` array (lines 180–181), so the triggers no longer render in the tab bar.
2. Remove the corresponding `<TabsContent value="returns">` and `<TabsContent value="inspections">` blocks (lines 293–299) to drop their panes.

No changes to the underlying `ReturnsTab.tsx` / `InspectionsTab.tsx` components or any other tabs, hooks, or data — purely a presentation-layer hide so the modules can be re-enabled later by reverting these lines.
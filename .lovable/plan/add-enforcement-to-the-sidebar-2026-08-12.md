# Add Enforcement to the sidebar

## What's happening

The Enforcement pages exist and are routable (`/enforcement` list and `/enforcement/:id` detail, both guarded by the `license_management` module), but `src/config/navigation.tsx` has no entry pointing to them. So the only way to reach enforcement today is by typing the URL — nothing shows in the left panel.

## The fix

Add a single sidebar item:

- Label: **Enforcement Cases**
- Destination: `/enforcement`
- Placement: in the **Market Conduct** section, directly after "Investigation Closure Approvals" (enforcement is the outcome of conduct investigations)
- Icon: gavel (consistent with other decision/closure items)
- Visibility: internal staff only, gated on the same `license_management` module the route already enforces, so the menu never shows a link the user cannot open

No route, permission, or backend change — the route and its guard already exist; only the menu entry is missing.

## Technical notes

- Single edit to `src/config/navigation.tsx`: one item added to the `Market Conduct` section's `items` array with `roles: ALL_INTERNAL, module: 'license_management'`.
- Sidebar visibility tests (`src/test/sidebarVisibility.test.tsx`) run unchanged; the new item follows the existing module-gated pattern so persona expectations stay valid.

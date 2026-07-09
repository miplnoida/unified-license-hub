## Move admin menu items into "Prudential Supervision"

Edit `src/config/navigation.tsx` only.

**Remove** from `Returns Management → Returns Admin` children (lines 100–105):
- Validations
- Prudential Thresholds
- Prudential Ratios
- Prudential Analytics
- Notif Templates
- Notif Log

**Add** to `Prudential Supervision` group items (around line 212), appended after existing entries, preserving current labels, routes, icons, and `ADMIN_ROLES` gating. Since these are admin-only configuration screens, they'll be marked `adminOnly: true` where appropriate (matching the "Risk Taxonomy" pattern already in that group) and keep `module: 'returns_management'` so existing permission checks still pass — no route or permission changes.

Returns Admin submenu keeps: Return Types, Configurations, Cutoff Config, Due Dates, Late Fees, Schedule Calendar.

No route, page, or permission-registry changes. No other files touched.
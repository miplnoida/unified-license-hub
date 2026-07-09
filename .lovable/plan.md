## Goal
Add a Back button to the prudential supervised-entity profile page and insert short, non-functional explanatory descriptions inside the **Ratios & Trends** and **Breaches** tabs.

## What will change

### 1. Back button in `src/pages/prudential/PrudentialEntityProfile.tsx`
- Add a left-aligned **Back** button at the top of the profile page (above the entity name / action buttons).
- Use `ChevronLeft` icon + "Back to Entities" label.
- Link to `/prudential/entities` (as requested).
- Keep existing entity header, action buttons, and tabs untouched.

### 2. Tab usage descriptions (no logic change)
Add a short, read-only explanatory subtitle inside each of these tabs:

#### Ratios & Trends tab
- Insert a subtitle/info line below the tab header, e.g.:
  > "Displays prudential ratios computed from submitted returns over time. Use the trend chart and ratio table to monitor capital, liquidity, asset quality, and other configured indicators for this entity."

#### Breaches tab
- Insert a subtitle/info line below the tab header, e.g.:
  > "Lists threshold breaches detected from prudential returns. Each row shows the metric, severity, observed value, configured threshold, and detection date. Use the Create action / Escalate buttons to initiate supervisory follow-up."

- These will be purely presentational (text or a small `CardDescription`/`Alert` block). No changes to data fetching, table columns, chart logic, or action handlers.

## Files to edit
- `src/pages/prudential/PrudentialEntityProfile.tsx`

## Out of scope
- No changes to ratios/breaches data, calculations, or tab behavior.
- No changes to other profile tabs or the entities list page.

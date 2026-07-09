
## Problem

`/admin/returns/prudential/analytics` (`src/pages/returns-mgmt/PrudentialAnalytics.tsx`) appears blank because it requires the user to:
- pick a ratio from a dropdown (no default),
- **manually type a licensee UUID** into a plain text input,
- **manually type a period-end date**.

Until all three are filled, both the Trend chart and Peer Comparison chart show only "Select a ratio and licensee…" placeholder text — so on first load the page looks empty and there is no realistic way for a user to know a licensee's UUID.

## Fix (frontend-only)

Rework the filter bar in `PrudentialAnalytics.tsx` so the page is useful immediately:

1. **Ratio dropdown** — auto-select the first ratio from `useRatioKeys()` when none is chosen.
2. **Licensee picker** — replace the UUID text input with a searchable Select populated from `licensees` (id + legal_name, ordered by name). Auto-select the first licensee that has computed ratios so the trend chart renders on load.
3. **Period-end picker** — replace the free date input with a Select of distinct `period_end` values that actually exist in `return_calculated_ratios` for the chosen ratio (most recent first). Default to the latest period.
4. **Empty/loading states** — show a small "Loading…" / "No data yet" message inside each chart card instead of the current static placeholder when queries are pending or return zero rows.
5. Keep existing queries (`useRatioTrend`, `usePeerSnapshot`) and chart rendering unchanged; only wiring and defaults change.

No backend, RLS, or business-logic changes. Other prudential pages are untouched.

## Technical notes

- Add two small hooks inside the page (or co-located): `useLicenseesForRatio(ratioKey)` selecting distinct `licensee_id, licensees.legal_name` from `return_calculated_ratios` joined to `licensees`; `usePeriodEndsForRatio(ratioKey)` selecting distinct `returns_filed.period_end`. Both gated on `ratioKey`.
- Use existing shadcn `Select` (Command/Combobox if list is large) — remember the project convention that Select values must be non-empty strings.
- Preserve current `DashboardLayout` + `PageHeader` structure and both chart cards.

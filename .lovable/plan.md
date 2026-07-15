## Fix: Matched Signals badge readability

**Issue**: In the Suspected Duplicates table and the Duplicate Pair detail modal, the "Matched Signals" chips (email, phone, institution, etc.) render with a green background inherited from the shadcn `secondary` badge variant in the current theme, making the field label and detail text invisible.

**Fix (UI only)**: Update `src/components/complaints/duplicates/MatchedFieldsList.tsx` so each chip uses a white background with dark, readable text (and a subtle border), instead of the themed `secondary` variant.

- Change `<Badge variant="secondary" ...>` to `<Badge variant="outline" ...>` with explicit classes: `bg-white text-slate-900 border-slate-200`.
- Replace the muted-foreground span (which becomes unreadable) with `text-slate-600` so the detail portion stays legible on white.
- Keep icon, spacing, and content unchanged.

Because both the list view (`SuspectedDuplicatesTable.tsx`) and the detail drawer (`DuplicatePairDrawer.tsx`) render through `MatchedFieldsList`, this single change fixes both surfaces.

No other components, logic, or data are touched.

## Application Queue — Restore default order & add optional sort

**Goal:** Show newest applications first by default (do not reorder by priority). Display submission datetime. Let users pick a sort field from the filter bar. Keep all other functionality intact.

### Changes (single file: `src/pages/applications/ApplicationQueue.tsx`)

1. **Default order = latest first**
   - Remove the client-side sort by `getEffectiveActionPriority.sortKey` inside the `filtered` useMemo.
   - Remove `.order('priority', ...)` from the Supabase query.
   - Default DB order: `submitted_at desc nulls last`, then `created_at desc` (already present) → newest submission on top.

2. **Show submission datetime**
   - Add a new column **"Submitted"** between `Category` and `Status`.
   - Render `submitted_at` formatted as `dd MMM yyyy, HH:mm` (fallback to `created_at` with a muted "created" label if not submitted). Use `Intl.DateTimeFormat` — no new deps.
   - Bump the loading/empty `colSpan` from 10 → 11.

3. **Sort control in the filter bar (user-driven only)**
   - Add a `sortBy` state (default `'submitted_desc'`) and a `Select` next to the existing Status/Sector filters:
     - Newest submitted (default)
     - Oldest submitted
     - Application # (A→Z)
     - Applicant (A→Z)
     - SLA age (oldest first)
     - Action Priority (Critical → Deferred)
   - Applied in the `filtered` useMemo after the search filter. No sort is auto-applied beyond the user's choice; default remains newest-first.

4. **Preserved (unchanged)**
   - `getEffectiveActionPriority` helper, Action Priority column with tooltip, Manual chip, per-row priority Select, bulk update dialog, assignee logic, SLA chip, search, status/sector filters, RLS query, applicant/user lookups, stats cards.

### Verification
- Load page → rows ordered by newest `submitted_at` first (matches admin panel behaviour).
- New "Submitted" column shows date + time.
- Changing the Sort filter reorders the table; clearing it returns to newest-first.
- Action Priority badges, manual override chip, bulk update, and assignee dropdown all still work.

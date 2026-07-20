# Fix: Active Primary User not updating after creation

## Root cause (verified)
`PrimaryUserCard` (`src/components/entity-detail/PrimaryUserCard.tsx`) fetches its data in a `useEffect` keyed only on `entityId`. When `WebUsersTab` creates a new primary user via `create-web-user` + `entity_user_access` insert (lines 136–166), it calls its own `loadUsers()` to refresh the table, but never signals `PrimaryUserCard` to refetch. `entityId` doesn't change, so the card keeps showing the pre-creation state until a full page reload.

## Fix
Add a lightweight refresh signal from `WebUsersTab` down to `PrimaryUserCard`.

1. `src/components/entity-detail/PrimaryUserCard.tsx`
   - Accept an optional `refreshKey?: number` prop.
   - Include `refreshKey` in the `useEffect` dependency array that triggers `load()`.

2. `src/components/entity-detail/WebUsersTab.tsx`
   - Add local state `primaryRefreshKey` (number, default 0).
   - After a successful create in `handleSubmit` (and after primary-related edits/status toggles if applicable), bump `primaryRefreshKey`.
   - Pass `refreshKey={primaryRefreshKey}` to `<PrimaryUserCard />`.

No behavior changes elsewhere. Purely a presentation-layer sync fix — no backend, RLS, or workflow changes.

## Verification
- Create a primary user from the Web Users tab → "Active Primary User" card updates immediately without page reload.
- Existing table refresh, PPOC mappings enrichment, edit/reset/deactivate flows remain untouched.

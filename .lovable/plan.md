# Plan: Surface PPOC mappings in Web Users tab

Read-only enhancement to `src/components/entity-detail/WebUsersTab.tsx`. No DB changes, no changes to create/edit/delete flows, no changes to the PPOC Mapping admin page.

## What the user will see

For each row in the Web Users table (the entity's Primary + Secondary users), a new **PPOC Mappings** column showing:

- `—` if the user has no active PPOC mappings.
- Otherwise, a compact list of the *other* licensees they are mapped to as PPOC, each as a small badge (licensee name + sector count if scoped). Example: `Acme Insurance (2 sectors)`, `Beta Bank`.
- We exclude a mapping that points back to the current entity itself (avoids "PPOC of self" noise — they're already the Primary/Secondary here).
- If the list is long (>2), show first 2 badges + `+N more` with a tooltip listing the rest.

A small info hint above the table clarifies: *"PPOC Mappings show additional licensees this user is authorized to act on. Manage them in Admin → PPOC Mapping."*

## Data fetch

Extend the existing `loadUsers` in `WebUsersTab.tsx`:

1. After loading `profiles` for the entity, collect their `id`s.
2. Fetch in parallel:
   - `ppoc_entity_mappings` where `ppoc_user_id IN (userIds)` AND `is_active = true`.
   - `ppoc_mapping_sectors` for those mapping ids (count only).
   - `licensees` (`id, name`) for the referenced `licensee_id`s.
3. Build a `mappingsByUser: Record<userId, { licenseeId, licenseeName, sectorCount }[]>`, filtering out entries where `licenseeId === entityId`.
4. Store in a new `userMappings` state and render in the new column.

All queries use the existing `supabase` client and respect current RLS — no new RPC.

## Non-goals (explicitly unchanged)

- Create/View/Edit/Delete/Reset password/Deactivate actions.
- Primary/Secondary logic and button label.
- `entity_user_access` insert on create.
- `PrimaryUserCard`, other entity-detail tabs, PPOC admin page, `PpocContext`, `LicenseeSwitcher`.

## Technical details

- File touched: `src/components/entity-detail/WebUsersTab.tsx` only.
- New state: `const [userMappings, setUserMappings] = useState<Record<string, MappingSummary[]>>({})`.
- New column inserted before the actions column in the existing `<Table>`.
- Badges use existing shadcn `Badge` (variant `outline`) and `Tooltip` for the overflow list.
- No new dependencies.

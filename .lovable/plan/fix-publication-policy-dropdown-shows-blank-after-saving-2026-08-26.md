# Fix: Publication policy dropdown shows blank after saving

## What's happening

On Regulated Entities → Detail → Structure → Public register policy, changing the dropdown does save correctly. The current value for Apex Commercial Bank is stored as "Public" in the database, and the save routine writes it properly.

The dropdown looks empty because the screen reads the entity's publication policy from the entity structure summary, and that summary never includes the publication policy field. So the selected value is always undefined, and the dropdown falls back to the "Select a policy" placeholder — before and after a change.

## The fix

1. Extend the entity structure summary routine so it returns the entity's current publication policy key and its human-readable label.
2. The Structure workspace then binds the dropdown to that returned key, so the saved policy is displayed on load and immediately after a change (the screen already refreshes this data after a successful save).
3. Show the policy label next to the dropdown as read-only confirmation of what the public register currently applies.

## Technical detail

- `public.entity_structure_overview(uuid)` (SECURITY DEFINER, unchanged permission checks) gets two new keys in its JSON payload: `publication_policy` (the key from `registry_publication_policies`, joined via `licensees.publication_policy_id`) and `publication_policy_label`. No schema change, no new table, no grant change — a `CREATE OR REPLACE FUNCTION` migration only.
- `src/pages/entities/EntityStructureHub.tsx` already reads `overview.publication_policy`; no change needed for correctness beyond the read-only label display. `useSetPublicationPolicy` in `src/hooks/useWaveB.ts` already invalidates the `['wave-b']` key, which covers `['wave-b','entity-structure',entityId]`.
- No change to the write path (`entity_set_publication_policy`) or to the public register functions.

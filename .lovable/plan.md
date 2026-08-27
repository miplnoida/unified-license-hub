# Fix: Entity 360 "Identity" section shows "No identity records"

## Diagnosis (confirmed by database inspection)

This is a **data gap, not a UI/code bug**.

- The entity you are viewing is **Apex Commercial Bank** (`f74e8eb9-…`, identity status "Provisional", created 2026-08-24).
- The Identity tab of Entity 360 reads from the `entity_identifiers` table via the `entity360_section` RPC.
- Verified: `entity_identifiers` has **0 rows** for this entity, so the "This entity has no identity records on file." message is rendering correctly.
- Scope: only **20 of 53 licensees** have any identity identifiers on file — the RDM Wave A seeding populated identifiers for a subset of entities, and entities created later (like Apex Commercial Bank) never got identifier records. There is currently **no governed write path in the app** to add one.

## Proposed fix

1. **Backfill migration (data fix)**
   - For every licensee with no `entity_identifiers` rows, insert a primary identifier record derived from the data we already hold (e.g. legal name and/or registration/license number from `licensees`/`licenses`), using the appropriate `entity_identifier_types` entry, with `verification_status` matching the entity's current identity state (`provisional` → 'unverified/provisional', per the `entity_identifier_types`/status catalogue).
   - Idempotent: only inserts where no identifier exists for the entity.
   - Result: Apex Commercial Bank and the other 32 affected entities will show their identifier(s) instead of the empty state.

2. **Governed add-identifier path (optional, closes the gap going forward)**
   - Add a governed RPC `public.entity_identifier_register` (internal staff only, permission-checked, audit-logged) so new identifiers can be recorded from the Entity 360 Identity section without direct table writes.
   - Add a small "Add identifier" action in the Identity section (visible only to roles allowed by `e360_section_allowed`).

## What I will NOT change

- The empty-state UI or `entity360_section` logic — both are working as designed.
- Identity verification status transitions ("Provisional" → "Verified") — that remains the existing entity-resolution workflow.

## Verification

- Re-query `entity_identifiers` for Apex Commercial Bank and confirm the Identity tab renders the record.
- Confirm the other 32 entities are backfilled and counts match expectations.

# Governed Identity Verification Action

## Goal
Give internal staff a governed way to verify an entity's identifier against an authoritative source, which promotes both the identifier and the entity's identity status (e.g. Apex Commercial Bank) from Provisional to Verified.

## Current state (confirmed)
- `public.entity_identifier_register` only records a claim; every new identifier defaults to PROVISIONAL.
- No verification RPC exists for entity identifiers (checked all public functions).
- The Identity section of Entity 360 has "Add identifier" but no verify action.
- Entity-level identity status (`licensees.identity_identity_status` / `entity_identity_statuses`) is never promoted by any existing flow.

## What will be built

### 1. Backend: `public.entity_identifier_verify` RPC (migration)
- Internal-staff only (checked via existing role/permission helpers); revokes anon.
- Inputs: identifier ID, authoritative source reference (e.g. registry name), evidence notes/attachment reference, and optional verification date.
- Concurrency-safe: row lock on the identifier; rejects if already VERIFIED (idempotent error).
- Sets the identifier's verification status to VERIFIED and records source/evidence + who/when.
- If the identifier is the entity's **primary** identifier, promotes the entity's identity status to `verified` in the same transaction.
- Writes an audit-log entry (existing audit infrastructure).
- Optional counterpart `entity_identifier_reject_verification` to move a claim to REJECTED with a mandatory reason.

### 2. UI: Verify action in Entity 360 → Identity section
- "Verify" button on each PROVISIONAL identifier row (visible to authorized internal roles only).
- `VerifyIdentifierDialog.tsx`: shows the identifier claim, requires authoritative source + evidence notes (and optional document), confirm via SweetAlert2.
- On success: row flips to VERIFIED; when it's the primary identifier, the entity identity status badge updates to Verified (queries invalidated).

### 3. Verification
- pgTAP assertions: permission denial for non-staff, happy-path verify, primary-identifier promotion of entity status, idempotency, audit row written.
- Browser check on Apex Commercial Bank: verify its REN, confirm both the identifier row and the entity identity column show Verified.

## Technical notes
- New migration only adds a function — no table shape changes; identifier evidence stored on existing `entity_identifiers` columns (verification metadata) or audit log if columns are absent (will confirm at build time).
- No changes to pre-license registration flows.

# Fix: entity web users show as "Applicant" and cannot use Returns

## What I found (verified in the database)

For `anisha.k@mishainfotech.com` (Apex Commercial Bank, `user_type = primary`, `licensee_id` set):

- `profiles.role = 'applicant'`. The signup trigger `handle_new_user` maps any requested role that is not `applicant`/`pre_licensee`/internal down to `'applicant'`, so `licensee_primary` (what the web-user function requested, and what her `auth` metadata still shows) never lands on the profile row. That is exactly why the admin Web Users list labels her "Applicant".
- She has **no** row in `entity_user_memberships` and **no** row in `entity_user_access` for Apex. The Web Users tab does insert into `entity_user_access` after creating the account, but the result is never checked and no row exists — so nothing links her to the entity in the tables the Returns rules read.
- Returns access is decided server-side by:
  - read: `can_read_entity_returns` → `entity_external_read_access` = an active `entity_user_access` row **or** an APPROVED membership with `returns.view`;
  - filing/submission: `returns_can_file` → `entity_membership_capability(user, entity, 'returns.submit')` **and** licence entitlement.
  With neither row, both evaluate false: her Returns pages come back empty/denied and she cannot submit.

For the PPOC `john.smith@yopmail.com` there **is** an APPROVED `entity_user_memberships` row for Apex with role `PRIMARY_REPRESENTATIVE` (`is_primary_representative = true`), which satisfies both the read and the submit capability. That single row is the whole difference between the two users. Apex's licence (`LIC-2026-000034`, active, valid to 2027-08-24) is fine, so entitlement is not the blocker.

## Fix

1. **Correct the profile role for entity web users** — in `handle_new_user`, when the requested role is `licensee_primary`/`licensee_secondary` and `user_type` is `primary`/`secondary`, persist that role on `profiles` instead of collapsing it to `applicant`. `create-web-user` additionally sets `profiles.role` explicitly after creation so the value is authoritative regardless of trigger ordering. No new privilege is introduced: both are external roles, and every server check stays as-is.

2. **Provision the entity link server-side** — `create-web-user` (service role) creates, in the same call as the account:
   - `entity_user_memberships`: `PRIMARY_REPRESENTATIVE` for a primary user, `FILING_USER` for a secondary user, status `APPROVED`, `effective_from = now()`, `approved_by` = the admin performing the action, with `authority_evidence_reference = 'Admin-provisioned entity web user'`;
   - `entity_user_access`: `primary_user` / `secondary_contact`, active.
   The client-side insert in `WebUsersTab.tsx` is removed (it silently fails under RLS) and any failure returned by the function is surfaced as an error toast instead of a success message.

3. **Backfill existing entity web users** — one migration that, for every `profiles` row with a `licensee_id` and `user_type` in (`primary`,`secondary`) that has no membership/access row, inserts the corresponding APPROVED membership plus active access row, and repairs `profiles.role` to `licensee_primary`/`licensee_secondary`. This immediately fixes Anisha and any other user created the same way.

4. **Web Users list display** — show the entity role from `user_type` + membership role (Primary User / Secondary User) rather than the raw `profiles.role`, so the column can never read "Applicant" for an entity user again.

## Explicitly unchanged

`returns_can_file`, `returns_entitlement_ok`, `can_act_on_license`, `entity_membership_capability`, `can_read_entity_returns`, all Returns RLS policies, PPOC mapping logic, and the internal Returns queue. Access still has to be earned through a membership/access row — we are creating the row that admin provisioning was supposed to create.

## Verification

- Re-query Anisha: `profiles.role = licensee_primary`, one APPROVED `PRIMARY_REPRESENTATIVE` membership and one active `entity_user_access` row for Apex.
- Signed in as her: Returns pages list Apex obligations/filings, a filing can be opened and submitted; admin Web Users shows "Primary User".
- Create a fresh test web user for an entity and confirm both rows appear from the single admin action, and that a failure now shows an error rather than a false success.
- A user with no entity link still gets no Returns data (negative check).

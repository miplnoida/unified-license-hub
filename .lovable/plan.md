# Fix "No internal users found" in the panel member picker

## What's happening

The picker builds its list by reading the whole staff-role table from the browser. Access rules on that table only allow **admin / super admin** accounts to read all rows — every other internal user (licensing officer, supervisor, analyst, legal) can only read *their own* role row.

So when a non-admin internal user opens the picker:
- only their own row comes back,
- and if their own profile is marked as a portal user type (e.g. the licensing officer account whose profile type is `primary`), it is then filtered out by the primary/secondary exclusion added earlier,
- leaving zero options → "No internal users found."

Confirmed in the database: 13 candidate staff accounts exist (10 with profile type `employee`, 3 marked `primary`), all active, so the data is fine — only the read path is broken.

## The fix

Stop deriving the staff directory in the browser and serve it from one trusted server-side directory function.

1. Add a security-definer directory function `public.list_internal_users(_search text, _include_ids uuid[])` that:
   - returns one row per distinct staff account: id, full name, email, primary role, status,
   - keeps only accounts holding a non-external role (excludes pre_licensee, licensee, licensee_primary, licensee_secondary, applicant),
   - excludes accounts whose profile type is a portal type (primary, secondary, applicant, licensee variants) — the rule agreed earlier,
   - excludes accounts mapped to a licensed entity,
   - restricted to internal staff callers via the existing `is_internal_staff` check; anyone else gets no rows,
   - optional search on name/email and optional forced inclusion of legacy ids so already-assigned members still render.

2. Point `useInternalUsers` at this function instead of the three client-side table reads, keeping the same return shape (`id`, `full_name`, `email`, `primary_role`, `status`, `is_active`) so every existing consumer — appeal panels, panel composition dialog, legal referral, prudential actions, coordination, notification forwarding, background info — works unchanged.

3. Bump the query cache key so stale browser-cached empty lists are discarded.

## Verification

Run the app and open both appeal-panel pickers (New/Edit panel form and Panel Composition dialog) and confirm the 10 internal staff members are listed as `Name — email`, with primary/secondary portal accounts still absent. Report the result rather than assuming it.

## Technical notes

- Access rules are unchanged; the directory function is the only new read path, and it is gated to internal staff.
- No table or policy changes are needed — this is a read-path fix plus one function.

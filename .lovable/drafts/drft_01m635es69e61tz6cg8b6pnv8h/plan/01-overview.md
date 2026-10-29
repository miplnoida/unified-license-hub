## Goal
Fix three access/visibility problems without changing roles, permissions, schema or unrelated modules.

## What was confirmed before planning (read-only)
- `rodneybay.registration@yopmail.com` holds only `applicant` + `pre_licensee` roles. The post-licence rule added earlier is only applied on two screens; "My Returns" (`/entity/returns*`) and other licensee menus still use the broader `requiresLicenceEntitlement` check, which treats a linked licence as entitlement.
- `rbc_primary_user@yopmail.com` is `licensee_primary` — must keep full access.
- The staff accounts are actually `returns_officer@mishainfotech.com` (profile role `returns_officer`, system role `analyst`) and `returns_supervisor@mishainfotech.com` (profile `returns_supervisor`, system `supervisor`). The brief's spelling `return_officer@` does not exist.
- The regulator filing page has tabs Versions / Forms / Metrics / Validation / Compare / Lifecycle / Requests — no tab renders the submitted answers.

## Diagnosis still to confirm (step 1 of build)
Why the header says "Applicant" for the staff accounts. Likely cause: the role label helper or login mapping does not recognise the `returns_officer` / `returns_supervisor` profile role and falls back to the external "Applicant" label, which also makes the menu treat them as external and show "My Returns". This will be proven by signing in as each account and tracing the resolved role before any fix.

## Fixes
1. **Pre-licensee lockout** — one shared eligibility rule (role + active licence + approved entity membership; no emails/IDs) used by the sidebar, the route gates for all post-licence and `/entity/returns*` pages, and the applications list. Direct URLs show a clear "available to licensed institutions" screen instead of the membership warning.
2. **Staff role consistency** — fix the role resolution so staff fall back to their system role (Analyst / Supervisor) instead of "Applicant"; header, profile and menu read the same resolved role. Staff opening My Returns are sent to the regulator Returns Queue. No role assignments changed.
3. **Submitted answers for regulators** — add a "Submitted answers" tab to the regulator filing page, reading the existing stored submission for the selected version: sections, fields, tables and attachments (attachment links via existing signed-URL viewer). Read-only; uses the existing filing detail data and permissions.

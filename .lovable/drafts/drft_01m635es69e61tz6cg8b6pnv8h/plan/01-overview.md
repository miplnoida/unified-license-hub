# Final plan: fix "role not found" and make permission edits safe

Scope: only the "role not found" error and making permission edits safe. The cross-institution application issue is not included. No bulk copy of roles, no other role or module changes, and nothing runs on the database or gets published without your approval.

## What the final checks showed
**Admin who can edit roles but not create them.** Copying a missing role into the older role list counts as creating a role. The existing security check stays in place and is not bypassed, so for these roles the save is refused and nothing changes. The admin sees: *"Saving this role for the first time needs the 'Create roles' permission. Ask a super admin or someone with that permission."* Roles that are already in the older list save exactly as today.

**Attempts vs. successful saves in the audit log.**
- **"Assign permissions" check (attempt):** recorded when the admin clicks Save, before anything is saved. I'll label it as an attempt and add the role's ID. It stays even if the save fails, so it is never counted as a change.
- **"Role saved" (success):** recorded only when the save completes, inside the same all-or-nothing step. It lists the permissions added, removed and kept.

A failed save leaves only the attempt entry. Each successful save leaves one attempt entry and one "Role saved" entry, with no duplicates.

**Consistency.** The permission list that controls real access and the page's list line up one-to-one, with no duplicates. After the fix:
- the page's ticks come from the list that controls access;
- the older list ends up with exactly what was ticked;
- the access list gets the same ticks, plus anything the page can't show, which is always kept;
- the real access check reads only the access list.

**Complaints Officer + all 6 Support Management actions:**
- Before: 15 permissions and 1 assigned user.
- After: 21 permissions (the same 15 plus the 6 new ones) and the same 1 user.
- Type, tier, category and status don't change.

**SQL checked against the real tables.** I checked every column, required field, uniqueness rule and automatic check involved. This turned up one limit you should know about:

> **23 of the 42 affected roles still can't be saved after this fix.** 21 of them, for example Complaints Supervisor, Returns Supervisor and Security Administrator, use a dashboard level the older list doesn't allow (supervisory, admin or oversight). The other 2, Prudential Analyst and Applicant, have a name that clashes with a different role already in the older list.

Fixing these 23 would mean changing the older list's rules or merging roles, which is outside this fix. Instead of "role not found", the admin will see a clear message saying why the role can't be saved yet, and nothing changes. **Complaints Officer and Returns Officer are not affected by this limit.**

## Applying and testing
The change applies only when you accept the draft. Then I'll test:
- Complaints Officer and Returns Officer
- Approver/Decision-Maker (already in the older list)
- one of the 23 limited roles (must be refused cleanly)
- an edit-only admin (must be refused cleanly)
- a deliberately failing save (nothing may change)
- a user with no role-management access (must be refused)

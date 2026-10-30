# Revised minimal fix: "role not found" and safe permission editing

Scope: only the "role not found" error and making permission edits safe. The cross-institution application issue is not included. I won't run anything on the database, copy roles in bulk, or publish without your approval.

## Results of the read-only checks
**1. Mapping between the two permission lists.** The page's list of permissions and the list that controls real access line up one-to-one, with no duplicates or doubles on either side. But **146 of the 423 real permissions have no entry on the page's list**. 41 roles hold 178 of these.

**2. Today's save already loses permissions.** Every save, on any role, removes real permissions the page can't show. For Complaints Officer that would remove complaint assign, investigate and resolve, and correspondence dispatch. The fix keeps them.

**3. Complaints Officer today:** 15 permissions and 1 assigned user. 11 of the 15 show on the page, 4 can't. Its type, tier, category and status are copied unchanged. Its stored data-scope settings are empty today and stay empty.

**4. Audit logging today.** The page writes an "assign permissions" entry before the save is even tried. That's why two entries were logged at 08:05 today for your failed attempts. These entries don't name the role and stay even when the save fails. The save itself writes only a permission count.

**5. Copying a role into the older list needs role-create permission.** An automatic check on that list requires it. An admin who can edit roles but not create them would get a clear refusal. Nothing would be saved.

## Expected before and after: Complaints Officer, adding Support Management (all 6 actions)
| | Before | After |
|---|---|---|
| Permissions that control real access | 15 | 21: the same 15 plus the 6 Support Management actions |
| The 4 that can't show on the page | kept | kept |
| Assigned users | 1 | 1 (unchanged) |
| Type, tier, category, status | internal, operational, operational, active | unchanged |

An administrator can still remove any of the 11 visible permissions by unticking it. Nothing else is removed.

## The fix
1. **The page shows the real ticks.** It reads them from the list that controls access. The permissions it can't show are listed read-only as "Also held (managed elsewhere)", so they're visible but never removed by mistake.
2. **The role is copied into the older list only when it is saved**, keeping the same ID and details. There's no bulk copy.
3. **The save changes only what the page shows.** Real permissions the page can't show are always kept.
4. **One accurate audit entry per save.** It's written inside the same transaction and names the role, the permissions added, removed and kept, and whether the role was copied in. The early "attempt" entry from the page is relabelled as an attempt, so it isn't counted as a change.
5. **All or nothing.** Copying the role, permission changes and the audit entry are saved together, or not at all.

## Testing after you accept
The change applies only when you accept the draft. Then I'll test it on:
- Complaints Officer and Returns Officer (affected)
- Approver/Decision-Maker (already has an older-list record)
- a deliberately failing save (nothing may change)
- a user without role-edit permission (must be refused)

You'll get the before-and-after permission lists for each.

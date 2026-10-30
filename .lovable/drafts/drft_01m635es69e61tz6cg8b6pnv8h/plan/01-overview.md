# Revised minimal fix: "role not found" when saving Complaints Officer

## What I checked
- **Why the save still uses the older role list.** The current role list decides who can do what, and the access checks read only that list. The save step is a wrapper that first calls an older save routine. That routine holds the save checks (data scope rules, "View must be ticked first") and stores each role's data-scope settings. The roles page still reads those settings from the older list. So the older list can't simply be dropped in a small fix. It would mean moving the scope settings and checks across, which is a separate, larger change.
- **Why it fails.** Complaints Officer exists only in the current list. The older routine tries to update it there, finds nothing, and stops with "role not found". 42 roles are like this.
- **A second, bigger risk I found.** The roles page loads each role's current ticks from the older list. For Complaints Officer that list has none, so the page opens with nothing ticked, even though the role really has 15 permissions and 1 assigned user. If the save worked as it does today, ticking only Support Management would **wipe the other 15**. Also, 4 of those 15 (complaint assign, investigate, resolve and correspondence dispatch) have no match in the older list, and today's save would always drop them.

## The minimal fix (3 parts, only for the role being saved)
1. **Show the real ticks.** The roles page loads each role's current permissions from the current list, so Complaints Officer opens showing what it really has.
2. **Copy the role into the older list only when that role is saved.** It keeps the same ID and the same name, description, type, category, tier, status and system flags. Its data-scope settings start empty, exactly as the page shows them today. No bulk copy of the 42 roles.
3. **Never drop permissions the page can't show.** The save changes only the permissions the page can display. The 4 extra Complaints Officer permissions, and any like them on other roles, are left untouched.

## What does not change
- Who can edit roles stays the same: you need role-management edit permission, or super admin.
- No user's role assignments change.
- No other role, permission, user or module is touched.
- If any check fails, the whole save is undone. That includes the copied role, so nothing is half saved.
- Support Management access is enforced by the same access check the app uses everywhere. That check reads only the current list, which this save updates.

## Applying and testing
The change applies only when you accept this draft. I won't run anything on the database before you approve. Once you accept, I'll test it on:
- Complaints Officer and Returns Officer (both affected)
- Approver/Decision-Maker (already has an older-list record)
- an account without role-edit permission (the save must be refused)

Then I'll report the results. I can't record this request in the project's task list while in planning mode, so I'll add it there once you approve.

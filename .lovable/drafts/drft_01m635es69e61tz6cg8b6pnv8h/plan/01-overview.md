# Fix "role not found" when saving Complaints Officer access

## What is happening
Saving a role on the Roles page goes through two role lists: the current one (used by the page and by sign-in access checks) and an older list that the save step still writes to first.

The **Complaints Officer** role exists only in the current list. The save step tries to update it in the older list, finds nothing, and stops with "role not found". Nothing is saved.

This affects **42 roles** created this way, including Complaints Officer and Supervisor, Returns Officer and Supervisor, Fit & Proper Officer and Supervisor, the AML/CFT roles, Licensee Primary and Secondary User, Applicant and Pre-Licensee. Editing any of them fails the same way. Roles created on the page itself are not affected.

## The fix
Before saving, the save step checks whether the older list has the role. If not, it copies the role in with the same ID, name, type, category, tier and status from the current list. The normal save then runs as it does today: same checks, same permission rules, same audit entry.

- Who can edit roles does not change. You still need role management edit permission or super admin.
- No permissions are granted automatically. A role gets only what you tick and save.
- No other role, user or module changes. The copy is made only when that role is saved.

## Applying it
The change is ready, but it applies only when you accept this draft. Until then the error still shows in the preview, so I can only test the fix after you accept. Then I'll save Support Management on Complaints Officer and confirm the access was stored.

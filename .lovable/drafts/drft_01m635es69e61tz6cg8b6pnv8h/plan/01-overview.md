# Fix: pre-licensee pages sending the user back to the dashboard

## Confirmed cause
An approved pre-licensee account only gets pages on a fixed "allowed pages" list. Anything not on the list sends them to the dashboard. My Institution, My Correspondence, Help & User Manual and Support aren't on that list, so these four pages get blocked before they load. These are the links the user sees in the menu.

## Change
Add these four pages to the allowed list:
- My Institution (`/entity/profile`)
- My Correspondence (`/entity/correspondence`, and the message detail pages under it)
- Help & User Manual (`/help`)
- Support (`/support`)

## What stays the same
- My Institution data still comes only from the existing member-only lookup. A pre-licensee who isn't an approved member of the institution sees the page's own "no institution" message. They don't see institution data, ratings or notes.
- Correspondence only shows threads the backend already allows this user to see.
- Returns and post-licence services stay blocked for pre-licensee-only accounts.
- No database, permission or role changes.

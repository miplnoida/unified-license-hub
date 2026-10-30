## Fix: Pending payments card opens a 404 page (pre-licensee dashboard)

**Cause:** For pre-licensees, the card links to `/billing/pre-licensee`, a page that does not exist. Licensees go to `/payments?status=pending`, which exists and is already allowed for pre-licensees.

**Fix:** Point the pre-licensee card to the same working payments page, filtered to pending.

## Technical details
- `src/components/dashboard/ApplicantDashboard.tsx` line 40: set `paymentsPath` to `'/payments?status=pending'` for all users.
- No database, permission or other module changes.
- Check: sign in as the pre-licensee test account, click the card, confirm the payments list opens.

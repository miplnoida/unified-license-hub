# Pre-Licensee Dashboard – Pending Payments 404 Fix

## Root cause
For pre-licensees, the Pending payments card links to `/billing/pre-licensee`. No such page exists, so it shows 404. The payments page `/payments` exists and pre-licensees are already allowed to open it.

## Exact change
File: `src/components/dashboard/ApplicantDashboard.tsx`, line 40.

Before:
```ts
const paymentsPath = portalCtx.isPreLicensee ? '/billing/pre-licensee' : '/payments?status=pending';
```
After:
```ts
const paymentsPath = '/payments?status=pending';
```
Licensees already use this exact link, so their navigation is unchanged.

## Manual verification
1. Sign in as the pre-licensee test account and open the dashboard.
2. Click Pending payments: the payments list opens (no 404).
3. Confirm the list is filtered to pending payments.
4. Confirm only that account's own payments appear.
5. As a licensee, confirm the card still opens the same payments page.

## Scope confirmation
Only this one line in this one file changes. No other files, modules, database, permissions or payment logic are touched. No publishing.

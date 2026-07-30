## What I confirmed

- `APP-2026-000131` has one appeal, `APL-2026-000001`, currently in **withdrawn** status (lodged and withdrawn today).
- The appeal panel on the application page shows whatever appeal exists — including a withdrawn one — so the applicant can no longer see the "Lodge an appeal" button while that record stays.
- Withdraw is currently a single click with no confirmation (`LicenseAppealPanel.tsx`).
- Internal staff already have an appeals register; it is not something missing.

## Plan

1. **Confirmation before withdrawal**
   - In the applicant appeal panel, wrap "Withdraw appeal" in a SweetAlert2 confirmation (matching the project's destructive-action pattern): title, explanation that withdrawal ends the appeal and cannot be undone, Cancel / Yes, withdraw.
   - Only run the withdrawal mutation when confirmed; keep the existing spinner and toasts.

2. **Clear the withdrawn appeal for APP-2026-000131**
   - Remove the withdrawn appeal record `APL-2026-000001` (and its timeline events) via a data migration, so the applicant sees the eligibility card and can lodge a fresh appeal within the remaining 30-day window.

3. **No other behaviour changes** — regulator register, panel referral, and decision flows stay as they are.

## Answer: how internal users see appeal requests

Internal staff use the sidebar entry **Licensing → Licensing Appeals** (`/admin/license-appeals`). That register lists every lodged appeal with counters (total, open, with panel, decided), a status filter, and an eye icon that opens the appeal record where staff can acknowledge, refer to an appeal panel with a hearing date, and record the outcome with a rationale. A second entry, **Appeal Panels** (`/admin/appeal-panels`, admin-only), manages panel membership.

Visibility requires the `license_appeals` module permission on the user's role — a role without it will not see the menu item and will be blocked from the route. So if a supervisor can't see appeals, grant that module in Roles & Permissions.

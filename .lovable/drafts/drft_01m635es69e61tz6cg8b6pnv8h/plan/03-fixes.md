## Fixes

1. **Export notifications.** Add "exported" to the server's list of allowed notification audit actions so Export downloads a CSV. *Database function change: it is staged and takes effect when you accept the draft.*
2. **Wrong Open record page.** When the signed-in user is external, send registration links (`/admin/registrations/...`) to `/registration-status`. Unknown admin links fall back to opening the notice only, with no navigation. This is done in the shared link helper, which serves both the list and the detail panel.
3. **Blank outcome.** When the outcome is empty, show "See the decision letter" instead of "Outcome: .". This is a display fallback only; stored notices are not changed.
4. **Licence detail 403.** On the licence page, treat a "forbidden" summary result as no summary. The page shows the licence normally, with no background error or retry storm. Who may see the summary on the server is **not** changed (see the decision below).
5. **Certificate stuck.** If the certificate does not exist, show "Certificate not yet issued by the regulator" and disable the Certificate button. "Check back shortly" is misleading here. Generating certificates is not changed.
6. **Entity Name "—".** Use the licence's own entity or application name as a fallback when the holder's profile can't be read.
7. **Duplicate key warning** on the Help & User Manual page: give its list items unique keys.

## Decision needed (not in this fix unless you approve)
Bug 4 has a deeper cause: this applicant can see licence `LIC-2026-000166` in the list, but the server says they are not its holder. This touches the access concerns you put **on hold**, so I will not change any server access rule. Fix 4 only removes the visible error.

## Not changed
No roles, permissions, access rules, payment logic, the Role Not Found work or the cross-institution work. No publishing.

## Verification
- Run the same browser check as the pre-licensee on all 10 My Work addresses: no 404, no page error, no failed background calls.
- Notifications: Export downloads a CSV; registration "Open record" opens Registration Status; application notices open the application.
- My Licences: View shows no 403s; Certificate shows the clear message; Entity Name is filled in.
- Add small tests for the link redirect rule and the export action being allowed.

## Technical details
- Files: `src/lib/notificationLinks.ts` (or the resolver used at `NotificationCenter.tsx:346` / `NotificationDetailDrawer.tsx:85`), `src/hooks/useLicenseLifecycle.ts` (`useLicenseCase` swallows 42501 and sets `retry: false`), `src/lib/licenseCertificate.ts`, `src/pages/licenses/LicensesList.tsx` (entity name fallback), the user-manual component with the duplicate key, and the message renderer for the outcome fallback.
- Staged migration: `CREATE OR REPLACE FUNCTION public.log_notification_audit` with `'NOTIFICATION_EXPORTED'` added to the allow-list; the body is otherwise identical.

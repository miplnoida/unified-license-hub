# Pre-Licensee – My Work Menu Bug Fix

## What was checked
I signed in as the pre-licensee `rodneybay.registration@yopmail.com` and opened every My Work sub menu, followed every link and clicked the main buttons on each page.

The sidebar shows 7 items: Notifications, My Licences, My Appeals, My Correspondence, My Payments, Help & Support (plus Help & User Manual). My Institution, My Returns, Information Requests and Supervisory Actions are hidden correctly. If you type their web address directly you get a clear "not available" notice instead of an error.

**Pages that work:** no page crashes and no 404. My Appeals ("View my applications"), My Correspondence, My Payments (pending filter, row actions, help link) and Help & Support (Open/Resolved tabs, new request form) all behave correctly.

## Bugs found

| # | Menu | Bug | Evidence |
|---|------|-----|----------|
| 1 | Notifications | **Export** fails with an error toast for every user | The server rejects the "exported" audit entry because it is missing from its allowed list (HTTP 400) |
| 2 | Notifications | **Open record** on registration notices sends the applicant to the regulator's admin registration page (wrong page) | 5 notices link to `/admin/registrations/...` |
| 3 | Notifications | The "Decision issued" message reads "Outcome: ." because the outcome is blank | Message text in the notice |
| 4 | My Licences → View | The licence detail page triggers two "forbidden" (403) errors in the background, so its summary header never loads | The licence holder on record is a different account from the signed-in applicant |
| 5 | My Licences → Certificate | Always shows "Your certificate is being prepared. Please check back shortly." The certificate was never generated, and an applicant cannot generate it, so the message never changes | Certificate service returns "not found" |
| 6 | My Licences | **Entity Name** column shows "—" | The name is looked up from the holder's profile, which this applicant is not allowed to read |
| 7 | Help & User Manual (from Payments) | Console warning about duplicate keys on the manual page | React warning (no visible break) |

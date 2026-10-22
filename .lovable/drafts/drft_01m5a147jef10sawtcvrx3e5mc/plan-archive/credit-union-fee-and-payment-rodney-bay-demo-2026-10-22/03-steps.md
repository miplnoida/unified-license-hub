## Shortest path

| # | Screen | Action | Role | State |
|---|---|---|---|---|
| 1 | `/register` → Start New Registration | `rodneybay.registration@yopmail.com`, exact legal name; stop if a provisional entity is proposed | You (email code) | Ready |
| 2 | `/admin/registration-review/:id` | Resolve the match to registry `cc331…`, then approve (creates the hand-off) | Entity Resolution Officer, then Registration Officer | After 1 |
| 3 | `/pre-license/new` | New applicant saves the Credit Union draft (no payment yet) | New applicant | After 2 |
| 4 | Application page → Fee breakdown | Add one XCD 2,500 application fee line to this draft only | Licensing Officer | After 3 |
| 5 | `/pre-license/new` → Payment & Submit | Applicant sees XCD 2,500, pays with the built-in simulation, then submits | New applicant | After 4 |
| 6 | Read-only check | Application number, payment reference/receipt, payment status "completed", application status "submitted" | Me | After 5 |

What I do: guide you through each step and run the read-only checks in step 6. I change nothing in Fee Management and no gateway settings, and I never mark a payment as paid.

## Risks to confirm during the run
- Step 4 assumes staff can open a draft application's page. If the fee panel isn't available for drafts, I stop and report it. The only other option is a sector-wide fee, which would also charge APP-2026-000163.
- Step 5 assumes the payment step reads the per-application fee. I check the amount shown before anyone pays.

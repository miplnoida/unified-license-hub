# Session 2 demo data: status check and finish plan

## Answer: No, Session 2 is not complete

I checked all 15 steps of the Session 2 run sheet against the live data (09:45 UTC).

| Steps | What's in it | Status |
|---|---|---|
| 1-8 | Registration, form v2.0, fee, payment, submit, workflow | Data ready. APP-2026-002011 is submitted, with the paid XCD 2,500 receipt. The answers are fictional demo values. |
| 9-10 | Officer raises a query, applicant answers it | Not ready: the application has no query yet |
| 11 | Directors' fit & proper review | Partly ready: 2 people in screening, 1 submitted, 1 waiting for a committee decision |
| 12 | Second-person approval, licence issued | Blocked: final approval was refused because the fit & proper decisions and the sufficiency check aren't done |
| 13-14 | Licence conditions, renewal and variation setup | Blocked: no licence exists yet |
| 15 | Entity 360 view | Partly ready: there's no licence to show yet |
| Extra | Primary web user for the applicant | Not created: this comes after the licence |

There is one blocker. The fit & proper committee needs 3 votes. Only 1 of its 3 members (the Super Admin) is allowed to vote, and that vote is already in. The other two get "permission denied".

## Plan to finish (after you approve)

1. **Fix the committee voting.** Give the existing committee-vote permission to the Fit & Proper Supervisor and Fit & Proper Officer roles, through the admin role-permission screen.
2. **Finish fit & proper for all 4 directors** in the normal screens: screening, then committee votes, then the decision.
3. **Run the sufficiency check** on the application.
4. **Raise one officer query and have the applicant answer it** (steps 9-10). This has to happen before final approval.
5. **Final approval as the second person**, then confirm the licence is issued and its conditions show.
6. **Create the primary web user** for rodneybay.registration@yopmail.com through the licensee's web users page.
7. **Retest the whole of Session 2 in the browser** with each role's login. I'll take a screenshot at every step and mark each row Ready or Not ready in the demo documents.

## Committee voting decision (you approved option A)
Only the vote permission is added, and only to those two roles. No other permission changes. The change is recorded in the audit history and noted in the demo documents.

## Rules I'll follow
- Every step goes through the app's normal screens, using the account of the role that owns it.
- No workflow steps skipped.
- No changes to the fit & proper findings.
- Nothing in the protected AML records changes.

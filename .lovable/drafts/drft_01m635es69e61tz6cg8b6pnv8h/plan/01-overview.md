# Two Fixes Before Accepting the Draft

Nothing will be accepted or published. Both fixes stay in this draft until you approve them.

## 1. Lock "Under Review" applications for Primary and Secondary users

**Why they can still edit:** the server check from this draft blocks the applicant. Primary and Secondary users get their edit rights through a separate "can submit / can respond to information request" route, and that route ignores the Under Review state. The screens have the same gap.

**Fix:**
- **Server:** when an application has been submitted and is with the regulator, refuse every applicant-side edit. That covers the applicant, Primary and Secondary users, and any institution member. Staff with application-edit permission and super admins keep their access.
- **Server:** the draft-save command already blocks every non-staff user. Keep that and add a test.
- **Screens:** the Edit and Continue buttons and the form pages use one shared "is this editable" rule for every portal user, so Primary and Secondary users see read-only forms. Today they get editable controls through their submit permission.
- **Unchanged:** returned applications, information-request responses and resubmissions still open for editing.

## 2. Submitted return answers not visible to regulator staff

**What I found:**
- The answers are stored. 6 return forms have saved answers, across 3 filing versions; 6 more are still pending with no answers.
- rohit@mishainfotech.com is a Super Admin and Licensing Analyst, so the database lets that account read those answers. Access rules are not the cause.
- The Submitted Answers tab on a filing page exists only in this draft. On the main or published app, staff have no screen that shows return answers at all.

**FIL-2026-000003-f63f:** still a Draft. It was never submitted, so there are no answers to show.

**FIL-2026-000001-b43a (closed):** both forms have stored answers. I opened this filing in this draft signed in as rohit@mishainfotech.com and clicked **Submitted answers**. The answers did show, for example Assets 48,500,000 on the Balance Sheet form.

**Why it looks missing:** the filing page opens on the **Versions** tab. Submitted answers is a separate tab further down the page, which is easy to miss. The main and published app don't have this tab at all.

**Fix (display only):**
- On submitted, accepted or closed filings, open the **Submitted answers** tab first.
- Add a "View submitted answers" button to the Filing closed panel.
- On unsubmitted filings, show "This filing has not been submitted yet – no answers to review."
- No access-rule or database changes.

## Checks
- Primary and Secondary users trying to edit an Under Review application are refused, both on screen and by the server. A returned application still opens for editing.
- rohit@mishainfotech.com sees the answers for FIL-2026-000001-b43a and sees the "not submitted yet" note on FIL-2026-000003-f63f.
- Run the existing tests plus new tests for both rules.

## How the database change applies
The Under Review database change is staged in this draft. It takes effect only when you accept the draft. Nothing is published.

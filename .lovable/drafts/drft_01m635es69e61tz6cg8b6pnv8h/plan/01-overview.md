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
- 12 return form slots exist. 6 have stored answers, saved under the "return filing requirement" type.
- Staff can read stored answers only if they hold one of the old built-in roles (admin, supervisor, analyst or super admin). The newer role setup, such as a Returns Officer, is not checked. So those staff get nothing back, and the Submitted Answers tab shows empty forms.

**Not yet confirmed:** which admin account you are using. Step 1 checks that account's roles and confirms this is the cause before anything changes.

**Fix:**
- Add a read-only rule: staff who can view a filing, according to the existing filing-access check, can read the stored answers for that filing's forms, and nothing else. Institutions keep their own access; there is no cross-institution reading and no write access.
- If a form has no answers stored, the tab says so clearly instead of showing an empty form.

## Checks
- Primary and Secondary users trying to edit an Under Review application are refused, both on screen and by the server. A returned application still opens for editing.
- A Returns Officer and an admin can see the answers for FIL-2026-000001-b43a. An unrelated institution user cannot.
- Run the existing tests plus new tests for both rules.

## How the database changes apply
Both database changes are staged in this draft. They take effect only when you accept the draft. Nothing is published.

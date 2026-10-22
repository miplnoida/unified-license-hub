# Rodney Bay: submit pre-licence form, approve licence, create primary web user

Scope: only Rodney Bay Community Credit Union Ltd (cc331000-...0001), applicant rodneybay.registration@yopmail.com, draft APP-2026-002011 (now on form v2.0). No code, schema or security changes. AML freeze stays in force and AML records are not touched.

## Step 1 - Pre-checks (read-only)
- Confirm the draft is still editable, on v2.0, and the existing payment TXN-1792648603-2B7B7D (XCD 2,500) is linked and settled.
- Confirm an active Pre Application approval workflow covers the Credit Unions sector, and which staff roles act at each step.
- If no workflow covers Credit Unions, stop and report. I will not create or change a workflow without separate approval.

## Step 2 - Submit the form (applicant, in the browser)
- Sign in as the applicant and complete all 11 sections (A to K) through the normal screens.
- Answers use clearly fictional demo values that match the Rodney Bay story (credit union, Saint Lucia, XCD). Required uploads use the prepared demo PDFs.
- Use the existing payment; no new payment is made. Submit, and confirm the status is Submitted and the application is in the workflow.

## Step 3 - Review and approve through the configured workflows (staff, in the browser)
- The pre-licence application goes through every step of the configured Pre Application workflow, in order, with the role assigned to each step. No step is skipped and no manual override is used. Maker-checker is kept, so different accounts act at the review and approval steps.
- The licence is issued only by that workflow. Confirm the licence number, its validity dates and that it links to Rodney Bay.
- Post-licence applications from Rodney Bay follow the configured Post Application workflow the same way. Step 1 also checks that this workflow exists for Credit Unions. No post-licence application is created unless you ask for one.

## Step 4 - Primary web user
- Check whether the approval already set up the applicant as a licensee user.
- If not, an admin opens Rodney Bay's Web Users tab and creates rodneybay.registration@yopmail.com as the Primary User. That gives an approved Primary Representative membership and active entity access.
- No duplicate account is created if one already exists. The welcome or temporary-password email goes only to this yopmail address.

## Step 5 - Verify
- Signed in as the applicant: the licence is visible, the user is listed as Primary User, and the licensee portal pages load for Rodney Bay.
- Database read-back confirms one application (Submitted, then Approved), one workflow run, one licence, and one membership plus one access row.
- Update `demo/readiness-matrix.md` and `demo/blockers-and-dependencies.md`.

## Will stop and report if
- There is no Credit Union workflow, a staff session is not available, or a required field cannot be filled honestly with demo values.

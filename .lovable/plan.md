# Demo readiness plan: Sessions 2, 3 and 4

## Goal
Use one connected story across all three sessions: the same regulator, applicant organisation, people, application and licence, all created through the normal screens. Then hand over a readiness pack that lists what works, what partly works and what is missing, with gaps written down honestly rather than shown as finished.

The current draft APP-2026-002011 is left untouched.

## The connected story

```text
Session 2                 Session 3                    Session 4
Registration  ->  Licence  ->  Returns / Risk / AML  ->  Complaint / Investigation
(Rodney Bay CU)   issued       assessment, findings      enforcement, dashboards,
                               corrective actions        reports, audit trail
```

One regulator with the Credit Unions sector, one demo organisation (a new "Rodney Bay Demo Credit Union" registered by the applicant) and one second organisation for comparison views.

## Step 1 - Readiness check (read-only)
- Walk every screen in each session's list as the right user and score it Ready, Partial or Missing.
- Reuse the earlier read-only audit and update it.
- Output: `/mnt/documents/demo/readiness-matrix.md`.

## Step 2 - Demo users and roles
- Confirm or create demo accounts: applicant (rodneybay), licensing officer, supervisor/approver, analyst, AML officer, complaints officer and executive viewer.
- These are created through the admin screens. Passwords are shared with you privately, never written into documents.

## Step 3 - Session 2 data (through the screens, as the applicant and the officers)
- A new application on the current form (version 4), with documents uploaded, fee assessed and payment completed (simulated gateway).
- Review, due-diligence notes and approval, so a licence is issued with conditions.
- One extra application left mid-review and one left at "query raised", to show live states.
- Variation and renewal shown on the issued licence, if Step 1 finds them Ready.
- Entity 360 and Person 360 checked for the new organisation.

## Step 4 - Session 3 data
- Regulatory return filed by the new licensee, with one late return to show penalties.
- Prudential monitoring view and peer comparison.
- AML/CFT: walk through the existing policy, methodology and configuration screens. Show existing assessments.
- **Constraint:** project memory has AML-CLOSE-08 frozen, which blocks new AML development and certification runs. Creating a new AML assessment for the demo needs your explicit go-ahead. Without it, Session 3 shows existing assessments only.
- Examination finding with a corrective action and remediation tracking, if available.

## Step 5 - Session 4 data
- Public complaint against the demo credit union, moved through triage and investigation to an outcome.
- Enforcement or appeal only where the screens exist. Otherwise it is listed as a gap.
- Dashboards, reports, AI insights, API keys/integrations and audit log checked against the data created above.

## Step 6 - Session run-sheets
For each session, `/mnt/documents/demo/session-N-runbook.md` will contain:
- Agenda and click-by-click flow
- Logins to use
- Configuration-then-effect moments, e.g. change a fee rule or form, then show its effect
- Cross-module hand-offs
- Known gaps and fallback talking points
- Dry-run checklist

Responsible team members and dates are left as blanks for you to fill in. I don't have that information.

## Out of scope
- Code changes
- Publishing
- Changes to the protected AML records and FSRA policy

Any blocker found during Step 1 is reported to you as its own fix request.

## Technical details
- All successful flows are run through Playwright browser sessions as the real users, as the project rules require. Database reads are used only to verify results.
- Each record created is logged with its reference number in `/mnt/documents/demo/demo-data-register.md`.

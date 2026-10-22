## What I will do, in one pass

**Session 2: licensing**
- **Processing:** open APP-2026-002011 as staff and check the review notes, document verification, the existing RFI and its answer, and the F&P records. I add only non-decision notes where the screen allows it. I make no new votes or determinations.
- **Post-licensing:** as the admin, build the 3 forms (fictional Saint Lucia content), publish them, and activate the 3 services.
  - Then, as rodneybay.registration, open each service and fill in and **save it as a draft**. I do not submit, because each request is legally significant.
  - I also record the service status for all 15 services.

**Session 3: prudential and returns**
- **Figures:** prepare one consistent set of fictional XCD figures for Q4 2025 to Q3 2026, covering assets, loans, deposits, institutional capital, income and expenses. From these I work out the ratios: capital to assets, liquidity, and delinquency over 90 days.
- **Returns:** create the Credit Union quarterly return as described above. Then file each period the schedule actually opens as rodneybay.registration through the normal filing screen. If no period is open yet, the returns are reported as blocked by the filing schedule.
- **Prudential assessment:** using the assessment screen, add the methodology note, risk-factor observations, the supporting figures, observations and recommendations.
  - Its status stays **draft**, with no approved rating.
  - Any score is shown only as an officer's draft proposal, if the screen allows that.
- **SP-CU-DEMO-2026-01:** fill in the objectives, planned activities, dates, responsible people and the link to the assessment. Status stays draft.
- **EXM-CU-DEMO-2026-01:** check the 3 findings and the 3 corrective actions (PA-CU-DEMO-2026-01/02/03). I fill any empty description, severity, owner, remediation or target date. Nothing is marked completed.

**Verification and report**
- I open every item in the browser with an authorised session and keep the URL and a screenshot of each.
- The report is the table you asked for, using your exact statuses, plus:
  - the list of post-licensing services
  - the list of quarterly returns
  - the blockers for each session, with the next action for each

## Rules I keep
- No new entity or application.
- No payment, vote, determination or approval.
- No status changes made directly in the database, and no backdating.
- No code, schema or security changes.
- AML/CFT records are untouched.

If a screen refuses a save, I stop on that item, record the exact error and carry on with the rest.

## Technical details
- Licence `c5a0d9fe` has `holder_id` = 4de88ec7 (the applicant). Licence visibility rules stay as they are.
- Services `CU-PL-02/04/07` are activated using the services admin screen. No Credit Union forms exist with `form_type = post_license`.
- `return_configurations` has 0 rows for sector 17a9fbec, and there are no Credit Union `return_templates`.
- Prudential assessment `cd600001-…-0001`: `ratings = {}`, `evidence_refs = []`, `status = draft`.

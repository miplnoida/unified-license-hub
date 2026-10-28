# St Vincent FSA demonstration preparation

## Current verdict
**Not fully ready as a St Vincent FSA demonstration.** The Rodney Bay application, licence and accepted return are usable examples, but they belong to Saint Lucia FSRA. Current reports mix historical/test populations and reporting sources. Do not present those totals or policies as St Vincent regulatory data.

The read-only review confirmed:
- APP-2026-002011 approved; LIC-2026-000166 active; FIL-2026-000001-b43a accepted with an immutable version and different submitting/accepting users.
- No duplicate application/licence/filing references or tested filing relationship/date mismatches.
- Six licence-to-sector regulator mismatches need classification, not automatic reassignment.
- 54 documents pending scanning and seven legacy-unverified documents are not safe evidence-viewer demonstrations.
- Rodney Bay prudential assessment and supervisory plan remain drafts; the assessment is not linked to the accepted filing.
- Reports Overview shows no compliance-return data, while the canonical filing register has 96 records. The Board Pack reconciles 119 licences, 56 applications, 96 filings and 22 complaints, but is installation-wide, not an SVG-specific pack.

## 1. Preserve the existing installation
- Keep all Saint Lucia entities, policy versions, historical assessments and workflow decisions unchanged.
- Keep AML-CLOSE-08 frozen: no AML development, calculation, certification, policy changes or cleanup.
- No bulk relabelling, date manipulation, fabricated approvals, scanner bypass, role grants or external email/SMS.
- Review any proposed authorization SQL and its exact security impact separately before applying it.

## 2. Establish an honest FSA demonstration context
Default to a **clearly labelled illustrative credit-union demonstration**, explaining that the existing installation is a Saint Lucia configuration and SVG rules would be configured during implementation.

After approval, prepare a fictional SVG-specific entity and coherent example records through normal authorized screens, only if the installation supports doing so without changing shared Saint Lucia configuration. If separate preparation cannot be isolated safely, retain Rodney Bay as an explicitly non-SVG product example rather than rename it.

Use illustrative XCD figures; do not describe existing annual/quarterly forms, deadlines, thresholds or registration/licensing terms as SVG-prescribed. Validate these against FSA-supplied requirements before regulatory configuration.

## 3. Prioritize the reporting demonstration
- Trace one accepted filing from institution → reporting obligation → period → validated submission → reviewer → acceptance → supervisory review.
- Reconcile Reports Overview and the relevant returns reports against canonical filings; retain separate legacy coverage where necessary rather than silently merge unlike records.
- Give the executive pack an explicit regulator/sector/date scope and state what each total counts. Do not present installation-wide counts as SVG statistics.
- Present a concise briefing covering authorisations, filing completeness/overdue work, financial indicators, supervision/findings/remediation, complaints and fee collection. Mark unavailable indicators as unavailable, not zero.
- Investigate dashboard versus report count differences and document population/status rules before changing them.
- Demonstrate export/print only after values reconcile; scheduled delivery requires separate verification and permission to send.

## 4. Complete a coherent supervisory storyline
- Assess whether a safe normal-screen link can connect the accepted filing to the prudential review; do not retrofit invented lineage.
- Complete applicable review/approval steps with distinct authorized officers only where approved; drafts remain labelled drafts until then.
- Rehearse examination → finding → corrective action → enforcement monitoring using existing fictional examples, without issuing real sanctions or external notices.
- Preserve real licensing dates. Explain older reporting periods as historical illustrative data; do not change dates just to remove overdue indicators.
- Keep unverified uploads, renewal and AML actions out of the live demonstration.

## 5. Verify the actual presenter journey
- Use a normal presenter account rather than the break-glass Super Admin for the primary demonstration.
- Verify primary-user, returns-officer/supervisor, prudential and complaints screens with authorized sessions; no permission broadening to make a screen work.
- Confirm exact record references, visible statuses, report counts and document availability; capture fallbacks for blocked steps.
- Rehearse a 45–60-minute flow and freeze demonstration data after the rehearsal. Changes to shared configuration, publication or external communications require separate approval.

## Proposed agenda
1. Institution dossier and authorisation — 8 minutes.
2. Primary-user return, validation and accepted version — 12 minutes.
3. Prudential review, examination and remediation — 12 minutes, only verified steps.
4. Complaint and enforcement-monitoring example — 8 minutes.
5. Executive reporting and audit provenance — 10 minutes.
6. Explain package choices and SVG implementation configuration — 5 minutes.

## Technical details
- Existing RLS and workflow commands remain the access and decision boundaries.
- Licence holder identifiers are mixed: 61 resolve to entity records, 53 to profiles and five only to auth identities. This is not evidence of 58 orphaned licences; ownership resolution needs explicit review.
- Eight active return reports use `compliance_returns`; none directly use `return_filings`. Inspect their actual execution paths before selecting a reporting fix.
- Package C is currently selected. The PDF package split differs from stored project preferences; show C for the complete demo and do not alter A/B definitions without reconciling the commercial scope.
- Add narrow regression tests for any approved reporting/data-rule change; normal authorized browser journeys establish usability. Do not run frozen AML certification suites.

## Acceptance criteria
The chosen entity's dossier, licence, filing and supervisory example tell one consistent story; presenter roles can open every planned screen; report totals reconcile for an explicit population; fictional data and non-SVG configuration are disclosed; unavailable/scanner-blocked content is not claimed complete; protected records and unrelated modules remain unchanged.
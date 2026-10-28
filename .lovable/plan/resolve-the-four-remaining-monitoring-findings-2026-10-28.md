# Resolve the four remaining monitoring findings

## Completed first
Nine findings corrected and verified with 54 targeted tests plus a rolled-back overdue-alert regression. Two findings were outdated; the risk-worker missing-import explanation was false-positive against the current library and hosted boot logs. Browser checks proved Board Pack reconciliation, examination filters/calendar links, AML entity links and Notification Templates page-size selection. Frontend publication and AML certification remain out of scope.

## 1. Registration documents — verification without dead ends (#2)
- Keep verified-email ownership and fresh registration OTP mandatory for issuing a new upload capability.
- Provide a dedicated verification stage before the first document/signature upload, after the primary email is collected, regardless of submission-OTP placement.
- When submission OTP is disabled, distinguish that preference from mandatory upload-ownership verification; do not issue anonymous unverified capabilities.
- For returning applicants, offer fresh verification when capability issuance expires; never treat a historical `emailVerified` flag as fresh server authorization.
- Surface verification-required/expired reasons rather than a generic upload failure.
- Test default/deferred OTP, submission OTP disabled, expired returning applicants, changed-email invalidation and cross-journey denial.

## 2. Malware scan delivery (#9)
- Keep documents unavailable until a trusted scanner returns a clean verdict.
- Add an atomic, server-owned enqueue bridge when file_uploads enters pending_scan; deduplicate jobs and cover secure upload, form uploads, batch uploads, RFI and DMS paths.
- Commission or verify the scanner endpoint and credentials using secure settings, without exposing secrets. Scanner availability is an external dependency; do not invent a clean verdict when absent.
- Process only authorized worker jobs; retry/report scanner failures without falsely reporting scan completion. Verify clean, infected, unavailable-provider and retry cases with harmless test files.
- Do not mass-release or rescan historical documents without separate authorization.

## 3. Renewal-only access (#10)
- Introduce an explicit server-side renewal rule bound to a real licence and a configured renewal service, with existing approved entity membership/capability checks and taxonomy/regulator compatibility.
- Permit eligible expired/past-grace licence holders to request renewal without authorizing unrelated post-licence activity.
- Keep suspended/revoked/cancelled licences excluded unless existing policy explicitly permits them; no client-declared renewal flag may bypass validation.
- Retain duplicate-request, form, payment and approval workflow controls.
- **Before applying any authorization change, present exact SQL and its permission impact for separate approval.** Test legitimate expired-holder renewal and unauthorized/cross-entity/non-renewal denials.

## 4. Professional supervision navigation (#13)
- Register Detection & Trigger Governance and Management Assurance in the canonical database menu under the existing supervision group.
- Align navigation visibility with the existing cross-domain route authority and subscription-package availability; do not grant new roles or rely on hardcoded fallback entries.
- Verify authorized staff discoverability, unauthorized exclusion, search/breadcrumbs, and disabled-package hiding.

## Technical safeguards
- New database objects require explicit grants and RLS; queue access must not let applicants/staff forge scan verdicts or worker jobs.
- Use additive migrations only; preserve content fingerprints, published AML policy bases and protected assessments.
- Use normal authorized browser journeys for positive user-flow checks and narrow unit/rolled-back database tests; no full AML certification, shared-server resize, external communications or app publication.
- Update the monitoring review and resolve each remaining finding only after its scoped checks pass; report provider/session blockers explicitly.

## Approval requested
Approve this scoped implementation approach for findings 2, 9, 10 and 13. Renewal authorization SQL still requires its own approval before execution; scanner activation requires a verified provider.
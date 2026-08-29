# F5 — Post-Licensing Services: Final Certification (IN PROGRESS)

Runtime HEAD at time of this run: `8848e9150d45fe765a71b3c071c4324e81f4d99a`
Status: **NOT CERTIFIED — F5-C BLOCKERS REMAIN** (certification gate not green)

## 1. Final live census (verified against the live database)

| Measure | Value |
| --- | --- |
| Active F5 service rows (post_license + renewal) | 152 |
| post_license rows / renewal rows | 144 / 8 |
| Distinct business definitions | 17 |
| Workflow-bound rows | 152 / 152 |
| Published-form-bound rows | 152 / 152 |
| Effect-mapped definitions | 17 / 17 |
| Unmapped services | 0 |
| F&P-required rows / definitions | 40 / 5 |
| Licence variation rows / voluntary surrender rows | 8 / 8 |
| PRODUCT_GAP entries | 0 |
| BCR entries | 1 (`PLS_DEREGISTRATION`) |

### Industry feature matrix (effect register)

Supported families: RENEWAL, LICENCE_VARIATION, LICENCE_SURRENDER, legal-name change,
address change, auditor change, change of control, shareholding change, beneficial-owner
change, director appointment, director resignation (ack), KFH change, new branch,
branch closure, group restructuring, incident notification, outsourcing notification.

Ownership recorded for non-catalogue journeys: expiry = governed scheduled sweep
(`license_expiry_sweep`, `mark_expired_licenses`) plus officer confirmation;
reinstatement = internal `license_lifecycle_step DECIDE_REINSTATEMENT`.

## 2. Certification gate `certify:f5c`

`scripts/certify-f5c.sql` created and registered as `certify:f5c` (61 assertions across
Sections A–K: census/matrix, entity-change E2E, F&P dependency, notification
acknowledgement, branch open/close, renewal, variation/surrender, fee + withdrawal +
applicability boundary, authority/isolation/browser-tamper, classification authority and
the frozen F4 boundary, server authority/immutability).

Current result: **58 / 61 passing at best run; not green.**

Outstanding failures are harness-level, in the certification script itself — not yet
proven product defects, and not yet cleared:

- `C-99` — F&P scenario harness: determination outcome vocabulary and the certified
  one-open-filing-per-licence guard require per-scenario terminal fixtures; partially
  corrected, still aborting.
- `H-99` — submission-boundary harness: `can_submit_application` / intake-context return
  shapes need text handling; the governed `WORKFLOW_FIELD_LOCKED` guard correctly refuses
  the harness's direct status transition (a genuine control, proving the boundary).

Because the consolidated gate does not pass twice cleanly, **F5 is not certified and not
frozen**. Sections 3–6 below (surface manifest, full upstream regression, security
certification sign-off) were not executed in this run and must not be treated as
evidence.

## 3. Corrections carried into this document

The F5-B5X evidence wording stating that a client-side workflow fallback remains is
**stale**. Final truth: `src/lib/workflowApprovalResolver.ts` is server-only. Persisted
applications resolve exclusively through `application_workflow_view(application_id)`, and
RPC error, forbidden, no-row, `found=false` or malformed state all fail closed; unsaved
applications return an unresolved state without a browser regulatory decision.

## 4. Boundary / BCR register (unchanged, legitimate non-product items)

- `PLS_DEREGISTRATION` jurisdiction semantics (BUSINESS_CONFIGURATION_REQUIRED)
- Variation / surrender fee and SLA configuration
- F6: fee schedules, refunds, reconciliation
- F9: full Fit & Proper certification
- F14 correspondence, F15 SLA/escalation, F18 reporting depth
- F20: fresh migration replay and browser-execution environment items

## 5. Remaining work to reach certification

1. Repair the two harness aborts in `scripts/certify-f5c.sql` and run `certify:f5c` twice
   identically.
2. Execute the surface manifest classification for every active F5 route.
3. Run the full permanent F5 gate battery and the frozen upstream battery once.
4. Record the security/authority sign-off and freeze the F5 contracts.

## Verdict

**F5-C BLOCKERS REMAIN**

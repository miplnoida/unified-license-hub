# F5 — Post-Licensing Services: Final Certification & Freeze

Status: **F5 PRODUCT CERTIFIED AND FROZEN — BUSINESS CONFIGURATION / DOWNSTREAM BOUNDARIES RECORDED**

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

Final result: **73 / 73 PASS, twice, identical (only ephemeral fixture UUIDs differ), zero residue.**
The gate grew from the planned 61 to 73 assertions because Sections C (F&P) and H
(submission/fee boundary) were restructured into independent rollback sub-transactions,
each proving its blocker with a genuine submitted filing, its own canonical subject and
its own legitimate assessment. No assertion was removed or weakened.

Harness repairs made in Phase 1 (certification script only, no product runtime change):
- Section C uses the certified F&P vocabulary (`rejected` / `approved`), never reuses a
  determined assessment, never uses withdrawn filings to dodge the one-open-filing guard,
  and asserts the refusal codes `FP_SUBJECT_REQUIRED` / `FP_DETERMINATION_REQUIRED` and
  readiness `state` / `satisfied` — proving F&P is the blocker, not terminal state.
- Section H treats `can_submit_application(uuid)` as boolean, drives every transition
  through `submit_application` / `withdraw_application` (`WORKFLOW_FIELD_LOCKED` intact),
  and uses a valid `payments.payment_channel`. It proves: assessed fee > 0 blocks until a
  valid payment; zero/waived does not; absent fee configuration fabricates no charge;
  governed withdrawal works; the duplicate/open-filing guard holds; F4 payment behaviour
  is unchanged.

## 2a. Genuine defects found by the repaired certification (product corrections)

Two real defects surfaced in the frozen upstream battery and were corrected:

1. **F0-C A-16** — `public.post_license_matter_kind(text)` (seeded in F5-B5X) was
   executable by `anon`. `EXECUTE` revoked from `anon` and `PUBLIC`; granted to
   `authenticated` and `service_role`. F0-C now 34 / 34.
2. **F1-C SC-02** — the 16 new variation / voluntary-surrender services left 18
   configuration dimensions unexplained. Explicit `BUSINESS_CONFIGURATION_REQUIRED`
   expectations were recorded for them (16 SLA, 2 fee); no fee, SLA or legal basis was
   invented. The F1-C census constants were refreshed for the expanded catalogue
   (136/680 -> 152/760, BCR 9 -> 27, SLA 8 -> 24, fee 1 -> 3). F1-C now 96 / 96.

## 2b. Permanent F5 battery (all green)

| Gate | Result |
| --- | --- |
| `certify:f5c` x2 | 73 / 73, 73 / 73 |
| `verify:f5b5x` (SQL) | 51 / 51 |
| `verify:f5b5x` surfaces | 15 / 15 |
| `verify:f5b4` | 48 / 48 |
| `verify:f5b3` | 53 / 53 |
| `verify:f5b3-establishments` | 34 / 34 |
| `verify:f5b2` | 44 / 44 |
| `verify:f5b1` | 51 / 51 |

## 2c. Frozen upstream regression (all green, after the two corrections above)

`verify:f0c` 34/34 - `verify:f1c` 96/96 - `verify:f2b` 63/63 - `verify:f3b` 38/38 -
`certify:f3c` 39/39 - `certify:f4c` 87/87 - `verify:f4b` complete - `verify:license-terms`
complete - `verify:coordination-lifecycle` 26/26 - `verify:outbox-delivery` 28/28 -
`verify:hardening` 31/31 + F5-B1 block 4/4 - `verify:anon-execute`, `verify:definer-guards`,
`verify:audit-contract`, `verify:permission-refs`, `verify:service-completeness`,
`verify:write-contract`, `verify:breadcrumbs` all clean.

Frontend suite 141 files / 1299 tests passed; typecheck clean; production build succeeded.

## 2d. Surface manifest

Surface authority is proven by `verify:f5b5x-surfaces` (15 / 15): the workflow resolver
calls only `application_workflow_view`, cannot fall back to a browser matcher on RPC
failure, no longer queries `services.workflow_id` / `approval_workflows` to decide the
effective workflow, retains no hierarchical browser workflow algorithm, uses
`applications.request_kind` for persisted classification, renders forms via
`post_license_service_form_set()`, has no unreachable Quick Action targets, and keeps
compatibility redirects for retired duplicate pages.
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

## 5. Security / authority sign-off

- No anonymous execute remains on any non-extension routine (F0-C A-16 green).
- Post-licensing configuration DML stays revoked for external roles; all changes flow
  through audited governed RPCs.
- Workflow, F&P, duplicate/open-filing, licence-state and fee guards are all intact and
  fail closed; no guard was weakened to make a service pass.
- Classification is server-authoritative (`applications.request_kind`); a forged client
  `data.type` cannot reclassify an F4 filing.

## 6. Freeze

The F5 Post-Licensing Services contracts (intake authority, canonical classification,
service/licence binding, lifecycle input, effect engine and ledgers, establishment
register, F&P linkage, fee boundary, submission/withdrawal authority, server-only
workflow and form resolution) are **FROZEN**. `certify:f5c` plus the F5-B1..B5X gates are
the permanent regression battery for this module.

## Verdict

**F5 PRODUCT CERTIFIED AND FROZEN — BUSINESS CONFIGURATION / DOWNSTREAM BOUNDARIES RECORDED**

# F7 — REGULATORY RETURNS: FINAL CERTIFICATION & FREEZE

Date: 2026-08-30
Protected F7-B baseline entering certification: `5968a3c78403a526d2cfc467ad84dc710bf7feb6`
Permanent certification gate: `npm run certify:f7c` (`scripts/certify-f7c.sql`)

## 1. Result

`certify:f7c` = **68 / 68 PASS**, executed twice with zero residue.

Sections certified: surface inventory (A), canonical spine (B), security (C), authority &
maker-checker matrix (D), empirical multi-persona lifecycle and F8 downstream acceptance
contract (E), currency & regulator provenance (F), F6 late-fee boundary (G), notification
contract (H), live-estate integrity (I), navigation & discoverability (J), operability (K),
zero residue (Z).

## 2. Defects found and repaired during certification

1. **Regulatory history integrity (DATA-INTEGRITY, repaired).**
   `return_filing_version_immutable()` sealed only version identity/`submitted_at`. A decided
   version's lifecycle status and decision provenance could be rewritten (for example
   `ACCEPTED` → `DRAFT`). Repaired: a decided version (`ACCEPTED`/`REJECTED`/`SUPERSEDED`)
   can no longer be reopened or unsealed, its decision record, submitter and declaration
   details are permanent, and the only permitted onward transition is `ACCEPTED` → `SUPERSEDED`.
   Certified by E-11 and E-12.

2. **Privilege drift on returns configuration (SECURITY, repaired).**
   `return_definitions`, `return_definition_forms`, `entity_reporting_obligations` and
   `reporting_periods` still carried blanket `INSERT/UPDATE/DELETE` (plus `anon SELECT` and
   residual `TRUNCATE/REFERENCES/TRIGGER`) grants to the browser roles. Row level security
   denied those writes, so the drift was latent rather than exploitable, but it contradicted the
   governed-configuration contract. Privileges revoked; `service_role` retained.
   Certified by B-01 and C-05.

Two gate assertions were corrected without weakening coverage, because they mis-stated correct
product behaviour: the entity-currency override statuses of record are `ACTIVE`/`SUPERSEDED`
(F-02), and a filing legitimately emits one `return.submitted` event per submitted version —
original and amended (E-16).

## 3. Downstream F8 acceptance contract (certified)

`tg_prudential_detect_on_acceptance` fires only on a transition into `ACCEPTED`.
Empirically certified: DRAFT (E-05), SUBMITTED (E-07), open RFI (E-08) and REJECTED (E-14)
raise no downstream signal; an accepted version signals exactly once (E-10); an accepted
amendment raises its own single signal and never re-signals the superseded version (E-13).
A downstream detection failure is recorded and never rolls back regulatory acceptance.

## 4. Frozen-contract regression battery (all green)

| Gate | Result |
| --- | --- |
| certify:f7c | 68/68 ×2 |
| verify:f7b | 105/105 |
| verify:f6x-currency | 141/141 |
| verify:enforcement-currency | 37/37 |
| verify:f1c | 96 pass / 0 fail |
| verify:f2b | 63 pass / 0 fail |
| verify:f6b | 38/38 |
| certify:f6c | 80/80 |
| verify:anon-execute | PASS (0 defects) |
| verify:definer-guards | PASS |
| frontend | 143 files / 1312 tests PASS |
| typecheck | clean |

## 5. Live estate at certification

24 return definitions, 38 definition forms, 72 entity obligations, 362 reporting periods,
93 filings, 103 versions, 55 validation results, 6 requests, 1,717 metric values.
Legacy `compliance_returns` and `returns_filed` hold 0 operational rows.
Integrity anomalies (orphans, missing regulator/currency snapshots, accepted filings without
an accepted version, broken supersession lineage, duplicate live filings, unknown statuses): 0.

## 6. Recorded boundaries (not F7 defects)

- One ambiguous historical entity identifier remains `DATA_REMEDIATION_REQUIRED`.
- Baseline Supabase linter findings (security definer views, extension-in-public, broad
  definer EXECUTE surface) remain platform-level and pre-existing.
- F20 deployment/commissioning items remain outside F7.
- Live FX rate feed availability remains an operational precondition of the F6-X engine.

## 7. Verdict

**F7 REGULATORY RETURNS CERTIFIED AND FROZEN**

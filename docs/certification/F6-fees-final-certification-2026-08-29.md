# F6 — Fees & Payments Final Certification & Freeze

Date: 2026-08-29
Protected runtime HEAD (start of closure): `bbb09b203517299ac5b03058061a6f8e3650b0cc`
Final certification evidence HEAD: `43d042b2dbd1ee846830f5999a44e8966455b2f5`
Permanent gates: `npm run certify:f6c`, `npm run verify:f6b`

## 1. Result

| Gate | Run 1 | Run 2 |
| --- | --- | --- |
| `certify:f6c` | 80 PASS / 0 FAIL | 80 PASS / 0 FAIL |
| `verify:f6b` | 38 PASS / 0 FAIL | 38 PASS / 0 FAIL |

No existing F6-B assertion was removed or weakened; `certify:f6c` grew from 24 to
80 assertions, with the receipt-provenance family (R-02…R-12) and the historical
receipt census (H-00…H-05) added in this closure.

## 2. Defects found and closed in this closure

1. **Receipt provenance.** `payment_receipt_issue(payment_id)` no longer attaches
   whichever assessment happens to be current. It resolves the assessment the
   payment actually settled through `fee_payment_allocations`, falling back to
   payment-linked `fee_ledger_entries`, and fails closed with
   `NO_ASSESSMENT_LINEAGE` when no lineage exists. The receipt snapshots the
   payment identity, amount, currency, method, reference and date, the exact
   assessment id, its configuration provenance, and that assessment's immutable
   fee lines.
2. **Second receipt-minting path.** `issue_payment_invoice(...)` previously built
   a receipt from caller-supplied fee lines and tax with no assessment lineage,
   and was invoked by `verify_offline_payment`. It now delegates to
   `payment_receipt_issue` and only stamps an invoice number; the
   `_fee_breakdown` / `_tax_amount` arguments are ignored. Verified offline money
   therefore produces an assessment-bound receipt.
3. **Reversal semantics.** `fee_payment_reverse` preserves the receipt, records
   `voided_at` / `voided_reason`, audits `payment.receipt.voided`, and a reversed
   payment cannot mint a replacement receipt. A refund leaves the original
   receipt standing as evidence of money once received.
4. **Certification fixture honesty.** D-06 now runs an independent
   application/assessment cycle (fee → assessment → offline capture → pending →
   regulator verification → allocation → settled balance) instead of bypassing
   `ASSESSMENT_SETTLED`. Relief and submission-gate scenarios likewise run
   against genuinely open balances, reopened only by governed compensating
   reversal.
5. **UI authorization.** The waiver-request and refund-request actions in
   `ApplicationFinancePanel` are now permission-gated (`fee_management.edit`),
   restoring the 100% RBAC action-coverage floor.

## 3. Industry capability matrix

| Capability | Evidence |
| --- | --- |
| Fee configuration / binding | A-03, A-04 (143 configurations, stored late-fee structure) |
| Server calculation / preview | C-01…C-03, preview creates no financial history |
| Immutable assessment of record | C-04, D-01, A-06 provenance, B-06 append-only guards |
| Payment initiation | D-01, D-02 |
| Offline capture + verification | D-06, D-06b (independent lifecycle) |
| Partial / full / overpayment | D-02, D-03, D-04 |
| Allocation / unallocated credit | D-03, D-03b (explicit credit, bounded allocation) |
| Receipt / invoice | D-05, D-05b, R-02…R-12 |
| Waiver / exemption | E-01…E-04 (maker-checker, rejection without effect) |
| Refund | E-05…E-08 (request, ceiling, decision-before-payout, independent payout) |
| Reversal / correction | E-09, R-11 (compensating, never destructive) |
| Reconciliation | F-01…F-03 (matched, exception, governed resolution) |
| Overdue / late-fee hooks | A-03 |
| Currency isolation | A-05, B-08 (no silent conversion), R-04 |
| Maker-checker | B-09, E-02, E-08 |
| Audit / provenance | D-05b, R-11b, G-08 (15 distinct financial audit actions) |
| Entity / regulator views | G-05 overview equals engine |
| Reporting / export boundary | G-01, G-04, R-08 confidentiality refusals |

0 Critical, 0 unresolved High Track-A, 0 unresolved Track-A PRODUCT GAP.

## 4. Security sign-off (empirical)

- Zero browser financial DML, receipts included (B-01, G-03, G-04, R-09).
- Zero anonymous financial read or write (B-02); zero anonymous execution of F6
  entrypoints (B-03).
- RLS enabled across the financial estate (B-04); every F6 routine is a guarded
  definer routine with a pinned `search_path` (B-05).
- Server-authoritative pricing: no receipt or assessment figure can be stated by
  a caller (B-07, and the invoice-path defect closed above).
- Cross-entity isolation (G-01, G-02, R-08); maker-checker on relief and refund
  (E-02, E-08).
- Project-wide database linter count (~1,439) remains the pre-existing platform
  SECURITY DEFINER baseline, not an F6 regression.

## 5. Receipt lineage contract (frozen)

- One receipt per payment, issued only by `payment_receipt_issue`, only for a
  settled payment, idempotently.
- The receipt's assessment id equals the assessment resolved from the payment's
  allocation (or payment-linked ledger) lineage; absent lineage fails closed.
- Amount and currency equal the payment exactly; itemisation equals that
  assessment's immutable lines.
- A later governed supersession or reassessment cannot alter an issued receipt.
- Reversal voids the receipt's standing and audits it; refund does not rewrite it.
- Financial evidence is never deleted.

## 6. Historical receipt census

Population: 1 receipt on record.

- Payment exists, amount and currency match, settlement state consistent
  (H-01…H-03 pass).
- **DATA_REMEDIATION_REQUIRED = 1** — receipt `RCT-2026-000038`
  (`5147a908-81b0-4f47-8d1c-265f407679f1`, payment
  `3190cf2b-3816-40bc-8aad-6fab6ebe0b3c`, 25,000.00 USD) predates the
  server-authoritative routine and carries no allocation or ledger lineage.
  Legacy financial evidence was deliberately not rewritten to obtain a green
  gate; the item is recorded for regulator-directed remediation.

## 7. Frozen F0–F5 regression (single full pass, all green)

`certify:f5c` 73/73 · `verify:f5b1` 51/51 · `verify:f5b2` 44/44 ·
`verify:f5b3-establishments` 34/34 · `verify:f5b3` 53/53 · `verify:f5b4` 48/48 ·
`verify:f5b5x` 51/51 + 15 surfaces · `certify:f4c` 87/87 · `verify:f4b` 33/33 ·
`verify:license-terms` PASS · `verify:coordination-lifecycle` PASS ·
`verify:outbox-delivery` 28/28 · `certify:f3c` PASS · `verify:f3b` PASS ·
`verify:f2b` PASS · `verify:f1c` PASS · `verify:f0c` PASS ·
`verify:hardening` 31/31 + 4/4 · `verify:anon-execute` PASS ·
`verify:definer-guards` PASS · `verify:permission-refs` PASS ·
`verify:audit-contract` PASS · `verify:write-contract` PASS ·
`verify:breadcrumbs` PASS · `verify:service-completeness` PASS.

Frontend: 141 files / 1299 tests pass. Typecheck clean. Build OK.

## 8. Surface manifest

| Surface | Classification | Basis |
| --- | --- | --- |
| Applicant payment panel (`LicenseePaymentPanel`) | TESTED-PASS | server assessment ensured only at initiation; no client pricing |
| Offline payment dialog | TESTED-PASS | outstanding read from server; D-06 lifecycle proven |
| `/payments` | TESTED-PASS | read-only listing over governed reads (B-02, B-10) |
| `/payments/:id` | TESTED-PASS | includes regulator finance panel; audit trail loads |
| `/admin/fees` (Financial Operations) | TESTED-PASS | waiver/refund/reconciliation queues over governed RPCs |
| Assessment detail / ledger / allocations | TESTED-PASS | G-05 overview equals engine; regulator-only |
| Fee components administration | TESTED-PASS | gated on `fee_management.edit`, no client pricing fallback |
| Waiver / refund request actions | TESTED-PASS | permission-gated; server maker-checker proven |
| Reversal / reconciliation views | TESTED-PASS | E-09, F-01…F-03 |
| Receipt / invoice surface | TESTED-PASS (source) / ENVIRONMENT-BLOCKED (deployed) | server issuance proven in database; deployed browser run requires publish |
| Legacy client-side receipt minting in `NewApplication` | DEAD-RETIRED | replaced by `payment_receipt_issue` |

No unexplained NOT-TESTED.

## 9. Boundaries recorded

- **F20 DEPLOYMENT/COMMISSIONING** — the F6 database privilege lockdown is live;
  the certified frontend (server receipt issuance, gated finance actions) must be
  published, followed by a deployed payment/receipt smoke validation. Deployed
  browser validation was not executed in this environment and is not claimed.
- **DATA_REMEDIATION_REQUIRED (1)** — legacy receipt `RCT-2026-000038` lacks
  assessment lineage; see §6.
- **BCRs** — late-fee tiering and fee-schedule content remain business
  configuration; the engine enforces them but does not invent them.
- **F7 boundary** — regulatory returns filing, validation and return-level
  penalties are out of F6 scope; only the fee/assessment interface is frozen here.

## Verdict

**F6 PRODUCT CERTIFIED AND FROZEN — BUSINESS CONFIGURATION / DEPLOYMENT / DATA
REMEDIATION BOUNDARIES RECORDED**

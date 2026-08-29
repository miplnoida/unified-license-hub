# F6 — FEES & PAYMENTS — READ-ONLY DISCOVERY

- HEAD: `2ec0051f3cbf4fd534c9ac6ba6831e91e2052848` (F0–F5 CERTIFIED AND FROZEN)
- Date: 2026-08-29
- Mode: READ-ONLY. No migrations, no seeding, no configuration change, no retirement, no product development.

## 1. Boundary

**Supplied by frozen upstream (F0–F5)**
- `applications`, `licenses`, `services`, taxonomy and entity primitives (read-only for F6).
- F5 submission payment *boundary* only: `submit_application` invokes `post_license_fee_assessment`, and submission is gated when an assessed amount is outstanding (`license_fee_bindings.gate_policy` ∈ `BLOCK_UNTIL_VERIFIED | BLOCK_UNTIL_PAID | ADVISORY`).
- Shared audit (`audit_logs` via `tg_payments_audit`, `tg_payment_receipts_audit`, `tg_auto_compliance_audit`) and notification (`trg_notify_payment`) primitives.

**Owned by F6**
Fee schedules/types/components, binding resolution, assessment/calculation authority, waivers/exemptions, payment initiation and verification, partial/over/under payment, receipts and reference numbering, invoices, refunds, reversals, reconciliation, allocation, overdue/late fee, currency, fee reporting, fee/payment audit and idempotency.

**Belongs to later modules**
- Returns late-filing penalty *obligation* creation (F7 owns obligation; F6 owns the money).
- Payment-systems oversight (`payment_system_operators`, `payment_oversight_*`, PFMI) is F8 prudential supervision, not entity fees.
- Enforcement penalties (`enforcement_penalty_payments`) — enforcement module.

## 2. Runtime surface manifest

| Route / surface | Component | Backend | Tables | Class |
|---|---|---|---|---|
| `/payments` | `src/pages/payments/PaymentHistory.tsx` | direct `.from()` reads (`:118-120`) | `payments`, `payment_receipts`, `refunds` | ACTIVE |
| `/payments/:id` | `PaymentDetail.tsx:36,42` | direct read + `applications` join | `payments` | ACTIVE |
| `/admin/fees` | `FeeManagement.tsx:130,138,143` | direct reads | `fee_configurations`, `fee_rules`(0), `fee_types` | ACTIVE (reads one empty table) |
| `/admin/returns/late-fees` | `LateFeesPage.tsx` (`adminRoutes.tsx:232`) | late-fee config | `late_fee_structures`(1), `late_fee_penalty_tiers`(0) | ACTIVE — UNCONFIGURED |
| `/billing/penalties` | `Penalties` (`dashboardRoutes.tsx:268`) | module `fee_management` | enforcement penalty tables | ACTIVE |
| `/settings/payments` | `PaymentSettings.tsx` | settings | config | ACTIVE |
| Application embed | `LicenseePaymentPanel.tsx:134` | `rpc('complete_or_get_application_payment', { _amount: totalDue })` | `payments` | ACTIVE — **client-supplied amount** |
| Application embed | `OfflinePaymentDialog.tsx:64` / `PaymentVerificationDialog.tsx:91` | `submit_offline_payment` / `verify_offline_payment` | `payments` | ACTIVE |
| Application embed | `FeeComponentsPanel.tsx:113,123,131` | direct `insert/update/delete` | `fee_components`(0) | ACTIVE — **direct client DML on fee line items** |
| Invoicing | `src/lib/invoice.ts:35` | `issue_payment_invoice` | `payment_receipts` | ACTIVE |
| `/prudential/payment-systems*` | `PaymentSystemsOversight.tsx` | oversight RPCs | `payment_system_*`, `payment_oversight_*` | ACTIVE — **belongs to F8, not F6** |

No DUPLICATE / UNREACHABLE / MOCK / BROKEN fee-payment page was found: every fee/payment component reachable from the routers resolves to a real file and uses live `supabase.from`/`rpc`.

## 3. Live census

`fee_configurations` 143 · `fee_types` 25 · `license_fee_bindings` 10 (renewal 8, variation 1, reinstatement 1 — **no initial/new matter_kind binding**) · `license_fee_process_settings` 5 · `payments` 2 · `payment_receipts` 1 · `late_fee_structures` 1 · `fee_components` **0** · `fee_rules` **0** · `license_fee_assessments` **0** · `late_fee_penalty_tiers` **0** · `payment_attachments` **0** · `payment_remarks` **0** · `refunds` **0**.

Functions (all `public`, SECURITY DEFINER unless noted): `license_fee_resolve`, `license_fee_assess`, `license_fee_simulate`, `license_fee_ledger`, `license_fee_operation`, `license_fee_configuration_overview`, `post_license_fee_assessment`, `create_or_get_application_payment`, `complete_or_get_application_payment`, `submit_offline_payment`, `verify_offline_payment`, `application_payment_verify`, `issue_payment_invoice`, `next_invoice_number`, `generate_receipt_number`, `payment_refund_decide`, `external_can_access_payment(_values)`, audit/notify triggers `tg_payments_audit`, `tg_payment_receipts_audit`, `trg_notify_payment`.

Constraints: `payments_channel_check` (`online|offline`), `payments_verification_status_check` (`pending|approved|rejected`). **No non-negative CHECK on `payments.amount`.**

Absent by name sweep (`waiver|exempt|reversal|reverse|credit_note|allocat`): **no waiver, exemption, reversal or credit-note table or function exists.**

## 4. Industry / regulatory feature matrix

| Capability | Class | Evidence |
|---|---|---|
| Fee schedules / types | BUILT+PROVEN | 143 + 25 rows, admin surface active |
| Fee components (line items) | PARTIAL | table exists, 0 rows, client-side DML only |
| Fee bindings / applicability | BUILT-NOT-PROVEN | 10 rows; no initial-licence binding |
| Assessment / calculation authority | PARTIAL | `license_fee_assess` / `post_license_fee_assessment` exist; `license_fee_assessments` = 0 rows |
| Server-authoritative payable amount | MISSING-TRACK-A | `_amount` is client-passed, `COALESCE(_amount,0)` |
| Waivers / exemptions | MISSING-TRACK-A | no table/function |
| Payment initiation | BUILT+PROVEN | get-or-create RPCs with `FOR UPDATE` |
| Payment verification (offline/online) | BUILT+PROVEN | `verify_offline_payment`, `application_payment_verify` |
| Partial / over / under payment | MISSING-TRACK-A | single `_amount`, no balance ledger |
| Receipts / reference numbering | BUILT+PROVEN | `generate_receipt_number`, `next_invoice_number` |
| Invoices | BUILT+PROVEN | `issue_payment_invoice` |
| Refund initiation | MISSING-TRACK-A | only `payment_refund_decide` (decision-only) |
| Refund execution / ledger | MISSING-TRACK-A | `refunds` 0 rows, no execution path |
| Reversals / chargebacks | MISSING-TRACK-A | none |
| Payment reconciliation | MISSING-TRACK-A | only returns/accounting reconciliation exists |
| Allocation (application/licence/service/return) | PARTIAL | `payments.application_id`, `license_fee_ledger`; no return/service allocation |
| Overdue / unpaid / late fee | PARTIAL / BCR | `due_days`, `late_fee_structures`(1), tiers 0 rows |
| Multi-currency | PARTIAL / BCR | `currency` default `JMD`, no rate table |
| Audit | BUILT+PROVEN | payment + receipt + generic compliance triggers |
| Idempotency / concurrency | BUILT+PROVEN | `SELECT … FOR UPDATE` on application row |
| Unauthorized manipulation resistance | MISSING-TRACK-A | client amount + direct `fee_components` DML |
| Regulator vs entity views | BUILT+PROVEN | `/payments` vs oversight/admin surfaces |
| Fee revenue reporting | PARTIAL | only `license_fee_configuration_overview` |

## 5. Finite gap register

| ID | Sev | Gap | Evidence | Canonical remediation |
|---|---|---|---|---|
| GAP-F6-01 | CRITICAL | Payable amount is client-supplied and trusted | `LicenseePaymentPanel.tsx:134`; `create_or_get_application_payment` / `complete_or_get_application_payment` use `COALESCE(_amount,0)` | Recompute server-side from `license_fee_resolve`/assessment; reject or ignore client amount |
| GAP-F6-02 | CRITICAL | Client performs direct DML on `fee_components` | `FeeComponentsPanel.tsx:113,123,131` | Revoke external DML; route through governed fee RPC (extend `license_fee_operation`) |
| GAP-F6-03 | CRITICAL | Assessment primitive unused — no persisted assessment of record | `license_fee_assessments` 0 rows | Make assessment mandatory precondition for payment/gating |
| GAP-F6-04 | HIGH | No refund initiation/execution path | `refunds` 0 rows; only `payment_refund_decide` | Add governed refund request → decide → execute with ledger + audit |
| GAP-F6-05 | HIGH | No reversal / chargeback capability | name sweep empty | Governed reversal RPC writing compensating ledger entry |
| GAP-F6-06 | HIGH | No payments reconciliation engine | only returns/accounting reconciliation | Reconciliation run + exception queue over `payments`/receipts |
| GAP-F6-07 | HIGH | No waiver/exemption capability | name sweep empty | Governed waiver with authority + rationale + audit |
| GAP-F6-08 | HIGH | No partial/over/under payment handling or balance ledger | single `_amount` semantics | Introduce assessed-vs-settled balance ledger |
| GAP-F6-09 | MEDIUM | No `amount >= 0` constraint on `payments` | constraint census | Add CHECK |
| GAP-F6-10 | MEDIUM | `fee_rules` empty while `/admin/fees` reads it | `FeeManagement.tsx:138` | Confirm canonical vs legacy; retire or configure (BCR if policy) |
| GAP-F6-11 | MEDIUM | No initial/new-licence fee binding | binding matter_kind breakdown | BCR — regulator must configure |
| GAP-F6-12 | MEDIUM | Late-fee tiers unconfigured | `late_fee_penalty_tiers` 0 | BCR — regulator penalty policy |
| GAP-F6-13 | MEDIUM | No return/service-level fee allocation | `payments.application_id` only | Extend allocation dimension (coordinate with F7) |
| GAP-F6-14 | LOW | No multi-currency rate handling | `currency` default only | BCR unless multi-currency in scope |
| GAP-F6-15 | LOW | No fee revenue/collection report | function census | Reporting surface over assessment/settlement ledger |

Track-A PRODUCT GAP count: **10** (01–10, excluding 11/12/14 BCR and 13/15 as noted below).
Track-A: 01, 02, 03, 04, 05, 06, 07, 08, 09, 10. BCR: 11, 12, 14. Downstream/coordination: 13, 15.

## 6. Frozen-contract dependencies (must not be changed)

- `submit_application` body references `post_license_fee_assessment` (verified via `pg_proc.prosrc`) — F5 submission gate.
- `license_fee_resolve` reads frozen `license_fee_bindings`; `license_fee_assessments.binding_id` FK → `license_fee_bindings`.
- `license_fee_bindings` FK → `fee_configurations`.
- `payments`/`payment_receipts` audit triggers write shared audit; `trg_notify_payment` uses shared notification primitive.
- `PaymentDetail.tsx:42` reads frozen `applications`.

## 7. Verdict input

F6 has a real engine but the money path is not server-authoritative. Remediation must be consolidated and must not alter frozen F0–F5 primitives.

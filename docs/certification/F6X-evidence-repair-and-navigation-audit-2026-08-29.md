# F6-X — Certification Evidence Repair + Menu/Discoverability Audit

Date: 2026-08-29
Scope: evidence completion for the frozen F6-X multi-currency extension, plus the
new mandatory navigation/discoverability rule. No FX redesign; no F7/F8; no
Entity-Network/UBO work.

## 1. Strengthened permanent gate

`npm run verify:f6x-currency` — **73 PASS / 0 FAIL**, two consecutive runs, zero
residue (previous baseline 43; assertions were only added).

New rollback-safe sections:

| Section | Proves |
| --- | --- |
| H | Regulator-scoped monetary authority: two synthetic regulators resolve their own base/reporting/accepted-currency configuration; A's scoped rate is never selected for B; platform config never overrides a regulator-specific config; the transaction regulator is derived server-side from `applications.regulator_id`, never from caller input |
| I | Missing/blank payment currency fails closed with `PAYMENT_CURRENCY_MISSING` — no allocation, no receipt, no substituted base currency |
| J | base != reporting behaviour: original amount/currency preserved, base and reporting amounts booked with their own immutable conversion provenance, later rate changes never re-rate booked history, reporting reproduces booked provenance rather than today's rate, single deterministic conversion (no hidden double conversion) |
| K | Unconverted reporting stays visible: `unconverted_allocations`, `unconverted_by_currency`, `completeness` are returned instead of a silently complete total |
| L | Effective periods: rate A usable until superseded, successor closes it, no two APPROVED rates overlap per regulator/pair/rate type, historical transactions keep naming A, FIXED works across dates, no currency code implies FIXED |
| Z-04..Z-08 | Residue checks for every new fixture |

### Production defect found and fixed by the strengthened gate

`fee_payment_settlement_sync` wrote base/reporting conversions with the invalid
purpose `BASE_REPORTING`, which violated `fx_conversions_purpose_check` and left
booked equivalents null. Migration applied: canonical `BASE`/`REPORTING`
purposes, `fx_conversions.regulator_id` + index, `fx_record_conversion` persists
regulator scope, `EXECUTE` restricted to `service_role`.

## 2. Payment gateway currency contract

`supabase/functions/_shared/connector/adapters/payment_gateway.ts` +
`src/test/paymentGatewayCurrencyContract.test.ts` — **8/8 PASS**:

- outbound create/refund without an authoritative ISO currency is rejected
  (`PAYMENT_CURRENCY_MISSING`);
- capture transmits only an explicitly validated currency, otherwise null;
- provider response missing currency rejected; mismatched currency rejected
  (`PAYMENT_CURRENCY_MISMATCH`); matching currency succeeds;
- refund/capture introduce no independent fallback;
- the adapter source is scanned for `?? 'XXX'` / `|| 'XXX'` / literal money defaults.

Repo-wide scan is clean: the last runtime money default
(`public-complaint-intake` `|| "XCD"`) was removed — a stated amount no longer
acquires an assumed currency.

**Live provider execution did not occur in this environment and is recorded as an
F20 commissioning item.**

## 3. Recorded re-freeze evidence (actual executed counts)

| Gate | Result |
| --- | --- |
| `verify:f0c` | 34 TESTED_PASS / 0 FAIL |
| `verify:f1c` | 96 TESTED_PASS / 0 FAIL |
| `certify:f5c` | 73 PASS / 0 FAIL |
| `verify:f6b` | 38 PASS / 0 FAIL |
| `certify:f6c` | PASSED, 0 FAIL, zero residue |
| `verify:f6x-currency` | 73 PASS / 0 FAIL ×2 |
| `verify:anon-execute` | PASS |
| `verify:definer-guards` | PASS |
| `verify:permission-refs` | PASS |
| `verify:audit-contract` | PASS — 0 stale audit writers |
| `verify:write-contract` | PASS |
| `verify:hardening` | PASS |
| Frontend suite | 143 files / 1312 tests PASS |
| Typecheck | clean |
| Production build | green |

`verify:f0c` initially aborted on a harness defect (pooled backends recycle
`pg_temp`, so `CREATE OR REPLACE` could not rename helper parameters). The gate
now drops its helpers first; no product control was changed or weakened.

## 4. Navigation / discoverability audit (F6 + F6-X production routes)

| Route | Classification |
| --- | --- |
| `/settings/currency` — Currency & Exchange Rates | **was ORPHAN → now MENU-LINKED** |
| `/admin/fees` — Fee administration | NESTED-REACHABLE (Administration → Configuration → Licensing hub, `show_in_sidebar=false` by design) |
| `/payments` — Payments list | MENU-LINKED (My Work) |
| `/payments/:id` — Payment detail | CONTEXTUAL-ACTION (from payments list) |
| Regulator finance / fee-operations panels | CONTEXTUAL-ACTION (embedded in payment detail and Fee Management) |
| Waiver / refund / reconciliation operations | CONTEXTUAL-ACTION (within fee & payment surfaces) |
| `/admin/returns/late-fees` | NESTED-REACHABLE (Returns configuration hub) |
| `/prudential/payment-systems` | MENU-LINKED |

Fix applied through the canonical database-driven navigation, not hardcoded
links: a `sec_routes` entry and a `sec_navigation_items` row
`nav_adm_sys_currency` (label "Currency & Exchange Rates", parent
`nav_adm_system`, icon `Banknote`, order 40, audience internal, sidebar +
search, gated on `fee_management.view`). Snapshot regenerated.

Guards: `validate-nav-icons` OK (213 active items, all icons approved);
`verify-breadcrumb-coverage` **340 routes / 0 uncovered** (`/admin/people-access`
was covered by adding one breadcrumb registry rule after the snapshot refresh).

Zero unexplained orphan production routes remain.

## 5. Boundaries carried forward (not code defects)

- Platform monetary configuration is USD base / USD reporting, derived from the
  configured site currency; the regulator must confirm or change it in
  `/settings/currency`.
- No approved live FX rates loaded yet — cross-currency operation is inert until
  the regulator loads rates (business configuration).
- Legacy receipt `RCT-2026-000038` remains `DATA_REMEDIATION_REQUIRED`.
- F20: publish the frontend and commission the live payment provider.
- Project database linter count (~1,455) is the pre-existing platform SECURITY
  DEFINER baseline; unchanged by this pass — no linter clearance is claimed.

**Verdict: F6-X MULTI-CURRENCY EXTENSION CERTIFIED — F1/F5/F6 CONTRACTS RE-FROZEN — NAVIGATION/DISCOVERABILITY VERIFIED.**

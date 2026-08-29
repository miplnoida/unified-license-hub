# F6-X — Multi-Currency, Effective-Dated FX & Base/Reporting Currency Extension

Date: 2026-08-29
Scope: controlled additive extension of the frozen F6 Fees & Payments contract.
Permanent gate: `npm run verify:f6x-currency` (`scripts/verify-f6x-currency.sql`)

## Results

| Check | Result |
| --- | --- |
| `verify:f6x-currency` | **43 PASS / 0 FAIL**, two consecutive live runs, zero residue |
| `verify:f6b` (frozen F6 remediation) | 38 PASS / 0 FAIL |
| `certify:f6c` (frozen F6 certification) | 80 PASS / 0 FAIL |
| Frontend suite | 142 files / 1304 tests pass (one environment-order flake re-run green in isolation) |
| Typecheck / production build | clean / green |

## What now holds

**No platform default currency.** Every monetary movement states its own
currency or fails closed. The payment-gateway adapter no longer defaults to
`JMD` on either the request or the provider response (`requireCurrency`,
`assertProviderCurrency`), invoice rendering refuses to produce a receipt
without a recorded currency, and `formatMoney` renders `—` rather than guessing.
Penalty totals are separated by currency instead of summing mixed currencies.

**Server authority.** Base and reporting currency, supported/accepted currencies,
rounding, and FX policy come from `monetary_configs` via
`monetary_config_resolve`, which raises `MONETARY_CONFIG_MISSING` when nothing is
configured. `fx_convert` resolves an approved, effective-dated rate; an unknown
currency, a missing currency, or a date with no rate in force all fail closed.

**Effective dating and regimes.** `MARKET`, `EFFECTIVE_UNTIL_CHANGED` and
`FIXED`/pegged regimes are representable. The rate applied on a past date is the
rate that was in force then; a newer rate never re-rates an earlier period, and
approving a successor closes the predecessor period. Two approved rates can
never overlap for one pair, scope and rate type.

**Maker-checker.** A proposer can never approve their own rate
(`FX_MAKER_CHECKER`); a non-privileged user cannot propose one (`FX_FORBIDDEN`);
a rejected rate is never applied; backdating requires explicit configuration
authority.

**Immutable conversion provenance.** Every recorded conversion carries rate,
rate identity and version, effective date, regime, source, rounding policy and
difference, and can never be updated or deleted. Superseding a rate leaves
recorded history untouched. Settlement allocations carry FX provenance.

**Privilege surface.** `anon` holds no privilege at all on `currencies`,
`monetary_configs`, `fx_rates`, `fx_conversions`; `authenticated` holds `SELECT`
only (INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER revoked). RLS is on for
all four. Every currency/FX routine is `SECURITY DEFINER` with a pinned
`search_path` and no anonymous or `PUBLIC` EXECUTE.

**Administration surface.** `/settings/currency` — currency master, base and
reporting currency, and the effective-dated rate register with propose /
approve / reject / supersede, all gated on `fee_management.edit` and written
only through governed routines.

## Contract note

`certify:f6c` assertion B-08 previously required that no fee routine referenced
exchange rates at all. Under F6-X, conversion is permitted but only through the
governed FX contract; B-08 now fails any fee routine that touches rates without
`fx_convert` / `fx_record_conversion`. This tightens rather than weakens the
frozen control.

## Recorded boundaries (not code defects)

- The platform monetary configuration is `USD` base / `USD` reporting, derived
  from the configured site currency. The regulator must confirm or change it in
  `/settings/currency`; it was not silently rewritten.
- No exchange rates or conversions exist in the live database yet — cross-currency
  operation is inert until the regulator loads approved rates (business configuration).
- Legacy receipt `RCT-2026-000038` remains `DATA_REMEDIATION_REQUIRED` (F6-C).
- F20 deployment/commissioning: the app must be published for the deployed
  frontend to run against the extended, locked-down monetary estate.
- The project-wide database linter count (~1,451) is the pre-existing platform
  SECURITY DEFINER baseline; F6-X introduced no new finding.

**Verdict: F6-X MULTI-CURRENCY EXTENSION CERTIFIED — F1/F5/F6 CONTRACTS RE-FROZEN.**

# F6-X Addendum — Entity Reporting Currency (Additive, Effective-Dated)

Date: 2026-08-30
Status: additive extension of the certified and frozen F6-X multi-currency contract.
No frozen F6-X assertion was weakened or removed.

## Contract

An entity's regulatory reporting currency defaults to the applicable regulator's base
currency. An authorized effective-dated entity override may be maintained only through
Entity 360/Profile and is resolved server-side. A return definition may mandate another
currency only through explicit business configuration. Every filing snapshots its
authoritative currency and provenance, so later profile changes never rewrite historical
returns. Original as-reported monetary values remain unchanged, while regulator
base/reporting equivalents use the canonical F6-X effective-dated FX engine. No module
maintains an independent entity-currency preference.

## Objects

- `entity_currency_profiles` — effective-dated history with statuses `PROPOSED`, `ACTIVE`,
  `REJECTED`, `SUPERSEDED`, `WITHDRAWN`; proposal and decision metadata retained; RLS on;
  no browser INSERT/UPDATE/DELETE grants.
- `monetary_configs.entity_currency_override_approval_mode` — `DIRECT_AUTHORIZED` (default)
  or `MAKER_CHECKER`.
- Governed routines: `entity_currency_approval_mode`, `entity_currency_override_set`,
  `entity_currency_override_decide`, `entity_currency_override_withdraw`,
  `entity_currency_override_supersede`, `entity_currency_profile_overview`,
  `entity_reporting_currency_resolve`, `returns_rebase_filing_currency`.
- Filing snapshot columns on `return_filings`: `reporting_currency`, `currency_source`,
  `currency_as_of`, `entity_currency_profile_id`.
- Display: `returns_filing_metrics_display(filing_id, mode)` with `AS_REPORTED`,
  `REGULATOR_BASE`, `CONSOLIDATED_REPORTING`, returning `OK`, `UNCONVERTED` or
  `NOT_REPORTED` per metric and never summing unlike currencies.

## Authority

Maintenance and decisions require the catalogued `licensee_management.edit` authority.
A proposer cannot decide their own proposal. The resolver considers `ACTIVE` profiles only,
so a pending proposal never affects filing currency. Every maintenance action and decision
is audited with its reason.

## Gate

`scripts/verify-f6x-currency.sql` section M (M-01…M-09) proves governed entrypoints,
definer/`search_path` hardening, absence of browser write grants, RLS, filing snapshot
columns, absence of competing preference columns, approval mode as configuration,
server-side resolution with provenance, and fail-closed behaviour for an unresolvable
entity. Result: 82/82 assertions pass, run twice, with zero residue.

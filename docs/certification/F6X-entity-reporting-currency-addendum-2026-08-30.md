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

## Strict regulator-body scope (2026-08-30)

Canonical institutional identity is `regulators.id`; `licensees.lead_regulator_id`,
`regulator_officer_id` and `alternate_regulator_id` remain officer/user assignments and are
never used as regulator identity. Entity currency profiles, approval mode, monetary
configuration, FX resolution, filing snapshots and historical display are all resolved
strictly per regulator body, with fail-closed behaviour when a body is ambiguous or has no
monetary configuration. `scripts/verify-f6x-currency.sql` now adds Section P (static identity
assertions) and Section Q (rollback-safe two-regulator behavioural fixture): 141/141 pass.

Entity 360 → Reporting & currency renders one card per applicable regulator body with a
regulator selector, per-body resolved currency and provenance, per-body override history,
approval control, pending proposals, and an explicit "monetary configuration required" state.
`ComplaintEntityCard` now scopes licensed-entity search by the regulator body reached through
the entity's sector instead of the officer assignment field.

## Enforcement Penalty Currency Review (2026-08-30)

### Why JMD appeared

`public.enforcement_actions.penalty_currency` was `text NOT NULL DEFAULT 'USD'`, and
`enforcement_case_action` accepted `_payload->>'penalty_currency'` verbatim on
`IMPOSE_SANCTION`. There was no monetary authority: the browser (or any RPC caller)
denominated the sanction. The literal JMD came from the certification fixture
`scripts/cert-v2/p11-enforcement.ts`, which posted `penalty_amount: 250000,
penalty_currency: 'JMD'`. `RECORD_PAYMENT` compounded this by defaulting tender
currency to the sanction currency or `'USD'`.

### Live census (before remediation)

Configuration of record: regulator body FSRA `8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3`,
regulator-scoped `monetary_configs` row `d94bcb8d-e1d2-4f4b-b726-5ebac684ac94`,
base currency XCD, reporting currency USD, supported transaction currencies `{USD}`.

All five positive-penalty rows, every one JMD 250,000 (total 1,250,000 JMD; no
cross-currency total taken), same entity `69d93314-569b-490d-acdf-3e313cd428ba`,
same `source_kind = EXAMINATION_FINDING`, all created 2026-08-23 within ~24 minutes:

| Case | Id | Status | Stage | Opened |
|---|---|---|---|---|
| ENF-2026-00006 | d6f0591b-c075-41fb-8414-f081a912c23f | in_monitoring | REMEDIATION_MONITORING | 14:47:31Z |
| ENF-2026-00007 | 002c1034-6ace-4ba0-bf97-54e7ddb20e7b | active | REMEDIATION_MONITORING | 14:50:39Z |
| ENF-2026-00008 | 62d3da46-4328-4f0f-9f77-0e1561a3d874 | closed | CLOSED | 14:51:22Z |
| ENF-2026-00009 | 7d9d9b77-779f-462e-a7e0-395bb1a4778a | closed | CLOSED | 15:07:02Z |
| ENF-2026-00010 | d8bf35a5-24ee-47cd-8f0a-538dd077018d | closed | CLOSED | 15:10:57Z |

### Classification

CERTIFICATION FIXTURE / INVALID LEGACY DEFAULT. Provenance is conclusive: the
`IMPOSE_SANCTION` case event payload carries `penalty_currency: JMD`, and the exact
emitting script is the P11 certification harness. No statutory or configured JMD
penalty policy exists for this regulator. No genuine historical JMD sanction was found,
so no genuine historical currency was overwritten.

### Monetary authority now in force

- `monetary_configs.enforcement_penalty_currency_policy` — `REGULATOR_BASE` (default)
  or `EXPLICIT_ALLOWED_CURRENCIES` with `enforcement_penalty_allowed_currencies`;
  constrained by `monetary_configs_enf_penalty_policy_chk`. Business configuration, not code.
- `enforcement_penalty_currency_resolve(entity, requested, reason)` — resolves the
  canonical regulator body (`regulators.id`) via `entity_regulator_body_resolve`, then
  the strict regulator monetary configuration, then the authoritative currency. Fails
  closed when the body or its configuration cannot be resolved. A non-base currency
  requires the explicit policy, regulator support and a recorded legal reason.
- `tg_enforcement_penalty_currency_authority` — derives and fixes the currency on any
  penalty write and snapshots `penalty_regulator_id`, `penalty_monetary_config_id`,
  `penalty_currency_source`, `penalty_currency_policy`, `penalty_currency_reason`,
  `penalty_currency_set_at`. Payload currency is never trusted. The `'USD'` column
  default was removed.
- `tg_enforcement_penalty_payment_currency` — validates tender currency and forbids it
  from rewriting the sanction currency.
- `enforcement_penalty_currency_override` — governed, decision-authority-only, refused
  once a sanction currency is fixed.
- Reporting currency, tender currency, regulator base currency and sanction currency
  remain distinct concepts; an entity reporting override never redenominates a penalty.

### Historical handling

The five proven fixtures were remediated to XCD against the active FSRA configuration
through an audited data-remediation step recording old currency (JMD), new currency
(XCD), classification, reason, actor and timestamp; five `DATA_REMEDIATION` audit rows
exist (`metadata.remediation = ENFORCEMENT_PENALTY_CURRENCY`). Their five settlement
rows were aligned to XCD. No blanket historical rewrite was performed.

### Source-code remediation

Runtime currency literals removed from `FeeOperationsPanel.tsx` (reconciliation example
now primed from the resolved configuration), `RetailPaymentsPanel.tsx`, `RedressPanel.tsx`
and `src/lib/conduct/intelligence.ts` (now delegates to canonical `src/lib/money.ts`,
which has no default currency). `EnforcementWorkspace.tsx` no longer exposes a free-text
`penalty_currency`: it shows the server-resolved currency and offers a governed approved
currency selector with a mandatory reason only where the regulator policy permits it.
`scripts/cert-v2/p11-enforcement.ts` no longer supplies a currency. `Penalties.tsx`
already displays the stored sanction currency and keeps per-currency totals separate.

### Permanent gate

`npm run verify:enforcement-currency`
(`scripts/verify-enforcement-penalty-currency.sql`) — 37/37 assertions pass, run twice,
rollback-safe, zero residue: authority surface and anon closure (A), policy as
configuration and provenance columns (B), regulator-base resolution and fail-closed
behaviour (C), browser omission/override refusal and governed approved-currency path (D),
officer-assignment and reporting-currency isolation (E), snapshot immutability across a
base-currency change and tender separation (F), whole-estate currency/provenance
integrity plus remediation audit (H), residue (Z).

# Returns for real licensees: canonical sector mapping + 2025/2026 backfill

Confirmed by inspection this turn:

- The verification account `john.smith@yopmail.com` (John Smith, Apex Commercial Bank) holds licence `LIC-2026-000034`, status `active`, valid until 2027-08-24, on sector **Commercial Bank**, which is `inactive`.
- The 18 new `FSRA_*` return definitions, their form mappings and their 18 obligation rules are all scoped to the 9 **active** sectors, so no legacy-sector licence can ever match a rule.
- `returns_derive_entity_obligations` matches rules only against `licensees.sector_id` (ignoring the sectors of the entity's actual licences) and stamps `effective_from = GREATEST(rule.effective_from, CURRENT_DATE)`, which is why 2025 history is skipped.
- `can_act_on_license` (used by `returns_entitlement_ok` → `returns_can_file_obligation`) compares the rule's sector to the licence's sector with plain equality, so a Commercial Bank licence fails against an International Banks rule.
- Frontend capability handling is already correct: `useEntityCapabilities` grants open/edit on `prepare_filing` or `submit`, and Submit stays `submit`-only.

## What will be built

### 1. Canonical sector alias map (new table)

`public.sector_alias_map` — one row per retired sector: `legacy_sector_id` (unique), `active_sector_id`, `note`, `is_active`, timestamps with the standard update trigger. Read access for signed-in users; writes only via backend/admin (no client write policy). Seeded mappings:

```text
Commercial Bank            -> International Banks
Merchant Bank              -> International Banks
Financial Group            -> International Banks
Financial Holding Company  -> International Banks
Building Society           -> Credit Unions
Micro-credit Institution   -> Credit Unions
Life Insurance             -> Domestic Insurance & Pension
General Insurance          -> Domestic Insurance & Pension
Pension Fund Administrator -> Domestic Insurance & Pension
Money Service Business     -> Money Services Business
Payment Service Provider   -> Money Services Business
Securities Dealer          -> International Mutual Funds
```

Licence records themselves are **not** modified.

### 2. Resolver function

`public.sector_effective_id(sector_id)` returns the mapped active sector when an active mapping exists, otherwise the input unchanged. Used by both the entitlement predicate and obligation derivation.

### 3. Entitlement resolution through the map

`can_act_on_license` gains one extra accepted condition: the licence's effective sector equals the requested effective sector. Direct-match behaviour, status/grace rules, sub-sector and category checks are unchanged, and no other predicate, RLS policy or grant is weakened.

### 4. Obligation derivation fix

`returns_derive_entity_obligations` will:
- build the entity's effective sector set from `licensees.sector_id` **plus** the sectors of every licence in `entity_licenses`, each passed through `sector_effective_id`, and match rules against that set;
- record `effective_from` from the rule itself instead of clamping to today, so 2025 periods can be generated.

Everything else in the function (dedupe on active obligations, `requires_active_license`, priority ordering, closure sweep, audit log) stays as-is.

### 5. Backfill for real licensees

For every entity with an eligible licence (Apex Commercial Bank, Coral Harbour Bank, Meridian Commercial Bank, Windward Trust Bank, Basseterre Building Society, Cayon Commercial Bank, plus insurers, MSBs and other mapped legacy sectors):
- insert the matching `entity_reporting_obligations` for that entity's effective sector (Annual + Quarterly FSRA definitions), keyed idempotently on entity + definition so re-running creates no duplicates;
- generate `reporting_periods` for 2025 and 2026 (Annual 2025/2026 and Q1–Q4 for both years), with due dates from each definition's `due_days_after_period_end`.

Entities whose sector has no mapping keep no returns and continue to show the existing contextual notice. Existing obligations, periods, filings and legacy-sector rules are untouched.

### 6. Verification

Sign in as `john.smith@yopmail.com` and confirm: the Returns workspace lists Annual 2025, Annual 2026 and Q1–Q4 for 2025 and 2026 for the International Banks configuration only, the File Return / Open action is present, the opened filing pins both International Banks forms (Balance Sheet and Profit and Loss) at their published versions, no other sector's forms appear, and a save → validate → submit pass completes. Also confirm a preparer-only account can open and prepare but not submit, and that an entity with no eligible licence still sees the notice with no filing action.

## Not touched

Licence records and sector reference data, form builder, applications, approvals, payments, complaints, correspondence, admin returns queue, RBAC/RLS policies, audit and notifications, PPOC entity switching, and the previously seeded demo entities.

## Technical notes

- One migration: create `sector_alias_map` (+GRANTs, RLS, update trigger), seed the 12 mappings, create `sector_effective_id`, replace `can_act_on_license` and `returns_derive_entity_obligations`.
- Backfill runs as data statements after the migration, mirroring the derivation rule (the RPCs require an authenticated admin session and cannot be invoked from the tooling).
- Server-side enforcement path is unchanged: `returns_open_filing` still calls `returns_can_file_obligation` → `returns_entitlement_ok` → `can_act_on_license`.

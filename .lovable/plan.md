# Returns configuration for 2025/2026 + File Return availability

## What I found (verified)

Canonical returns chain in use today:

```text
return_definitions
  -> return_definition_forms (pinned form templates)
  -> reporting_obligation_rules (sector / sub-sector applicability)
     -> entity_reporting_obligations (per entity)
        -> reporting_periods (period_start/end, due_date)
           -> return_filings -> return_filing_versions
              -> return_filing_form_requirements (pinned published form_version_id)
```

Confirmed blockers:

1. **No eligible licensees in active sectors.** All 20 live licences sit on retired legacy sectors (Commercial Bank, Life Insurance, Building Society, …). The 9 active FSRA sectors hold **zero** licences, so `can_act_on_license` / `returns_entitlement_ok` can never pass for an active sector.
2. **All 36 obligation rules are scoped to legacy sectors.** None reference the 9 active sectors.
3. **Wrong definitions carry the forms.** Only `PRUD_BS_Q` (Balance Sheet template, published v4) and `PRUD_PL_Q` (P&L, published v2) have `return_definition_forms` rows. Every existing entity obligation is for `PRUD_CAP_Q` / `INS_TECH_Q` / `MSB_TXN_M`, which have **no** form mappings — so an opened filing pins zero forms and renders empty.
4. **No 2026 periods at all**; periods stop at 2025-12-31, and 18 of 18 obligations have `source_rule_id = NULL`, so `returns_obligation_scope` returns a NULL sector and sector validation degrades to "any eligible licence".
5. **File Return / Open button hidden** because `useEntityCapabilities` sets `canOpenOrEdit = capabilities.includes('submit')`. The PREPARER role holds `prepare_filing` (not `submit`), and the backend already distinguishes the two (`returns_can_prepare` vs `returns_can_file`). So preparers see no action at all, and primary reps on entities with no obligation see an empty calendar.

## What will be built

### 1. Sector-specific forms (18 templates)
For each of the 9 active sectors, clone the published Balance Sheet v4 and P&L v2 schemas into two new `form_templates` (`form_type = returns`, `status = published`, correct `sector_id`), each with one published `form_versions` row (v1, `effective_from = 2025-01-01`). Names:
`<Sector> - Balance Sheet`, `<Sector> - Profit and Loss`.

### 2. Sector-specific return definitions (18)
Per sector, two definitions following the engine model:
- `<Sector> - Annual Return` — ANNUAL, due 120 days after period end
- `<Sector> - Quarterly Return` — QUARTERLY, due 30 days after period end

Each definition maps both sector forms via `return_definition_forms` (Balance Sheet seq 1, P&L seq 2, required, effective from 2025-01-01).

### 3. Obligation rules (18)
One `reporting_obligation_rules` row per definition scoped to that sector (`sector_id`, `requires_active_license = true`, `effective_from = 2025-01-01`, active).

### 4. Demo licensee + licence + membership per active sector (9)
One synthetic entity per active sector, tagged `(SAINT-LUCIA-FSRA-DEMO)`, with an `active`/issued licence in that sector, plus `entity_licenses`, an APPROVED PRIMARY_REPRESENTATIVE membership and an APPROVED PREPARER membership on existing demo licensee logins. Existing entities, licences and memberships are not modified.

### 5. Obligations + periods for 2025 and 2026
Derive obligations for each seeded entity (`effective_from = 2025-01-01` so history is not skipped), then generate periods through 2026-12-31. Result per entity: annual 2025 + 2026, and Q1–Q4 for 2025 and 2026, with the exact period boundaries you listed and due dates computed from `due_days_after_period_end` (existing rule — no new due-date logic). Overdue/outstanding state for 2025 comes from the existing calendar logic.

All of this is written as idempotent SQL keyed on stable codes (`FSRA_<SECTORCODE>_ANN` / `_QTR`) so re-running creates no duplicates; existing definitions, templates, filings and periods are left untouched.

### 6. File Return visibility fix (frontend only)
In `useEntityCapabilities`:
- `canOpenOrEdit` / `canValidate` = `prepare_filing` **or** `submit`
- `canSubmit` stays `submit`-only
- `isViewer` = membership with neither prepare nor submit

`EntityReturnsWorkspace` then shows **Open / Continue** for preparers and primary reps, **View** for viewers, and the existing `ReturnsEntitlementNotice` when there is no eligible licence or no approved membership. The submit action on the filing page remains gated by `canSubmit`. No server predicate, RLS policy, grant or RPC is weakened — `returns_open_filing` still calls `returns_can_file_obligation`, so an unauthorised open still fails server-side.

## Not touched

Balance Sheet/P&L originals and their versions, existing definitions/obligations/periods/filings, legacy-sector rules, form builder, applications, approvals, payments, complaints, admin returns queue, RBAC/RLS, audit, notifications, PPOC entity switching (which keeps working through the existing membership selector).

## Verification before reporting done

For each of the 9 active sectors, sign in as the seeded primary rep and preparer and confirm: only that sector's returns appear, Annual 2025/2026 and Q1–Q4 2025/2026 are listed, the Open button is present, the opened filing pins both sector-specific published forms, and another sector's forms are absent. Plus a no-licence and a no-membership case showing the contextual notice with no filing action.

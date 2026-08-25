# Applicant/Licensee Returns — "New Return" guided filing UX

Make Returns simple for non-technical filers, without changing the Returns engine. The regulator-generated obligation and configuration model stays the authoritative source; the new flow is a guided selector over it.

## What changes for the filer

`/entity/returns` is reorganised into:

1. A prominent **+ New Return** action (with a short "Start an eligible regulatory return" line).
2. **My Returns** — actual filing records only (Draft, In Progress, Submitted, Under review, Correction requested, Accepted, Overdue), with friendly labels and contextual actions (File Return / Continue / Respond / View).
3. **Obligations Calendar** — the existing regulator-generated obligation table, moved to a second tab so it is available but no longer the primary experience. Obligation rows are labelled as obligations, never as filings.

The four summary cards (active obligations, next due, overdue, correction requested) stay where they are.

### New Return wizard (dialog, existing design system)

Cascading steps, each showing only what the previous step permits, each auto-selected when there is exactly one option:

```text
Entity (only if >1 approved membership)
  -> Sector (only sectors where this entity holds an eligible licence)
    -> Reporting year (only years with configured periods)
      -> Return type (only definitions configured for that sector + year)
        -> Quarter (only for quarterly definitions, only configured quarters)
          -> Start Return
```

The wizard never invents a return. Each combination resolves to exactly one existing reporting period on an active entity reporting obligation. The primary button reflects what already exists for that period:

- nothing yet -> **Start Return**
- draft / in progress -> **Continue Return**
- correction requested -> **Respond to Correction**
- submitted / under review / accepted -> button disabled with "This return has already been submitted." plus **View Return** where permitted

Business states are explained in-page, never as Access Denied:

- eligible membership, no eligible licence -> New Return disabled with "Regulatory Returns will become available once your licence has been approved and issued."
- licence suspended/revoked/expired beyond grace -> New Return disabled with the existing licence-status explanation; history stays viewable.
- no approved membership -> the existing membership explanation.
- view-only role -> "You can view Returns but do not have permission to prepare a new filing."
- no configured obligations -> "There are currently no regulatory returns configured for your licensed sector."

## Technical section

### Data source for the wizard

A new read-only `SECURITY DEFINER` RPC, `returns_new_return_options(_entity_id uuid)`, is the single source for every dropdown. It derives, server-side:

- **Sectors**: from `entity_reporting_obligations` (`status = 'ACTIVE'`) joined through `source_rule_id -> reporting_obligation_rules.sector_id`, intersected with the entity's eligible licensed sectors resolved through the canonical resolver (`entity_license_entitlements` / `can_act_on_license` semantics plus `sector_effective_id` alias mapping). Sectors are never listed from `sectors`. Obligations with no sector rule (legacy `PRUD_CAP_Q`, `INS_TECH_Q`) are attributed to the entity's licensed sector rather than dropped, so nothing currently filable disappears.
- **Years**: `extract(year from reporting_periods.period_end)` for those obligations. No hardcoding — 2025 stays selectable when a period exists, flagged `is_overdue` with its due date.
- **Return types**: the `return_definitions` reachable for the chosen sector + year, with `frequency`.
- **Periods/quarters**: the actual `reporting_periods` rows (id, label, start/end, due date, status), so Q1–Q4 only appear when configured.
- **Existing filing state** per period: `return_filings.id`, `filing_reference`, `status`, latest version id.

Each row also carries the resolved `obligation_id` and `period_id` so the UI submits ids, not names. The RPC reuses the same visibility predicates as `returns_entity_calendar` (super admin / `returns_management.view` / `entity_membership_capability(..., 'returns.view')`).

### Start Return

`Start Return` calls the existing `returns_open_filing(_period_id)` unchanged. It already:

- re-validates authorisation via `returns_can_file_obligation`,
- rejects non-active obligations and waived periods,
- is idempotent per `reporting_period_id` (one filing per period, existing filing reused),
- pins the in-force published `form_version` rows from `return_definition_forms`, which guarantees the sector-specific form (a Commercial Banking filer can only ever get the International Banks/Commercial Banking pinned forms for that definition).

Duplicate prevention therefore stays server-side; the UI adds a pre-check only to choose the right button label. Frontend selections are never trusted: only `_period_id` crosses the boundary, and the server re-derives entity, obligation, entitlement and capability from it. If `returns_open_filing` lacks a unique constraint on `reporting_period_id`, one is added.

### Permissions

`useEntityCapabilities` already splits `prepare_filing` (open/edit) from `submit`. New Return is enabled on `canOpenOrEdit`, so a preparer can start and save a draft without submit rights; viewers get the read-only message. No RLS, `returns_entitlement_ok`, membership or licence check is weakened.

### PPOC / entity switching

The wizard takes the workspace's selected entity. Changing entity resets sector, year, type, quarter and refetches options and filings under an entity-scoped query key, so Entity A data cannot leak into Entity B.

### Files

- `src/hooks/useEntityReturns.ts` — add `useNewReturnOptions(entityId)`; keep existing hooks intact.
- `src/components/entity/returns-canonical/NewReturnDialog.tsx` (new) — cascading wizard.
- `src/components/entity/returns-canonical/MyReturnsTable.tsx` (new) — filings list with friendly statuses/actions.
- `src/pages/entity/returns/canonical/EntityReturnsWorkspace.tsx` — New Return button + `My Returns` / `Obligations Calendar` tabs.
- `src/pages/entity/returns/EntityReturnsDashboard.tsx` — add the same New Return shortcut, same data source.
- One migration: the `returns_new_return_options` read model (+ grants, unique guard if missing).
- Memory note for the new applicant Returns UX.

Untouched: filing workspace, form renderer, admin Returns Queue, obligation derivation, existing configuration/templates/periods, and all unrelated modules.

### Verification

Single-sector licensee (only their sector offered), multi-sector licensee, Annual 2025, Quarterly 2026 Q2 resolving exactly Q2, existing draft -> Continue, submitted -> no duplicate, no licence -> disabled with licence message, suspended licence -> blocked but history visible, preparer vs submitter vs viewer, PPOC entity switch, and a direct RPC call with a foreign entity's `period_id` to confirm server rejection.

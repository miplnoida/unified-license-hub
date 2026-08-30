# F7-B — Regulatory Returns Consolidated Remediation (Closure Evidence)

Date: 2026-08-30
Upstream state: F0–F6 + F6-X certified and frozen (contracts unchanged by this pass).
Scope: Track-A F7 product gaps only. No F7 certification/freeze. No F8. No Entity Network/UBO work.

## 1. Architecture converged onto the canonical returns spine

Canonical objects retained and extended:

- `return_definitions`, `return_definition_forms`, `return_obligations`, `return_periods`
- `return_filings`, `return_filing_versions`, `return_filing_forms`
- `return_metric_values`, `return_filing_requests`
- new in this pass: `return_filing_extensions`, `return_filing_evidence`, `return_overdue_events`
- new in this pass: `entity_currency_profiles` (effective-dated entity reporting currency)

Legacy `compliance_return_*` surfaces are retired: browser execution/DML revoked, legacy
notification triggers removed, and the dead `ReturnSubmission`, `ComplianceReturns`,
`FillReturnPage` and `complianceReturnGovernedOps` code paths deleted. Legacy routes now
redirect to the canonical journeys (`/entity/returns`, `/returns/queue`,
`/returns/filings/:filingId`); `LegacyReturnFilingRedirect` resolves legacy identifiers
server-side. No orphan returns route remains.

## 2. Governed lifecycle

Every lifecycle transition is a `SECURITY DEFINER` routine with a pinned `search_path`,
an authority check, and an audit record. The browser performs no direct DML:

| Capability | Governed routine |
| --- | --- |
| Open / submit filing | `returns_open_filing`, `returns_submit_filing` |
| Validation & metrics | `returns_validate_filing`, `returns_calculate_metrics`, `returns_extract_metrics` |
| Review (maker-checker) | `returns_review_filing` |
| RFI | `returns_raise_rfi`, `returns_respond_to_request` |
| Amendment | `returns_request_amendment`, `returns_decide_amendment` |
| Extension | `returns_request_extension`, `returns_decide_extension` |
| Evidence | `returns_attach_evidence`, `returns_withdraw_evidence` |
| Overdue | `returns_overdue_sweep` |
| Notification | `returns_notify` |
| Currency | `returns_snapshot_filing_currency`, `returns_rebase_filing_currency`, `returns_filing_metrics_display` |

Maker-checker: a submitter cannot review their own filing; a proposer cannot decide their
own entity-currency override. Late fees remain owned exclusively by the frozen F6 estate.

## 3. Lifecycle UI

`src/components/returns/FilingLifecyclePanel.tsx` is the single shared lifecycle workspace,
rendered with `audience="REGULATOR"` in `src/pages/returns-canonical/FilingDetail.tsx`
(Lifecycle tab) and with `audience="ENTITY"` in
`src/pages/entity/returns/canonical/EntityFilingWorkspace.tsx`. It exposes RFI issuance and
responses, extension requests and regulator decisions, amendment requests and decisions,
version-bound secure evidence upload/download/withdrawal, and deadline facts. Entity users
cannot reach regulator decisions.

Material governed workflows use explicit dialogs with mandatory reasons
(`src/components/governance/ReasonDialog.tsx`); `window.prompt` has been removed from the
returns and entity-currency workflows.

## 4. Reporting currency contract

An entity's regulatory reporting currency defaults to the applicable regulator's base
currency. An authorized effective-dated entity override may be maintained only through
Entity 360/Profile and is resolved server-side by `entity_reporting_currency_resolve`. A
return definition may mandate another currency only through explicit business configuration.
Every filing snapshots its authoritative currency and provenance
(`reporting_currency`, `currency_source`, `currency_as_of`, `entity_currency_profile_id`),
so later profile changes never rewrite historical returns. As-reported values are never
altered; base/consolidated equivalents use the canonical F6-X effective-dated FX engine via
`returns_filing_metrics_display`, which reports `UNCONVERTED` rather than summing unlike
currencies. Override approval mode is business configuration
(`monetary_configs.entity_currency_override_approval_mode`: `DIRECT_AUTHORIZED` or
`MAKER_CHECKER`). No module maintains an independent entity-currency preference.

## 5. Gates

- `npm run verify:f7b` — 66/66 assertions pass (sections A–L, including empirical
  lifecycle-authority probes and zero-residue checks), run twice.
- `npm run verify:f6x-currency` — 82/82 assertions pass (frozen sections unchanged, new
  section M covers the entity reporting-currency layer), run twice.
- Frontend suite, `npx tsgo --noEmit`, and `npm run build` pass.

## 6. Gap dispositions

GAP-F7-01…14 are closed by the objects above: canonical lifecycle (01–03), validation and
metrics authority (04–05), amendments and extensions (06–07), RFI and review maker-checker
(08–09), evidence integrity (10), overdue events and notifications (11–12), audit and
reporting (13), currency of record (14).

## 7. Boundaries (not defects)

- F20 deployment/commissioning and scheduled execution of `returns_overdue_sweep` remain
  operational activities.
- FX availability for a given pair/date is regulator business configuration; missing rates
  surface as `UNCONVERTED`.
- Supervision-module prompt-based flows (`ThematicReviewDetail`, `EntitySupervisionTab`)
  are outside the F7 returns boundary and unchanged.

## Gate status (2026-08-30)

`npm run verify:f7b` 105/105 pass. `npm run verify:f6x-currency` 141/141 pass including the
strict two-regulator scope fixture. Frontend 143 files / 1312 tests pass; `tsgo --noEmit`
clean; production build green.

## Final F7-B re-freeze regression battery (2026-08-30)

No new product capability was added in this pass. Two genuine security defects were exposed
by the permanent security battery and repaired:

- GAP-F0-08: eleven F7-B/F6-X/enforcement routines were executable by `anon`/`PUBLIC`.
  Anonymous and `PUBLIC` execution was revoked; signed-in execution is retained only where
  the routine performs its own permission check. The four trigger functions
  (`returns_touch_updated_at`, `return_filing_currency_snapshot_protect`,
  `tg_enforcement_penalty_currency_authority`, `tg_enforcement_penalty_payment_currency`)
  are no longer executable by any browser role.
- F0-B7: `returns_overdue_sweep(date)` authorized a system run on `current_user`. It now
  uses the canonical `public.is_trusted_service_request()` identity and otherwise fails
  closed; the signed-in branch still requires `returns_require('workflow_action')`.

Gate hygiene: F1/F2/F5/F6/F6-X/F7 gate scripts now drop pooled-session `pg_temp` helpers
before recreating them, so a pooled backend reused across gates cannot fail on differing
helper parameter names.

### Executed results

| Gate | Result |
| --- | --- |
| `verify:f7b` | 105/105 pass (twice) |
| `verify:f6x-currency` | 141/141 pass (twice) |
| `verify:enforcement-currency` | 37/37 pass (twice) |
| `verify:f1c` | 96/96 pass (twice) |
| `verify:f2b` | 63/63 pass |
| `certify:f5c` | 73 assertions pass |
| `verify:f6b` | 38/38 pass |
| `certify:f6c` | 80/80 pass |
| `verify:anon-execute` | PASS (7 allowlisted, 0 defects) |
| `verify:definer-guards` | PASS |
| `verify:permission-refs`, `verify:audit-contract`, `verify:write-contract`, `verify:hardening`, `verify:outbox-delivery`, `verify:service-completeness` | PASS |
| `verify:breadcrumbs` | 340 routes, 0 uncovered |
| `validate-nav-icons` | 213 items, all approved |
| authz/ownership/traceability source gates | PASS |
| `scripts/cert-v2/p11-enforcement.ts` | 26/26 steps pass |
| Frontend | 143 files / 1312 tests pass |
| `tsgo --noEmit` | clean |
| `npm run build` | green (chunk-size warnings only) |

### Live census

- Enforcement penalties: six positive sanctions, all XCD. ENF-2026-00006…00010 carry
  `DATA_REMEDIATION_REGULATOR_BASE`; the new P11 sanction ENF-2026-00011 was minted with
  `REGULATOR_BASE` provenance without any client-supplied currency — positive proof of
  server authority. Settlements: 6 rows, XCD only, 1,500,000 XCD total.
- `entity_currency_profiles`: zero rows lacking a regulator body scope.
- `return_filings`: 93 rows, zero lacking a snapshotted reporting currency or regulator.

### Residual documented boundaries (not F7 defects)

- Supabase linter baseline remains ~1,488 findings (security-definer/search-path classes)
  and is a platform-wide backlog item, not an F7 regression.
- One historical entity identifier remains `DATA_REMEDIATION_REQUIRED` (ambiguous source).
- Display-only `currency: 'USD'` formatter defaults remain in legacy dashboard/fee-catalogue
  screens (`SupervisoryDashboard`, `LicenseeDashboard`, `ApplicantDashboard`,
  `ExecutiveSupervisoryDashboard`, `PrudentialEntityProfile`, `FeeManagement`,
  `LateFeesPage`, `PostLicenseeDashboard`). They format already-authoritative amounts and
  hold no monetary authority; conversion to canonical `src/lib/money.ts` is queued as a
  presentation follow-up outside this freeze.
- F20 deployment/commissioning and scheduling of `returns_overdue_sweep` remain operational.

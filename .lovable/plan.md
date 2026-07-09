# Admin Complaints List — SCRIPT 4 TAB B Enhancement Plan

## Scope
Enhance only `src/pages/complaints/ComplaintsList.tsx` (plus small, isolated helpers) to make the admin view demo-ready for Complaint Intake, Classification, Triage, Routing, and SLA. External complainant view stays minimal and personal-scope only.

## Data loading changes (internal users only)

Update the load function in `ComplaintsList.tsx` to fetch, in parallel:

1. `complaints` — all existing fields plus: `intake_source, channel_id, customer_type, vulnerability_indicator, licensee_id, conduct_risk_category_id, product_id, severity, priority, assigned_team, investigator_id, sla_due_at, sla_days, resolved_at, triage_source, triage_evaluated_at, triage_rule_id, triage_override_reason, email, complainant_id`.
2. Reference lookups (one call each, cached in state maps):
   - `complaint_types` (already loaded)
   - `conduct_risk_categories`
   - `conduct_products`
   - `conduct_channels`
   - `licensees` (id, name) — only for ids referenced
   - `profiles` — batch by unique `investigator_id` + `complainant_id`
3. External users: unchanged personal-scoped query, no reference joins beyond `complaint_types`.

Batch lookups use `.in('id', [...uniqueIds])` to avoid N+1.

## UI changes

### Filter bar (internal only)
Extend existing filter row with additional selects (collapsed into a "More filters" popover to avoid clutter):
- Status (existing)
- Severity, Priority
- Product, Channel, Conduct risk category
- Intake source (portal / internal / staff_intake / referral)
- SLA status (on_track / at_risk / breached) — computed client-side from `sla_due_at`
- Assigned team, Triage source, Vulnerable customer (yes/no)

Search input extended to also match: entity/licensee name, complainant email, assigned team, complaint type name.

### Table columns (internal)
Replace current 6-column table with a denser layout:
1. Complaint # + intake source badge (portal/internal/staff)
2. Entity / Complainant (licensee name if linked, else email; vulnerable flag icon)
3. Classification (type · category · product · channel — compact)
4. Severity / Priority badges
5. Assigned (team · investigator name)
6. SLA (due date + on_track/at_risk/breached pill)
7. Status
8. Actions (menu)

External user table keeps existing simple columns.

### Expandable "Demo evidence" row (internal)
Add a chevron per row that expands an inline panel showing evidence checklist:
- Complaint record ✓ (always)
- Acknowledgement available ✓ (link → open `ComplaintAcknowledgement` reprint)
- Classification complete/incomplete (checks category/product/channel/severity/priority all set)
- Priority assigned ✓/✗
- Routing assigned ✓/✗ (team or investigator)
- SLA status
- Triage timestamp + source + matched rule (if any) + override indicator
- Link "Open full detail & history" → `/complaints/:id`

A header toggle "Demo evidence view" auto-expands all rows.

### Row actions menu (internal only)
Dropdown per row:
- Open detail (navigate to `/complaints/:id`)
- Reprint acknowledgement (open existing `ComplaintAcknowledgement` dialog with reconstructed input)
- Run/retry auto-triage (invoke existing `evaluate-complaint-triage` edge fn, toast result, refresh)
- Take investigation / Assign to me (only when `status='submitted'`; existing `handleUpdateStatus`)
- Quick view classification (small popover using reference maps — no new fetches)

All actions use existing `logAudit` helper. External users: no action menu (only View, as today).

## Small helpers (new, minimal)
- `src/lib/complaintsSla.ts` — `computeSlaStatus(created_at, sla_due_at, sla_days, resolved_at) → 'on_track' | 'at_risk' | 'breached' | 'resolved'`. Pure function, unit-testable.
- `src/components/complaints/ComplaintEvidenceRow.tsx` — presentational expandable row content (keeps `ComplaintsList.tsx` readable).

No changes to: `ComplaintDetail.tsx`, `ConductClassificationCard`, `TriageHistoryCard`, `ComplaintAcknowledgement`, `ComplaintInvestigationTab`, complaint creation flows, edge functions, DB schema, RLS, notifications.

## Guards
- All internal-only UI gated by existing `isInternal` check.
- Reference lookups skipped for external users.
- Missing/nullable fields render as `—`.
- No schema migrations. If a referenced column isn't in generated types, cast row-level via `as any` at the query boundary only.

## Verification
- `tsgo` typecheck
- Manual: external user sees unchanged list; internal user sees new columns, filters, actions
- Existing complaint creation (both dialog + `/complaints/new`) unchanged
- Detail page navigation still works
- Retry triage action calls `evaluate-complaint-triage` and refreshes list
- Acknowledgement reprint opens existing dialog

## Out of scope
DB schema changes, new edge functions, changes to detail page, notification/audit infra changes, conduct/prudential/returns modules.

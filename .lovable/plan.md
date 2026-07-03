## Market Conduct — Remaining Hardening Fixes

Targeted patches only. No module rewrites.

### 1. Alert dedupe (Option B — race-safe insert)
File: `supabase/functions/evaluate-complaint-triage/index.ts`
- Replace the `upsert(..., { onConflict: 'dedupe_key', ignoreDuplicates: true })` with:
  1. `SELECT id FROM conduct_alerts WHERE dedupe_key = $1 AND status <> 'closed' LIMIT 1`
  2. If found → skip; record `skipped_duplicate` in the audit event.
  3. Else `INSERT`; on `23505` unique-violation, treat as concurrent dup and skip gracefully.
- Keep the partial unique index as-is so alerts can regenerate after closure.

### 2. Triage Rules UI — condition fields
File: `src/pages/admin/conduct/TriageRules.tsx`
- Add fields to `FIELDS` + `OPS`:
  - `sla_due_at` (operators: `lt`, `lte`, `gt`, `gte`, `is_empty`, `is_not_empty`; value input = datetime-local, stored ISO)
  - `status` (`eq`, `neq`, `in`, `not_in`, `is_empty`, `is_not_empty`) with dropdown of complaint statuses
  - `conduct_risk_category` (`eq`, `neq`, `in`, `not_in`, `is_empty`, `is_not_empty`) with dropdown from `conduct_risk_categories`
- Normalize naming: keep `entity` (label "Licensee/Entity") and `age_days` (label "Age (days)"); remove/alias `licensee`/`days_open` in UI. Backend already accepts both, no edge-fn change required.

### 3. Triage Rules UI — outputs
Same file:
- Replace free-text `conduct_risk_category_code` with a dropdown of `conduct_risk_categories` writing `conduct_risk_category_id` (keep code fallback hidden for legacy rules).
- `generate_alert_kind` → `Select` with: `repeat_complaint`, `vulnerable_customer`, `critical_severity`, `thematic_spike`, `sla_breach`, `sla_at_risk`, `rule_triggered`, `high_risk_category`.
- Add inputs: `alert_severity` (dropdown low/medium/high/critical), `alert_title` (Input), `alert_detail` (JSON Textarea with `JSON.parse` validation + inline error), `recommended_action` (already present — verify save/load).
- Persist all under `outputs` JSON.

### 4. Supabase types
File: `src/integrations/supabase/types.ts`
- Types were regenerated in the previous turn and already include all listed tables/columns (verified `conduct_triage_audit_events`, `triage_original_values`, `triage_result_snapshot`, `conduct_risk_categories`, etc.).
- No action beyond a re-verification grep in the report. If a column is still missing at build time, regenerate.

### 5. Triage history in complaint detail
File: `src/pages/complaints/ComplaintDetail.tsx` (+ small new component)
- Create `src/components/complaints/TriageHistoryCard.tsx`:
  - Shows `triage_evaluated_at`, matched rule name (join `conduct_triage_rules`), `triage_source`, `triage_override_status`, `triage_last_error`.
  - Collapsible JSON views: `triage_result_snapshot`, `triage_original_values`.
  - Table of `conduct_triage_audit_events` for the complaint (event, rule, created_at, actor) with pagination-lite (last 20).
  - "View full audit" opens existing `ChangeHistoryDrawer` via `HistoryButton` filtered to entity `complaint`.
- Mount inside the existing Conduct/Overview tab in `ComplaintDetail.tsx` right under `ConductClassificationCard`.

### 6. Strengthen alert lifecycle audit
File: `src/pages/conduct/ConductAlerts.tsx`
- `ack` and `doClose`: change `logAudit` calls to pass `before: { status: oldStatus }`, `after: { status: newStatus }`, and `meta: { kind, complaint_id, triage_rule_id, alert_id }`.
- Rule-generated close via `OverrideReasonDialog` already records original vs overridden — extend `metadata` to include `kind`, `complaint_id`, and confirm the override reason is stored in `rule_overrides` (existing behavior).

### 7. Build verification
- Run `tsgo` (project's typecheck). Fix any type errors introduced (mostly around new dropdown option unions and JSON parse types).
- Confirm 0 errors before reporting.

### Deliverables in final reply
Files changed, migration status (none required this pass), dedupe strategy switched to select-then-insert with 23505 fallback, UI parity confirmations for conditions + outputs, types grep results, complaint-detail triage history mounted, alert audit before/after values, build result.

### Files to edit
- `supabase/functions/evaluate-complaint-triage/index.ts`
- `src/pages/admin/conduct/TriageRules.tsx`
- `src/pages/complaints/ComplaintDetail.tsx`
- `src/components/complaints/TriageHistoryCard.tsx` (new)
- `src/pages/conduct/ConductAlerts.tsx`

No DB migration required.
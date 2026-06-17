# SLA Manager — Completion Plan

## 1. Database migration (new file)

Create `supabase/migrations/<ts>_sla_manager_complete.sql`. Builds on the existing tables — additive only, no drops.

### New table
```sql
CREATE TABLE public.business_calendar_process_assignments (
  id uuid PK,
  profile_id uuid NOT NULL REFERENCES business_calendar_profiles(id) ON DELETE CASCADE,
  process_type text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz, updated_at timestamptz,
  UNIQUE (process_type)            -- a process maps to exactly one calendar
);
```
+ GRANT (authenticated + service_role), RLS, admin-only write policy, authenticated read.

### Additive columns on existing tables
- `business_calendar_profiles.updated_by uuid`
- `business_calendar_holidays.created_by/updated_by uuid` + `updated_at` + trigger
- `sla_configurations.updated_by uuid`
- `sla_escalation_tiers.created_by/updated_by uuid`

### Extra constraints (the originals already cover most rules; add what's missing)
- `business_calendar_profiles`: CHECK `working_start_time < working_end_time`, CHECK `array_length(working_days,1) BETWEEN 1 AND 7` and each day in 0..6.
- `business_calendar_holidays`: UNIQUE (profile_id, holiday_date) already present — keep.
- `sla_escalation_tiers`: tighten CHECK `tier BETWEEN 1 AND 3` (spec says 3 tiers); UNIQUE (process_type, tier) already present.
- `sla_configurations`: existing CHECKs already cover duration ≥1, unit ∈ (hours,days), warning_threshold 1..100.

### Seed data
- Insert `BOJ Calendar` and `FSC Calendar` profiles (Mon–Fri, 09:00–17:00, `Asia/Kolkata`) via `ON CONFLICT (name) DO NOTHING`.
- For every existing distinct `sla_configurations.process_type`, seed Tier 1 (delay 0, recipients "assigned_officer,team_lead"), Tier 2 (delay 3, "deputy_director"), Tier 3 (delay 7, "director") — `ON CONFLICT (process_type,tier) DO NOTHING`.

### RLS pattern
Admin-only writes via `has_role(auth.uid(),'admin')`; authenticated read on all four tables (consistent with the existing migration).

## 2. Frontend — `src/pages/admin/SlaManager.tsx`

### 2a. SLA Configuration tab — fix inline edit
Replace the stale-closure `onBlur={() => saveRow(row)}` pattern with a ref-backed map of latest values, so `saveRow` always reads the freshest row:

```text
const latestRef = useRef<Record<string, SlaRow>>({});
update(id, patch) → updates state AND latestRef.current[id]
onBlur → saveRow(latestRef.current[id])
Select/Checkbox → saveRow(latestRef.current[id]) after state update
```
Tab order is natural (inputs in DOM order). Success/error toast already present — keep. Audit event `ADMIN_SLA_UPDATED` unchanged. After successful save, fire `notifyTeamLeads(process_type, change)` (see §3).

### 2b. Business Calendar tab — process assignments
Add an "Assigned process types" section in the right-hand card:
- Multi-select using checkbox list of distinct `sla_configurations.process_type` values.
- "Assign" button writes to `business_calendar_process_assignments` (upsert on `process_type` so reassignment moves the process to this profile).
- Show currently-assigned process types as badges in each profile row in the left list and below the calendar header.
- Audit: `ADMIN_CALENDAR_UPDATED` with `{ assigned: [...], unassigned: [...] }`.

### 2c. Escalation tab — guarantee all 3 tiers exist
On load, for the selected process type, if any of tiers 1/2/3 is missing, auto-insert defaults (Tier 1: 0 days, assigned_officer+team_lead; Tier 2: 3 days, deputy_director; Tier 3: 7 days, director). Inline-edit uses same ref-backed pattern as 2a. Persist on blur; audit `ADMIN_SLA_UPDATED`.

### 2d. Performance Summary tab — remove fake data
Replace hard-coded `sample[]` with a real query: aggregate `applications`/`compliance_returns` against the matching `sla_configurations` row (process_type matched to entity type). Since the project has no live SLA-deadline column on these entities, the honest behaviour is:
- Query `sla_configurations` for the list of process types.
- For each, attempt to read counts from any view named `vw_sla_performance` (won't exist yet).
- On absent source → render an empty state: "Live SLA performance is published in DASH-OPS." with a Button linking to `/dashboard` (DASH-OPS route). No fabricated percentages.

### 2e. Business-rule banner
Add a persistent `<Alert>` at the top of each tab: "Changes apply to new cases and newly entered workflow stages only. In-progress timers are not retroactively recalculated." (Already partially present in CardDescriptions — promote to Alert for visibility.)

## 3. Notifications on SLA change

New helper `src/lib/slaNotifications.ts`:

```ts
notifySlaChange({ process_type, change }) → 
  dispatchNotificationEvent({
    event_key: 'sla.configuration_updated',
    entity_type: 'sla_configuration',
    entity_id: <row id>,
    payload: { process_type, change, updated_by_email, app_url }
  })
```

Uses the existing `dispatchNotificationEvent` (`src/lib/notificationEvents.ts`) → `dispatch-notification-event` edge function → existing `notification_dispatch_log` + `send-notification` pipeline. Recipient rule resolves to "team leads for the affected process type" via a new `notification_event_configs` row seeded by the migration:

```sql
INSERT INTO notification_event_configs (event_key, channels, recipient_rules, subject_template, body_template, ...)
VALUES ('sla.configuration_updated', '{in_app,email}',
  '[{"type":"role","role":"team_lead"}]',
  'SLA updated: {{process_type}}',
  'SLA for {{process_type}} was updated by {{updated_by_email}}. {{change}}',
  ...);
```

Frontend never fakes via toast — toast is only UX confirmation; the email/in-app is fired through the dispatch pipeline.

## 4. Type & build hygiene

- After migration runs, regenerated `src/integrations/supabase/types.ts` exposes new tables — replace the `(supabase as any)` casts in SlaManager with typed clients where straightforward.
- Run typecheck; fix any compile errors (mostly the new `business_calendar_process_assignments` typings and the `latestRef` map types).

## 5. Verification

- TypeScript compiles (`tsc` clean).
- Inline edit: type into a Duration cell, tab away → value persisted (verified by re-fetch), toast appears, `audit_logs` row written with `ADMIN_SLA_UPDATED`.
- Assign "License Application" to BOJ Calendar → row appears in `business_calendar_process_assignments`; badge shows on profile.
- Escalation tab: switching to a process with no tiers auto-creates 3 rows in `sla_escalation_tiers`.
- Save an SLA change → `notification_dispatch_log` shows a `sla.configuration_updated` row per team-lead recipient.
- Performance Summary: shows empty-state card with DASH-OPS link, no fake numbers.
- Existing admin features untouched: AdminHub card, route guard, permission module unchanged.

## Files touched

- `supabase/migrations/<ts>_sla_manager_complete.sql` *(new)*
- `src/pages/admin/SlaManager.tsx` *(edit)*
- `src/lib/slaNotifications.ts` *(new)*

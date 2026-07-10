## Goal

Make the SLA on every complaint come from the admin **Complaint Management → Complaint Types** setting (the `sla_days` field on `complaint_types`) instead of a hardcoded 20 days, and remove the "Assign / Take investigation" action from the Complaints list.

## What changes

### 1. Apply the complaint-type SLA to every new complaint (DB trigger — one source of truth)

Add a `BEFORE INSERT` trigger on `public.complaints`:

- If `complaint_type_id` is set and its `complaint_types.sla_days` is present, set:
  - `NEW.sla_days = complaint_types.sla_days`
  - `NEW.sla_due_at = coalesce(NEW.created_at, now()) + sla_days * interval '1 day'` when not already provided
- Fallback: if no type or no `sla_days`, use 20 days (current default) so nothing regresses.
- Existing triage rules keep working — they run after intake and can still override `sla_days` / `sla_due_at` when a rule matches. Only the *baseline* comes from the setting.

Why a DB trigger: applies uniformly to the applicant portal, internal intake, the triage edge function, and any future entry points — no path can bypass it.

### 2. Backfill existing complaints

One-time UPDATE:
- For every existing `complaints` row missing `sla_days` or `sla_due_at`, take the value from its linked `complaint_types.sla_days` (fallback 20) and set `sla_due_at = created_at + sla_days days`.
- Skip resolved/closed rows so we don't retroactively "un-breach" them.

### 3. Frontend — read SLA from the row, remove hardcoded 20

`src/pages/complaints/ComplaintsList.tsx`
- Remove the hardcoded `sla_days: 20` in `handleCreate` (acknowledgement dialog) — use `inserted.sla_days` returned from the insert (add it to the `.select()` list).
- Same fix in `reprintAck` fallback (already uses `c.sla_days ?? 20`; keep the value from DB).
- No hook changes needed elsewhere; SLA status is already computed from `sla_days` / `sla_due_at`.

### 4. Remove the Assign action on the list

`src/pages/complaints/ComplaintsList.tsx` — in the row action menu:
- Remove the **"Take investigation"** menu item (this was the manual-assign action that set `investigator_id`).
- Remove the preceding `DropdownMenuSeparator` if it becomes orphaned.
- Keep the **Assigned** column and the **Assigned team** filter in the table for visibility (they only display data set by triage rules / detail page); the user asked to remove the *assign option*, not the display. If the intent is to also drop the column + filter, say so and I'll extend the plan.

Assignment can still be performed from the complaint detail page workflow — this only removes the shortcut from the list.

## Files touched

- Migration: trigger + function + backfill on `public.complaints`
- `src/pages/complaints/ComplaintsList.tsx` (ack payload + drop "Take investigation" menu item)

## Assumption to confirm

"Remove assign option" = remove the **Take investigation** row action only. The Assigned column and team filter stay so users can still see who owns each complaint. Confirm if you also want the column/filter hidden.
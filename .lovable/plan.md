## What's actually wrong

Verified against the live record `CMP-2026-000001`:

- The complaint is **closed** (`status = closed`, `closed_at = 1 Apr 2026`).
- Its workflow instance is still `status = active` with **`current_step_key` and `current_step_id` both NULL**, and it has **zero approval actions**.
- `get_public_complaint_tracking` computes progress purely from that instance: it looks up the step order of the current step, and with no current step `v_current_order` is NULL, so every step evaluates `is_complete = false` and `is_current = false` — the UI renders all twelve steps as "still to come".

This is not a one-off: **31 complaint workflow instances have a NULL current step**, and **10 complaints are resolved/closed/rejected while their workflow instance is still not completed**. So every one of those tracking pages is wrong in the same way.

## What to build

### Backend — one migration replacing `get_public_complaint_tracking`

Make progress derive from the complaint's **own status** first, and use the workflow instance only as extra detail:

1. Map the complaint status to a milestone order using the step keys already configured on the complaint workflow:
   - `submitted` → at `filed`/`triage`
   - `under_investigation` → at `investigation`
   - `resolved` → `resolved` reached (everything before it complete)
   - `closed` → `closed` reached (all preceding complete, terminal step current/complete)
   - `rejected` / `duplicate` → treated as closed with a "not taken forward" label
2. Compute the effective order as `GREATEST(status-derived order, workflow current step order)` so a workflow that *has* advanced further still wins, but a stale/NULL instance can never drag progress back to zero.
3. Mark steps: order < effective → complete; order = effective → current (or complete when the complaint is in a terminal status); order > effective → upcoming.
4. Hide the branch-only steps that never applied (`enforcement`, `notice_issued`, `response_received`, `payment`, `appeal`, `withdrawn`) unless the complaint actually reached them — a closed complaint shouldn't list eight enforcement steps it never went through.
5. When no workflow instance exists at all, still return a sensible milestone list from the status map, so the stepper is never empty.

Also, since the complaint is closed but history shows only two audit rows, add the complaint's own lifecycle timestamps (`created_at`, `resolved_at`, `closed_at`) as synthetic timeline entries when no matching audit event exists — so a closed complaint always shows "Complaint received" and "Complaint closed" with real dates.

### Frontend — `ComplaintTrackingView.tsx`

Presentation only:
- Show "Complete" / "In progress" / "Still to come" captions consistent with the new flags, and mark the whole stepper visually finished when the status is terminal.
- No change to the lookup, correspondence, or investigation sections.

## Technical notes

- Single migration, `CREATE OR REPLACE FUNCTION public.get_public_complaint_tracking`; return shape unchanged (same top-level keys, same `steps` entry fields), so the view keeps working.
- No data backfill of the stale workflow instances — the fix is read-side, so all 31 affected complaints are corrected without touching workflow state or business logic.
- The separate question of *why* complaint workflow instances never advance (0 approval actions across these complaints) is a workflow-engine issue; it is not addressed here and can be a follow-up if you want the underlying state repaired too.

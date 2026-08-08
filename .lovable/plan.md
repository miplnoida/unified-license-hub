# Stop duplicate hearing-completion entries

## What is happening

Verified in the code and the database function:

- The hearing form's **Save minutes & mark hearing complete** button is only disabled while the request is in flight or when no hearing is scheduled. It stays enabled after the hearing has already been completed, so it can be pressed repeatedly.
- `complete_appeal_hearing` overwrites the minutes each time (so the minutes text itself is not duplicated), but it has no completion guard: every press stamps a new completion time and inserts another `hearing_completed` entry in the appeal history. That is the duplicate the tester is seeing.

## What to build

### 1. The button reflects state instead of always being live
- Once the hearing is completed, show the recorded minutes and the completion timestamp as read-only, with an explicit **Amend minutes** action instead of a permanently live complete button.
- Disable the complete button when the minutes box is empty/unchanged or the hearing is already completed, and label it clearly (`Save minutes & mark hearing complete` before completion, `Save amended minutes` after).
- Keep the existing in-flight spinner and the "no hearing scheduled" guard.

### 2. Amending is a deliberate, separate action
- Amend reveals the editable minutes box pre-filled with the stored text; saving it updates the minutes without re-stamping the hearing as newly completed.
- If the text is unchanged, saving is blocked with a short message rather than writing another history entry.

### 3. Backend becomes idempotent and honest in history
- `complete_appeal_hearing` gains an explicit amend flag:
  - First completion: sets minutes, sets the completion time, logs `hearing_completed`.
  - Repeat call without the amend flag: returns a "hearing already completed" result instead of writing anything.
  - Amend call: updates the minutes, leaves the original completion time intact, and logs a distinct `hearing_minutes_amended` entry naming who amended them.
- No change to permissions, the scheduling RPC, the panel snapshot, or the decision/quorum rules.

## Existing data

Nothing is rewritten. Any appeal that already collected repeated `hearing_completed` entries keeps them — the history is append-only by design. Duplicates simply stop occurring from here on.

## Technical notes

- Frontend: `src/components/appeals/AppealPanelSection.tsx` (hearing block — completed read-only view, amend toggle, dirty/completed-aware disabled state) and the `completeHearing` mutation in `src/hooks/useLicenseAppeals.ts` to pass the amend flag.
- Backend: one migration replacing `public.complete_appeal_hearing(_appeal_id uuid, _minutes text, _amend boolean default false)` with the completion guard and the new event type; error/result shape follows the existing HTTP-200-with-details convention.

## Verification

- Complete a hearing once — button becomes a read-only minutes panel with the completion time and a single history entry.
- Press complete again (via a stale view) — no second history entry is written.
- Amend the minutes — text updates, original completion time unchanged, one `hearing_minutes_amended` history entry.
- Saving amended minutes without editing them is refused.

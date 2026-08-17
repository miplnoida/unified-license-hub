# Findings tab — corrective action status stays "open" after a finding is closed

## What's actually happening

Confirmed on this examination (EXM-2026-00002): the finding `finding title` is `closed` (closed 11 Aug 2026), but its linked corrective action `67451d8d…` is still `open` in the actions table. So the panel is displaying the truth — the bug is that closing a finding never closes the corrective action it created.

Today "Close finding" only writes `status = closed` on the finding row. The corrective action keeps living in the prudential actions lifecycle, which also means:
- the examination close guard ("cannot close while remediation actions remain open") can still block progression, and
- the action keeps appearing in overdue/breach sweeps and entity action lists.

## Fix

1. **Closing a finding closes its corrective action.** The Close finding action asks for a short closure note, then closes the linked corrective action through the existing gated closure path (`close_prudential_action`, kind `completed`, reason = the note) before marking the finding closed. If the closure gate refuses (e.g. required evidence not accepted), the finding is not closed and the refusal reason is shown — the user is told what to resolve first.

2. **Clearer wording in the finding card.** The corrective action line reads as a plain sentence with the status labelled — "Corrective action: <title> — Completed 11 Aug 2026" / "— Open, due 18 Aug 2026" — and gets a small status badge instead of "· status open".

3. **Repair the existing inconsistent row.** A one-off data fix closes corrective actions that belong to already-closed findings on this and any other examination, so the currently displayed record becomes consistent.

## Technical notes

- `FindingsPanel.tsx`: `closeFinding` becomes async — prompt for note (SweetAlert, per project convention), call `useCloseActionGated()` when `r.remediation_action_id` exists, then the existing finding update; surface RPC errors as toast and abort.
- `useExaminations.ts`: findings query already joins the action; add `status`/`due_date` fields if missing and invalidate `prudential_actions` + `prudential_action_monitor` keys after a finding close so other views refresh.
- Data repair migration: update open/in-progress/overdue actions whose id is referenced by a closed `examination_findings` row to completed, with an audit note. No schema, RLS or guard changes.

## Verification

Reload the Findings tab on this examination: the corrective action shows as completed. Then close a fresh finding with a linked open action and confirm the action closes in the same step and the examination close guard no longer reports open remediation.

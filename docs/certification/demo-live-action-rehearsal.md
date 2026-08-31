# Saint Lucia FSRA — Live Action Rehearsal Plan

HEAD `687a4b892b0752a4448efdf64fff2b1be3f94c0d`, 2026-08-31. Read-only certification of what may
be performed live, based on current data and governed write paths.

## Safe live actions

| Action | Governed path | Precondition present | Visible effect | Reversible for rehearsal |
|---|---|---|---|---|
| Acknowledge a breach | `prudential_breach_acknowledge` (direct DML on `return_threshold_breaches` revoked) | 47 unacknowledged current outcomes | acknowledged actor/time/rationale, inbox count moves | rehearse under rollback-scoped fixture only; live acknowledgement is append-only |
| Escalate a breach to enforcement | governed escalation RPC citing breach IDs | open breach `LIQUIDITY_RATIO` on Coral Harbour | enforcement case created, breach shows escalation link | not reversible — perform on a non-narrative entity or narrate only |
| Add a note / progress update to `PA-2026-0001` | governed prudential action update | action is `in_progress` | timeline entry, audit event | append-only |
| Send correspondence | governed correspondence dispatch | Coral Harbour contacts present, Resend-primary router live | dispatch row, audit event, delivery state | append-only |
| Record a supervisory decision on an AI insight | `ai_insight_actions` write | 18 insights awaiting review | insight moves to accepted/modified/rejected with actor | append-only; **doing this once before the demo also clears D18** |

## Actions to narrate rather than perform

- Acknowledging or escalating a breach on Coral Harbour changes the very figures used later in
  the script — narrate, or use a non-narrative entity.
- Completing `PA-2026-0001` removes the only open action in the story.
- Any examination or F&P step: no demo-entity record exists to act on (D4).

## AI capability boundaries (must be stated exactly this way)

| Capability | Truthful description |
|---|---|
| Ratio/threshold evaluation, breach detection, EWI, SLA and escalation timing, risk banding inputs | deterministic regulatory rules — must **not** be called AI |
| Insight generation, narrative drafting, summarisation | genuine model-backed generation with recorded provenance |
| Model governance | 2 registered models, 25 governance events, 15 recorded attempts, 3 kill switches — kill switches are **recorded**, enforcement is not proven (D3) |
| Human control | every insight is advisory; nothing is applied without an attributable human decision |
| Roadmap | anything not observable in this environment must be described as roadmap, not live |

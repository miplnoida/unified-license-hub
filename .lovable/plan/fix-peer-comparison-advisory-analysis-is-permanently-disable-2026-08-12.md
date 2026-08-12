# Fix: Peer Comparison advisory analysis is permanently disabled

## What's actually happening (verified against live data)

The Peer Comparison tab always compares on the entity's **most recent** filed period. For this entity that is **30 Jun 2026**, and only this entity has filed ratios for that period — peer sample of 1, against the configured minimum of 3. So every row is correctly suppressed as `INSUFFICIENT_PEER_DATA`, no row counts as comparable, and the advisory panel's "Generate analysis" button stays disabled with no explanation.

Earlier periods do have a publishable sample: 31 Dec 2025 and 31 Mar 2026 each have 3 peers reporting in the same sector and category, which meets the minimum. The comparison is simply pinned to a period no one else has filed yet.

So this is not an AI failure and not a permission problem — it's a period-selection and messaging problem.

## What to change

1. **Add a period selector to the Peer Comparison tab.**
   - Lists the entity's filed periods (most recent first).
   - Defaults to the most recent period that has a publishable peer sample, instead of blindly the latest filed period.
   - Changing the period re-runs the existing peer snapshot per ratio — no calculation logic changes.

2. **Add a peer-basis choice: sector + category (default) or sector only.**
   - Sector-only widens the sample when a category is too thin, using the same server-side suppression rules.
   - The chosen basis is shown on screen so a supervisor always knows what the comparison is against.

3. **Make the suppression state explain itself.**
   - A short line above the table: "Peer statistics are published only when at least N peers reported this ratio for the selected period." with the actual sample size found.
   - When no period has a publishable sample, say so plainly instead of leaving a silently disabled button.

4. **Fix the advisory panel's disabled state.**
   - Keep the rule that advisory commentary is only generated from publishable, aggregate peer statistics (never suppressed values, never named peers).
   - When it is disabled, the button's tooltip/help text states the reason ("no ratio has a publishable peer sample for 30 Jun 2026 — try 31 Mar 2026").
   - Once a period with a usable sample is selected, the button enables and generates as designed.

5. **No changes** to peer statistics, minimum-peer configuration, thresholds, risk scores, EWIs, permissions, or the advisory prompt contract. Deterministic values stay authoritative.

## Technical notes

- `src/pages/prudential/PrudentialEntityProfile.tsx` → `PeerComparisonTab`: introduce `selectedPeriod` and `peerBasis` state; build the period list from the `returns` prop; pick the default period by probing periods for a publishable sample (most recent first). Rows are the latest ratio per `ratio_key` **within the selected period**, not the global latest.
- `PeerRow` keeps using `usePeerSnapshot(ratio_key, period, sectorId, entityId)`; sector-only basis passes the sector but suppresses the category narrowing via the existing RPC argument shape (`_entity_id` omitted for basis = sector only, entity value looked up separately) — chosen so `public.peer_ratio_snapshot` needs no change.
- `AdvisoryAiPanel` gains an optional `disabledReason` string rendered next to the generate button; `ready` stays driven by `comparable.length > 0`.
- Reuse `usePeerMinPeers()` for the message wording so the number always matches configuration.

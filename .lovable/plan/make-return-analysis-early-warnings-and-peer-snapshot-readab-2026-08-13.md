# Make Return Analysis early warnings and peer snapshot readable

## What's wrong today (verified in `src/pages/returns-mgmt/ReturnAnalysis.tsx`)

1. **Early Warnings print raw JSON.** The card renders `{w.reason.replace('_',' ')} — {JSON.stringify(w.evidence[0])}`, so a supervisor sees
   `trend deterioration — {"newest":0.4610027855153203,"oldest":0.7800226280911589,"change_pct":-40.9}`.
   The generator (`src/lib/consolidatedAnalysis.ts`) stores structured evidence for three reasons: `trend_deterioration`
   (oldest / newest / change_pct), `consecutive_amber` (streak / comparator / threshold) and `null_reason_cluster`
   (null_reason / list of ratios). Only the display is wrong — the stored evidence is fine.
2. **The metric is shown as a raw key.** The title line shows `metric_key` (e.g. `car_total`) rather than the ratio's
   configured label, even though labelled ratios are already available in the same analysis record.
3. **Numbers are unrounded.** Evidence numbers come straight out of JSON at full float precision.
4. **Peer snapshot is cryptic.** It renders one dense line: `you: 0.50 · peer median: 0.50 · IQR 0.45–0.55`,
   with no explanation of whether that position is good, and abbreviations ("IQR") non-specialists don't read.

## What will change (presentation only)

### Early Warnings
Each warning becomes a short sentence built from the stored evidence, all numbers rounded to 2 decimals:

- Trend deterioration → **"Capital adequacy ratio fell 40.90% over the filings compared — from 0.78 to 0.46."**
  (Rising values use "rose"; the wording states direction, never a cause.)
- Consecutive amber → **"Warning level reached in 2 consecutive filings — the value stayed above the 0.15 limit."**
  (comparator translated to "above"/"below"/"at or above"/"at or below".)
- Null reason cluster → **"3 ratios could not be calculated for the same reason: missing input line items."**
  followed by the affected ratio labels.

Supporting details stay visible as small labelled chips (Oldest 0.78 · Newest 0.46 · Change −40.90%) instead of JSON,
so no information is lost. Anything the helper cannot interpret falls back to labelled key/value pairs — never JSON text.

The warning heading uses the ratio's configured label with the technical key shown small and secondary.

### Peer Snapshot
Reformat as a labelled row per ratio instead of one run-on line:

- `This entity` and `Peer median` as two clearly labelled figures (2 decimals).
- Where the middle range exists, show it as **"Typical peer range 0.45 – 0.55"** (no "IQR").
- Add a plain-language position phrase derived only from the numbers: **"In line with peers"**, **"Above the peer median"**,
  or **"Below the peer median"**, with the gap shown as a rounded difference. No judgement about good/bad is asserted.
- Keep the existing "not enough peers" behaviour untouched.

## Technical notes

- New presentation helper `src/lib/prudential/analysisNarrative.ts`:
  `describeEarlyWarning(warning, labelByKey)` → `{ headline, sentence, details: {label, value}[] }`,
  `comparatorPhrase()`, `formatRatioValue()` (2-decimal, `—` for null), and `peerPosition(myValue, median)`.
  Pure functions, unit-tested.
- `src/pages/returns-mgmt/ReturnAnalysis.tsx`: Early Warnings card and Peer Snapshot card use the helper;
  ratio labels resolved from the analysis record's own ratio list, falling back to a humanised key.
- No changes to `src/lib/consolidatedAnalysis.ts` scoring, stored evidence, thresholds, or any query/RPC.
- Unit test file for the narrative helper; typecheck and a browser check of the Return Analysis page at the current width.

# Fix Prudential Entities — tab overlap and breach severity labels

## What's wrong today (verified)

1. **Tabs overlap the cards on the entity detail page.** The tab strip on `/prudential/entities/:id` has 13 tabs and is set to wrap, but the strip keeps a fixed single-row height. On narrow widths (your 1010px viewport) the wrapped second row spills outside the strip and sits on top of the Overview cards.

2. **"Worst breach" shows the raw word `red`.** Breach records in the database store a traffic-light value (`red` / `amber`) plus a level (`breach` / `warn`) — confirmed: 146 rows `red/breach`, 40 rows `amber/warn`. The UI prints that raw token instead of a supervisory label, and because the colour map only knows `critical/high/medium/low`, the badge also renders grey instead of red.

3. **The list page's "Risk" filter never matches anything.** Its options are Critical / High / Medium / Low, but the computed worst-breach value is `red`/`amber`, so choosing any option empties the table.

4. **Dashboard tiles undercount.** The prudential dashboard counts high-risk/critical/amber entities using `critical`/`high`/`medium`, which never occur, so those tiles read zero even when red breaches exist.

## What will change

### Shared severity model
Add one small helper module for breach severity used by all prudential screens:
- Canonical order: red/breach (worst) → amber/warn → green/ok.
- Display labels: `red`/`breach`/`critical` → **Breach**, `amber`/`warn`/`medium` → **Warning**, `green`/`low`/`ok` → **Within limits**.
- Tone classes mapped to existing semantic tokens (destructive for breach, amber for warning, emerald for within limits) — no new hardcoded colours.
- A `worstOf(list)` helper so ranking is defined in one place.

### Entity detail page (`/prudential/entities/:id`)
- Let the tab strip grow to fit wrapped rows so tab content can no longer be covered by the Overview cards; keep the strip sticky-free and scroll-safe on small widths.
- "Worst breach" card renders the mapped label and tone (e.g. **Breach** in red) instead of `red`.
- Breaches tab severity chips and the "Escalate" visibility condition use the same helper, so escalation actions appear for real red/breach rows (FRD: escalate on critical/high severity).

### List page (`/prudential/entities`)
- "Worst breach" column shows the mapped label and correct tone.
- Risk filter options become Breach / Warning / Within limits and filter against the canonical severity, so results are non-empty.
- Column tooltip text stays, wording aligned to the new labels.

### Prudential dashboard
- Red/amber entity tiles and the entity mini-list use the shared helper instead of the never-matching `critical`/`high`/`medium` strings.

## Technical notes
- New file: `src/lib/prudentialSeverity.ts` (pure functions + label/tone maps, unit-testable).
- Edits: `src/pages/prudential/PrudentialEntityProfile.tsx` (tab strip height, worst-breach badge, breach rows), `src/pages/prudential/PrudentialEntitiesList.tsx` (badge + filter), `src/pages/prudential/PrudentialDashboard.tsx` (counts), `src/hooks/usePrudentialSupervision.ts` (use shared ranking for `worst_breach`, accept canonical filter values).
- No schema or data changes; presentation and filter mapping only.
- Verification: typecheck, a small unit test for the severity helper, and a Playwright pass on the list and detail pages at 1010px confirming no tab overlap and a red **Breach** badge.

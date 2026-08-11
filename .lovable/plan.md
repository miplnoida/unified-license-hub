# Fix disabled buttons on Investigation → Closure tab

## Verified cause

Both buttons are blocked by hidden minimum-length rules in the frontend, not by permissions:

- **Submit for approval** (`src/components/conduct/ClosurePanel.tsx`) stays disabled unless *Summary of findings* has 20+ characters **and** *Determination rationale* has 20+ characters. The 20-character rule is only printed next to "Summary of findings" — the rationale field shows no hint, so a short but "filled" rationale silently keeps the button dead.
- **Save directive** (`src/components/conduct/PostClosureMonitoringPanel.tsx`) stays disabled unless *Focus areas* has 10+ characters. No hint is shown anywhere.

So a user can fill every field and still see permanently greyed-out buttons with no explanation.

## What will change (UX only, no workflow/validation loosening)

1. **Tell the user what is missing.** Add a small "What's still needed" list above the action row on both panels, listing only the unmet requirements in plain language, e.g.:
   - "Summary of findings needs at least 20 characters (currently 12)."
   - "Determination rationale needs at least 20 characters."
   - "Focus areas need at least 10 characters."
2. **Label the rules on the fields themselves.** Add the same "(min 20 characters)" / "(min 10 characters)" hints next to *Determination rationale* and *Focus areas* so the requirement is visible before typing.
3. **Keep the button clickable-looking but explained.** The buttons stay disabled while requirements are unmet (prevents guaranteed backend rejections), and get a hover tooltip repeating the first unmet requirement, so it never looks broken.
4. **No change** to the closure workflow, readiness gate, override flow, approval steps, or backend rules.

## Technical notes

- Derive a `missing: string[]` array in each component from the existing state values and render it with the project's existing card/alert styling and semantic tokens.
- Reuse the existing disabled conditions; only the messaging is added, so `submit`/`saveDraft`/`save` mutation behaviour is untouched.
- Files touched: `src/components/conduct/ClosurePanel.tsx`, `src/components/conduct/PostClosureMonitoringPanel.tsx`.

## Goal
Make the Track Changes UI visibly evident even when a record has no narrative text and no comments/suggestions yet, so users can see the feature is in place.

## Scope (UI-only, no backend changes)
Edit `src/components/collab-review/CollaborativeReview.tsx` and (if needed) the small components under `src/components/collab-review/markup/`.

## Changes

1. **Always-visible reviewer legend area**
   - Render the `ReviewerLegend` region even when `legendEntries` is empty.
   - Empty state shows a compact info strip: "Track Changes ready — reviewer colors will appear here once comments or suggestions are added." with 3 sample color swatches (muted) as a visual cue.

2. **Legend explainer chips**
   - Add small non-interactive legend chips next to the reviewer list: `Insertion` (underline swatch), `Deletion` (strikethrough swatch), `Comment` (dotted-underline swatch with pin). These are static and always visible so users understand the markup vocabulary.

3. **Narrative empty-state upgrade**
   - When narrative text is empty, replace the plain "No narrative content." line inside `InlineMarkup` with a short guided placeholder:
     - Title: "No narrative yet"
     - Body: "Once this field has content, reviewer edits appear inline: insertions underlined, deletions struck through, comments highlighted with a numbered pin."
     - Include one greyed example line: `The applicant meets `[ins]`the capital`[/ins] `requirements.`[pin 1] rendered with tokenized styling.

4. **View-mode toggle affordance**
   - Add a tooltip on Markup/Final/Original explaining each mode. No behavior change.

5. **Sidebar empty state**
   - Replace "No comments yet. Select text to add a comment or suggest a change." with a two-line hint plus a subtle legend that mirrors the top strip (Insertion/Deletion/Comment swatches), so users see the color language on the right too.

## Out of scope
- No changes to `useCollabReview`, RPCs, RLS, permissions, or any backend logic.
- No changes to comment/suggestion submission flow.
- No changes to how real markup renders when data exists (behavior preserved).

## Files touched
- `src/components/collab-review/CollaborativeReview.tsx` — always-render legend region, sidebar empty state, tooltip on toggle.
- `src/components/collab-review/markup/ReviewerLegend.tsx` — support empty state + static "Insertion/Deletion/Comment" legend chips.
- `src/components/collab-review/markup/InlineMarkup.tsx` — richer empty-narrative placeholder with a demo line.

## Verification
- Open the current application (empty narrative, no reviewers) → legend strip, static markup key, and enhanced empty states are visible.
- On a record with real comments/suggestions → existing colored inline markup, pins, and reviewer chips render unchanged.
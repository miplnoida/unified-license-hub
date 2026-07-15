
## Goal

Upgrade the Collaborative Review panel (used on Applications, Registrations, Returns, Complaints) so multi-reviewer contributions are visually distinguished in a Word-style "Track Changes + Comments" experience. **UI only** — no changes to hooks, RPCs, permissions, mutations, or data shape.

## Scope

Single file focus: `src/components/collab-review/CollaborativeReview.tsx`, plus a few small presentational subcomponents under `src/components/collab-review/markup/`. All data continues to flow through the existing `useCollabReview` hook.

## What changes visually

### 1. Reviewer legend bar
A horizontal chip strip at the top of the panel listing every distinct contributor on this entity with their assigned color swatch, name, and role. Clicking a chip filters sidebar cards to that reviewer (client-side state only).

### 2. View mode switcher (Word-style)
Segmented control above the narrative with three modes:
- **Markup** (default): shows original text with inline insertions (colored underline) and deletions (colored strikethrough), each tinted by the suggesting reviewer's color.
- **Final**: preview of narrative if all pending suggestions were accepted (rendered only — no writes).
- **Original**: raw narrative unchanged.

### 3. Inline markup renderer
Replaces the plain `<Textarea readOnly>` in Markup/Final modes with a rendered `<div>` that splices in `insert` / `delete` / `replace` suggestions using each author's color. Selection-anchored comments render as a highlighted span with a numbered pin that scrolls to the matching sidebar card. The raw textarea is still used when the user wants to select text for a new comment (toggle stays as it is).

### 4. Sidebar cards with reviewer accent
Each comment/suggestion card gets a 3px left border in the author's color and a small colored pin badge matching the inline anchor number. Reply avatars keep their existing color dots. Cards scroll into view when their inline anchor is clicked, and vice versa.

### 5. Grouping & counts
Sidebar header shows per-reviewer counts ("Legal · 3, Sr Examiner · 2") derived from the same data already fetched.

## Non-goals (explicit)

- No changes to `useCollabReview`, RPCs (`add_review_comment`, `add_review_suggestion`, `decide_review_suggestion`, etc.), permissions logic, or workflow gating.
- No new tables, migrations, or edge functions.
- No changes to how comments/suggestions are created, resolved, accepted, or rejected — only how they're displayed.
- "Final" view is a read-only preview; accept/reject still requires the existing buttons.

## Technical notes

- New presentational components (all UI-only, no data fetching):
  - `markup/ReviewerLegend.tsx` — chip strip driven by `authors` + `roleDisplay` already in the component.
  - `markup/ViewModeToggle.tsx` — 3-way segmented control (`markup | final | original`).
  - `markup/InlineMarkup.tsx` — pure function that takes `{ text, suggestions, comments, mode, colorByAuthor }` and returns a React tree with `<ins>` / `<del>` / `<mark>` spans styled inline via `style={{ color, borderColor, background }}`.
- Colors come from the existing `roleDisplayMap` (`color` field) with the current `DEFAULT_COLOR` fallback — no new tokens needed.
- Existing selection capture / "Add comment" / "Suggest change" forms remain unchanged and still operate on the underlying textarea, which is shown when the user clicks "Add comment" (small UX affordance: the textarea appears below the rendered markup for selection).
- Mobile drawer path (`isMobile`) receives the same legend + toggle; layout stays vertical.

## Files touched

```text
src/components/collab-review/CollaborativeReview.tsx           (edit — swap render blocks, keep logic)
src/components/collab-review/markup/ReviewerLegend.tsx         (new)
src/components/collab-review/markup/ViewModeToggle.tsx         (new)
src/components/collab-review/markup/InlineMarkup.tsx           (new)
```

No other files change.

## Verification

- Type-check passes.
- Existing tests (`collabReviewPermissions.test.ts`, etc.) continue to pass since the hook contract is untouched.
- Manual check on an application with existing comments + suggestions: legend shows reviewers, Markup mode renders inline changes in reviewer colors, Final mode hides deletions and shows insertions plain, Original mode matches today's textarea.

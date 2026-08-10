# Prudential entities list: icon button instead of "Open" link

Replace the text link in the last column of the Prudentially Supervised Entities table with a compact icon-only button, matching how other list pages expose row actions.

## Change

- In the entities table, the row action cell currently renders an underlined "Open" text link to the entity profile.
- Swap it for a ghost icon button (eye icon) that navigates to the same entity profile route.
- Keep it accessible: `aria-label="View prudential profile"` plus a tooltip/title so the action is still discoverable without visible text.
- Update the column header tooltip copy that says `Click "Open" to view its full prudential profile` so it refers to the view button instead.

## Technical detail

- File: `src/pages/prudential/PrudentialEntitiesList.tsx`
- Use the existing `Button` component (`variant="ghost"`, `size="icon"`) wrapping a `react-router-dom` `Link` via `asChild`, with the `Eye` icon from `lucide-react`.
- No data, query, or routing changes; presentation only.

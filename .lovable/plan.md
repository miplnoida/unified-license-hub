# Enhance the Review & Submit screen

Rework the review step so it reads like a real licensee application summary instead of a plain label/value list, and move the edit control into each section header so it stops dropping onto its own line and wasting space.

## What changes visually

1. Summary header
   - A compact stats strip at the top: number of sections, total fields captured, and an overall completion percentage with a progress bar.
   - Keeps the existing title/description, but presented as an application summary panel.

2. Section cards with inline edit
   - Each section header shows: an index chip (01, 02, ...), the section title, a "x of y completed" badge, and the edit icon button aligned to the far right on the same row as the title.
   - The edit icon sits beside the accordion chevron (not inside the body), so no extra row and no trailing blank space.
   - Sections that still have empty required-looking gaps get a subtle "Incomplete" tint on the badge so applicants can spot them quickly.

3. Denser, more professional field layout
   - Fields render in a two-column grid on wider screens (single column on mobile) as label-above-value pairs with hairline separators, instead of one full-width row per field.
   - Long values (addresses, textareas, attachments, tables) automatically span the full width.
   - "Not provided" stays muted/italic; attachments, booleans, diff highlights and "Was: ..." history all keep working exactly as today.

4. Declaration and submit block
   - The acknowledgement checkbox becomes a bordered declaration panel with a heading, and the confirm button gets a clear primary treatment with the inline hint next to it rather than stacked above.

## Scope

Presentation only, in `src/components/applications/ReviewAcknowledgement.tsx`. No data, validation, workflow, or edit-navigation logic changes — the same `onEdit(sectionIndex, editRef)` call fires from the new header icon.

Note: this component is also used by the licence application review screens, so those get the same upgraded look.

## Technical notes

- Accordion header becomes a flex row: `AccordionTrigger` keeps the title/badges, with the edit `Button` rendered as a sibling outside the trigger to avoid nested-button issues and accidental collapse on edit click.
- Completion counts reuse the existing `isDisplayOnlyReviewField` filter so headings, dividers and info text are never counted as fields.
- Field grid via `grid md:grid-cols-2`, with full-width class applied for attachment/table/textarea-length values.
- All colors use existing semantic tokens; the diff yellow/red highlight classes stay as-is.

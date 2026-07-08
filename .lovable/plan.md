## Fix pre/post application review UI — balance label/value columns

**File:** `src/components/applications/ReviewAcknowledgement.tsx` (field-row layout inside the Accordion, ~lines 207–257)

### Problem
Each review row uses `flex justify-between` with a narrow `min-w-[140px]` label and a value column capped at `max-w-[300px]`, right-aligned. On wide screens the label area stays visually empty while long answers (like Corporate Structure Details) get squeezed into a thin right-hand column that scrolls forever.

### Change
Convert the row to a responsive 1/3 label + 2/3 value grid, left-aligned:

- Replace the `flex items-start justify-between gap-4` row wrapper with `grid grid-cols-1 md:grid-cols-3 gap-4`.
- Label span: keep muted style, drop `min-w-[140px] shrink-0`; occupy `md:col-span-1`. Keep the "Changed" badge behavior.
- Value container: `md:col-span-2`, switch `items-end` → `items-start`, remove `text-right` and `max-w-[300px]` caps on the text spans so long answers wrap across the full 2/3 column.
- Attachment blocks: keep existing `AttachmentDisplay` but drop the `max-w-[360px]` cap and right-alignment so they align with the value column edge.
- "Was: …" original-value hint stays under the value, left-aligned.
- Preserve the yellow "changed" highlight, hover state, and all existing conditional branches (attachment / boolean / null / string).

No changes to logic, data flow, section headers, table-diff renderer, or display-only field renderer. No other files touched.

### Result
Long text answers fill the available width and read top-to-bottom instead of squeezing into a narrow right column, while short answers still sit cleanly next to their label.
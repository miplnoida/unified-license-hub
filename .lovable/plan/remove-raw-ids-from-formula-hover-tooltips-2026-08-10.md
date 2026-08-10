# Remove raw IDs from formula hover tooltips

Formulas now render as readable text (`Balance Sheet › CAPITAL ACCOUNTS`), but hovering still reveals the raw expression with template UUIDs and `line_x_col_y` codes, because the tooltip was built to show the stored expression.

## Change

- The hover tooltip shows the **full readable formula** (useful when the table cell truncates it), never the UUID/line-code expression.
- Truncated cells keep a tooltip; fully visible readable formulas no longer need one.
- Unresolved references (deleted form field) stop printing the UUID. They render as `Unknown field` in the destructive colour with a hover note explaining the referenced form field no longer exists, so admins still see something is broken without seeing internal IDs.
- Formulas that contain no ID tokens at all (plain arithmetic like `100 * 2`) continue to display as-is.

## Where it applies

Single change in the shared formula display component, so it takes effect everywhere it is used:
- Prudential Ratios: table, version history modal, edit-dialog "Reads as" preview
- Manage Validations: table, version history, edit preview

## Technical notes

- `src/components/prudential/FormulaText.tsx`: replace the tooltip content (currently the raw `formula` string) with the joined readable pieces; drop the `changed`-based raw `<code>` fallback so raw expressions are never rendered when tokens exist; map `unresolved` pieces to a friendly placeholder label instead of `m[0]`.
- No backend, RPC, or schema changes; stored expressions stay untouched.

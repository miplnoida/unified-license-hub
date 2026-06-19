## Problem

In dynamic forms rendered by `FormRenderer` (used across registration, applications, returns, compliance), clicking **Next** or **Submit** sets inline field errors but gives no top-level feedback. On long forms the user can't tell *why* the form didn't submit without manually scrolling to find a red helper text — poor UX.

## Goal

When validation fails on **Next** / **Submit** (and **Save Draft** if/where it validates), surface the problem immediately:

1. A summary **toast** naming what's wrong (e.g. *"3 fields need attention: Entity Name, Email, Phone"* — truncated after 3 names with "…and N more").
2. **Auto-scroll** the page to the first invalid field and focus/highlight it, so the user lands directly on the issue.

No change to validation rules, submit/save semantics, or any other working behavior.

## Scope

Single file: `src/components/form-renderer/FormRenderer.tsx`. This is the shared renderer that powers every dynamic form, so the fix applies everywhere automatically. No backend, hook, route, or business-logic changes.

## Technical Details

Modify `validateCurrentStep()` and its two callers (`handleNext`, `handleSubmit`) in `FormRenderer.tsx`:

1. **Return richer info** — change validator to return `{ ok: boolean; errorEntries: Array<{ fieldName: string; label: string; message: string }> }` (or keep boolean and read from new state). Build entries in the existing loop using `field.label`.

2. **Emit summary toast** on failure in the callers:
   ```ts
   const names = errorEntries.slice(0, 3).map(e => e.label).join(', ');
   const more = errorEntries.length > 3 ? ` …and ${errorEntries.length - 3} more` : '';
   toast.error(`Please fix ${errorEntries.length} field${errorEntries.length>1?'s':''}: ${names}${more}`);
   ```
   `toast` from `sonner` is already imported (line 30).

3. **Scroll to first error** — tag each rendered field wrapper with `data-field-name={field.fieldName}` (renderField at ~line 633 and the variant at ~line 954). On validation failure, query `document.querySelector('[data-field-name="…"]')`, call `scrollIntoView({ behavior: 'smooth', block: 'center' })`, and attempt `.focus()` on the first focusable child (`input, select, textarea, [tabindex]`). Wrap in `requestAnimationFrame` so the DOM has the `setErrors` paint applied first.

4. Apply the same toast + scroll in `handleSaveDraft` only if it currently validates — looking at line 453 it does **not** validate, so leave Save Draft untouched (user said "do not change other working functionality").

## Verification

- Open a long dynamic form (e.g. Commercial Bank Pre Licensee registration), leave required fields blank, click **Submit** → toast lists missing fields, page scrolls to first one, field gets focus, existing inline red helper text still appears.
- Single-error case shows singular wording.
- Fill all fields → no toast, submit proceeds as before.
- `Next` button behaves the same way on multi-step forms.
- No regression to Save Draft (still saves without validation).

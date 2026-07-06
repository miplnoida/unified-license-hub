
## Problem

On `/entity/returns/.../fill` Review tab, the acknowledgement checkbox is disabled whenever `disabled` is passed to `ReturnReviewPanel`. In `FillReturnPage` that prop is `!allComplete` — so unless every form has "I've completed this form" ticked, the user can't even tick the acknowledgement box and has no visible reason why.

## Fix

In `src/components/returns/ReturnReviewPanel.tsx`:

1. Remove `disabled={disabled}` from the acknowledgement `Checkbox` and its `Label` so the user can always toggle it. Submit remains correctly gated by the existing `disabled={!acknowledged || loading || disabled}` on the button.
2. When `disabled` is true, show a short helper line under the checkbox explaining the block (e.g. "Mark every form as completed before you can submit."), so the disabled Submit button isn't a mystery.

No changes to submit logic or the completeness rule.

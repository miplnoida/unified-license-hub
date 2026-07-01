## Plan

1. **Remove the misleading embedded actions in return forms**
   - Update the shared `FormRenderer` to support hiding its built-in bottom action bar.
   - Use that option only in the licensee return fill page so embedded `Save Draft` / `Submit` buttons no longer appear inside each sub-form.

2. **Keep one working Save Draft action**
   - Use the existing page-level `Save Draft` button as the single draft-save control.
   - Make it persist the latest in-memory form values, show `Draft saved` on success, and show a visible error toast if the database write fails.

3. **Make submission flow explicit and reliable**
   - Keep the existing `Review & Submit` step as the only final submission entry point.
   - Ensure it saves latest form data first, runs server-side validation, then always shows a clear result:
     - validation blocked dialog if rules fail
     - error toast if save/update fails
     - success toast/navigation if the return is submitted

4. **Tighten backend access if needed**
   - Add/adjust database policies only if the current licensee/PPOC draft writes are blocked by row-level access rules.
   - Keep access scoped to users with return submission capability for the relevant licensee/entity.

5. **Verify the behavior**
   - Confirm there is no inert embedded Submit button.
   - Confirm Save Draft gives visible success/failure feedback.
   - Confirm final submission shows validation errors when invalid and success/failure feedback once validation passes.
Plan to fix the remaining error:

1. Fix the real failing path: assessment save/update is sending UI-only relationship fields (`licensee` / `licensees`) back to `prudential_assessments`, so the backend treats them as missing table columns.

2. Harden `useUpsertAssessment` by sanitizing the payload before insert/update:
   - Remove `licensee`, `licensees`, and any other embedded/display-only fields before writing.
   - Keep valid assessment columns such as rating, rationale, conclusion, status, entity/return IDs, notes, timestamps, and audit fields.

3. Also adjust the Assessment Detail save call to avoid spreading the full loaded row blindly, so future embedded read fields are not accidentally written back.

4. Verify with the current assessment detail route that clicking Save no longer produces:
   - `Could not find the 'licensee' column of 'prudential_assessments' in the schema cache`

No workflow transitions, prudential calculations, thresholds, or return submission logic will be changed.
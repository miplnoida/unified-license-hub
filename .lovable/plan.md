Plan to fix the remaining schema-cache error:

1. Replace the current prudential assessment embedded relationship query with the explicit backend FK relationship syntax:
   - Use `licensee:licensees!prudential_assessments_entity_id_fkey(name)` instead of the current alias form.
   - Apply this in both the assessment list and single assessment detail queries.

2. Update any UI/data typing that expects `licensees.name` so it also reads the corrected `licensee.name` shape without breaking existing display code.

3. Add a safe fallback if the embedded relationship still fails due to backend schema cache lag:
   - Fetch `prudential_assessments` normally.
   - Fetch matching `licensees` by `entity_id`.
   - Merge the licensee name client-side.

4. Verify the failing prudential page/query no longer requests a non-existent `licensees` column and that the page renders assessment rows/details correctly.

No approval workflow, return submission, or prudential calculation logic will be changed.
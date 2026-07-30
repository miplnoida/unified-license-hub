## Confirmed cause

`APP-2026-000131` is rejected, belongs to the expected applicant account, has a valid `rejected_at` timestamp, and has no existing appeal. The **My Appeals** page still appears empty because its application query requests `applications.licensee_id`, but that column does not exist. The backend rejects the complete query, while the page ignores the returned error and converts it into an empty list.

## Implementation plan

1. **Correct the refused-application query**
   - Remove the nonexistent `licensee_id` field from the applications query and local interface.
   - Continue passing the valid application and regulator identifiers when lodging an appeal; `licensee_id` is optional in the appeal record.

2. **Prevent silent failures**
   - Handle query errors explicitly on **My Appeals** instead of displaying the same “no appeals” state.
   - Show a clear retryable error message if eligibility cannot be loaded.

3. **Clean up the application detail integration**
   - Remove the invalid `app.licensee_id` lookup from the appeal panel invocation.
   - Preserve all existing application, workflow, and appeal behavior.

4. **Verify the affected applicant flow**
   - Confirm `APP-2026-000131` appears under **Applications you can appeal** with its 30-day deadline.
   - Confirm **Lodge an appeal** opens and successfully creates an appeal without requiring a licensee ID.
   - Confirm the lodged appeal replaces the eligibility card and appears in **My Appeals**.
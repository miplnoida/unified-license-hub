# Fix APP-2026-000135 Notification Recipient Routing

## Verified cause

- APP-2026-000135 was successfully submitted at 08:16 UTC and entered workflow step `Step 1`.
- Its configured step uses `specific_users` and names Vidya Rani as the approver.
- The notification dispatcher currently reads only the step's fallback role fields and ignores `approver_type`, `approver_config.user_ids`, and assignment configuration.
- It therefore resolved the fallback `admin` role and delivered the reviewer notification to Shreya Sharma instead of Vidya Rani.
- The applicant confirmation was delivered correctly. The reviewer event was also technically delivered (in-app and email), but to the wrong recipient.

## Implementation

1. Update the shared workflow-step recipient resolver in `dispatch-notification-event` to honor the configured approver mode:
   - `specific_users` → resolve `approver_config.user_ids`.
   - dynamic role configuration → resolve assigned users from the configured role.
   - legacy role fields → retain the existing fallback for older workflows.
2. Ensure `sector_regulators` does not broaden a reviewer event beyond the explicitly configured current-step approver when a specific-user assignment exists.
3. Keep recipient IDs deduplicated so overlapping rules cannot send duplicates.
4. Deploy the corrected dispatcher.
5. Re-dispatch the reviewer event for APP-2026-000135 with a repair-specific idempotency suffix so Vidya Rani receives the missing in-app and email notification without duplicating the applicant confirmation or Shreya's existing records.

## Verification

1. Confirm APP-2026-000135 creates reviewer delivery records for Vidya Rani on both configured channels.
2. Confirm the in-app notification is visible and unread for Vidya Rani.
3. Test recipient resolution for specific-user, role-based, and dynamic-role workflow steps to prevent regression.
4. Confirm no additional applicant notification and no duplicate reviewer notification are created.
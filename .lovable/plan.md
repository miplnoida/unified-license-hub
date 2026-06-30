## Fix: Include `previous_valid_until` and `new_valid_until` in `approve-pre-licensee` renewal response

### Scope
Edit only `supabase/functions/approve-pre-licensee/index.ts` (renewal branch). No SQL, no UI, no workflow, no notification logic changes.

### Change
In the renewal branch, after resolving the original license:

1. Expand the existing license fetch to also select `valid_from` and `valid_until`:
   ```ts
   .select("id, license_number, valid_from, valid_until")
   ```
2. Read renewal metadata from `appData`:
   - `renewed_valid_until = appData.renewed_valid_until ?? null`
   - `previous_valid_until = appData.previous_valid_until ?? null` (leave null if absent — no guessing)
3. Compute `new_valid_until = renewed_valid_until ?? rLicense.valid_until`.
4. Include the new fields in the existing success JSON response:
   ```ts
   return jsonResponse(req, 200, {
     success: true,
     renewal: true,
     message: "License renewed",
     license_number: rLicense.license_number,
     license_id: rLicense.id,
     licensee_id: rLicensee.id,
     valid_from: rLicense.valid_from,
     valid_until: rLicense.valid_until,
     previous_valid_until,
     new_valid_until,
     web_user_created: false,
   });
   ```

### Not changed
- `provision_application_entity` SQL (already returns these — this fix just makes the edge function propagate them).
- `perform-workflow-action` (already dispatches `license.renewed` with payload from RPC result; this just ensures the post-provisioning response is consistent).
- Any non-renewal branch.
- Renewal calculation, license/licensee writes, audit logging.

### Acceptance verification
- Trigger final approval of a renewal application.
- Inspect `approve-pre-licensee` response: contains populated `previous_valid_until` and `new_valid_until`.
- `notification_dispatch_log` row for `license.renewed` shows both fields populated (not undefined/null when metadata is present).
- Non-renewal approvals unchanged.

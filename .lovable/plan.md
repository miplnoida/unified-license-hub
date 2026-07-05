## Plan

Fix the RFI display/status issue without changing unrelated modules.

### What will change
1. **Closed RFI item badges**
   - In the RFI tab, when the parent RFI is `closed` or `cancelled`, unanswered items will no longer show the orange `pending` badge.
   - They will show a neutral closed-state label such as `not responded` / `closed`, matching the existing “This RFI is closed to further responses” message.

2. **Response counter on closed RFIs**
   - Keep the factual response count (`0/2 responded`) visible, but ensure it is not treated as an actionable pending state.
   - If needed, adjust the label to avoid implying an active pending request.

3. **Applicant dashboard action-required cleanup**
   - Update applicant metrics so closed/cancelled RFIs never appear in the dashboard “Action required” list.
   - Add a safety filter so applications in `info_requested` / `query_raised` are not shown as action-required if they no longer have an open/responded RFI.

4. **Close RFI persistence hardening**
   - When staff close an RFI, also mark any remaining `application_rfi_items.response_status = 'skipped'` for that RFI.
   - This prevents stale item-level `pending` values from resurfacing after reloads.

### Files to update
- `src/components/applications/ApplicationRfiTab.tsx`
- `src/hooks/useApplicantMetrics.ts`

### Validation
- Verify the shown closed RFI no longer displays orange `pending` badges.
- Verify closed RFIs are absent from applicant action-required/dashboard pending counts.
- Keep existing RFI raise/response behavior unchanged.
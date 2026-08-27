# Fix the inactive Close complaint action

## Confirmed diagnosis

For complaint **CMP-2026-000122**:

- The final outcome is recorded with status `SUBMITTED`.
- Quality review is approved.
- The mandatory investigation work item is completed.
- The outcome explicitly has `communication_required = true`.
- There is no outbound record in complaint correspondence.

The backend closure rule therefore returns the blocker **“The outcome letter to the consumer has not been issued.”** This is why the button remains disabled. The value entered in **Final communication reference** is closure-review metadata only; it does not create or issue correspondence.

The screenshot also shows that this blocker is not being surfaced next to the disabled button, leaving only the generic “remaining workflow/domain requirement” message. The button is not being disabled by frontend RBAC.

## Implementation

1. Keep the governed backend closure requirement unchanged; do not bypass the required consumer communication.
2. Make the Closure & QA screen use one authoritative readiness result and display every backend blocker immediately beside the close action.
3. When the blocker is the missing outcome letter, show a direct **Issue outcome letter** action using the existing governed `complaint_outcome_letter_issue` flow.
4. Clarify that **Final communication reference** is an optional audit reference and does not itself send or record the required letter.
5. After the outcome letter is issued, invalidate/refetch closure readiness so **Close complaint** becomes active immediately when no other blockers remain.
6. Remove the misleading generic Current step guidance for this condition; Current step remains guidance only and no new Close, Resolve, or Forward workflow actions will be added.

## Verification

- Reproduce the not-ready state for CMP-2026-000122 and confirm the missing-letter blocker is visible.
- Issue an outcome letter through the governed action and confirm an outbound correspondence record is created.
- Confirm readiness changes to `READY_FOR_CLOSURE` and the close action enables without reloading.
- Confirm the final close still calls the governed `complaint_close` operation and preserves server-side authorization, QA, redress, work-item, RFI, representation, and correspondence gates.
- Run the focused complaint closure tests and verify the preview build.

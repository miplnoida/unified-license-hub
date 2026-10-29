## ON HOLD — institution application visibility fix

Paused on the owner's instruction. Do not implement Option A or B. Do not touch the applications list, the "open application" check or any related access logic, and do not create or run migrations. Current pre-licensing and post-licensing behaviour stays as it is until further instruction.

### Recorded for future review (not to be changed in this task)
- **Cross-institution access concern:** the portal capability check ignores the institution it is given. Any external user with licensing "view" permission may pass the "open application" check for applications linked to other institutions. This needs a separate review and approval.
- **Why the pre-licensing list is empty:** Rodney Bay's `APP-2026-002011` is recorded against the institution, but the list and the open-application check don't use that link. Its Primary user therefore sees 0 pre-licensing applications.

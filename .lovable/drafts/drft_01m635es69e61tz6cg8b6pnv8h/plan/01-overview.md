# Draft "Anisha" vs Main App – Impact

The main app has no newer changes, so accepting this draft brings in only what's listed below. Accepting does not publish.

## What changes for users
1. **Pre-licensee menus and pages:** licensed-only pages (Returns, Information Requests, Supervisory Actions, My Institution) are hidden from the menu for pre-licensees. If a pre-licensee opens one directly, they see an access notice. Licensees are unaffected.
2. **Pending Payments card:** no longer opens a 404 page; it opens Payments filtered to pending.
3. **"Under Review" status:** applications that have been submitted and are with the regulator show "Under Review" instead of "In Progress", and applicants can no longer edit or continue them. Returned applications and information-request responses still work.
4. **Notifications:** links no longer send applicants to admin pages, and the blank "Outcome" text now shows a fallback.
5. **Licence page:** the background error when a holder views a licence is removed. The message now reads "Certificate not yet issued".
6. **Application detail:** the staff-only automatic check no longer runs for applicants, so the 403 blank screen is gone.
7. **Returns:** staff see read-only submitted answers. Staff opening entity return pages are sent to the regulator returns workspace.
8. **Access requests:** a menu permission is added for the authorised-user request queue.
9. **User Manual:** a small fix for duplicate list entries.

## Server and database parts (higher impact)
- **Certificate service:** now accepts the background job, so certificates can be created. This goes live only if the update on accept succeeds.
- **Submission service:** blocks submitting the same application twice.
- **Two staged database changes**, applied on accept:
  - The notification Export action is allowed in the audit log.
  - The server stops applicants from editing applications that are Under Review.

  Both change live behaviour for everyone.

## Risks to check after accept
- Submit-capable Primary and Secondary users can still edit Under Review applications directly. This was left unchanged on purpose.
- Licensee navigation was checked in the code only, not in the browser.
- Retrying the 17 failed certificate jobs is still a separate step, after the certificate update is live.

## Not included
No role, access-rule or payment changes. Role Not Found and cross-institution access stay on hold. Nothing is published.

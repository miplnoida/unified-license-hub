## Goal
Applicants see their full application history on My Applications (`/applications`), Pre Licensing (`/applications?type=pre`) and Post Licensing (`/applications?type=post`). That covers every status: Draft, Submitted, Under Review, Approved, Rejected, Cancelled and the rest. It also holds whatever happens to the licence later (issued, expired, suspended, revoked). Search, filters, sorting, the details page and staff permissions stay exactly as they are.

## Suspected causes (not yet confirmed)
These come from reading the list page. Step 1 checks each one against real data before any change is made.
1. **Active sector cut.** The selected sector is sent to the server for applicants too, so applications in another sector, or with no sector, drop out.
2. **PPOC/entity scoping.** When a licensee entity is active, the list may scope to that entity and hide applications the user owns personally (or the other way round).
3. **Browser-side Pre/Post guess.** If a row comes back without `request_kind`, the page guesses from `service_id` and can file it under the wrong tab.
4. **Row cap before filtering.** Only the first page of server rows gets filtered, so older applications disappear.
5. **Status exclusions.** Draft/In Progress may be excluded by rules meant for the staff list, and approved/licensed rows may be filtered by licence state.

## Steps
1. **Trace with real data (read-only).** Sign the preview in as an applicant account. Compare the applications the account owns in the backend with what each of the three pages returns. Check them against the list function's definition and record which cause explains each missing row.
2. **Applicant scope = ownership.** For applicant, pre-licensee and licensee audiences, show every application the user owns. Applications of their active PPOC entity are added on top, and never replace the user's own. Sector becomes an optional filter, never a hidden cut. Staff keep today's scoping.
3. **Classification from the server only.** Pre = `request_kind` other than `POST_LICENSE`, Post = `POST_LICENSE`. Rows with no value show on My Applications and are flagged, not dropped.
4. **Full pagination.** Page through every row, or pass the Pre/Post kind to the server, so nothing past the first page is lost. Header counts must match the rows shown.
5. **All statuses and licence states.** Make sure no applicant-side filter removes drafts, cancelled or approved applications, or rows whose licence is expired, suspended or revoked.
6. **Tests.** One test per rule: an owned application stays visible with a different sector selected; an owned application stays visible while a PPOC entity is active; INITIAL goes under Pre only; POST_LICENSE goes under Post only; a draft stays visible; an approved application with a revoked licence stays visible; more than 200 rows are all returned. Then run the full test suite, a typecheck and a browser check of all three pages.

## If the database list function itself is at fault
Its updated version is prepared as a separate, additive change for your approval. Nothing is run and nothing is deployed. Existing records and access rules are not touched.

## Deliverables
Root cause with affected files, summary of fixes, any database change awaiting approval, test results and manual verification steps.

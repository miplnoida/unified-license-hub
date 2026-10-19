## Goal
In the applicant portal, "My Applications" shows every application the signed-in applicant owns, whatever its status. Pre/Post licensing and status stay as optional filters only. They must never hide an application without saying so.

## Why applications can go missing today (from the code)
The list page asks the server for applications, then filters them in the browser:
1. **Sector filter applied to applicants.** The selected active sector goes to the server for every user. An applicant's application linked to another sector (or to no sector) gets dropped.
2. **Pre/Post classification in the browser.** The page decides pre vs post with a fallback rule (`service_id` present means post). If the server row has no `request_kind`, a pre-licensing application can be misfiled as post, or the other way round.
3. **500-row cap before filtering.** With a Pre/Post filter on, only the first 500 server rows get filtered. Anything past that is silently lost.

This diagnosis is not confirmed yet. Step 1 checks it against your own account's real data before any change is made.

## Steps
1. **Check against real data.** Sign the preview in as your applicant account. Compare the applications you own in the backend with what the list returns, using the Pre and Post views and both sector settings. Record which of causes 1–3 explains each missing row.
2. **Ignore sector scoping for applicants.** External users (applicant, pre-licensee, licensee) see all of their own applications in every sector. Internal staff keep sector scoping as it works today.
3. **Use the server's classification.** Make sure each list row carries `request_kind`, and filter Pre/Post only on that value. Show unclassified rows under an "All" view instead of dropping them.
4. **Remove the silent cap.** Send the Pre/Post filter to the server as a parameter (if the existing list function already accepts one), or page through all rows before filtering.
5. **Add an "All" tab** next to Pre/Post as the default view for applicants. The header counts must match the rows shown.
6. **Tests.** Add tests for these rules: an applicant sees their own submitted application with a different sector selected; an application with `request_kind=INITIAL` shows under Pre and not Post; a `POST_LICENSE` one shows under Post; no rows are lost beyond 500.

## Why the error is still showing

I checked the live system. The fix hasn't been applied yet. Database fixes made in a draft are only staged, and they apply when the draft is **accepted**. This draft hasn't been accepted, so saving still refuses applications that were "returned for correction".

## Steps

1. **Accept this draft.** This applies the staged fix: "returned for correction" becomes a status that can be saved. Nothing else in the draft's database changes. Accepting also brings this draft's earlier screen changes into the main project. Accepting does not publish the site.
2. **Confirm the fix is live** with a read-only check of the save rule.
3. **Retest as the applicant** (soufriereteachers.cu@yopmail.com) on APP-2026-002019: Save Draft, then Submit. If a second server check still blocks the submission, fix that check the same way, for this status only.
4. Run the new regression check: the owner can save, and an outsider is still refused.

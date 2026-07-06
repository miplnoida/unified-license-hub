## Goal
Make the Approval Workflows list show the same active workflow data on the BOJ custom domain as it does in the Lovable preview.

## Diagnosis
The screenshot confirms the domain is rendering the workflows page but returning `0` workflows. Since the same regulator and workflow data show correctly in preview, this is most likely one of these:

1. **Published frontend is stale** and still using old workflow filters/query logic.
2. **Published runtime context differs** from preview, such as active regulator, role, or stored session/context state.
3. **Domain-side query is being blocked or filtered** by backend policies/permissions or mismatched workflow type values.

## Plan
1. **First republish the current app build** so the custom domain receives the same frontend code as preview.
   - This is the fastest and least invasive fix.
   - No app code changes are needed if the issue is only a stale deployment.

2. **Before publishing, run/check the security scan requirement.**
   - If critical security findings still block publishing, either fix them or get explicit approval to ignore/manage them.
   - After the blocker is cleared, publish the app.

3. **After publish, verify the BOJ domain workflow page.**
   - Confirm the workflow count is no longer `0`.
   - Confirm active workflows and steps appear.
   - Confirm the same admin account/regulator context is selected.

4. **If the published domain still shows zero after publishing, investigate the domain session/query path.**
   - Compare the workflow list query used by the page against current backend data.
   - Check whether active regulator context is missing or stale on the domain.
   - Check whether workflow `entity_type` / workflow type filters exclude existing records.
   - Check whether backend access policies/grants differ for the signed-in admin role.

5. **Apply a targeted code/backend fix only if verification shows publish alone did not resolve it.**
   - Normalize workflow type filters to include existing active workflow types.
   - Add a fallback for missing active regulator context if appropriate.
   - Fix backend access rules only if the admin role is incorrectly denied workflow rows.

## Expected outcome
The custom domain `/workflows` page should show the existing active approval workflows instead of the empty “No workflows yet” panel.
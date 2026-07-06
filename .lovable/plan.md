## What I found
The backend contains active workflows, including:

- Pre License Approval Workflow
- Post Application Workflow
- Building Society Pre License Workflow
- Complaint Management Workflow
- Registration Workflow
- Return Workflow

They are all under regulator id `8dd8ac87-...` / **Regulator 1**.

The custom domain is likely selecting a different active regulator from browser storage/default ordering. The regulator context currently auto-selects the first active regulator alphabetically when none is stored. In this database, that is **ABC Prudential Authority**, which has no approval workflows, so the page correctly renders but shows `0`.

## Fix plan
1. **Make regulator context self-healing**
   - If the stored regulator id is missing, invalid, or no longer in the active regulator list, replace it with a valid regulator instead of continuing with a stale value.
   - This prevents custom domains from silently querying an empty regulator scope.

2. **Prefer the BOJ/default regulator consistently**
   - Update default regulator selection so the BOJ domain does not accidentally pick the alphabetically first demo/test regulator.
   - Prefer a configured/current regulator when available; otherwise fall back safely.

3. **Improve the workflows page empty state**
   - Show which regulator context is currently being used when no workflows are returned.
   - This avoids the misleading “No workflows yet” message when workflows exist under another regulator.

4. **Make the workflow query wait for valid regulator context**
   - Avoid firing the workflows query before the active regulator has been validated.
   - This prevents a temporary or stale `activeRegulatorId` from caching an empty result.

5. **Verify after implementation**
   - Confirm the workflows page queries the regulator that actually owns the workflows.
   - Confirm the list shows the existing active workflows instead of `0`.
   - Republish again after the code fix so the custom domain receives it.

## Expected result
The BOJ domain `/workflows` page will show the existing active approval workflows instead of the empty panel.
## What is causing the error

This is now clearly **not a signature payload size issue**.

The registration approval function uses a shared CORS allowlist in `supabase/functions/_shared/cors.ts`. That allowlist currently permits:

- localhost
- `*.lovable.app`
- `*.lovableproject.com`
- `*.lovable.dev`

It does **not** permit the custom published domain:

- `https://boj.skntreasury.com`

So the same action works on the Lovable URL but fails on the custom published URL because the browser blocks the edge-function request during CORS/preflight. In the app this appears as:

`Failed to send a request to the edge function`

The secret list also shows no `ALLOWED_ORIGINS` secret is configured, so the function is using the default allowlist only.

## Fix plan

### 1. Add the custom published domain to the backend CORS defaults
Update `supabase/functions/_shared/cors.ts` so the default allowed origins also include:

- `https://boj.skntreasury.com`

I will keep the existing Lovable domains untouched.

### 2. Add a regression test for the custom domain
Update `supabase/functions/_shared/cors_test.ts` to assert that:

- `https://boj.skntreasury.com` is allowed
- unknown external domains remain blocked

### 3. Redeploy the impacted function(s)
Because this is shared backend code, redeploy at minimum:

- `perform-registration-workflow-action`

If other edge functions are also called from the custom domain, they use the same shared CORS helper and may need redeploy too. I will prioritize the registration approval function because that is the broken flow.

### 4. Verify
After implementation:

- Test the approval/reject action from the custom published domain.
- Confirm OPTIONS preflight returns `Access-Control-Allow-Origin: https://boj.skntreasury.com`.
- Confirm the action request reaches `perform-registration-workflow-action` instead of failing before the function runs.

## What I will not change

- No permission/role logic changes.
- No workflow RPC/database changes.
- No signature payload resizing.
- No changes to the Supabase client.
- No workaround like overriding `window.fetch`.

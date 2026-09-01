# Fix "Failed to send a request to the edge function" on registration actions

## What is actually happening

The registration Approve button does reach the backend function, but the browser blocks the response before your app can read it. Verified just now against the live backend:

- Preflight from `https://uni-role-verse.lovable.app` → `access-control-allow-origin: https://uni-role-verse.lovable.app` (allowed).
- Preflight from `https://olras.mishainfotech.com` (your custom domain) → `access-control-allow-origin: null` (denied).

The function itself is healthy — a direct POST returns a normal JSON `401 UNAUTHORIZED` response, so it boots and runs fine. The failure is purely the shared browser-origin allowlist: the custom domain is not on it, so every browser call from `olras.mishainfotech.com` fails with the generic "Failed to send a request to the edge function" message.

This affects every edge function that uses the shared CORS helper, not just registration. Approving on step 1 is simply where you hit it first.

## Fix

Single change in the shared CORS allowlist (`supabase/functions/_shared/cors.ts`):

1. Add the project's own custom domain `olras.mishainfotech.com` (including subdomains) to the default allowed-origin patterns, alongside the existing localhost / `lovable.app` / `lovableproject.com` / `lovable.dev` entries.
2. Remove the stale hardcoded third-party host `boj.skntreasury.com`, which is unrelated to this deployment.
3. Keep the existing behaviour intact: the optional `ALLOWED_ORIGINS` secret still overrides the defaults when set, unknown origins still get `null`, and no per-function code changes.

No changes to registration workflow logic, permissions, the RPC, notifications, or any other function.

## Verification

- Re-run the preflight check for `https://olras.mishainfotech.com` and confirm the response echoes that origin instead of `null`.
- Confirm the lovable preview and published origins still return their own origin.
- Confirm a direct POST still returns the normal JSON envelope (no behaviour change).
- Typecheck + build.

# Fix: CAPTCHA "Could not save configuration (unexpected error)"

## What is actually wrong

Two confirmed backend issues, plus one reason the error message is useless:

1. **No Data API grants on the CAPTCHA tables.** `captcha_configurations`, `captcha_secrets`, and `captcha_verifications` have zero table grants for `authenticated` / `service_role`, so the insert from the settings page is rejected by the Data API before RLS is even considered. The admin policy on `captcha_configurations` is correct — it just can't be reached.
2. **`score_threshold` is NOT NULL (default 0.5), but the form sends `null`** for every provider other than reCAPTCHA v3, so even with grants the insert would fail with a null-violation.
3. The save handler reports "Unexpected error" because database errors are plain objects, not `Error` instances, so the real message is discarded.

## Changes

**Migration**
- Grant `SELECT, INSERT, UPDATE, DELETE` on `captcha_configurations` to `authenticated`, and `ALL` to `service_role` (all policies are admin-scoped, so no `anon` grant).
- Grant `ALL` on `captcha_secrets` and `captcha_verifications` to `service_role` only (client access stays denied by policy).
- Make `score_threshold` nullable so non-v3 providers can store no threshold; keep the 0.5 default. Verification already falls back to 0.5 when the value is absent.

**Settings page (`src/pages/settings/CaptchaSettings.tsx`)**
- Surface the real failure reason in the toast (message from the database/function error) instead of a blanket "Unexpected error".

## Verification
- Re-check grants and column nullability after the migration.
- Create a configuration (non-v3 and v3) from `/settings/captcha` and confirm it saves, the secret is stored via the function, and the row appears in the list.

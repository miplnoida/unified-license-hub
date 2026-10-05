# SEC-CRED-01 — Legacy Account Credential Rotation & Provider Secret Externalisation

## A. Verdict
**CONDITIONAL PASS — BLOCKED ON PROVIDER-SIDE SECRET ROTATION.**

All in-application controls are complete. The SMTP (Gmail app-password) credential that was once committed to source control is still the live credential. It must be revoked and replaced at the provider by the owner (see H). Until that happens, the credential issue is not closed.

## B. Registration-account classification
| Reference | Classification | Evidence | Action | Sessions | Notification |
|---|---|---|---|---|---|
| REG-2026-000196 | TEST_DISPOSABLE | Applicant name "TEST SEC-CRIT-01A…"; plus-addressed certification email; created 2026-10-05 by SEC-CRIT-01A; never signed in; no applications | Auth account disabled through the supported `toggle-user-status` admin function (ban); registration preserved | 0 active sessions/tokens before and after | None |
| REG-2026-000051 | GENUINE_ACTIVE | Named MIPL staff mailbox; registration approved; signed in 2026-08-31; holds a draft application and applicant/pre_licensee roles | Account kept active; fresh password required via the standard auth recovery flow | 0 active sessions/refresh tokens (nothing to revoke) | One password-recovery email via the platform auth provider (`/forgot-password` → auth recover), 2026-10-05T20:07:36Z, HTTP 200 (accepted). Recipient: the account's own registered address |

No passwords or hashes were read.

## C. Historical credential census
`password`, `confirm_password` and `confirmPassword` in registration data: **0**. Workflow, audit and form snapshots: **0**. `config_change_log`: **0**.

## D. Provider architecture before remediation
- `site_settings.email_sms_settings` held the SMTP host/port/user **and the password**, plus an SMS `apiKey` field. That row was readable by settings administrators in the browser.
- `_shared/email-provider.ts`, `test-smtp-email` and `notification-status` read the password from that row.
- The Resend key was already server-only (`email_provider_secrets`, then `RESEND_API_KEY`).

## E. Secret exposure locations
| Location | Category | Status |
|---|---|---|
| `supabase/baseline/seed/site_settings.csv` | SMTP password | Removed from current source; still present in Git history (rotation required) |
| `site_settings.email_sms_settings` (live database) | SMTP password | Removed |
| `config_change_log` (3 rows) | SMTP password copies | Removed |
| SMS `apiKey` | Empty | Field removed |

## F. Secure secret architecture
- Secrets live only in `email_provider_secrets`. That table has no browser grants: only the service role can use it, and access to it from `anon` and `authenticated` was revoked.
- `readProviderSecret()` reads `smtp_password` or `sms_api_key` from that table, falling back to the `SMTP_PASSWORD` platform secret.
- The runtime never reads secrets from `site_settings`. SMTP is reported as unusable (fail closed) when no secret is present.

## G. Database/source cleanup
- Migration (SEC-CRED-01) copied the existing value server-side without writing it into any SQL text. It then stripped the secret fields from the settings and their history, and added the guard. A follow-up migration removed one remaining history copy.
- The seed CSV has the fields removed.

## H. Provider rotation/revocation
- Old credential rotated/revoked: **NO**
- New credential exists only in secure storage: **NO**. The old value currently sits in secure storage.

**Owner action:**
1. In the Google account behind the SMTP user, create a new App Password.
2. Enter it under Settings → Email & SMS → SMTP password, then Save. It goes write-only to the server.
3. Send one test to an approved MIPL address.
4. Revoke the old App Password in Google.

## I. Admin UI behaviour
- The screen shows only whether a secret is configured. Secret inputs are write-only ("Leave blank to keep existing password").
- Saving ordinary settings never touches the secret.
- Browser check as super admin: 6 settings and secret-store responses contained no secret.

## J. Secret-persistence prevention
- Trigger `site_settings_no_provider_secrets` rejects `smtp.password`, `sms.apiKey` and `resend.apiKey` in `email_sms_settings` with the error `PROVIDER_SECRET_FORBIDDEN_IN_SETTINGS`.
- The browser save strips these fields.
- Test file: `src/test/secCred01ProviderSecrets.test.ts`.

## K. Repository credential scan
Scanned for provider tokens, cloud keys, private keys and literal secret assignments. The only hit is a UI placeholder in `src/pages/settings/IntegrationSettings.tsx` (example text, not a key), which is a false positive. The seed SMTP password is removed.

## L. Tests
- Typecheck: clean.
- Vitest: 185 files, **1774/1774** passed.
- Playwright (authentication, audience boundary, server enforcement): **27/27** passed.
- Settings-screen secret check: passed.

## M. Security scan
Fresh scan: **0 critical, 18 warnings, 41 info**. The publish gate's figure of 60 is stale saved state from 2026-09-11.

## N. Publish/live smoke
Publish was requested for olras.mishainfotech.com. `/`, `/login`, `/register`, `/settings/email-sms` and `/supervision/aml/assessments` all returned HTTP 200.

Edge functions redeployed: send-notification, send-registration-otp, test-resend-email, test-smtp-email, notification-status. The recovery email was accepted, so no missing-secret error occurred on the normal path.

## O. Protected AML non-impact
00830, 00836 and 00838 have unchanged timestamps. FSRA, STR_SAR_GOVERNANCE and AML evidence were not touched. No SMS was sent.

## P. Final answers
- Do registration records contain plaintext passwords? **NO**
- Are both historical accounts handled according to their classification? **YES**
- Is any active provider secret in ordinary database configuration? **NO**
- Is any active provider secret in current Git source? **NO**
- Has the previously committed credential been revoked/rotated? **NO** (owner action at Google)
- Does the runtime get secrets only from secure server-side storage? **YES**
- Can the settings UI retrieve the secret? **NO**
- Is the fresh scan at zero critical? **YES**

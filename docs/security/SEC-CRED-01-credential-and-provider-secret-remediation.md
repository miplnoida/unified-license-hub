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

## Q. Provider-side credential rotation closure (verification 2026-10-05 20:50 UTC)
| Item | Result |
|---|---|
| New Google App Password created | Owner reports YES |
| Replacement stored in secure server-side storage | **NOT EVIDENCED**: the only `smtp_password` entry was last written at 20:03:54 UTC by the SEC-CRED-01 migration (the old value), with no admin author. No secret-store update has been logged since |
| Test email delivered with replacement | **NOT EVIDENCED**: no email delivery records since 20:00 UTC |
| Old Google App Password revoked | OLD PROVIDER APP PASSWORD: REVOKED BY OWNER (owner statement) |
| Post-revocation application email delivered | NOT EVIDENCED |
| Ordinary DB secret count | 0 (settings 0; change history 0) |
| Registration plaintext credentials | 0 |
| Git active-secret count | 0 (the only seed matches are form-field type definitions named "password", which are not secrets) |
| REG-2026-000196 / REG-2026-000051 | Login disabled / account active; no further email sent |
| Focused tests | 2 files, 7/7 passed |
| Protected AML 00830/00836/00838 | Unchanged |

## R. Final verdict
**SEC-CRED-01 = CONDITIONAL PASS (unchanged).** If the old password has been revoked, the app is still holding the revoked value, so outgoing SMTP email will fail until the replacement is entered. The package closes as PASS once:
1. the new App Password is saved through Settings → Email & SMS → SMTP password; and
2. one test email is received at the approved MIPL mailbox.

## S. Final verification attempt (2026-10-05 21:00 UTC)
| Check | Result |
|---|---|
| Secure SMTP secret updated after 20:03:54 UTC | **NO**: still 20:03:54 UTC, no admin author |
| Settings/secret save recorded in change history after 2026-08-31 | **NO** |
| Test-email function invoked (function logs) | **NO** log entries |
| New email delivery record since 20:03 UTC | **NONE** |
| Ordinary settings / settings history / registration password counts | 0 / 0 / 0 |
| Active SMTP credential in Git source | 0 |
| UI read-back of secret | Not possible (no browser grants on the secret store) |
| REG-2026-000196 disabled / REG-2026-000051 active | YES / YES |
| 00830 / 00836 / 00838 | Unchanged |

**Verdict: SEC-CRED-01 remains CONDITIONAL PASS.** This backend holds no evidence that the replacement password was saved or that a test email was sent. The save was probably made in a different environment, or it failed silently. PASS is not claimed.

## T. Final verification attempt 2 (2026-10-05 21:05 UTC)
- The owner reports a successful save and a received test email at olras.mishainfotech.com. The live site uses this same backend; this was checked from the live bundle.
- Secure SMTP secret: still `updated_at` 20:03:54 UTC with no admin author. The replacement is **NOT stored**.
- `email_sms_settings` last saved 2026-08-31. No settings or secret change logged since then. No test-email function logs. No email delivery records since 20:03 UTC.
- Hygiene unchanged: registration, settings and history secret counts are 0/0/0; REG-196 is disabled; REG-051 is active; no further reset email was sent; 00830/00836/00838 are unchanged.
- No security rescan was run, because no secret or code changed.

**Verdict: SEC-CRED-01 remains CONDITIONAL PASS.** The owner's confirmation conflicts with the system records, so PASS cannot be evidenced.

# SEC-CRED-01A — Verified Secret Save Path & SMTP Test Authority

## Q. Secret-save-path diagnosis
- The live bundle already contained the secure-storage save code. The backend recorded **no** secret write, settings save or test-email run after 20:03 UTC, so no save reached this backend.
- The old flow had three gaps:
  1. The success message relied only on the request not erroring; there was no read-back proof.
  2. Send Test Email could use an unsaved password typed in the browser.
  3. Test attempts left no record.

## R. Save acknowledgement design
- `email_provider_secret_status(key)` returns only `configured`, `updated_at` and `updated_by`. It is gated by settings.edit; PUBLIC and anon are revoked.
- `email_provider_secret_set` now returns the same acknowledgement.
- The client reads status before the write, calls the setter, then reads status again. It accepts the save only if the secret is configured, the new `updated_at` is strictly later than before, and the updater is the current user. Otherwise it shows "SMTP password was not saved. Existing credential remains unchanged.", keeps the typed value, and shows no success message.
- The SMTP section shows server-backed "Password: Configured · Last changed: …".

## S. SMTP-test authority change
- `test-smtp-email` ignores every browser-supplied SMTP field and password. It uses the saved settings plus the password from secure storage only, and fails closed with "not configured in secure storage" when the password is missing.
- The browser sends only `{ to }`. The test button is disabled while a new password is typed but not yet saved.

## T. Test-email audit evidence
- New table `email_provider_test_log` records the invoking user, recipient, provider, status (ACCEPTED/FAILED), failure category, provider message ID, and the timestamp of the secret used.
- It never stores the password. Only settings administrators can read it. Failed attempts are logged too.

## U. Deployed build/environment verification
- The settings page shows "Build <commit> · built <time> · backend <project id>".
- After publishing, the live page `EmailSmsSettings-D-lQZSls.js` carries build marker **433c43e**, which matches the current source revision, and backend `sndfttzqmbkmkcnrvpfn`.

## V. Automated test results
- Vitest: 186 files, **1782/1782** passed. The new file `secCred01aSecretSavePath.test.ts` (8 tests) covers save proof, failed save, unchanged timestamp, metadata-only status, a password-free test request, unsaved-password gating, stored-secret authority, and audit without secrets.
- Typecheck: clean.
- Direct denial checks, all refused (HTTP 401, 42501): anon status query, applicant status query, applicant secret write.
- Admin status returns metadata only. Admin direct table read is refused (403).

## W. Owner action required
1. Hard-refresh `olras.mishainfotech.com/settings/email-sms` and confirm it shows **Build 433c43e**.
2. Enter the replacement Google App Password and click **Save Changes**.
3. Confirm "Last changed" shows a NEW time later than 05 Oct 2026 20:03 UTC.
4. Reload the page and confirm the same time persists.
5. Click **Send Test Email** and confirm receipt.

**Verdict: CONDITIONAL PASS — awaiting owner entry of the replacement Google App Password through the newly verified save path and a successful server-stored SMTP test.**

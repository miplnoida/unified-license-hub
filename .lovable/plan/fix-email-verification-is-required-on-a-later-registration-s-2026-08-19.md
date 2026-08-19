# Fix "Email verification is required" on a later registration step

## What's actually happening (verified)

- `useRegistrationForm` restores the saved registration draft from session storage but deliberately overwrites `emailVerified: false` on every restore (`useRegistrationForm.ts` line 90).
- The only code that can set `emailVerified` back to `true` lives inside `EmailVerificationSection` — it checks a session marker and asks the server whether the email is already verified, but **only while that component is mounted**.
- Verification is configured on step 2, so the section is not mounted on step 4. After any page refresh (or a fresh render of a later step), the flag is `false`, and `validateDeclarations` / the submit gate raise "Email verification is required".
- Going Back re-mounts the verification stage, the server/marker check flips the flag to `true` again, and Next then works — which is the confusing behaviour reported.

## Fix

Make verified state survive independently of which step is on screen:

1. **Rehydrate at the page level.** In `PreLicenseeRegistration`, on mount and whenever the resolved login email changes, restore `emailVerified` from the per-email session marker and from the existing server `checkOnly` lookup. This is the same check the section already performs, just hoisted so it runs on every step.
2. **Persist the flag with the draft.** Stop blanking `emailVerified` on session restore; instead restore it only when the saved email matches the currently resolved login email, so a changed email still resets verification (current behaviour is preserved).
3. **Keep the section as the only OTP UI.** `EmailVerificationSection` keeps its send/verify logic and its email-change reset; it will simply read the already-restored flag instead of being the sole source of it.
4. **Don't show a stale blocking toast.** While the page-level restore check is in flight, the Next/Submit gate waits for it rather than immediately failing with "Email verification is required".

Net effect: the email is verified once at the configured step, and step 4 / submit accept it — including after a refresh — without the user having to navigate backwards.

## Technical notes

- Extract the verified-marker key helper and the server `checkOnly` lookup out of `EmailVerificationSection.tsx` into `src/lib/registrationEmail.ts` (or a small sibling module) so both the page and the section use one implementation.
- `useRegistrationForm.ts`: replace the unconditional `emailVerified: false` with a match against the persisted email; expose a small `hydratingEmailVerification` flag if needed for the gate.
- `PreLicenseeRegistration.tsx`: add the hoisted restore effect keyed on `resolveRegistrationLoginEmail(...)`; no change to placement logic or step generation.
- Tests: extend `src/test/registrationLoginEmailVerification.test.ts` with cases for restore-after-refresh on a later step, and reset when the login email changes.

## Verification

Typecheck plus the registration test suites, and a live walkthrough of `/register`: verify at the configured step, advance to the last step, refresh mid-flow, and confirm Next/Submit no longer demand re-verification; then change the login email and confirm verification is required again.

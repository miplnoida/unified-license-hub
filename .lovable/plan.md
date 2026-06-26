## Problem

On the public registration form (`/register`), Step 1, after entering an email and clicking **Next**, the user gets the toast **"Please wait — verifying email availability…"** and is blocked from advancing.

Root cause in `src/pages/registration/PreLicenseeRegistration.tsx`:

- The hook `usePrimaryUserEmailUniqueness` debounces 500ms before calling the RPC `check_primary_user_email_exists`, and synchronously sets `status = 'checking'` the moment `effectiveEmail` changes.
- `handleDynamicFieldBlur` separately fires the same RPC on blur and sets `pendingPrimaryEmailChecks[fieldName] = true` until it resolves.
- `handleNext` (line 535) and `handleSubmit` (line 710) hard-block with that toast whenever `status === 'checking'` OR `hasPending` is true.
- A user typing an email and immediately clicking Next is inside the 500 ms debounce window (or the ~200–500 ms RPC roundtrip), so they hit the block even though the email is fine.

The RPC works (verified in DB) and the duplicate-detection logic itself is correct — only the UX of the "still checking" gate is wrong.

## Fix (minimal, frontend-only)

Replace the synchronous toast-and-return guard with an **await-the-check** flow. No DB, no schema, no other workflows touched.

### File: `src/pages/registration/PreLicenseeRegistration.tsx`

1. Add a small helper `ensurePrimaryEmailResolved(currentDynamicStep)` that:
   - Resolves the primary-email field on the current step (uses existing `getPrimaryEmailFieldsForStep`).
   - If `emailUniqueness.status === 'checking'` or any `pendingPrimaryEmailChecks[fieldName]` is true, **awaits** until they settle (poll a ref every 100 ms with a hard timeout of ~4 s).
   - On timeout, fall back to a single direct `supabase.rpc('check_primary_user_email_exists', { p_email })` call to get a definitive answer and update `dynamicErrors` accordingly.
   - Returns `{ duplicate: boolean }`.
2. In `handleNext` (line 532-553):
   - Remove the early `toast.error('Please wait — verifying email availability…')` return.
   - Before `setCompletedSteps`, `await ensurePrimaryEmailResolved(...)`. If `duplicate`, show the existing `DUPLICATE_PRIMARY_EMAIL_SUBMIT_ERROR` toast and stop. Otherwise advance.
   - While awaiting, set a local `isAdvancing` state to disable the Next button and show a subtle spinner (reuse existing button loading pattern).
3. In `handleSubmit` (line 707): apply the same await-then-decide change for the final submit click.
4. Keep the existing `validateCurrentStep`, duplicate-error toast, and `emailUniqueness.status === 'taken'` short-circuit intact — they still run after the await.

### Out of scope (do not touch)

- `usePrimaryUserEmailUniqueness.ts`, `primaryEmailValidation.ts`, RPC, schema, migrations.
- `RegistrationStepRenderer`, `DynamicRegistrationStepper`, `FormRenderer`.
- Applicant-name uniqueness, OTP/CAPTCHA, document upload, save-draft, resubmit, declarations, review acknowledgement.
- Admin form builder, generic application/return/workflow forms.

## Verification

1. `/register` → Step 1 → type a fresh email → immediately click **Next**: button briefly disables (≤ ~500 ms), step advances, no false toast.
2. Type a known-existing email → click Next: inline field error + duplicate toast, step does not advance.
3. Slow-network simulation (3G): Next button shows spinner until RPC resolves, then either advances or shows duplicate error.
4. Final Submit on last step behaves identically.
5. Save Draft, resubmission deep-link, OTP verify, document upload, and admin preview unaffected.
6. `tsgo` typecheck passes.

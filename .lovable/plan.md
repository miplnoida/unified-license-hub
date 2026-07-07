## Goal
On the public applicant registration flow, the final "Review & Submit" step currently lists every form field including **Password** and **Confirm Password** (shown as plain digits in the summary). Hide those two fields from that review summary — they are for account creation only, not for display.

## Change

**File:** `src/pages/registration/PreLicenseeRegistration.tsx`

In `buildReviewSections()` (schema-driven branch, ~line 1109), skip password and confirm-password fields when building the review list. Uses the existing helpers already imported at the top of the file:

- `isRegistrationPasswordField(field)`
- `isRegistrationConfirmPasswordField(field)`

Insert an early `return` inside the `s.rows.forEach(...c.field...)` loop, right after the display-only handling and before the attachment/value push:

```ts
if (isRegistrationPasswordField(f) || isRegistrationConfirmPasswordField(f)) return;
```

That's the only change. Password entry fields still appear during the actual form steps, values are still captured and submitted for account creation — they just don't render on the Review page.

## Out of scope
- Admin-side review screens (already filter password via `SENSITIVE_DYNAMIC_KEYS` in `BackgroundInfoTab`).
- Registration form builder / admin preview page.
- Field editor defaults (password field stays in the form config).

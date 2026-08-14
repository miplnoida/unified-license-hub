# Registration verification code not arriving — diagnose and harden

## What the data shows (verified)

- The code-generation step is still working: OTP rows were created today at 11:22 and 11:24 UTC for `entity4@yopamil.com` and `user4@yopamil.com`, both still unverified. Earlier attempts on 13–14 Aug (`entity2@yopmail.com`, `entity3@yopmail.com`, `vidya04@yopmail.com`) were created **and verified**, so sending was working within the last 24 hours.
- Mail settings are unchanged since 5 May 2026: Gmail SMTP relay (`smtp.gmail.com:587`, TLS) with a from-address on a different domain. Host, user, password and from-address are all present, and sending is enabled.
- The registration screen already surfaces the real send error as a toast when the send fails, so a silent "code sent" message means the mail server accepted the message.
- The two failing attempts used the domain **`yopamil.com`**, not the `yopmail.com` domain used by every successful earlier test. That domain looks like a typo, in which case the message can never be delivered.

## Diagnosis status

Not yet confirmed. Two plausible causes, and they need to be separated before any change:

1. **Wrong recipient domain** (`yopamil.com` vs `yopmail.com`) — mail accepted by the relay, then dropped/bounced. Nothing is broken in the app.
2. **Gmail relay now rejecting or throttling** the send (app-password revoked, daily limit, or from-address mismatch policy). This would show up as a send error, which today is only visible in the toast at the moment of sending and is not recorded anywhere.

Right now there is no stored record of what the mail server replied, which is why the cause cannot be settled from data alone.

## Plan

1. **Confirm the cause first.** Trigger a send to a known-good mailbox (`...@yopmail.com`) and to the exact address that failed, and capture the mail-server response. If the good address arrives and the typo address doesn't, cause 1 is proven and no code change is needed beyond step 2. If both fail, the Gmail relay credentials/limits are the cause and must be re-authorised in Settings → Email & SMS.

2. **Record every code-send outcome.** Add a delivery outcome (accepted / failed plus the server message and timestamp) against each verification-code request, so a "no email arrived" report can be answered from data instead of guesswork. Keep the code itself unrecorded — only the send result.

3. **Make the failure visible in the flow.** When the mail server rejects the send, keep the existing error toast but also show a persistent inline message on the verification step with the reason and a retry action, so the user isn't left waiting for an email that was never sent.

4. **Guard against the typo class of failure.** Show the exact address the code was sent to on the verification step (with a "wrong address? go back and edit" link) so a mistyped domain is caught immediately instead of after several failed attempts.

## Out of scope

No change to code generation, hashing, expiry, rate limiting, verification logic, or any other notification event.

## Technical notes

- Function: `supabase/functions/send-registration-otp/index.ts` (SMTP send block) — add outcome persistence and return the provider message on failure.
- Table: extend the existing verification-code table with delivery-status columns via migration (no new public-facing table).
- Frontend: `src/components/registration/DeclarationsStep.tsx` — inline failure banner, sent-to address display, retry.
- Mail transport stays the configured SMTP relay from Settings → Email & SMS; no provider switch.

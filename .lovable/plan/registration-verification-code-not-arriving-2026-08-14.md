# Registration verification code not arriving

## What the data shows (verified)

- Code generation still works. Two codes were created today at 11:22 and 11:24 UTC for `entity4@yopamil.com` and `user4@yopamil.com`, both still unverified.
- Earlier attempts on 13–14 Aug (`entity2@yopmail.com`, `entity3@yopmail.com`, `vidya04@yopmail.com`) were created **and verified**, so sending was working within the last 24 hours.
- Mail settings are unchanged since 5 May 2026 and complete (SMTP relay, TLS, from-address, credentials, sending enabled).
- The registration screen already surfaces the real send error as a toast, so a "code sent" confirmation means the mail server accepted the message.
- The two failing attempts used the domain **`yopamil.com`** instead of `yopmail.com`. That domain does not receive mail, so the message could never be delivered. This is the cause.
- `yopamil.com` appears **only** in those two verification-code rows — no account, profile or registration record uses it.

## Requested change: correct the two addresses

Update the two verification-code rows so the address reads `entity4@yopmail.com` and `user4@yopmail.com`.

Important: this is a records-only correction. Both codes were issued at 11:22 / 11:24 UTC and expire 10 minutes after creation, so they are already expired and rewriting the address will not cause an email to be sent. To actually receive a code, the registration step must be re-run with the corrected address — the corrected rows just stop the stale typo entries from looking like failed deliveries.

## Preventing a repeat

On the verification step, show the exact address the code was sent to, with a link back to correct it, so a mistyped domain is caught immediately instead of after several silent failures.

## Out of scope

No change to code generation, hashing, expiry, rate limiting, verification logic, mail settings, or any other notification event.

## Technical notes

- Data update on the verification-code table for the two affected rows only.
- Frontend: `src/components/registration/DeclarationsStep.tsx` — display the sent-to address plus an edit link.

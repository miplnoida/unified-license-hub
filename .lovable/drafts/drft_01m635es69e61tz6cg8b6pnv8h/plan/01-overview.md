# Licence Certificate Not Downloadable – Fix

## Why the message appears
The download button works, but there is no certificate file to download.

- No licence in the system has a certificate. All 119 licences have zero, including Rodney Bay's `LIC-2026-000166`.
- When a licence is issued, a background job is supposed to create the certificate PDF. All 17 of these jobs failed 8 times, with the error "Edge Function returned a non-2xx status code", and were then abandoned. The latest failure was on 22 Oct for LIC-2026-000166.
- Because no file exists, the download returns "not found" and the applicant sees the fallback message. This draft already changed the wording to "Certificate not yet issued by the regulator"; the live app still shows the old "being prepared" text.

**Confirmed:** the certificate service rejects the background job's request.
**Not yet confirmed:** the exact reason. The most likely cause is that the service does not recognise the job as a trusted system call, so it applies the user-permission check and refuses. Step 1 checks this.

## Steps
1. **Diagnose (read-only):** add temporary safe logging, or read the existing logs, to capture the status code and reason when the background job calls the certificate service.
2. **Fix the trust check** in the certificate service so internal system calls (the issuance job and the renewal path in pre-licensee approval) are accepted. Holder downloads keep their current rule: they can only download their own licence's certificate and can never generate one.
3. **Re-queue failed jobs:** after you approve, move the 17 abandoned certificate jobs back to pending so the worker regenerates the certificates. This writes to live data, so I will ask you first.
4. **Verify:** sign in as `rodneybay.registration@yopmail.com`, open My Licences → LIC-2026-000166 and click Download Certificate. A PDF should download.

## Out of scope
- The 17 failed "portal access" jobs fail with the same error and probably have the same cause. I will report on them and not change them.
- No changes to roles, access rules, payments, the workflow, or the on-hold items (Role Not Found, cross-institution access). Nothing is published.

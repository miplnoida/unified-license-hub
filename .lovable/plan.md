# Fix licence certificate downloads for licensees

## What I found (read-only checks)
- Licensees can only download a certificate the regulator has already created. They cannot create one themselves.
- **No licence in the system has a certificate on record right now.** All 116 active licences have none, including Rodney Bay `LIC-2026-000166`. So every licensee download returns "Certificate not yet issued".
- Certificate creation has been failing since **20 Aug 2026**. That's the date of the newest stored PDF file. 34 older PDF files are still in storage, but none of them is linked to a licence record.
- Automatic creation at licence approval also fails. All 17 queued "create certificate" jobs gave up with "Edge Function returned a non-2xx status code". The approval step only tries once and ignores errors, so failures go unnoticed.

I haven't confirmed the exact cause yet. The most likely cause is that the certificate service rejects the system's own internal calls during its access check. That would block creation both at approval time and in retries. The first step below confirms the cause before I change anything.

## Steps
1. **Confirm the cause.** Sign in as a Super Admin in the app and trigger a certificate for `LIC-2026-000166` the normal way (Licences → Certificate). Then read the service's response and logs to get the actual error.
2. **Fix the cause in the certificate service.** Likely fixes:
   - accept trusted internal calls (licence approval, retry worker) reliably
   - make sure the regulator's certificate permission is checked correctly for staff
   - report the real error instead of failing silently

   The rule stays the same: licensees can only download, never create, sign or send.
3. **Make failures visible.** Licence approval and renewal record a failed certificate attempt as a retry job, instead of quietly ignoring the error.
4. **Create the missing certificates.** After the fix, a Super Admin creates certificates for active licences through the normal staff action. I'll start with Rodney Bay `LIC-2026-000166` and then do the rest. The 17 failed retry jobs are re-queued so the retry worker can finish them. No licence dates, statuses or records are changed.
5. **Check it as a licensee.** Sign in as `rbc_primary_user@yopmail.com` and download the certificate from both the licence list and the licence detail page. Confirm the PDF opens. Then confirm an unrelated licensee still cannot download it.

## Not changing
- Who can view or download a certificate: holder, primary/secondary users and authorised staff.
- Licence data, workflow, payments, or any other module.

## Technical notes
- The `license_certificates` table has 0 rows. The `license-certificates` storage bucket has 34 objects, the last on 20 Aug 2026. In `licensing_provisioning_outbox`, `license_certificate` has 17 jobs, all `dead_letter`.
- Areas to check: `requireWorkerInvocation` in `generate-license-certificate`, and the `requireUserPermission(license_management, manage_certificates)` fallback. Service-to-service `functions.invoke` may not present the service key in the expected form.
- In `approve-pre-licensee` (issuance and renewal), replace the fire-and-forget call with an outbox enqueue when it fails.
- Re-queuing dead-letter jobs is a data update: it resets status and attempts on the 17 rows, and I'll ask for your approval before doing it.
- If step 1 shows something that needs a database permission change, I'll show you the exact change and get your approval first.

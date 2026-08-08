# Auto-create the license certificate when a licence is issued

## What is happening now (verified)

The "Certificate Signing" card reads the latest row in the certificate registry for the licence. That registry row is only written when someone presses **Download Certificate** on the licence page — nothing creates it when the entity/licence itself is approved and created.

Current data confirms this: 21 licences exist, but only 10 of them have any certificate record. For the other 11 the panel correctly (but confusingly) says "No certificate has been generated yet."

So this is not a display bug — the certificate genuinely does not exist yet for those licences.

## What to change

1. **Generate the certificate automatically at licence issuance.** When a licence record is created/activated by the approval flow, trigger certificate generation (version 1, status `draft`) so the signing panel has something to work with immediately.
2. **Backfill the 11 existing licences** that have no certificate record, so historical licences behave the same as new ones.
3. **Improve the empty-state copy** for the rare case where generation has not run yet: instead of only pointing at "Download Certificate", show a clear status line plus a **Generate Certificate** button directly in the Certificate Signing card (visible to the roles already allowed to sign), so the action is where the user expects it.
4. **Make the panel refresh** after generation so the version/status/signature ledger appears without a page reload.

## Technical notes

- Certificate creation is done by the existing `generate-license-certificate` function in `mode: "generate"`; it writes the PDF to the private `license-certificates` bucket and inserts into `license_certificates`.
- Issuance hook: call generation right after the licence row is created in the approval path (fire-and-forget, failures logged and retryable, never blocking licence issuance).
- Backfill: one-off invocation loop over licences with no `license_certificates` row.
- UI: `src/components/licenses/LicenseSignaturePanel.tsx` empty state gains the generate action and reuses the same invoke path as `LicenseDetail.tsx`; no change to signing/dispatch logic or permissions.

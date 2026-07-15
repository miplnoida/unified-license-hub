# Plan — Security & File Scanning notice on Registration

UI-only change. No backend, scanning, or upload logic is modified.

## What to build

A new collapsible panel component that renders on the registration page directly above the document/attachments step. It answers the applicant's question about malware handling in plain language, with ClamAV named as the scanning engine and daily signature updates (with offline mirror for restricted-network deployments) mentioned.

## Files

1. **New:** `src/components/registration/SecurityScanningNotice.tsx`
   - Collapsible card (shadcn `Collapsible` + `Card`) titled **"Security & file scanning"**, collapsed by default.
   - Trigger row: shield icon, title, one-line summary ("All uploads are scanned for malware before we accept them."), chevron.
   - Expanded body — short applicant-friendly bullets:
     - **Scanned on upload** — every file is checked with ClamAV, an industry-standard antivirus engine.
     - **Definitions stay current** — virus signatures refresh daily; on-premises and restricted-network deployments use a secure internal mirror so protection stays up to date without external internet access.
     - **What's allowed** — PDF, Word, Excel, images (JPG/PNG/WebP), CSV, and plain text, up to **20 MB per file**.
     - **If something is infected** — the file is blocked immediately, moved to a secure quarantine area, and a record is written to the audit log; our security team is notified. You'll see a clear error and can upload a clean copy.
     - **Your privacy** — files are stored privately and only reachable through short-lived signed links (5 minutes).
   - Footer line: small muted "Powered by ClamAV · signatures refreshed daily".
   - No props required beyond optional `className`. Pure presentational — no data fetching, no state beyond open/closed.

2. **Edit:** `src/pages/registration/PreLicenseeRegistration.tsx`
   - Import `SecurityScanningNotice`.
   - Render `<SecurityScanningNotice />` immediately above the attachments/documents step (the step that renders file upload fields). Placement is inside the step container so it only shows on that step, not on personal-info or review steps.

## Out of scope

- No changes to `secureFileUpload.ts`, upload components, RLS, or edge functions.
- No new copy on other portals (licensee, admin, complaints) — registration only, per request.
- No backend scanner wiring; copy reflects the intended ClamAV story only.

## Visual notes

- Use existing design tokens (`bg-card`, `border-border`, `text-muted-foreground`, primary accent for the shield icon).
- Icon: `ShieldCheck` from `lucide-react`.
- Keep it compact: ~single card, collapsed height ≈ one row; expanded shows 5 short bullets.

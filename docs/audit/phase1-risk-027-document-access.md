# RISK-027 — Document view/download auditing (Phase 1, read-only investigation)

Date: 2026-10-12. No code or database changes were made for this finding.

## Key distinction
- **Link issued** — the app created a time-limited signed storage URL. This is all the
  application can observe today.
- **Viewed / downloaded** — the file bytes were actually fetched. The browser fetches
  directly from storage after the link is issued, so the app never sees this. Proving it
  needs storage access logs or a server-side download proxy (both out of Phase 1 scope).

## Where signed links are issued and whether anything is logged

| Location | Links | Logged? |
|---|---|---|
| `src/lib/documentVersioning.ts` `getVersionSignedUrl` (versioned documents) | 1 | Yes — inserts `document_action_logs` action `download` **when the link is issued** (label overstates: it is link-issued, not a confirmed download). Best-effort; failure ignored. |
| `src/hooks/useConductInterviews.ts` | 1 | Yes — interview evidence access is logged |
| `src/lib/secureFileUpload.ts` | 1 | No |
| `src/components/shared/AttachmentList.tsx` | 2 | No |
| `src/components/payments/PaymentAttachments.tsx` | 1 | No |
| `src/hooks/useCorrespondence.ts` | 1 | No |
| `src/lib/fpEvidence.ts`, `src/components/fit-and-proper/FpConditionEvidencePanel.tsx` | 3 | No |
| `src/lib/registrationFileAccess.ts`, `src/components/registration/AttachmentDisplay.tsx` | 2 | No (server function issues capability-bound links; no access log) |
| `src/lib/formFileUpload.ts` | 2 | No |
| `src/pages/support/SupportCenter.tsx`, `src/pages/settings/CertificateSignatorySettings.tsx` | 2 | No |
| Edge functions: `document-extract`, `generate-license-certificate`, `application-acknowledgement`, `audit-export`, `registration-file-access` | — | audit-export records downloads via `log_export_download`; others not |

## Why `document_action_logs` has 0 `download` rows
- Live counts: 17 document groups, 18 versions; actions recorded: `upload` 17, `version_created` 1, `download` 0.
- The insert policy `doc_action_logs_insert_self` allows the insert when `actor_id = auth.uid()`
  and the caller owns the group or passes `is_doc_staff`. `download` is in the allowed action list.
- So the policy does **not** block an owner/doc-staff download. The versioned download buttons
  (`DocumentGroupList`, `DocumentVersionHistoryDialog`, used via `FormRenderer`) have simply
  not been used since logging was added — or were used by a user who is neither owner nor
  doc staff, in which case the insert is silently rejected. Which one applies is **Unverified**
  (no request logs retained).

## Status
**Partially implemented / Unverified.** One path logs link issuance; ~15 other link paths log nothing;
no path can prove an actual view/download.

## Requirements for a full fix (not implemented)
1. Decide the evidence standard: link-issued logging (code + existing tables) vs confirmed download
   (storage access logs or a server download proxy — infrastructure/database work).
2. If link-issued is acceptable: a single shared helper that logs `link_issued` for every path above.
   This needs an action value and a table every module may insert into — a **database change**
   (the current `download` value and group-scoped policy only fit versioned documents).
3. Rename/relabel the existing versioned `download` entry as link-issued in reports.

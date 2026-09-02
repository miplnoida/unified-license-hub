# DMS Phase 0 — Document Source Inventory & Taxonomy

Status: baseline for the Central DMS foundation slice (Blueprint phases 0–4).
Principle: extend the existing `document_groups` / `document_versions` / `document_action_logs` model. No parallel document subsystem. Legacy sources remain readable (dual-read) for the whole slice.

## 1. Source inventory

| # | Source | Storage | Current volume | Disposition | Notes |
|---|--------|---------|----------------|-------------|-------|
| 1 | `document_groups` + `document_versions` | `secure-documents` | 17 groups / 18 versions | **Canonical** | Evolved in place into the DMS document record. |
| 2 | `file_uploads` | `secure-documents` | 19 rows | **Physical registry** | Stays the physical file registry (scan status, quarantine). Never the logical document. |
| 3 | `documents` (legacy) | `documents` | 3 rows | **Migrate (Phase 9)** | Read-only dual-read until backfilled. Out of scope this slice. |
| 4 | Form JSON file references (`applications.data.forms_data`) | `secure-documents` | n/a | **Link-only** | Already resolved by `useApplicationDocuments`; canonical registration happens at upload time from Phase 4 onward. |
| 5 | `complaint_evidence` | complaint buckets | — | **Keep module-local** | Chain-of-custody rules differ; linked later via `document_relationships`, not migrated. |
| 6 | `conduct_evidence` / evidence packs | module storage | — | **Keep module-local** | Same reason as (5). |
| 7 | `correspondence_attachments` | module storage | — | **Link-only (later wave)** | Correspondence category reserved. |
| 8 | Payment documents (`payment-documents`) | private bucket | — | **Keep module-local** | Financial/Payment category reserved for later linkage. |
| 9 | Licence certificates (`license-certificates`, `certificate-assets`) | private buckets | — | **Migrate (Phase 4)** | Registered as canonical documents, `public_eligible`, unpublished. |
| 10 | `fp-evidence` | private bucket | — | **Manual review** | Fit & Proper sensitivity; classification decided before any linkage. |
| 11 | `return-uploads` | private bucket | — | **Link-only (Phase 6)** | Out of scope this slice. |
| 12 | `avatars`, `branding-assets` | public buckets | — | **Exclude** | Not regulatory documents. |
| 13 | `audit-exports` | private bucket | — | **Exclude** | Generated artefacts governed by audit export jobs. |

## 2. Category taxonomy (seeded)

`corporate_registration`, `licensing`, `licence_certificates`, `fit_and_proper`, `returns`, `prudential_supervision`, `market_conduct`, `complaints`, `enforcement`, `correspondence`, `regulatory_decisions`, `financial_payment`, `internal_regulatory`, `public_notices`, `other`.

Every category carries `default_confidentiality`, `default_publication_eligibility`, `requires_verification` and `requires_acceptance`. Conservative default for anything unclassified: category `other`, confidentiality `entity`, eligibility `not_publishable`.

## 3. Controlled vocabularies

- Confidentiality: `public`, `entity`, `regulator_internal`, `restricted`, `confidential`, `legal_privileged`.
- Publication eligibility: `not_publishable`, `public_eligible`.
- Publication status: `not_requested`, `draft`, `pending_approval`, `approved`, `published`, `rejected`, `withdrawn` (workflow deferred; only `not_requested` is written this slice).
- Document status: `draft`, `uploaded`, `pending_scan`, `available`, `pending_verification`, `verified`, `accepted`, `superseded`, `archived`, `rejected`, `quarantined`, `expired`, `withdrawn`, `on_hold`.
- Verification: `not_required`, `pending`, `verified`, `rejected`.
- Acceptance: `not_required`, `pending`, `accepted`, `conditionally_accepted`, `rejected`.

## 4. Backfill rule for existing rows

Existing 17 groups receive a `DOC-YYYY-NNNNNN` reference, category `other`, confidentiality `entity`, eligibility `not_publishable`, publication `not_requested`, and a document status derived from the current `status` column. No existing column is dropped or renamed; no row becomes invisible.

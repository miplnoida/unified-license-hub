# Phase 6 — Communications, Document Intelligence, Public Transparency & API

Phases 1–5 built the internal supervisory operating system. Phase 6 closes the loop with the outside world: how the regulator communicates decisions, how documents get read faster, what the public can see, and how partner systems consume data.

## 6.1 COMM-001 — Outbound Correspondence Service

A single place to compose, template, send, and archive formal letters (notices, decisions, RFIs, penalty demands).

- Tables: `correspondence_templates` (channel, subject, body with `{{tokens}}`, jurisdiction), `correspondence_dispatches` (recipient, source_type/source_id → any case, rendered payload, channel, status, tracking IDs).
- Edge function `send-correspondence`: renders template with record context, sends via existing email/SMS pipes, writes to `document_versions` so it appears in the case file.
- UI: `/admin/correspondence-templates` + a "Send Correspondence" action on Application, Enforcement, Complaint, F&P and Return workspaces. Timeline entry on the source record.

## 6.2 DOC-001 — Document Intelligence (AI extraction)

Turn uploaded PDFs/images into structured metadata.

- Table `document_extractions` (document_id, extracted_json, confidence, model, reviewed_by).
- Edge function `document-extract` using Lovable AI (Gemini) with vision to pull: doc type, party names, dates, monetary amounts, obligations, signatures present (bool).
- Auto-trigger on new upload; result surfaces as a right-panel "AI Insights" card on the document viewer with accept/edit-and-save.
- Search: `SELECT` documents by extracted fields (e.g., all uploads mentioning a specific licensee director).

## 6.3 PUB-001 — Public Registry Portal

A public, unauthenticated pages set that mirrors what most regulators are required to publish.

- Read-only views (RLS `anon` SELECT with strict column allowlists on new secure views):
  - `/public/licensees` — active licensees, license type, issue/expiry, status.
  - `/public/enforcement` — closed enforcement actions with published decisions.
  - `/public/warnings` — public warnings (a new `is_public` flag on enforcement + a `published_at`).
- Search + CSV download. SEO metadata on each page.

## 6.4 NOT-002 — Notification Preferences & Digest

Per-user control over what shows in the in-app bell + a daily digest email.

- Table `notification_preferences(user_id, channel, event_type, enabled)`.
- `/settings/notifications` grid: rows = event types (breach, enforcement update, RFI response, complaint assigned, F&P alert, risk band change), cols = In-App / Email / SMS.
- Edge function `send-daily-digest` (cron 08:00) rolls up yesterday's undelivered events into one email per user honoring preferences.

## 6.5 API-001 — Partner Read API + Webhooks

A stable, tokened surface for ministry/BI systems.

- Table `api_clients` (client_id, hashed_secret, scopes, rate_limit) and `webhook_subscriptions` (client_id, event_type, target_url, secret).
- Edge function `partner-api` exposing GET endpoints: `/licensees`, `/enforcement/public`, `/returns/summary` — all scope-gated.
- Edge function `emit-webhook` invoked from DB triggers on key events (license issued, enforcement closed, breach raised); signs with HMAC-SHA256, retries with backoff, logs to `webhook_deliveries`.
- `/admin/api-clients` UI to mint/rotate secrets and manage subscriptions.

## 6.6 SEC-001 — Compliance Audit Trail Export

Signed, timestamped exports of the audit log for periodic archival to the ministry / auditor-general.

- Edge function `audit-export` produces a JSONL + SHA-256 manifest for a date range, stored in a private bucket with a signed 24h URL.
- Table `audit_exports` records who exported what range and the manifest hash.
- UI: `/admin/audit-exports` list + "New export" dialog with range picker; regulator-only.

## Technical notes

- All new tables follow the mandatory `CREATE TABLE → GRANT → ENABLE RLS → CREATE POLICY` order; public registry uses secure views not raw table `anon` grants.
- AI calls stay on the Lovable AI Gateway (no user keys).
- Webhooks and correspondence run through Edge Functions, never client-side.
- All new admin UIs slot into AdminHub under the existing module gating.

## Suggested order

1. 6.1 Correspondence (highest daily value)
2. 6.4 Notification prefs + digest (small but user-visible)
3. 6.2 Document intelligence
4. 6.3 Public registry
5. 6.5 Partner API + webhooks
6. 6.6 Audit export

Reply **continue** to start with 6.1, or name the sub-phase you'd like first.

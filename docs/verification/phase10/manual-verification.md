# Phase 10 — Data Lineage & Export Governance: Manual Verification

Scope: `record_lineage()`, field-level diffing, lineage authorization, governed
export creation (`request_export_job`), the download register
(`audit_export_downloads`), and retention purge.

Automated coverage: `supabase/tests/phase10/01_record_lineage.sql`,
`supabase/tests/phase10/02_export_governance.sql`.

---

## V1 — Lineage surfaces both audit sources

1. Sign in as a super admin. Go to **Admin → Compliance Audit Logs**.
2. In **Case-Centric**, trace any object that has been created and later updated
   (e.g. an application ID).
3. Switch to the **Lineage** tab and press **Trace lineage** / **Load lineage**.

Expected: one card per recorded event, newest first, each labelled with its
source (`audit_logs` or `compliance_audit_logs`), the actor role, and the action.

## V2 — Field-level diff is truthful

1. For an update event, confirm the table lists **only** the fields whose values
   actually changed, with the before and after values side by side.
2. Confirm an insert event (no before payload) lists the created fields, and that
   an event with identical payloads shows "No field-level differences recorded".

Expected: no unchanged field appears in the diff table.

## V3 — Lineage is denied without audit permission

1. Sign in as a licensee user (or an internal user without
   `audit_management.view` / `.export`).
2. Call the lineage RPC directly with a known record ID.

Expected: request fails with `Not authorized to view data lineage`. Holding a
valid record ID is not sufficient — the SECURITY DEFINER function performs its
own authorization check.

## V4 — Export requires a justification

1. Go to **Admin → Audit Log Export**.
2. Leave **Justification** empty (or type fewer than 10 characters) and press
   **Run export**.

Expected: blocked with a message asking for a justification of at least 10
characters. The server-side RPC enforces the same rule independently.

## V5 — Export governance metadata is recorded

1. Run an export with a real justification, e.g.
   `Regulatory examination request BOJ-2026-01`.
2. Inspect the **Recent exports** table.

Expected: the row shows the source, range, row count, the justification, a
**Retention until** date (default 90 days out) and a download counter starting
at 0.

## V6 — Download register

1. Press **CSV** on a completed export.
2. Reload the page.

Expected: the download counter increments by 1, and the register
(`audit_export_downloads`) gains one row recording who downloaded it and when.

## V7 — Cross-user download is refused

1. As a different non-admin user, attempt `log_export_download` against another
   user's export job ID.

Expected: rejected with `Not authorized to download this export`; the register
rows of that export remain invisible to them.

## V8 — Retention purge

1. As the service role, backdate an export's `retention_expires_at` to the past.
2. Execute `select public.purge_expired_audit_exports();`.

Expected: the function returns the number of purged records and the expired rows
are removed. Non-expired exports are untouched. The purge routine is
service-role only — `authenticated` cannot execute it.

---

## Evidence to attach

| Check | Evidence |
| --- | --- |
| V1–V2 | Screenshot of the Lineage tab showing a diff table |
| V3 | Error response from the lineage RPC as a non-audit user |
| V4–V5 | Screenshot of the export form validation + the governed export row |
| V6–V7 | Download counter screenshot + refusal error text |
| V8 | Purge return value and post-purge row count |

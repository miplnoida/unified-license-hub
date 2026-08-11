# Auto-calculated complaint severity

Severity stops being a user-entered field at intake and classification. The system derives it from complaint triage configuration; supervisors can still override it afterwards with a logged reason.

## What changes for users

**Intake (internal complaint form)**
- The Severity dropdown is removed. In its place, a read-only note: "Severity is assigned automatically by triage configuration after submission."
- Staff continue to capture the classification inputs triage relies on (complaint type, conduct risk category, product, channel, customer type, vulnerability).

**Classification card (complaint detail)**
- Severity dropdown removed; severity shown as a read-only badge with the source ("From triage rule X" / "Configured default") and the last evaluation time.
- Priority, SLA days, assigned team stay editable as today.

**Supervisor override (kept)**
- The existing severity override on the complaint detail page remains: permission-gated, requires a reason, and writes to the override registry / audit history. It is relabelled "Override severity" and clearly marked as an exception to the automatic value.

**Bulk intake**
- `severity` column no longer read from uploaded files; the column hint is dropped and any supplied value is ignored, with a note in the import summary.

**Admin: triage configuration**
- The triage rules screen gains a "Default severity" setting used when no rule matches (falls back to medium if unset).

## Technical notes

- Add `default_severity` to `public.complaint_intake_rules` (text, checked against low/medium/high/critical, nullable) and read it in the triage engine. The default row (regulator_id NULL) is the fallback; regulator-scoped rows can differ.
- `create_complaint` / `create_complaint_with_attachments`: strip `severity` for every variant (currently stripped only for public/licensee) and set it from `default_severity` at insert time, so the record is never severity-less before triage runs.
- `evaluate-complaint-triage`: when no rule matches, apply the configured default instead of leaving the existing value; keep recording `triage_source` and matched rule so the UI can explain the value.
- `internalComplaintSchema` in `src/lib/complaintSchemas.ts`: drop `severity` from the accepted shape (the DB is the sole author). Update `src/test/complaintSchemas.test.ts` accordingly and add a case asserting a submitted severity is ignored.
- `update_complaint_severity` RPC is left intact for the override path.
- Frontend edits: `src/pages/complaints/NewInternalComplaint.tsx`, `src/components/complaints/ConductClassificationCard.tsx`, `src/pages/complaints/ComplaintDetail.tsx`, `src/pages/complaints/BulkIntake.tsx`, `src/hooks/useComplaintBulkImport.ts`, `src/pages/admin/conduct/TriageRules.tsx`.

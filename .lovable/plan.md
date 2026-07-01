## Problem found

The audit data exists, but the admin page is not showing the complete trail:

- `compliance_audit_logs`: 3 rows
- `security_event_logs`: 3 rows
- `audit_logs`: 551 legacy rows
- `audit_timeline`: correctly merges all 557 rows

The current `/admin/compliance-audit-logs` page reads only `compliance_audit_logs`, so it hides the 551 older legacy rows. Also, some server-side functions still write directly to `audit_logs`; because direct audit table inserts were revoked from user roles and the hardening relies on RPCs/triggers, those writes need to be routed through the approved audit functions or bridged safely.

## Implementation plan

1. **Bridge the audit UI to the unified timeline**
   - Update `/admin/compliance-audit-logs` to read from `audit_timeline` instead of only `compliance_audit_logs`.
   - Keep all existing tabs and filters, but make “All Entries” include legacy, compliance, and security sources.
   - Add a source column/badge so admins can see whether a row came from `legacy`, `compliance`, or `security`.
   - Keep `/admin/audit-logs` working for backward compatibility.

2. **Preserve old activity records visibly**
   - Ensure the current admin audit screen shows the 551 existing `audit_logs` rows through `audit_timeline`.
   - Ensure case/object filters work across both legacy `entity_type/entity_id` and new `object_type/object_id` columns via the unified view.

3. **Fix audit creation paths**
   - Replace direct server-side inserts into `audit_logs` in edge functions with the approved audit RPCs/shared helper.
   - At minimum patch the currently confirmed direct writers:
     - `perform-workflow-action`
     - `perform-license-action`
   - Add/adjust a shared function audit helper so future edge functions log through `log_compliance_audit` / `log_security_event` consistently.

4. **Database permission repair**
   - Add a migration to clean up audit RPC grants:
     - remove public/anonymous execute access from `log_compliance_audit` and `log_security_event`
     - keep execute access for authenticated users and service role
   - Keep audit tables append-only: no authenticated update/delete, immutability triggers stay in place.
   - If needed, add a compatibility RPC for server-side legacy activity events that inserts into `audit_logs` without reopening direct table inserts.

5. **Tests**
   - Update/add frontend tests proving `ComplianceAuditLogs` queries `audit_timeline` and can render mixed legacy/compliance/security rows.
   - Add edge/helper tests proving workflow/license actions use audit RPCs rather than direct audit table inserts.
   - Extend audit RPC tests for permission expectations and unified export logging.

6. **Verification**
   - Query the backend to confirm `audit_timeline` returns legacy + compliance + security counts.
   - Verify the preview route `/admin/compliance-audit-logs` loads old records.
   - Run targeted audit tests.
   - Run the full test suite if feasible.
   - Run a production build/typecheck through the normal harness.

## Final report after implementation

I will report:

- Files changed
- Database objects added/updated
- RPCs updated
- Triggers affected
- Tables/views modified
- Edge functions updated
- Frontend components updated
- Tests added/executed
- Test results
- Build result
- Remaining issues
- Audit Coverage (%)
- Security Coverage (%)
- Production Ready: YES/NO

Production Ready will be marked **NO** unless implementation and verification both pass.
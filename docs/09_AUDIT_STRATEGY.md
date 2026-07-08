# 09 — Audit Strategy

## Current State
16 distinct audit-style tables (see TD-005). Multiple export paths bypass audit (TD-006). Reports vs admin audit views read from different tables (TD-007).

## Target State
A unified **audit facade** with specialised sinks.

### Facade
```ts
platform/audit.record({
  actor: { userId, role, effectiveRole, licenseeId? },
  action: 'return.submitted' | 'license.approved' | ...,   // typed enum
  entity: { type, id, regulatorId?, sectorId? },
  before?: unknown,
  after?: unknown,
  metadata?: Record<string, unknown>,
  correlationId: string,
  ip?: string,
  userAgent?: string,
})
```
Facade writes to:
1. `audit_events` (new unified table) — canonical, append-only.
2. Domain-specific table (kept for backwards-compat and rich queries) via a mapping.

### Unified Read View
```sql
CREATE VIEW audit_events_v AS
SELECT ... FROM audit_logs
UNION ALL SELECT ... FROM compliance_audit_logs
UNION ALL SELECT ... FROM conduct_triage_audit_events
UNION ALL SELECT ... FROM return_audit_log
UNION ALL SELECT ... FROM audit_export_jobs
UNION ALL SELECT ... FROM report_logs
UNION ALL SELECT ... FROM document_action_logs
-- etc.
```
Regulator-facing audit report reads this view.

## Export Audit Rule
All exports (CSV / XLSX / JSON / PDF / print) must call `exportAudit.logExport()` **before** issuing the download. Central download helper `platform/exports.download(...)` enforces this.

## Action Vocabulary
Actions are dot-separated `<domain>.<verb>`; controlled list in `platform/audit/actions.ts`. Adding an action requires an ADR (short).

## Retention
- `audit_events` retained indefinitely (regulator requirement).
- Specialised sinks per current policy (`document_action_logs` 7 y, etc.).
- Storage cost review annually.

## Access
- Read: `has_role(_,'admin')` OR `has_role(_,'auditor')` (new role).
- Write: only via facade (RLS `USING (false)` on direct INSERT for non-service_role).

## Migration Plan
1. Introduce facade, dual-write to existing tables + `audit_events`.
2. Point admin audit UI at `audit_events_v`.
3. Backfill critical history from existing tables into `audit_events` (batch).
4. Remove direct table writes from feature code (per feature EPIC).

# RISK-025: Bounded-memory audit export (code only)

**Scope:**
- Only these files change:
  - `supabase/functions/audit-export/exportCore.ts`
  - `supabase/functions/audit-export/index.ts`
  - `src/test/auditExportPhase1.test.ts`
  - the readiness report
- `AuditExport.tsx` changes only if a compatibility gap is found.
- No changes to the database, data, deployment or publishing, Phase 2, live draft saving or uploads.

## Root cause (confirmed in source)
The current function holds the whole export in memory three times:
- every database row (`rows.push`, up to 100,000 objects),
- the full CSV string from `toCsv(rows)`,
- the `Blob` handed to the upload.

The column list is also built by scanning every row first, so nothing can be written until all rows have been loaded.

## New approach
1. **Streaming CSV writer (`exportCore.ts`)**
   - `csvHeader(cols)` and `csvRow(cols, row)` use the existing quoting and formula-guard rules, so the output is byte-for-byte the same.
   - The columns come from the first page. A later key that is not in that list is counted and reported, never silently dropped. All rows from one table share the same keys.
   - An async generator `streamCsv(loadPage)` yields one encoded chunk per page. Each page is released once it has been written.
2. **Keyset paging instead of offset paging**
   - Each page asks for rows after the last `(created_at, id)` seen, rather than skipping a growing number of rows.
   - This removes the cost that grows with each deeper page (risk 2 in the report).
   - It uses the existing `created_at` index; no new index is added.
3. **Fixed snapshot**
   - The time the export starts is recorded as `snapshot_at`.
   - Every query, including the count, also filters `created_at <= snapshot_at`.
   - Rows inserted during the export are therefore excluded, and the count matches the file.
   - Limit: this is not true database snapshot isolation. A backdated insert, or a change to an already-exported row, could still differ. This will be documented.
4. **Streaming upload**
   - The upload receives a `ReadableStream` built from the generator, using the existing `audit-exports` bucket, path, content type and 5-minute signed link.
   - If the storage client cannot accept a stream body, I stop at that point and report it, before writing any alternative.
5. **Interrupted jobs**
   - All failure paths and the outer `catch` mark the job `failed`.
   - A best-effort runtime shutdown handler marks a still-`running` job `failed`, with the reason "interrupted".
   - If the function is hard-killed, nothing can run, so a job can still stay `running`. This is documented as a known limitation: fixing it needs a database-side sweep, which is out of scope.
6. **Unchanged:**
   - permission check, justification, RISK-024 filter columns, the 100,000-row limit and truncation fields,
   - the response shape, the job fields, and existing old job rows.

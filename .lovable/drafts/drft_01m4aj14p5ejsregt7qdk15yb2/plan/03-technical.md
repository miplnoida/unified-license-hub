## Technical details
- Frontend: `src/pages/applications/ApplicationsList.tsx` (load, tabs, counts, CSV export), `src/lib/applicationCategory.ts`, `src/lib/visibleApplications.ts` (already pages at 200), `src/contexts/ActiveSectorContext.tsx` (read only).
- For external audiences, pass `_sector_id: null` and apply the sector as an optional client filter.
- Inspect `get_application_list_page` read-only (`pg_get_functiondef`) to check: applicant branch on `applicant_id = auth.uid()`, `_licensee_id` handling (OR, not AND), draft/status exclusions, licence-state joins, and whether `request_kind` is returned.
- Any needed change is staged as an additive `CREATE OR REPLACE` file in the draft migrations folder, for approval only. RLS, grants and records are not modified.
- Tests go in `src/test/` next to the existing tests and use a mocked RPC.

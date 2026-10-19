## Technical details
- File: `src/pages/applications/ApplicationsList.tsx` (load at ~L320–430, CSV export at ~L505–540); `src/lib/applicationCategory.ts`.
- For external audiences, pass `_sector_id: null`.
- If `get_application_list_page` does not return `request_kind`, a database change is needed (add the column to the function's output). It would be staged as an additive change that applies only when the draft is accepted. You will be asked before any database change.
- Internal staff behaviour, permissions and approval workflows stay unchanged.

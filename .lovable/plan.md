# Hide Applicant Panel Bulk Fill (Excel/XML)

Hide the **Bulk Fill via Excel or XML** section in the applicant (new application) panel. Keep all code in place so it can be re-enabled later with a single flag flip.

## What changes

1. Add a new feature flag in `src/lib/featureFlags.ts`:
   - `APPLICATION_BULK_FILL_ENABLED = false`

2. Update `src/components/applications/ApplicationUploadPanel.tsx`:
   - Import the new flag.
   - Return `null` when the flag is `false`.
   - Leave the existing component body unchanged so re-enabling is a one-line change.

## What does not change

- No files deleted.
- No database, Edge Function, or backend changes.
- Return upload/import functionality (`ReturnUploadPanel`) remains untouched.
- Other working functionality in `NewApplication.tsx` is not modified.

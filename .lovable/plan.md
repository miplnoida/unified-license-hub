## Plan: Fix imported return data still not displaying

### Findings
- The import is reaching the backend: the affected return has `353` saved `return_form_data` rows and recent import audit entries show `353` values written.
- However, every saved `field_value` for that return is blank. This means the UI refresh fix alone cannot show values because the committed rows contain empty strings.
- The likely root cause is the parser/import flow accepting rows from the template where the visible row exists but the `New Value` cell is blank, especially in `replace` mode. It then overwrites every mapped field with `''`.

### Changes to implement
1. **Prevent blank template rows from wiping/appearing as successful data imports**
   - Update XLSX/XML parsing so blank `New Value` rows are skipped unless the user explicitly chooses a clear/replace behavior that is intended to wipe data.
   - Add a clear warning when no actual values are found in the uploaded file.

2. **Make import summary honest**
   - In the upload preview, show both mapped rows and actual non-empty values so users can see whether data will really be imported.
   - Disable **Import into Return** if the uploaded file has zero non-empty values.

3. **Keep the post-import refresh deterministic**
   - Keep the current `handleImported` refetch/remount flow, but ensure it hydrates from the committed rows after import and does not overwrite the form with stale/blank state.

4. **Optional targeted cleanup for the affected return**
   - If needed, after the parser fix, the user should re-upload the completed file. The current backend rows for this return are blank because the last imports wrote empty values.
   - I will not delete or rewrite existing return values unless explicitly asked.

### Verification
- Confirm a completed template preview reports non-empty values before import.
- Import the file and verify `return_form_data` contains non-empty `field_value` rows.
- Verify the form tabs display imported values immediately without refreshing the page.
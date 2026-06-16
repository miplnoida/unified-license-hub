## Targeted Fix Plan

**Scope:** Only Form Management document uploads with versioning. No changes to registration approval, login, notifications, licensing, dashboard, or application approval behavior.

### Root cause
The live database policy for `file_uploads` already allows authenticated inserts only when `uploaded_by = auth.uid()`.

The current Form Management uploader passes `user.id` from the app profile context into `uploaded_by`. In some portal contexts, that app profile id can differ from the actual authenticated backend session id. When that mismatch happens, every `file_uploads` insert fails with:

`new row violates row-level security policy`

### Changes to make
1. **Use the authenticated session id for versioned uploads**
   - In `documentVersioning.ts`, resolve the current backend auth user via `supabase.auth.getUser()` inside `uploadVersionedDocument`.
   - Use that id for:
     - `uploaded_by` on `file_uploads`
     - `owner_id` matching/creation in document groups through the existing RPC
   - Keep the existing `userId` parameter as a compatibility fallback only.

2. **Keep Form Management context intact**
   - Continue passing:
     - `entityType`
     - `entityId`
     - `formId`
     - `fieldId`
     - `submissionId`
     - `documentType`
     - `documentLabel`

3. **Fix storage path compatibility**
   - The storage policies also expect authenticated uploads under a user-owned folder.
   - Update Form Management versioned storage paths to include the authenticated backend user id as the first path segment, while preserving the current `form-management/...` organization after that.

4. **Avoid unrelated workflow changes**
   - Do not modify registration upload helpers.
   - Do not modify login/auth workflows.
   - Do not modify notifications, licensing, dashboard, or application approval logic.

5. **Verification**
   - Run the existing document versioning/FormRenderer tests.
   - Manual verification remains required: create/choose a Form Management file field with **Allow multiple files**, upload multiple images, confirm every row uploads without RLS errors and shows version metadata.
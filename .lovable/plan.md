## Problem

External applicants cannot attach files to RFI responses. The insert into `file_uploads` fails with:

> new row violates row-level security policy "external_file_uploads_insert_capability_gate"

## Root Cause

The RFI response upload writes a `file_uploads` row with `entity_type = 'rfi_response'` and `entity_id = <rfi_item_id>` (see `src/components/applications/ApplicationRfiTab.tsx` ~line 314).

The RLS policy `external_file_uploads_insert_capability_gate` calls `public.external_can_upload_document_ref(auth.uid(), entity_type, entity_id)`. That function only recognises entity types: `application`, `license`, `licensee`, `entity`, `payment`, `compliance_return`, `return`, `returns_filed`, `complaint`. It has NO branch for `'rfi_response'`, so it falls through to `RETURN false` and blocks every external user.

Internal staff pass the `NOT has_external_role(...)` short-circuit, which is why the RFI upload only breaks for applicants / licensees.

The matching SELECT gate (`external_can_access_document_ref`) has the same blind spot — even if insert were allowed, the applicant couldn't read their own RFI attachment back.

## Fix (single DB migration)

Extend both helper functions with an `rfi_response` branch that resolves the parent application via `application_rfi_items -> application_rfis`, then delegates to the existing application capability check.

### 1. `public.external_can_upload_document_ref`

Add before the final `RETURN false`:

```sql
ELSIF v_type IN ('rfi_response', 'application_rfi_response', 'rfi', 'application_rfi') THEN
  RETURN EXISTS (
    SELECT 1
    FROM public.application_rfi_items it
    JOIN public.application_rfis r ON r.id = it.rfi_id
    WHERE (v_type IN ('rfi_response','application_rfi_response') AND it.id  = v_entity)
       OR (v_type IN ('rfi','application_rfi')                    AND r.id  = v_entity)
    LIMIT 1
    AND public.external_can_access_document_ref(
      _user_id, 'application', r.application_id, 'can_respond_rfi'
    )
  );
```

(Written as a correlated `EXISTS` with the capability check inside so we only match when the applicant has `can_respond_rfi` — or `can_upload_documents` as a fallback — on the parent application.)

### 2. `public.external_can_access_document_ref`

Add the same `rfi_response` / `application_rfi` resolution so applicants can SELECT the file row they just inserted (needed to render the attachment link in the RFI thread). Delegate to the application-level check with `can_view_status`.

### 3. No frontend changes

`ApplicationRfiTab.tsx` already writes the correct `entity_type` / `entity_id`; the fix is purely in the DB gate functions. `secure-documents` storage policies already scope by `${userId}/...` path, which the current upload path (`${currentUserId}/rfi/${rfiId}/...`) already satisfies.

## Verification

1. Sign in as the DEMO-ULRA-005 applicant, open the RFI, attach a PDF, submit → insert succeeds, response row created, `response_status` flips to `responded`.
2. Refresh the RFI tab → attachment link renders (SELECT gate now passes).
3. Re-run the failing action in the internal reviewer account → still works (internal path unaffected).
4. `supabase--linter` clean.

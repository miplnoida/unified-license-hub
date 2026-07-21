# 07 · Storage Policy Coverage

Evidence: [`storage-policies.tsv`](./storage-policies.tsv) (30 rows) and the buckets snapshot below.

## Buckets

| Bucket | Public | Bucket-scoped policies |
|--------|--------|------------------------|
| audit-exports        | private | 0 |
| avatars              | public  | 4 |
| branding-assets      | public  | 4 |
| certificate-assets   | private | 1 |
| documents            | private | 14 |
| fp-evidence          | private | 3 |
| license-certificates | private | 2 |
| payment-documents    | private | 3 |
| return-uploads       | private | 3 |
| secure-documents     | private | 7 |

## Findings

| Severity | Bucket | Issue | Recommendation |
|----------|--------|-------|----------------|
| **Critical** | `audit-exports` | Private with **0** policies — currently unreadable/unwritable to app roles; but service-role code writes exports there without a corresponding `SELECT` policy for the requesting user. Either exports never actually download, or a service-role-signed URL is being minted per request. | Add explicit policies: `SELECT USING (has_permission(auth.uid(), 'audit_management', 'export'))`; write via `service_role` only. |
| **Critical** | `documents`, `secure-documents`, `fp-evidence`, `return-uploads`, `payment-documents`, `license-certificates`, `certificate-assets` | Only **1 of 30** policies references `has_permission`. The rest gate on ownership + hard-coded role. | Rewrite each SELECT/INSERT/UPDATE/DELETE policy to compose with `has_permission(auth.uid(), '<module>', '<action>')`. |
| **High** | `avatars`, `branding-assets` | Public — fine for read. But INSERT policies must gate on the user's own path prefix + a permission check (e.g. `branding_management.upload`). | Verify path-prefix scoping and add permission check. |
| **Medium** | Signed-URL TTL | Project memory states 5-minute signed URLs. Confirm no edge function mints longer ones. | Grep `createSignedUrl` occurrences and cap TTL centrally. |

## Recommended policy skeleton

```sql
-- read
CREATE POLICY "documents_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(), 'document_management', 'view')
      OR owner = auth.uid()
    )
  );

-- write
CREATE POLICY "documents_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND public.has_permission(auth.uid(), 'document_management', 'upload')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

Apply the same pattern to every private bucket, wired to the module that owns the content.

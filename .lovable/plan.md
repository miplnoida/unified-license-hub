## Add Bulk Document Upload to New Application (Documents step)

Mirror the batch upload UI already present in `ApplicationDetail.tsx` documents tab into the New Application wizard's Documents step, without touching any other flow.

### Changes

**`src/pages/NewApplication.tsx`**
1. Add import: `import { BatchDocumentUpload } from '@/components/shared/BatchDocumentUpload';`
2. In the Documents step render block (around lines 2187-2195), insert `<BatchDocumentUpload>` right after the existing single `<DocumentUpload>`, guarded by `user?.id`:
   ```tsx
   <DocumentUpload entityType="application" entityId={applicationId} onUploaded={...} />
   {user?.id && (
     <BatchDocumentUpload
       entityType="application"
       entityId={applicationId}
       userId={user.id}
       helperText="Queue multiple files, tag each with a document type, and upload in one go."
       onUploaded={() => setDocRefresh(p => p + 1)}
     />
   )}
   <div key={docRefresh}>
     <AttachmentList entityType="application" entityId={applicationId} />
   </div>
   ```

### Out of scope
- No changes to `BatchDocumentUpload`, `DocumentUpload`, `AttachmentList`, or Application Detail.
- No changes to wizard step logic, RBAC, or backend.

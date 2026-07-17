/**
 * Attach staged files to a complaint via the atomic
 * `finalize_complaint_with_attachments` RPC.
 *
 * Historical behaviour: the client inserted `complaint_evidence` rows directly
 * after each file upload. That path is deprecated because it split an
 * intended-atomic operation into N unrelated statements; a partial failure
 * left orphan `file_uploads` rows with no complaint linkage and no clean
 * retry surface. All new callers must go through this helper, which:
 *
 *   1. Uploads the staged files into secure-documents via secureUpload
 *      (each upload creates a `file_uploads` row owned by the caller).
 *   2. Calls the SECURITY DEFINER RPC to link every upload to the complaint
 *      in a single transaction, verifying ownership + regulator scope.
 *   3. Returns a per-file success/error map so the UI can show retry state.
 */
import { supabase } from '@/integrations/supabase/client';
import { secureUpload, validateFile } from '@/lib/secureFileUpload';

export const MAX_COMPLAINT_ATTACHMENTS = 5;

export interface UploadedAttachment {
  name: string;
  size: number;
  fileUploadId: string;
  filePath: string;
}

export interface AttachStagedFilesResult {
  uploaded: number;
  attachments: UploadedAttachment[];
  failed: { name: string; error: string }[];
}

interface RpcResult {
  linked: number;
  failed: number;
  results: Array<{ file_upload_id: string; ok: boolean; error?: string; idempotent?: boolean }>;
}

export async function attachStagedFilesToComplaint(
  files: File[],
  complaintId: string,
  userId: string,
): Promise<AttachStagedFilesResult> {
  const result: AttachStagedFilesResult = { uploaded: 0, attachments: [], failed: [] };
  const staged: { file: File; fileUploadId: string; filePath: string }[] = [];

  // Phase 1 — validate + upload each file. Failures here surface immediately
  // and do not enter the RPC (nothing to link).
  for (const file of files) {
    const validation = validateFile(file);
    if (!validation.valid) {
      result.failed.push({ name: file.name, error: validation.error || 'Invalid file' });
      continue;
    }

    const upload = await secureUpload(file, userId, 'complaint', complaintId);
    if (!upload.success || !upload.fileUploadId) {
      result.failed.push({ name: file.name, error: upload.error || 'Upload failed' });
      continue;
    }

    staged.push({ file, fileUploadId: upload.fileUploadId, filePath: upload.filePath || '' });
  }

  if (staged.length === 0) return result;

  // Phase 2 — atomic link via RPC. The function verifies ownership,
  // regulator scope, and idempotency; a partial failure returns per-file
  // errors rather than throwing.
  const { data, error } = await supabase.rpc('finalize_complaint_with_attachments' as any, {
    p_complaint_id: complaintId,
    p_file_upload_ids: staged.map((s) => s.fileUploadId),
  });

  if (error) {
    for (const s of staged) {
      result.failed.push({ name: s.file.name, error: error.message });
    }
    return result;
  }

  const rpc = (data ?? { linked: 0, failed: 0, results: [] }) as RpcResult;
  const byId = new Map(rpc.results.map((r) => [r.file_upload_id, r]));

  for (const s of staged) {
    const outcome = byId.get(s.fileUploadId);
    if (outcome?.ok) {
      result.uploaded++;
      result.attachments.push({
        name: s.file.name,
        size: s.file.size,
        fileUploadId: s.fileUploadId,
        filePath: s.filePath,
      });
    } else {
      result.failed.push({ name: s.file.name, error: outcome?.error || 'Link failed' });
    }
  }

  return result;
}

/**
 * Shared helper for attaching staged files to a newly-created complaint.
 * Uploads each file into the secure-documents bucket via secureUpload
 * (which also creates the file_uploads row), then links it to the
 * complaint through the complaint_evidence table.
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

export async function attachStagedFilesToComplaint(
  files: File[],
  complaintId: string,
  userId: string,
): Promise<AttachStagedFilesResult> {
  const result: AttachStagedFilesResult = { uploaded: 0, attachments: [], failed: [] };

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

    const { error: linkError } = await supabase
      .from('complaint_evidence' as any)
      .insert({
        complaint_id: complaintId,
        file_upload_id: upload.fileUploadId,
        label: file.name,
        uploaded_by: userId,
      } as any);

    if (linkError) {
      result.failed.push({ name: file.name, error: linkError.message });
      continue;
    }

    result.uploaded++;
    result.attachments.push({
      name: file.name,
      size: file.size,
      fileUploadId: upload.fileUploadId,
      filePath: upload.filePath || '',
    });
  }

  return result;
}

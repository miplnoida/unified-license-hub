/**
 * File upload service for form fields.
 * Uploads files to secure-documents bucket and returns persistent metadata.
 */
import { supabase } from '@/integrations/supabase/client';

export interface FormFileData {
  name: string;
  url: string;         // signed URL for preview (refreshable)
  type: string;
  size: number;
  filePath: string;    // storage path (persistent)
  uploadId?: string;   // file_uploads record id
}

/**
 * Upload a file from a form field to secure storage.
 * Returns persistent file metadata to store in form data.
 */
export async function uploadFormFile(
  file: File,
  userId: string,
  applicationId?: string,
): Promise<{ success: boolean; data?: FormFileData; error?: string }> {
  // Validate size (20MB)
  if (file.size > 20 * 1024 * 1024) {
    return { success: false, error: 'File exceeds 20MB limit' };
  }
  if (file.size === 0) {
    return { success: false, error: 'File is empty' };
  }

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || 'bin');
  const filePath = `${userId}/form-files/${applicationId || 'general'}/${Date.now()}-${sanitizedName}`;

  // Upload to private bucket
  const { error: uploadError } = await supabase.storage
    .from('secure-documents')
    .upload(filePath, file, { cacheControl: '3600', upsert: false });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  // Record in file_uploads
  const { data: record, error: dbError } = await supabase
    .from('file_uploads' as any)
    .insert({
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      mime_type: file.type,
      file_extension: ext,
      uploaded_by: userId,
      entity_type: 'form_field',
      entity_id: applicationId || null,
      bucket_name: 'secure-documents',
      scan_status: 'pending_scan',
      metadata: { original_name: file.name },
    } as any)
    .select('id')
    .single();

  if (dbError) {
    await supabase.storage.from('secure-documents').remove([filePath]);
    return { success: false, error: dbError.message };
  }

  // Get signed URL for preview
  const { data: urlData } = await supabase.storage
    .from('secure-documents')
    .createSignedUrl(filePath, 300);

  return {
    success: true,
    data: {
      name: file.name,
      url: urlData?.signedUrl || '',
      type: file.type,
      size: file.size,
      filePath,
      uploadId: (record as any)?.id,
    },
  };
}

/**
 * Delete a previously uploaded form file.
 */
export async function deleteFormFile(filePath: string, uploadId?: string): Promise<boolean> {
  await supabase.storage.from('secure-documents').remove([filePath]);
  if (uploadId) {
    await supabase.from('file_uploads' as any).delete().eq('id', uploadId);
  }
  return true;
}

/**
 * Refresh a signed URL for a form file.
 */
export async function refreshFormFileUrl(filePath: string): Promise<string> {
  const { data } = await supabase.storage
    .from('secure-documents')
    .createSignedUrl(filePath, 300);
  return data?.signedUrl || '';
}

/**
 * Resolve the persistent storage path for a form file value.
 *
 * Versioned uploads store `filePath: ''` in the form data and only keep the
 * document version / group identifiers, so the real path must be looked up in
 * `document_versions` (or `file_uploads` for legacy rows).
 */
export async function resolveFormFileStoragePath(fileData: {
  filePath?: string | null;
  url?: string | null;
  uploadId?: string | null;
  versionId?: string | null;
  groupId?: string | null;
}): Promise<string | null> {
  if (fileData.filePath) return fileData.filePath;

  const versionIds = [fileData.versionId, fileData.uploadId].filter(Boolean) as string[];
  for (const id of versionIds) {
    const { data } = await supabase
      .from('document_versions' as any)
      .select('storage_path')
      .eq('id', id)
      .maybeSingle();
    const path = (data as any)?.storage_path as string | undefined;
    if (path) return path;
  }

  if (fileData.groupId) {
    const { data: group } = await supabase
      .from('document_groups' as any)
      .select('current_version_id')
      .eq('id', fileData.groupId)
      .maybeSingle();
    const currentVersionId = (group as any)?.current_version_id as string | undefined;
    if (currentVersionId) {
      const { data: version } = await supabase
        .from('document_versions' as any)
        .select('storage_path')
        .eq('id', currentVersionId)
        .maybeSingle();
      const path = (version as any)?.storage_path as string | undefined;
      if (path) return path;
    }
    // Fallback: latest version row for this group
    const { data: latest } = await supabase
      .from('document_versions' as any)
      .select('storage_path')
      .eq('group_id', fileData.groupId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const latestPath = (latest as any)?.storage_path as string | undefined;
    if (latestPath) return latestPath;
  }

  for (const id of versionIds) {
    const { data } = await supabase
      .from('file_uploads' as any)
      .select('file_path')
      .eq('id', id)
      .maybeSingle();
    const path = (data as any)?.file_path as string | undefined;
    if (path) return path;
  }

  return null;
}


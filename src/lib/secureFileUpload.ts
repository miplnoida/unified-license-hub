import { supabase } from '@/integrations/supabase/client';

// Allowed MIME types for upload
const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
};

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const SIGNED_URL_EXPIRY = 300; // 5 minutes

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export interface SecureUploadResult {
  success: boolean;
  fileUploadId?: string;
  filePath?: string;
  error?: string;
}

interface ReplaceSecureUploadParams {
  fileUploadId: string;
  existingFilePath: string;
  userId: string;
  entityType: string;
  entityId?: string | null;
  existingMetadata?: Record<string, any> | null;
}

/**
 * Validate a file before uploading.
 * Checks MIME type, extension, and size.
 */
export function validateFile(file: File): FileValidationResult {
  // Size check
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)}MB` };
  }

  if (file.size === 0) {
    return { valid: false, error: 'File is empty' };
  }

  // MIME type check
  if (!ALLOWED_MIME_TYPES[file.type]) {
    const allowed = Object.values(ALLOWED_MIME_TYPES).flat().join(', ');
    return { valid: false, error: `File type "${file.type || 'unknown'}" is not allowed. Allowed: ${allowed}` };
  }

  // Extension check (double-verify against MIME)
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  const allowedExts = ALLOWED_MIME_TYPES[file.type];
  if (!allowedExts?.includes(ext)) {
    return { valid: false, error: `File extension "${ext}" does not match its MIME type "${file.type}"` };
  }

  // Filename sanitization check
  if (/[<>:"/\\|?*]/.test(file.name)) {
    return { valid: false, error: 'File name contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Upload a file to the private secure-documents bucket.
 * Files are stored under the user's ID folder for RLS enforcement.
 */
export async function secureUpload(
  file: File,
  userId: string,
  entityType: string,
  entityId?: string,
): Promise<SecureUploadResult> {
  // Validate first
  const validation = validateFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${userId}/${entityType}/${entityId || 'general'}/${Date.now()}-${sanitizedName}`;

  // Upload to private bucket
  const { error: uploadError } = await supabase.storage
    .from('secure-documents')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    return { success: false, error: `Upload failed: ${uploadError.message}` };
  }

  // Record in file_uploads table
  const { data: record, error: dbError } = await supabase
    .from('file_uploads' as any)
    .insert({
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      mime_type: file.type,
      file_extension: ext,
      uploaded_by: userId,
      entity_type: entityType,
      entity_id: entityId || null,
      bucket_name: 'secure-documents',
      scan_status: 'clean',
      metadata: {
        original_name: file.name,
        upload_timestamp: new Date().toISOString(),
      },
    } as any)
    .select('id')
    .single();

  if (dbError) {
    // Rollback: delete the uploaded file
    await supabase.storage.from('secure-documents').remove([filePath]);
    return { success: false, error: `Failed to record upload: ${dbError.message}` };
  }

  return {
    success: true,
    fileUploadId: (record as any)?.id,
    filePath,
  };
}

/**
 * Generate a time-limited signed URL for a file in the private bucket.
 * Default expiry: 5 minutes.
 */
export async function getSignedUrl(
  filePath: string,
  expiresIn: number = SIGNED_URL_EXPIRY,
): Promise<{ url: string | null; error?: string }> {
  const { data, error } = await supabase.storage
    .from('secure-documents')
    .createSignedUrl(filePath, expiresIn);

  if (error) {
    return { url: null, error: error.message };
  }

  return { url: data.signedUrl };
}

/**
 * Download a file securely using a signed URL.
 */
export async function secureDownload(filePath: string, fileName: string): Promise<boolean> {
  const { url, error } = await getSignedUrl(filePath, 60); // 1 min for download
  if (!url) {
    console.error('Failed to get signed URL:', error);
    return false;
  }

  const response = await fetch(url);
  if (!response.ok) return false;

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(objectUrl);
  return true;
}

/**
 * Delete a file from secure storage and its database record.
 */
export async function secureDelete(fileUploadId: string, filePath: string): Promise<boolean> {
  const { error: storageError } = await supabase.storage
    .from('secure-documents')
    .remove([filePath]);

  if (storageError) {
    console.error('Storage delete failed:', storageError);
    return false;
  }

  await supabase.from('file_uploads' as any).delete().eq('id', fileUploadId);
  return true;
}

/**
 * Replace an existing secure upload while keeping the same file_uploads row.
 * This preserves the document id so audit/history stays attached to one record.
 */
export async function replaceSecureUpload(
  file: File,
  params: ReplaceSecureUploadParams,
): Promise<SecureUploadResult> {
  const validation = validateFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const nextPath = `${params.userId}/${params.entityType}/${params.entityId || 'general'}/${Date.now()}-${sanitizedName}`;

  const { error: uploadError } = await supabase.storage
    .from('secure-documents')
    .upload(nextPath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    return { success: false, error: `Upload failed: ${uploadError.message}` };
  }

  const nextMetadata = {
    ...(params.existingMetadata || {}),
    original_name: file.name,
    upload_timestamp: new Date().toISOString(),
    replaced_at: new Date().toISOString(),
    replaced_by: params.userId,
    previous_file_path: params.existingFilePath,
  };

  const { error: updateError } = await supabase
    .from('file_uploads' as any)
    .update({
      file_name: file.name,
      file_path: nextPath,
      file_size: file.size,
      mime_type: file.type,
      file_extension: ext,
      metadata: nextMetadata,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', params.fileUploadId);

  if (updateError) {
    await supabase.storage.from('secure-documents').remove([nextPath]);
    return { success: false, error: `Failed to replace file: ${updateError.message}` };
  }

  if (params.existingFilePath) {
    const { error: cleanupError } = await supabase.storage
      .from('secure-documents')
      .remove([params.existingFilePath]);

    if (cleanupError) {
      console.warn('[replaceSecureUpload] old file cleanup failed:', cleanupError.message);
    }
  }

  return {
    success: true,
    fileUploadId: params.fileUploadId,
    filePath: nextPath,
  };
}

export const ACCEPT_STRING = Object.values(ALLOWED_MIME_TYPES).flat().join(',');
export { MAX_FILE_SIZE, SIGNED_URL_EXPIRY };

/**
 * Document Versioning service for Form Management.
 *
 * Wraps the existing secure-documents bucket + file_uploads table with a
 * versioned document_groups / document_versions / document_action_logs model.
 *
 * No service role is used on the client. All access is RLS-enforced.
 */
import { supabase } from '@/integrations/supabase/client';
import { validateFile, ACCEPT_STRING, MAX_FILE_SIZE } from '@/lib/secureFileUpload';

export { ACCEPT_STRING, MAX_FILE_SIZE };

const BUCKET = 'secure-documents';
const SIGNED_URL_EXPIRY = 300;

export interface DocGroupRef {
  groupId: string;
  versionId: string;
  version: number;
  fileUploadId: string;
}

export interface BatchUploadItem {
  file: File;
  documentType: string;
  displayName?: string;
  documentLabel?: string;
  /** If supplied, file is added as a new version of this existing group. */
  groupId?: string;
  changeNote?: string;
  formId?: string;
  fieldId?: string;
  submissionId?: string;
}

export interface BatchUploadResult {
  fileName: string;
  success: boolean;
  groupId?: string;
  versionId?: string;
  version?: number;
  error?: string;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function safeDocType(documentType: string): string {
  return documentType.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase() || 'document';
}

async function sha256Hex(file: File): Promise<string | null> {
  try {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

async function uploadPhysicalFile(params: {
  file: File;
  userId: string;
  entityType: string;
  entityId: string | null;
  documentType: string;
  groupId: string;
  version: number;
}): Promise<
  | { ok: true; filePath: string; fileUploadId: string; safeName: string; ext: string; checksum: string | null }
  | { ok: false; error: string }
> {
  const { file, userId, entityType, entityId, documentType, groupId, version } = params;
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || 'bin');
  const safeName = sanitize(file.name);
  const filePath =
    `form-management/${entityType}/${entityId || 'general'}/${safeDocType(documentType)}/${groupId}/v${version}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, { cacheControl: '3600', upsert: false });
  if (uploadError) return { ok: false, error: uploadError.message };

  const checksum = await sha256Hex(file);

  const { data: record, error: dbError } = await supabase
    .from('file_uploads' as any)
    .insert({
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      mime_type: file.type,
      file_extension: ext,
      uploaded_by: userId,
      entity_type: 'document_version',
      entity_id: groupId,
      bucket_name: BUCKET,
      scan_status: 'clean',
      metadata: {
        original_name: file.name,
        safe_name: safeName,
        document_type: documentType,
        document_group_id: groupId,
        version,
        checksum_sha256: checksum,
      },
    } as any)
    .select('id')
    .single();

  if (dbError) {
    await supabase.storage.from(BUCKET).remove([filePath]);
    return { ok: false, error: dbError.message };
  }
  return { ok: true, filePath, fileUploadId: (record as any).id, safeName, ext, checksum };
}

/**
 * Upload a file as a new version of a (new or existing) logical document.
 * The server-side `create_document_version_metadata` RPC atomically:
 *   - finds-or-creates the document_groups row,
 *   - allocates the next version number,
 *   - inserts the document_versions row with full metadata,
 *   - updates current_version_id,
 *   - writes a document_action_logs entry.
 */
export async function uploadVersionedDocument(args: {
  file: File;
  userId: string;
  entityType: string;
  entityId?: string | null;
  documentType: string;
  documentLabel?: string;
  displayName?: string;
  changeNote?: string;
  formId?: string;
  fieldId?: string;
  submissionId?: string;
  /** If supplied, force a new version on this group instead of find-or-create. */
  groupId?: string;
}): Promise<{ success: true; data: DocGroupRef } | { success: false; error: string }> {
  const validation = validateFile(args.file);
  if (!validation.valid) {
    // Best-effort validation_failed log (only possible if we have a group ref).
    return { success: false, error: validation.error || 'Invalid file' };
  }

  // We need a group id for the storage path. If caller did not supply one,
  // probe for an existing matching group; if none, mint a provisional uuid for
  // the path — the RPC will create the real group row using the same logical
  // key and atomically attach the version. We then move the file only if the
  // RPC returns a different group id (rare race).
  let stagingGroupId = args.groupId;
  if (!stagingGroupId) {
    const { data: existing } = await supabase
      .from('document_groups' as any)
      .select('id')
      .eq('entity_type', args.entityType)
      .eq('document_type', args.documentType)
      .eq('owner_id', args.userId)
      .eq('form_id', args.formId || '')
      .eq('field_id', args.fieldId || '')
      .maybeSingle();
    stagingGroupId = (existing as any)?.id || crypto.randomUUID();
  }

  // Pre-compute provisional version for the storage path; RPC is source of truth.
  const { data: maxRow } = await supabase
    .from('document_versions' as any)
    .select('version')
    .eq('group_id', stagingGroupId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const provisional = ((maxRow as any)?.version || 0) + 1;

  const physical = await uploadPhysicalFile({
    file: args.file,
    userId: args.userId,
    entityType: args.entityType,
    entityId: args.entityId || null,
    documentType: args.documentType,
    groupId: stagingGroupId,
    version: provisional,
  });
  if (physical.ok !== true) {
    return { success: false, error: (physical as { ok: false; error: string }).error };
  }

  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    'create_document_version_metadata' as any,
    {
      _entity_type: args.entityType,
      _entity_id: args.entityId || null,
      _document_type: args.documentType,
      _document_label: args.documentLabel || args.displayName || args.file.name,
      _form_id: args.formId || null,
      _field_id: args.fieldId || null,
      _submission_id: args.submissionId || null,
      _bucket: BUCKET,
      _storage_path: physical.filePath,
      _file_upload_id: physical.fileUploadId,
      _original_file_name: args.file.name,
      _safe_file_name: physical.safeName,
      _file_size: args.file.size,
      _mime_type: args.file.type,
      _extension: physical.ext,
      _checksum: physical.checksum,
      _metadata: { display_name: args.displayName || args.file.name },
      _change_note: args.changeNote || null,
      _group_id: args.groupId || null,
    } as any,
  );

  if (rpcErr || !rpcData || (Array.isArray(rpcData) && rpcData.length === 0)) {
    await supabase.storage.from(BUCKET).remove([physical.filePath]);
    await supabase.from('file_uploads' as any).delete().eq('id', physical.fileUploadId);
    return { success: false, error: rpcErr?.message || 'Failed to register version' };
  }

  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  return {
    success: true,
    data: {
      groupId: (row as any).document_upload_id,
      versionId: (row as any).document_version_id,
      version: (row as any).version_number,
      fileUploadId: physical.fileUploadId,
    },
  };
}

// Back-compat shims (older callers and tests)
export async function uploadNewDocument(args: Parameters<typeof uploadVersionedDocument>[0]) {
  return uploadVersionedDocument(args);
}
export async function uploadNewVersion(args: {
  groupId: string; file: File; userId: string; changeNote?: string;
}) {
  // Look up the group's logical keys so the storage path is consistent.
  const { data: g } = await supabase
    .from('document_groups' as any)
    .select('entity_type, entity_id, document_type, document_label, form_id, field_id, submission_id')
    .eq('id', args.groupId)
    .maybeSingle();
  return uploadVersionedDocument({
    file: args.file,
    userId: args.userId,
    entityType: (g as any)?.entity_type || 'unknown',
    entityId: (g as any)?.entity_id || null,
    documentType: (g as any)?.document_type || 'document',
    documentLabel: (g as any)?.document_label,
    formId: (g as any)?.form_id,
    fieldId: (g as any)?.field_id,
    submissionId: (g as any)?.submission_id,
    changeNote: args.changeNote,
    groupId: args.groupId,
  });
}

/**
 * Batch upload. Each file is validated and uploaded independently — a single
 * failure never aborts the batch.
 */
export async function batchUploadDocuments(args: {
  userId: string;
  entityType: string;
  entityId?: string | null;
  items: BatchUploadItem[];
}): Promise<BatchUploadResult[]> {
  const results: BatchUploadResult[] = [];
  for (const item of args.items) {
    try {
      const r = await uploadVersionedDocument({
        file: item.file,
        userId: args.userId,
        entityType: args.entityType,
        entityId: args.entityId,
        documentType: item.documentType,
        documentLabel: item.documentLabel,
        displayName: item.displayName,
        changeNote: item.changeNote,
        formId: item.formId,
        fieldId: item.fieldId,
        submissionId: item.submissionId,
        groupId: item.groupId,
      });
      results.push(
        r.success === true
          ? { fileName: item.file.name, success: true, ...(r as { success: true; data: DocGroupRef }).data }
          : { fileName: item.file.name, success: false, error: (r as { success: false; error: string }).error },
      );
    } catch (err: any) {
      results.push({ fileName: item.file.name, success: false, error: err?.message || 'Unknown error' });
    }
  }
  // Best-effort batch summary log on each unique group touched
  const groupIds = Array.from(new Set(results.filter(r => r.success && r.groupId).map(r => r.groupId!)));
  for (const gid of groupIds) {
    await supabase.rpc('log_document_batch_action' as any, {
      _group_id: gid,
      _action: 'batch_uploaded',
      _details: {
        files: results.filter(r => r.groupId === gid).map(r => ({ name: r.fileName, success: r.success, version: r.version })),
      },
    } as any);
  }
  return results;
}
}

// -------- Query helpers --------

export interface DocumentGroupRow {
  id: string;
  entity_type: string;
  entity_id: string | null;
  document_type: string;
  display_name: string | null;
  owner_id: string;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersionRow {
  id: string;
  group_id: string;
  version: number;
  file_upload_id: string;
  uploaded_by: string;
  change_note: string | null;
  created_at: string;
  file?: {
    file_name: string;
    file_size: number;
    mime_type: string;
    file_path: string;
  } | null;
}

export async function listGroupsForEntity(entityType: string, entityId: string | null) {
  let q = supabase.from('document_groups' as any).select('*').eq('entity_type', entityType);
  q = entityId ? q.eq('entity_id', entityId) : q.is('entity_id', null);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as DocumentGroupRow[];
}

export async function listVersions(groupId: string): Promise<DocumentVersionRow[]> {
  const { data: versions, error } = await supabase
    .from('document_versions' as any)
    .select('*')
    .eq('group_id', groupId)
    .order('version', { ascending: false });
  if (error) throw error;

  const ids = (versions || []).map((v: any) => v.file_upload_id);
  if (ids.length === 0) return [];
  const { data: files } = await supabase
    .from('file_uploads' as any)
    .select('id, file_name, file_size, mime_type, file_path')
    .in('id', ids);
  const fileMap = new Map<string, any>((files || []).map((f: any) => [f.id, f]));
  return (versions || []).map((v: any) => ({ ...v, file: fileMap.get(v.file_upload_id) || null }));
}

export async function listActionLogs(groupId: string) {
  const { data, error } = await supabase
    .from('document_action_logs' as any)
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getVersionSignedUrl(version: DocumentVersionRow): Promise<string | null> {
  if (!version.file?.file_path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(version.file.file_path, SIGNED_URL_EXPIRY);
  if (error || !data) return null;

  // Best-effort action log; don't fail the download if RLS blocks the insert.
  const { data: user } = await supabase.auth.getUser();
  if (user.user) {
    await supabase.from('document_action_logs' as any).insert({
      group_id: version.group_id,
      version_id: version.id,
      actor_id: user.user.id,
      action: 'download',
      details: { version: version.version },
    } as any);
  }
  return data.signedUrl;
}

export async function softDeleteVersion(version: DocumentVersionRow): Promise<boolean> {
  const { error } = await supabase
    .from('document_versions' as any)
    .update({ is_deleted: true } as any)
    .eq('id', version.id);
  if (error) return false;
  const { data: user } = await supabase.auth.getUser();
  if (user.user) {
    await supabase.from('document_action_logs' as any).insert({
      group_id: version.group_id,
      version_id: version.id,
      actor_id: user.user.id,
      action: 'delete',
      details: { version: version.version },
    } as any);
  }
  return true;
}

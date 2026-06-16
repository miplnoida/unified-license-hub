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
  /** If supplied, file is added as a new version of this existing group. */
  groupId?: string;
  changeNote?: string;
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

type PhysicalResult =
  | { ok: true; filePath: string; fileUploadId: string }
  | { ok: false; error: string };

async function uploadPhysicalFile(params: {
  file: File;
  userId: string;
  entityType: string;
  entityId: string | null;
  documentType: string;
  groupId: string;
  version: number;
}): Promise<{ ok: true; filePath: string; fileUploadId: string } | { ok: false; error: string }> {
  const { file, userId, entityType, entityId, documentType, groupId, version } = params;
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || 'bin');
  const safeName = sanitize(file.name);
  const filePath =
    `form-management/${entityType}/${entityId || 'general'}/${safeDocType(documentType)}/${groupId}/v${version}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, { cacheControl: '3600', upsert: false });

  if (uploadError) return { ok: false, error: uploadError.message };

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
        document_type: documentType,
        document_group_id: groupId,
        version,
      },
    } as any)
    .select('id')
    .single();

  if (dbError) {
    await supabase.storage.from(BUCKET).remove([filePath]);
    return { ok: false, error: dbError.message };
  }
  return { ok: true, filePath, fileUploadId: (record as any).id };
}

/**
 * Create a brand-new document group and upload v1.
 */
export async function uploadNewDocument(args: {
  file: File;
  userId: string;
  entityType: string;
  entityId?: string | null;
  documentType: string;
  displayName?: string;
  changeNote?: string;
}): Promise<{ success: true; data: DocGroupRef } | { success: false; error: string }> {
  const validation = validateFile(args.file);
  if (!validation.valid) return { success: false, error: validation.error || 'Invalid file' };

  // 1) Create empty group
  const { data: group, error: groupErr } = await supabase
    .from('document_groups' as any)
    .insert({
      entity_type: args.entityType,
      entity_id: args.entityId || null,
      document_type: args.documentType,
      display_name: args.displayName || args.file.name,
      owner_id: args.userId,
    } as any)
    .select('id')
    .single();

  if (groupErr || !group) return { success: false, error: groupErr?.message || 'Failed to create group' };
  const groupId = (group as any).id as string;

  // 2) Upload physical file as v1
  const physical = await uploadPhysicalFile({
    file: args.file,
    userId: args.userId,
    entityType: args.entityType,
    entityId: args.entityId || null,
    documentType: args.documentType,
    groupId,
    version: 1,
  });
  if (physical.ok !== true) {
    await supabase.from('document_groups' as any).delete().eq('id', groupId);
    return { success: false, error: (physical as { ok: false; error: string }).error };
  }

  // 3) Atomically create version row + bump pointer + log action
  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    'create_document_version' as any,
    {
      _group_id: groupId,
      _file_upload_id: physical.fileUploadId,
      _change_note: args.changeNote || null,
      _action: 'upload',
    } as any,
  );

  if (rpcErr || !rpcData || (Array.isArray(rpcData) && rpcData.length === 0)) {
    await supabase.storage.from(BUCKET).remove([physical.filePath]);
    await supabase.from('document_groups' as any).delete().eq('id', groupId);
    return { success: false, error: rpcErr?.message || 'Failed to register version' };
  }

  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  return {
    success: true,
    data: {
      groupId,
      versionId: (row as any).version_id,
      version: (row as any).version,
      fileUploadId: physical.fileUploadId,
    },
  };
}

/**
 * Add a new version to an existing document group.
 */
export async function uploadNewVersion(args: {
  groupId: string;
  file: File;
  userId: string;
  changeNote?: string;
}): Promise<{ success: true; data: DocGroupRef } | { success: false; error: string }> {
  const validation = validateFile(args.file);
  if (!validation.valid) return { success: false, error: validation.error || 'Invalid file' };

  const { data: group, error: groupErr } = await supabase
    .from('document_groups' as any)
    .select('id, entity_type, entity_id, document_type, owner_id')
    .eq('id', args.groupId)
    .maybeSingle();

  if (groupErr || !group) return { success: false, error: groupErr?.message || 'Group not found' };

  // Pre-compute provisional version number for the storage path. The RPC
  // is the source of truth and will allocate the real number atomically.
  const { data: maxRow } = await supabase
    .from('document_versions' as any)
    .select('version')
    .eq('group_id', args.groupId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const provisional = ((maxRow as any)?.version || 0) + 1;
  const physical = await uploadPhysicalFile({
    file: args.file,
    userId: args.userId,
    entityType: (group as any).entity_type,
    entityId: (group as any).entity_id,
    documentType: (group as any).document_type,
    groupId: args.groupId,
    version: provisional,
  });
  if (physical.ok !== true) return { success: false, error: (physical as { ok: false; error: string }).error };

  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    'create_document_version' as any,
    {
      _group_id: args.groupId,
      _file_upload_id: physical.fileUploadId,
      _change_note: args.changeNote || null,
      _action: 'new_version',
    } as any,
  );

  if (rpcErr || !rpcData) {
    await supabase.storage.from(BUCKET).remove([physical.filePath]);
    return { success: false, error: rpcErr?.message || 'Failed to register version' };
  }

  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  return {
    success: true,
    data: {
      groupId: args.groupId,
      versionId: (row as any).version_id,
      version: (row as any).version,
      fileUploadId: physical.fileUploadId,
    },
  };
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
      if (item.groupId) {
        const r = await uploadNewVersion({
          groupId: item.groupId,
          file: item.file,
          userId: args.userId,
          changeNote: item.changeNote,
        });
        results.push(
          r.success === true
            ? { fileName: item.file.name, success: true, ...(r as { success: true; data: DocGroupRef }).data }
            : { fileName: item.file.name, success: false, error: (r as { success: false; error: string }).error },
        );
      } else {
        const r = await uploadNewDocument({
          file: item.file,
          userId: args.userId,
          entityType: args.entityType,
          entityId: args.entityId,
          documentType: item.documentType,
          displayName: item.displayName,
          changeNote: item.changeNote,
        });
        results.push(
          r.success === true
            ? { fileName: item.file.name, success: true, ...(r as { success: true; data: DocGroupRef }).data }
            : { fileName: item.file.name, success: false, error: (r as { success: false; error: string }).error },
        );
      }
    } catch (err: any) {
      results.push({ fileName: item.file.name, success: false, error: err?.message || 'Unknown error' });
    }
  }
  return results;
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

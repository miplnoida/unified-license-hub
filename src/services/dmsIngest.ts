/**
 * Central DMS ingestion service — the ONE way the platform accepts a document.
 *
 * From the officer's point of view "Add Document" is a single business action.
 * Technically it is a controlled two-phase operation, because object storage and
 * the database are separate systems:
 *
 *   1. `dms_ingest_begin`    — server validates authority, business context and
 *                              taxonomy, then issues a short-lived ingest
 *                              session and a controlled storage location.
 *   2. binary upload         — the browser writes ONLY the file, to that path.
 *   3. `dms_ingest_finalize` — server registers the file, the document (or its
 *                              next version), classification defaults,
 *                              retention, source context, canonical
 *                              relationships and the action history.
 *
 * The browser performs NO business-table writes: `file_uploads`,
 * `document_groups`, `document_versions` and `document_relationships` are all
 * written server-side. Callers never see bucket layout, version allocation or
 * relationship schema.
 *
 * `secureUpload` (legacy transport) and `uploadVersionedDocument` (Form
 * Management compatibility) must NOT be used for new canonical upload flows.
 */
import { supabase } from '@/integrations/supabase/client';
import { validateFile } from '@/lib/secureFileUpload';
import { describeDmsError } from '@/services/dms';

export type DmsIngestMode = 'NEW_DOCUMENT' | 'NEW_VERSION';

/** Business record the document is being filed against (picker vocabulary). */
export interface DmsIngestContext {
  recordType: string;
  recordId: string;
  categoryCode?: string | null;
  typeCode?: string | null;
  evidentiaryRole?: string | null;
  sourceModule?: string | null;
}

export interface DmsIngestSession {
  session_id: string;
  bucket: string;
  storage_prefix: string;
  mode: DmsIngestMode;
  expires_at: string;
}

export interface DmsIngestResult {
  groupId: string;
  versionId: string;
  version: number;
  documentReference: string | null;
  /** applied = filed against the record; anything else needs reconciliation. */
  contextStatus: string;
  alreadyFinalized: boolean;
  /** Business-language notice when the document is registered but not yet filed. */
  filingNotice?: string;
}

type Outcome<T> = { success: true; data: T } | { success: false; error: string };

const FILING_NOTICE =
  'Document uploaded, but filing against this record needs attention.';

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function extensionOf(name: string): string {
  const part = name.split('.').pop();
  return part ? `.${part.toLowerCase()}` : '.bin';
}

async function checksumOf(file: File): Promise<string | null> {
  try {
    const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/** Phase 1 — authority, context and a controlled storage location. */
export async function beginDocumentIngest(args: {
  mode: DmsIngestMode;
  context: DmsIngestContext;
  /** Required for NEW_VERSION: the logical document receiving the new version. */
  groupId?: string | null;
}): Promise<Outcome<DmsIngestSession>> {
  const { data, error } = await supabase.rpc('dms_ingest_begin' as any, {
    _mode: args.mode,
    _picker_type: args.context.recordType,
    _record_id: args.context.recordId,
    _document_group_id: args.groupId ?? null,
    _category_code: args.context.categoryCode ?? null,
    _type_code: args.context.typeCode ?? null,
    _evidentiary_role: args.context.evidentiaryRole ?? null,
    _source_module: args.context.sourceModule ?? null,
  } as any);
  if (error) return { success: false, error: describeDmsError(error.message) };
  const row = (Array.isArray(data) ? data[0] : data) as DmsIngestSession | undefined;
  if (!row?.session_id) return { success: false, error: 'Upload could not be started. Please try again.' };
  return { success: true, data: row };
}

/** Phase 3 — governed registration of the uploaded object. */
export async function finalizeDocumentIngest(args: {
  sessionId: string;
  storagePath: string;
  file: File;
  checksum?: string | null;
  displayName?: string | null;
  changeNote?: string | null;
}): Promise<Outcome<DmsIngestResult>> {
  const { data, error } = await supabase.rpc('dms_ingest_finalize' as any, {
    _session_id: args.sessionId,
    _storage_path: args.storagePath,
    _file_name: args.file.name,
    _file_size: args.file.size,
    _mime_type: args.file.type,
    _extension: extensionOf(args.file.name),
    _checksum: args.checksum ?? null,
    _display_name: args.displayName ?? null,
    _change_note: args.changeNote ?? null,
  } as any);
  if (error) return { success: false, error: describeDmsError(error.message) };
  const row = (Array.isArray(data) ? data[0] : data) as any;
  if (!row?.group_id) return { success: false, error: 'The document could not be registered.' };
  const contextStatus = String(row.context_status ?? 'applied');
  return {
    success: true,
    data: {
      groupId: row.group_id,
      versionId: row.version_id,
      version: Number(row.version ?? 1),
      documentReference: row.document_reference ?? null,
      contextStatus,
      alreadyFinalized: !!row.already_finalized,
      filingNotice: contextStatus === 'applied' ? undefined : FILING_NOTICE,
    },
  };
}

export async function abortDocumentIngest(sessionId: string, reason?: string): Promise<void> {
  await supabase.rpc('dms_ingest_abort' as any, {
    _session_id: sessionId,
    _reason: reason ?? null,
  } as any);
}

/** Housekeeping for abandoned staging uploads. Never touches a finalized document. */
export async function cleanupExpiredIngests(limit = 200) {
  const { data, error } = await supabase.rpc('dms_ingest_cleanup_expired' as any, { _limit: limit } as any);
  if (error) return { success: false as const, error: describeDmsError(error.message) };
  const row = (Array.isArray(data) ? data[0] : data) as any;
  return { success: true as const, data: { expired: Number(row?.expired ?? 0) } };
}

/** The single business operation: upload a file and file it centrally. */
async function ingest(args: {
  mode: DmsIngestMode;
  file: File;
  context: DmsIngestContext;
  groupId?: string | null;
  displayName?: string | null;
  changeNote?: string | null;
}): Promise<Outcome<DmsIngestResult>> {
  const validation = validateFile(args.file);
  if (!validation.valid) return { success: false, error: validation.error || 'That file cannot be accepted.' };

  const begun = await beginDocumentIngest({
    mode: args.mode,
    context: args.context,
    groupId: args.groupId ?? null,
  });
  if (begun.success !== true) return { success: false, error: begun.error };
  const session = begun.data;

  const storagePath = `${session.storage_prefix}/${Date.now()}-${sanitize(args.file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(session.bucket)
    .upload(storagePath, args.file, { cacheControl: '3600', upsert: false });

  if (uploadError) {
    await abortDocumentIngest(session.session_id, 'storage_upload_failed');
    return { success: false, error: `The file could not be uploaded: ${uploadError.message}` };
  }

  const checksum = await checksumOf(args.file);
  const finalized = await finalizeDocumentIngest({
    sessionId: session.session_id,
    storagePath,
    file: args.file,
    checksum,
    displayName: args.displayName ?? null,
    changeNote: args.changeNote ?? null,
  });

  if (!finalized.success) {
    // The staged object is not a document: leave the session recoverable and
    // remove the abandoned object so staging never accumulates.
    await abortDocumentIngest(session.session_id, 'registration_failed');
    await supabase.storage.from(session.bucket).remove([storagePath]);
    return finalized;
  }

  return finalized;
}

/** Upload New — registers a brand new logical document and files it automatically. */
export async function uploadNewDocument(args: {
  file: File;
  context: DmsIngestContext;
  displayName?: string | null;
  changeNote?: string | null;
}) {
  return ingest({ ...args, mode: 'NEW_DOCUMENT' });
}

/** Add Version — a further version of the SAME logical document. */
export async function uploadNewVersion(args: {
  file: File;
  groupId: string;
  context: DmsIngestContext;
  changeNote?: string | null;
}) {
  return ingest({ ...args, mode: 'NEW_VERSION' });
}

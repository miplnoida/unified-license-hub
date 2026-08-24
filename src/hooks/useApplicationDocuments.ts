/**
 * Consolidated application document resolver.
 *
 * Application files live in several representations:
 *  - versioned store: `document_groups` -> `document_versions` (current uploads,
 *    including files attached inside dynamic form fields)
 *  - secure store: `file_uploads` (entity_type 'application' or 'form_field')
 *  - legacy store: `documents`
 *  - references embedded inside `applications.data.forms_data`
 *
 * This hook reads every source in parallel, normalises the rows, and
 * deduplicates by physical storage path (then version id, then upload id) so a
 * single file never renders twice. Errors are surfaced instead of being
 * collapsed into an empty list.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { resolveFormFileStoragePath } from '@/lib/formFileUpload';

export interface ApplicationDocumentItem {
  key: string;
  fileName: string;
  documentType: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string | null;
  version: number | null;
  bucket: string;
  storagePath: string;
  /** Richness rank used when the same file surfaces from several sources. */
  rank: number;
}

const SECURE_BUCKET = 'secure-documents';
const LEGACY_BUCKET = 'documents';

function pushItem(map: Map<string, ApplicationDocumentItem>, item: ApplicationDocumentItem) {
  if (!item.storagePath) return;
  const existing = map.get(item.storagePath);
  if (!existing || item.rank > existing.rank) map.set(item.storagePath, item);
}

export function useApplicationDocuments(
  applicationId: string | undefined,
  formsData?: Record<string, any> | null,
  refreshKey?: number,
) {
  const [items, setItems] = useState<ApplicationDocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!applicationId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const [groupsRes, appUploadsRes, formFieldUploadsRes, legacyRes] = await Promise.all([
        supabase
          .from('document_groups' as any)
          .select('id, document_type, display_name, current_version_id, created_at, updated_at')
          .eq('entity_type', 'application')
          .eq('entity_id', applicationId),
        supabase
          .from('file_uploads' as any)
          .select('id, file_name, file_path, file_size, mime_type, created_at')
          .eq('entity_type', 'application')
          .eq('entity_id', applicationId),
        supabase
          .from('file_uploads' as any)
          .select('id, file_name, file_path, file_size, mime_type, created_at')
          .eq('entity_type', 'form_field')
          .eq('entity_id', applicationId),
        supabase
          .from('documents' as any)
          .select('id, file_name, file_path, file_size, mime_type, created_at')
          .eq('entity_type', 'application')
          .eq('entity_id', applicationId),
      ]);

      const firstError =
        groupsRes.error || appUploadsRes.error || formFieldUploadsRes.error || legacyRes.error;
      if (firstError) throw firstError;

      const map = new Map<string, ApplicationDocumentItem>();

      // 1. Versioned store — richest metadata (document type + version number).
      const groups = ((groupsRes.data as any[]) || []);
      if (groups.length > 0) {
        const { data: versions, error: verErr } = await supabase
          .from('document_versions' as any)
          .select(
            'id, group_id, version, bucket, storage_path, original_file_name, safe_file_name, file_size, mime_type, created_at, is_deleted',
          )
          .in('group_id', groups.map(g => g.id))
          .order('version', { ascending: false });
        if (verErr) throw verErr;

        const groupById = new Map(groups.map(g => [g.id, g]));
        const seenGroup = new Set<string>();
        for (const v of ((versions as any[]) || [])) {
          if (v.is_deleted) continue;
          const group = groupById.get(v.group_id);
          const isCurrent = group?.current_version_id === v.id || !seenGroup.has(v.group_id);
          if (!isCurrent) continue;
          seenGroup.add(v.group_id);
          pushItem(map, {
            key: `version-${v.id}`,
            fileName: v.original_file_name || v.safe_file_name || group?.display_name || 'Document',
            documentType: group?.document_type || null,
            fileSize: v.file_size ?? null,
            mimeType: v.mime_type ?? null,
            createdAt: v.created_at ?? group?.created_at ?? null,
            version: v.version ?? null,
            bucket: v.bucket || SECURE_BUCKET,
            storagePath: v.storage_path,
            rank: 3,
          });
        }
      }

      // 2. Secure uploads recorded directly against the application / form fields.
      for (const source of [appUploadsRes, formFieldUploadsRes]) {
        for (const u of ((source.data as any[]) || [])) {
          pushItem(map, {
            key: `upload-${u.id}`,
            fileName: u.file_name || 'Document',
            documentType: null,
            fileSize: u.file_size ?? null,
            mimeType: u.mime_type ?? null,
            createdAt: u.created_at ?? null,
            version: null,
            bucket: SECURE_BUCKET,
            storagePath: u.file_path,
            rank: 2,
          });
        }
      }

      // 3. Legacy documents table.
      for (const d of ((legacyRes.data as any[]) || [])) {
        pushItem(map, {
          key: `legacy-${d.id}`,
          fileName: d.file_name || 'Document',
          documentType: null,
          fileSize: d.file_size ?? null,
          mimeType: d.mime_type ?? null,
          createdAt: d.created_at ?? null,
          version: null,
          bucket: LEGACY_BUCKET,
          storagePath: d.file_path,
          rank: 1,
        });
      }

      // 4. File references saved only inside submitted form data.
      const formFileValues: any[] = [];
      const walk = (value: any) => {
        if (!value) return;
        if (Array.isArray(value)) {
          value.forEach(walk);
          return;
        }
        if (typeof value === 'object') {
          const looksLikeFile =
            'filePath' in value || 'uploadId' in value || 'versionId' in value || 'groupId' in value;
          if (looksLikeFile && (value.fileName || value.name || value.filePath)) {
            formFileValues.push(value);
            return;
          }
          Object.values(value).forEach(walk);
        }
      };
      walk(formsData || null);

      if (formFileValues.length > 0) {
        const resolved = await Promise.all(
          formFileValues.map(async v => ({
            value: v,
            path: await resolveFormFileStoragePath(v).catch(() => null),
          })),
        );
        for (const { value, path } of resolved) {
          if (!path) continue;
          pushItem(map, {
            key: `form-${path}`,
            fileName: value.fileName || value.name || 'Form attachment',
            documentType: 'Form attachment',
            fileSize: value.fileSize ?? value.size ?? null,
            mimeType: value.mimeType ?? value.type ?? null,
            createdAt: value.uploadedAt ?? null,
            version: null,
            bucket: SECURE_BUCKET,
            storagePath: path,
            rank: 0,
          });
        }
      }

      const merged = Array.from(map.values()).sort((a, b) => {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bt - at;
      });
      setItems(merged);
    } catch (err: any) {
      setError(err?.message || 'Unable to load documents');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [applicationId, formsData, refreshKey]);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, error, reload: load };
}

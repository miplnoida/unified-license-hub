import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { History, Loader2, Upload, FileText, Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  listGroupsForEntity,
  listVersions,
  getVersionSignedUrl,
  type DocumentGroupRow,
  type DocumentVersionRow,
} from '@/lib/documentVersioning';
import { DocumentVersionHistoryDialog } from './DocumentVersionHistoryDialog';
import { VersionedDocumentUploader } from './VersionedDocumentUploader';

interface Props {
  entityType: string;
  entityId?: string | null;
  documentTypeOptions?: string[];
  /** Hide the inline new-document uploader. */
  readOnly?: boolean;
}

interface GroupWithCurrent extends DocumentGroupRow {
  current?: DocumentVersionRow | null;
  versionCount: number;
}

export function DocumentGroupList({ entityType, entityId, documentTypeOptions, readOnly }: Props) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupWithCurrent[]>([]);
  const [historyGroup, setHistoryGroup] = useState<GroupWithCurrent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listGroupsForEntity(entityType, entityId ?? null);
      const enriched = await Promise.all(
        rows.map(async g => {
          const versions = await listVersions(g.id);
          return {
            ...g,
            versionCount: versions.length,
            current: versions.find(v => v.id === g.current_version_id) || versions[0] || null,
          } as GroupWithCurrent;
        }),
      );
      setGroups(enriched);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownloadCurrent = async (g: GroupWithCurrent) => {
    if (!g.current) return;
    const url = await getVersionSignedUrl(g.current);
    if (!url) {
      toast.error('Unable to generate download link');
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = g.current.file?.file_name || g.display_name || 'document';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="rounded-md border p-3 bg-muted/20">
          <div className="flex items-center gap-2 mb-2 text-sm font-medium">
            <Upload className="h-4 w-4" /> Add documents
          </div>
          <VersionedDocumentUploader
            entityType={entityType}
            entityId={entityId}
            documentTypeOptions={documentTypeOptions}
            onUploaded={() => load()}
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading documents…
        </div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
      ) : (
        <div className="divide-y rounded-md border">
          {groups.map(g => (
            <div
              key={g.id}
              className="p-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {g.display_name || g.current?.file?.file_name || '—'}
                    </span>
                    <Badge variant="secondary">{g.document_type}</Badge>
                    {g.current && <Badge>v{g.current.version}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {g.versionCount} version{g.versionCount !== 1 ? 's' : ''} ·{' '}
                    {new Date(g.updated_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => handleDownloadCurrent(g)}>
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
                <Button variant="outline" size="sm" onClick={() => setHistoryGroup(g)}>
                  <History className="h-4 w-4 mr-1" />
                  History
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <DocumentVersionHistoryDialog
        open={!!historyGroup}
        onOpenChange={o => !o && setHistoryGroup(null)}
        groupId={historyGroup?.id || null}
        groupName={historyGroup?.display_name || undefined}
        currentVersionId={historyGroup?.current_version_id || null}
      />
    </div>
  );
}

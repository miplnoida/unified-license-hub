import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Loader2, History, FileText } from 'lucide-react';
import { toast } from 'sonner';
import {
  listVersions,
  listActionLogs,
  getVersionSignedUrl,
  type DocumentVersionRow,
} from '@/lib/documentVersioning';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string | null;
  groupName?: string;
  currentVersionId?: string | null;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentVersionHistoryDialog({
  open,
  onOpenChange,
  groupId,
  groupName,
  currentVersionId,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<DocumentVersionRow[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!open || !groupId) return;
    setLoading(true);
    Promise.all([listVersions(groupId), listActionLogs(groupId)])
      .then(([v, l]) => {
        setVersions(v);
        setLogs(l);
      })
      .catch(err => toast.error(err.message || 'Failed to load history'))
      .finally(() => setLoading(false));
  }, [open, groupId]);

  const handleDownload = async (v: DocumentVersionRow) => {
    const url = await getVersionSignedUrl(v);
    if (!url) {
      toast.error('Unable to generate download link');
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = v.file?.file_name || `version-${v.version}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version history{groupName ? ` — ${groupName}` : ''}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading…
          </div>
        ) : (
          <div className="space-y-6">
            <section>
              <h4 className="text-sm font-semibold mb-2">Versions ({versions.length})</h4>
              {versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No versions yet.</p>
              ) : (
                <div className="divide-y rounded-md border">
                  {versions.map(v => (
                    <div key={v.id} className="p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">
                              {v.file?.file_name || `version ${v.version}`}
                            </span>
                            <Badge variant={v.id === currentVersionId ? 'default' : 'secondary'}>
                              v{v.version}
                              {v.id === currentVersionId ? ' · current' : ''}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {v.file ? formatSize(v.file.file_size) + ' · ' : ''}
                            {new Date(v.created_at).toLocaleString()}
                          </p>
                          {v.change_note && (
                            <p className="text-xs text-muted-foreground mt-1 italic">
                              {v.change_note}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleDownload(v)}>
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h4 className="text-sm font-semibold mb-2">Action log ({logs.length})</h4>
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No actions recorded.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {logs.map(l => (
                    <li key={l.id} className="flex items-center justify-between border-b py-1">
                      <span>
                        <Badge variant="outline" className="mr-2">
                          {l.action}
                        </Badge>
                        {l.details?.version ? `v${l.details.version}` : ''}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(l.created_at).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

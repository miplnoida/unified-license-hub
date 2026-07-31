import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Download, FileText, Loader2, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  getCorrespondenceFileUrl,
  uploadCorrespondenceFile,
  type CorrespondenceAttachment,
} from '@/hooks/useCorrespondence';

export function AttachmentsPanel({
  threadId,
  attachments,
  canUpload = true,
}: {
  threadId: string;
  attachments: CorrespondenceAttachment[];
  canUpload?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await uploadCorrespondenceFile(threadId, f);
      toast.success('Attachment uploaded');
      qc.invalidateQueries({ queryKey: ['correspondence-thread', threadId] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const download = async (path: string) => {
    try {
      const url = await getCorrespondenceFileUrl(path);
      window.open(url, '_blank', 'noopener');
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not open file');
    }
  };

  return (
    <div className="space-y-3">
      {attachments.length === 0 && <p className="text-sm text-muted-foreground">No attachments on this thread.</p>}
      <ul className="space-y-2">
        {attachments.map((a) => (
          <li key={a.id} className="flex items-center gap-3 rounded-md border p-2">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate">{a.file_name}</span>
                <Badge variant="secondary" className="text-[10px]">v{a.version}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {a.size_kb} KB · uploaded by {a.uploaded_by_name ?? 'Unknown'} · {format(new Date(a.created_at), 'PPp')}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => download(a.storage_path)}>
              <Download className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>

      {canUpload && (
        <div className="flex items-center gap-2 border-t pt-3">
          <Input type="file" multiple className="max-w-sm" onChange={(e) => upload(e.target.files)} disabled={busy} />
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
          <span className="text-xs text-muted-foreground">Re-uploading a file with the same name creates a new version.</span>
        </div>
      )}
    </div>
  );
}

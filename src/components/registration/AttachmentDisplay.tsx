import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Eye, Download, FileText, History, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DocumentVersionHistoryDialog } from '@/components/documents/versioned/DocumentVersionHistoryDialog';

export type NormalizedAttachment = {
  name: string;
  path?: string;
  viewUrl?: string;
  downloadUrl?: string;
  type?: string;
  size?: number;
  version?: number;
  groupId?: string;
  versionId?: string;
};

export function normalizeAttachments(value: unknown): NormalizedAttachment[] {
  const arr = Array.isArray(value) ? value : value ? [value] : [];
  return arr
    .map((item): NormalizedAttachment | null => {
      if (item == null || item === '') return null;
      if (typeof item === 'string') {
        const looksLikeUrl = /^(https?:|\/)/.test(item);
        return {
          name: item.split('/').pop() || item || 'Attachment',
          viewUrl: looksLikeUrl ? item : undefined,
          downloadUrl: looksLikeUrl ? item : undefined,
        };
      }
      if (typeof item === 'object') {
        const f = item as Record<string, any>;
        const path = f.path || f.file_path || f.storagePath || f.storage_path;
        const url = f.url || f.fileUrl || f.previewUrl || f.downloadUrl || f.signedUrl;
        const name =
          f.label || f.name || f.fileName || f.file_name || f.originalName || f.filename ||
          (typeof url === 'string' ? url.split('/').pop() : undefined) ||
          (typeof path === 'string' ? path.split('/').pop() : undefined) ||
          'Attachment';
        return {
          name,
          path,
          viewUrl: url,
          downloadUrl: f.downloadUrl || url,
          type: f.type || f.mimeType || f.mime_type,
          size: f.size || f.sizeBytes || f.size_bytes,
          version: typeof f.version === 'number' ? f.version : (typeof f.version === 'string' ? Number(f.version) || undefined : undefined),
          groupId: f.groupId || f.group_id || f.documentGroupId || f.document_group_id,
          versionId: f.versionId || f.version_id || f.currentVersionId || f.current_version_id,
        };
      }
      return null;
    })
    .filter((x): x is NormalizedAttachment => !!x);
}

function isSingleAttachmentObject(v: unknown): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const f = v as Record<string, any>;
  return !!(
    f.path || f.file_path || f.storagePath || f.storage_path ||
    f.url || f.fileUrl || f.previewUrl || f.downloadUrl || f.signedUrl ||
    f.fileName || f.file_name || f.originalName || f.filename ||
    // Treat any object with just a name/label as an attachment placeholder
    // so dynamic file fields render with View/Download icons even when only
    // a filename is stored.
    (typeof f.name === 'string' && f.name.length > 0) ||
    (typeof f.label === 'string' && f.label.length > 0)
  );
}

export function isAttachmentValue(v: unknown): boolean {
  if (v == null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0 && v.every(isAttachmentValue);
  if (isSingleAttachmentObject(v)) return true;
  return false;
}

async function resolveSignedUrl(att: NormalizedAttachment): Promise<string | null> {
  if (att.viewUrl) return att.viewUrl;
  if (!att.path) return null;
  for (const bucket of ['secure-documents', 'documents']) {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(att.path, 300);
    if (data?.signedUrl) return data.signedUrl;
  }
  return null;
}

async function downloadFile(att: NormalizedAttachment): Promise<void> {
  if (att.path) {
    for (const bucket of ['secure-documents', 'documents']) {
      const { data } = await supabase.storage.from(bucket).download(att.path);
      if (data) {
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = att.name;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
    }
  }
  const url = att.downloadUrl || att.viewUrl;
  if (url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = att.name;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
    return;
  }
  throw new Error('No download URL');
}

function AttachmentRow({ att }: { att: NormalizedAttachment }) {
  const [busy, setBusy] = useState<'view' | 'download' | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const canAct = !!(att.path || att.viewUrl || att.downloadUrl);
  const sizeLabel = att.size
    ? att.size < 1024 * 1024
      ? `${(att.size / 1024).toFixed(1)} KB`
      : `${(att.size / (1024 * 1024)).toFixed(1)} MB`
    : null;

  const handleView = async () => {
    setBusy('view');
    try {
      const url = await resolveSignedUrl(att);
      if (!url) {
        toast.error('Preview not available');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Preview not available');
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async () => {
    setBusy('download');
    try {
      await downloadFile(att);
    } catch {
      toast.error('Download not available');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-sm truncate flex-1 min-w-0" title={att.name}>{att.name}</span>
      {sizeLabel && (
        <span className="text-[10px] text-muted-foreground shrink-0">{sizeLabel}</span>
      )}
      {att.version != null && (
        <span
          className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground border rounded px-1.5 py-0.5 shrink-0"
          title={`Current version v${att.version}`}
        >
          v{att.version}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        disabled={!canAct || busy !== null}
        onClick={handleView}
        aria-label={`View attachment ${att.name}`}
        title={canAct ? 'View' : 'Preview not available'}
      >
        {busy === 'view' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        disabled={!canAct || busy !== null}
        onClick={handleDownload}
        aria-label={`Download attachment ${att.name}`}
        title={canAct ? 'Download' : 'Download not available'}
      >
        {busy === 'download' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      </Button>
      {att.groupId && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setHistoryOpen(true)}
            aria-label={`Version history for ${att.name}`}
            title="Version history"
          >
            <History className="h-3.5 w-3.5" />
          </Button>
          <DocumentVersionHistoryDialog
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            groupId={att.groupId}
            groupName={att.name}
            currentVersionId={att.versionId || null}
          />
        </>
      )}
    </div>
  );
}

export function AttachmentDisplay({ value }: { value: unknown }) {
  const items = normalizeAttachments(value);
  if (items.length === 0) {
    return <span className="text-muted-foreground/60 italic text-sm">Not provided</span>;
  }
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {items.map((att, i) => <AttachmentRow key={i} att={att} />)}
    </div>
  );
}

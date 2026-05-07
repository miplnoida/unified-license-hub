import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Eye, Download, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type NormalizedAttachment = {
  name: string;
  viewUrl?: string;
  downloadUrl?: string;
  path?: string;
};

export function normalizeAttachments(value: unknown): NormalizedAttachment[] {
  const arr = Array.isArray(value) ? value : value ? [value] : [];
  return arr
    .map((item): NormalizedAttachment | null => {
      if (!item) return null;
      if (typeof item === 'string') {
        if (!item) return null;
        const name = item.split('/').pop() || item;
        const isUrl = /^(https?:|\/)/.test(item);
        return { name, viewUrl: isUrl ? item : undefined, downloadUrl: isUrl ? item : undefined };
      }
      if (typeof item === 'object') {
        const f = item as Record<string, any>;
        const url = f.url || f.fileUrl || f.previewUrl || f.downloadUrl;
        const path = f.path || f.file_path;
        const name =
          f.name || f.fileName || f.file_name || f.originalName || f.filename ||
          (typeof url === 'string' ? url.split('/').pop() : undefined) ||
          (typeof path === 'string' ? path.split('/').pop() : undefined) ||
          'Attachment';
        return { name, viewUrl: url, downloadUrl: f.downloadUrl || url, path };
      }
      return null;
    })
    .filter((x): x is NormalizedAttachment => !!x);
}

export function isAttachmentValue(v: unknown): boolean {
  if (!v) return false;
  if (typeof v === 'object' && !Array.isArray(v)) {
    const f = v as Record<string, any>;
    return !!(f.path || f.file_path || f.url || f.fileUrl || f.fileName || f.file_name ||
      ((f.name || f.originalName) && (f.size != null || f.type)));
  }
  if (Array.isArray(v) && v.length > 0) return v.every(isAttachmentValue);
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
  const canAct = !!(att.path || att.viewUrl || att.downloadUrl);

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

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { File, Download, Loader2, Paperclip, Eye } from 'lucide-react';
import { toast } from 'sonner';

interface Attachment {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string | null;
  created_at: string;
  source: 'documents' | 'file_uploads';
}

interface AttachmentListProps {
  entityType: string;
  entityId: string;
  emptyText?: string;
  className?: string;
  showHeader?: boolean;
  title?: string;
  /** Also include file_uploads rows where entity_type='form_field' and entity_id=this entityId.
   *  Useful for applications/returns to surface files uploaded inside form fields. */
  includeFormFields?: boolean;
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Central attachment list. Reads from both legacy `documents` and secure
 * `file_uploads` tables, unifies them, and resolves downloads from either
 * `documents` or `secure-documents` storage buckets.
 */
export function AttachmentList({
  entityType,
  entityId,
  emptyText = 'No attachments uploaded yet',
  className,
  showHeader = false,
  title = 'Attachments',
  includeFormFields = false,
}: AttachmentListProps) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const queries: Promise<any>[] = [
        Promise.resolve(
          supabase
            .from('documents')
            .select('id, file_name, file_path, file_size, mime_type, created_at')
            .eq('entity_type', entityType)
            .eq('entity_id', entityId),
        ),
        Promise.resolve(
          supabase
            .from('file_uploads')
            .select('id, file_name, file_path, file_size, mime_type, created_at')
            .eq('entity_type', entityType)
            .eq('entity_id', entityId),
        ),
      ];
      if (includeFormFields) {
        queries.push(
          Promise.resolve(
            supabase
              .from('file_uploads')
              .select('id, file_name, file_path, file_size, mime_type, created_at')
              .eq('entity_type', 'form_field')
              .eq('entity_id', entityId),
          ),
        );
      }
      const results = await Promise.all(queries);
      if (cancelled) return;
      const [legacyRes, secureRes, formFieldRes] = results;
      const merged: Attachment[] = [
        ...(((legacyRes?.data) || []) as any[]).map(d => ({ ...d, source: 'documents' as const })),
        ...(((secureRes?.data) || []) as any[]).map(d => ({ ...d, source: 'file_uploads' as const })),
        ...(((formFieldRes?.data) || []) as any[]).map(d => ({ ...d, source: 'file_uploads' as const })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setItems(merged);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, includeFormFields]);

  const handleDownload = async (att: Attachment) => {
    setDownloadingId(att.id);
    try {
      const primary = att.source === 'file_uploads' ? 'secure-documents' : 'documents';
      const fallback = primary === 'secure-documents' ? 'documents' : 'secure-documents';
      let res = await supabase.storage.from(primary).download(att.file_path);
      if (res.error || !res.data) {
        res = await supabase.storage.from(fallback).download(att.file_path);
      }
      if (res.error || !res.data) {
        toast.error('Download failed: ' + (res.error?.message || 'File not found'));
        return;
      }
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading attachments...
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className={className}>
      {showHeader && (
        <div className="flex items-center gap-2 mb-2">
          <Paperclip className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{title}</span>
          <span className="text-xs text-muted-foreground">({items.length})</span>
        </div>
      )}
      <div className="space-y-2">
        {items.map(att => (
          <div
            key={`${att.source}-${att.id}`}
            className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
          >
            <File className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{att.file_name}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatFileSize(att.file_size)}</span>
                <span>·</span>
                <span>{new Date(att.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => handleDownload(att)}
              disabled={downloadingId === att.id}
              aria-label={`Download ${att.file_name}`}
            >
              {downloadingId === att.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

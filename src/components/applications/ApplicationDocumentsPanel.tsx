/**
 * Canonical application documents list.
 *
 * Renders the consolidated, deduplicated document set for one application with
 * explicit loading / empty / error states. Used for both the applicant and the
 * internal (admin) view so both audiences see the same files.
 */
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { File, Download, Eye, Loader2, Paperclip, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  useApplicationDocuments,
  type ApplicationDocumentItem,
} from '@/hooks/useApplicationDocuments';

interface Props {
  applicationId: string;
  formsData?: Record<string, any> | null;
  refreshKey?: number;
  title?: string;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const FALLBACK_BUCKETS = ['secure-documents', 'documents'];

async function signedUrlFor(doc: ApplicationDocumentItem): Promise<string | null> {
  const buckets = [doc.bucket, ...FALLBACK_BUCKETS.filter(b => b !== doc.bucket)];
  for (const bucket of buckets) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(doc.storagePath, 300);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return null;
}

export function ApplicationDocumentsPanel({
  applicationId,
  formsData,
  refreshKey,
  title = 'All Application Documents',
}: Props) {
  const { items, loading, error, reload } = useApplicationDocuments(applicationId, formsData, refreshKey);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const handleOpen = async (doc: ApplicationDocumentItem, download: boolean) => {
    setBusyKey(doc.key);
    try {
      const url = await signedUrlFor(doc);
      if (!url) {
        toast.error('Unable to access this file. Please try again.');
        return;
      }
      if (download) {
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.fileName;
        a.click();
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading documents…
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>Unable to load documents. Please refresh and try again.</span>
          <Button variant="outline" size="sm" onClick={() => reload()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No supporting documents have been uploaded.</p>;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Paperclip className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">({items.length})</span>
      </div>
      <div className="space-y-2">
        {items.map(doc => (
          <div
            key={doc.key}
            className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
          >
            <File className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-sm font-medium truncate">{doc.fileName}</p>
                {doc.documentType && <Badge variant="secondary">{doc.documentType}</Badge>}
                {doc.version != null && <Badge>v{doc.version}</Badge>}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatFileSize(doc.fileSize)}</span>
                {doc.createdAt && (
                  <>
                    <span>·</span>
                    <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={busyKey === doc.key}
                onClick={() => handleOpen(doc, false)}
                aria-label={`View ${doc.fileName}`}
                title="View in new tab"
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={busyKey === doc.key}
                onClick={() => handleOpen(doc, true)}
                aria-label={`Download ${doc.fileName}`}
                title="Download"
              >
                {busyKey === doc.key ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ApplicationDocumentsPanel;

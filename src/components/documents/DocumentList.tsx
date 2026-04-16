import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { File, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Doc {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

interface DocumentListProps {
  entityType: string;
  entityId: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function DocumentList({ entityType, entityId }: DocumentListProps) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDocs = async () => {
    setLoading(true);
    // Query both tables and merge results
    const [{ data: legacyDocs }, { data: secureDocs }] = await Promise.all([
      supabase
        .from('documents')
        .select('id, file_name, file_path, file_size, mime_type, created_at')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false }),
      supabase
        .from('file_uploads')
        .select('id, file_name, file_path, file_size, mime_type, created_at')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false }),
    ]);
    const all = [...(legacyDocs || []), ...(secureDocs || [])] as Doc[];
    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setDocs(all);
    setLoading(false);
  };

  useEffect(() => {
    loadDocs();
  }, [entityType, entityId]);

  const handleDownload = async (doc: Doc) => {
    // Try secure-documents first, then documents bucket
    let result = await supabase.storage.from('secure-documents').download(doc.file_path);
    if (result.error || !result.data) {
      result = await supabase.storage.from('documents').download(doc.file_path);
    }

    if (result.error || !result.data) {
      toast.error('Download failed: ' + (result.error?.message || 'File not found'));
      return;
    }

    const url = URL.createObjectURL(result.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.file_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading documents...</div>;

  if (docs.length === 0) return <p className="text-sm text-muted-foreground">No documents uploaded yet</p>;

  return (
    <div className="space-y-2">
      {docs.map(doc => (
        <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
          <File className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{doc.file_name}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatFileSize(doc.file_size)}</span>
              <span>·</span>
              <span>{new Date(doc.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => handleDownload(doc)}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

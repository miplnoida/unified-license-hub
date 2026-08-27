import { Button } from '@/components/ui/button';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { getSignedUrl } from '@/lib/secureFileUpload';
import { useRfiFileMeta } from '@/hooks/useComplaintRfis';

const fmt = (bytes: number) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function RfiAttachmentList({
  fileIds,
  onRemove,
}: {
  fileIds: string[];
  onRemove?: (id: string) => void;
}) {
  const { data: files = [] } = useRfiFileMeta(fileIds);
  if (!fileIds.length) return null;

  const open = async (path: string) => {
    const { url, error } = await getSignedUrl(path);
    if (!url) {
      toast.error(error ?? 'Could not open the document');
      return;
    }
    window.open(url, '_blank', 'noopener');
  };

  return (
    <ul className="space-y-1">
      {files.map((f) => (
        <li key={f.id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate flex-1">{f.file_name}</span>
          <span className="text-xs text-muted-foreground shrink-0">{fmt(f.file_size)}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => open(f.file_path)}>
            <Download className="h-3.5 w-3.5" />
          </Button>
          {onRemove && (
            <GuardedButton module="complaint_management" action="edit" data-rbac="complaint_management.edit" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onRemove(f.id)}>
              Remove
            </GuardedButton>
          )}
        </li>
      ))}
    </ul>
  );
}

import { FileText, Download, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import type { CorrespondenceAttachment } from '@/pages/correspondence/types';

export function VersionHistoryList({ items }: { items: CorrespondenceAttachment[] }) {
  if (!items.length) {
    return <div className="text-sm text-muted-foreground py-6 text-center">No attachments.</div>;
  }
  return (
    <ul className="divide-y">
      {items.map((a) => (
        <li key={a.id} className="py-3 flex items-center gap-3">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">{a.fileName}</span>
              <Badge variant="secondary" className="text-[10px]">v{a.version}</Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              {a.sizeKb} KB · uploaded by {a.uploadedBy} · {format(new Date(a.uploadedAt), 'PP')}
            </div>
          </div>
          <Button variant="ghost" size="sm"><Eye className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="sm"><Download className="h-3.5 w-3.5" /></Button>
        </li>
      ))}
    </ul>
  );
}

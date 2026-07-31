import { formatDistanceToNow } from 'date-fns';
import { History } from 'lucide-react';
import type { CorrespondenceEvent } from '@/hooks/useCorrespondence';

export function AuditTrailPanel({ entries }: { entries: CorrespondenceEvent[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity recorded yet.</p>;
  }
  return (
    <ol className="relative border-l border-border ml-2 space-y-4">
      {entries.map((e) => (
        <li key={e.id} className="ml-4">
          <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 border border-primary/40">
            <History className="h-2.5 w-2.5 text-primary" />
          </span>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium text-sm">{e.action}</span>
            <span className="text-xs text-muted-foreground">
              {e.actor_name ?? 'System'} · {e.actor_role ?? 'System'} · {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
            </span>
          </div>
          {e.detail && <div className="text-xs text-muted-foreground mt-0.5">{e.detail}</div>}
        </li>
      ))}
    </ol>
  );
}

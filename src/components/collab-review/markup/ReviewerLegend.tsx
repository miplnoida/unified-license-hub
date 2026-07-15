import { cn } from '@/lib/utils';
import { Users } from 'lucide-react';

export interface ReviewerLegendEntry {
  id: string; // author_user_id
  name: string;
  roleName: string;
  color: string;
  initials: string;
  count: number;
}

interface Props {
  entries: ReviewerLegendEntry[];
  activeId: string | null;
  onToggle: (id: string | null) => void;
}

export function ReviewerLegend({ entries, activeId, onToggle }: Props) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/30 p-2">
      <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground pr-1">
        <Users className="h-3 w-3" /> Reviewers
      </div>
      {entries.map(e => {
        const active = activeId === e.id;
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => onToggle(active ? null : e.id)}
            className={cn(
              'group inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors',
              active ? 'bg-background border-foreground/30 shadow-sm' : 'bg-background/60 border-transparent hover:border-border',
            )}
            title={`${e.name}${e.roleName ? ` — ${e.roleName}` : ''} · ${e.count} contribution${e.count === 1 ? '' : 's'}`}
          >
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold text-white"
              style={{ background: e.color }}
            >
              {e.initials}
            </span>
            <span className="font-medium">{e.name}</span>
            {e.roleName && <span className="text-muted-foreground">· {e.roleName}</span>}
            <span
              className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
              style={{ background: e.color }}
            >
              {e.count}
            </span>
          </button>
        );
      })}
      {activeId && (
        <button
          type="button"
          onClick={() => onToggle(null)}
          className="ml-auto text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Clear filter
        </button>
      )}
    </div>
  );
}

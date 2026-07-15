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

const SAMPLE_COLORS = ['#6366F1', '#16A34A', '#F59E0B'];

function MarkupKey() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <ins className="no-underline" style={{ borderBottom: '2px solid #16A34A', background: '#16A34A14', padding: '0 3px', borderRadius: 2, color: '#16A34A' }}>Aa</ins>
        Insertion
      </span>
      <span className="inline-flex items-center gap-1">
        <del style={{ color: '#DC2626', background: '#DC262614', textDecorationColor: '#DC2626', padding: '0 3px', borderRadius: 2 }}>Aa</del>
        Deletion
      </span>
      <span className="inline-flex items-center gap-1">
        <span style={{ background: '#6366F122', borderBottom: '1.5px dotted #6366F1', padding: '0 3px', borderRadius: 2 }}>
          Aa
          <sup className="ml-0.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-semibold text-white align-super" style={{ background: '#6366F1' }}>1</sup>
        </span>
        Comment
      </span>
    </div>
  );
}

export function ReviewerLegend({ entries, activeId, onToggle }: Props) {
  const isEmpty = entries.length === 0;
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground pr-1">
          <Users className="h-3 w-3" /> Reviewers
        </div>
        {isEmpty ? (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <div className="flex -space-x-1">
              {SAMPLE_COLORS.map((c, i) => (
                <span key={i} className="h-4 w-4 rounded-full border border-background opacity-50" style={{ background: c }} />
              ))}
            </div>
            <span>Track Changes ready — colors appear once reviewers add comments or suggestions.</span>
          </div>
        ) : (
          entries.map(e => {
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
          })
        )}
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
      <div className="border-t pt-1.5">
        <MarkupKey />
      </div>
    </div>
  );
}

export function MarkupKeyStrip() {
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <MarkupKey />
    </div>
  );
}

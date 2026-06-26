import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { FileText, PlusCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { getApplicationStatusLabel } from '@/lib/applicationStatus';

export interface RequiredFormRow {
  id: string;
  application_number: string | null;
  status: string;
  created_at: string;
  updated_at?: string | null;
  // Optional metadata available from the recent_applications row's `data` payload.
  // Falls back to defaults when missing — no extra fetch is made.
  name?: string | null;
  description?: string | null;
  progress?: { completed: number; total: number } | null;
}

interface Props {
  rows: RequiredFormRow[];
  newApplicationPath?: string;
  emptyHint?: string;
}

function ctaFor(status: string): 'Start' | 'Continue' | 'Resume' | 'View' {
  const s = status?.toLowerCase();
  if (s === 'draft') return 'Continue';
  if (s === 'in_progress') return 'Resume';
  if (['query_raised', 'info_requested', 'resubmission_requested', 'resubmission_required', 'returned_for_correction'].includes(s)) {
    return 'Resume';
  }
  return 'View';
}

function hrefFor(row: RequiredFormRow): string {
  const s = row.status?.toLowerCase();
  if (s === 'draft' || s === 'in_progress') {
    return `/applications/${row.id}/continue?draft=${row.id}&mode=continue`;
  }
  return `/applications/${row.id}`;
}

export function RequiredFormsList({ rows, newApplicationPath = '/applications/new', emptyHint }: Props) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Applications &amp; required forms</h3>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to={newApplicationPath}>
              <PlusCircle className="h-3.5 w-3.5 mr-1" /> New
            </Link>
          </Button>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
            {emptyHint || 'No applications yet. Start a new application to begin.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {rows.map((r) => {
              const label = ctaFor(r.status);
              const progress = r.progress && r.progress.total > 0
                ? `${r.progress.completed}/${r.progress.total} steps`
                : null;
              const updated = r.updated_at || r.created_at;
              return (
                <div key={r.id} className="rounded-md border bg-card p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">
                        {r.name || r.application_number || r.id.slice(0, 8)}
                      </p>
                      <Badge variant="outline" className="text-[10px]">
                        {getApplicationStatusLabel(r.status)}
                      </Badge>
                    </div>
                    {r.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{r.description}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {progress && <span>{progress} · </span>}
                      Updated {updated ? formatDistanceToNow(new Date(updated), { addSuffix: true }) : '—'}
                    </p>
                  </div>
                  <Button asChild size="sm" variant={label === 'View' ? 'outline' : 'default'}>
                    <Link to={hrefFor(r)}>{label}</Link>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

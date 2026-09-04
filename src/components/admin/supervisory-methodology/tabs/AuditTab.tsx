/**
 * Audit history — real recorded methodology events only.
 *
 * The timeline is the governed event log. If nothing has happened to a version
 * beyond its creation, that is what the screen says; no synthetic milestone is
 * ever displayed.
 */
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PaginationBar } from '@/components/shared/listing';
import { useSupervisoryMethodologyAudit } from '@/hooks/useSupervisoryMethodologyAdmin';
import { EmptyPanel, ErrorPanel, formatDateTime, humanize } from '../labels';

export function AuditTab({ methodologyId }: { methodologyId: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const { data, isLoading, error } = useSupervisoryMethodologyAudit(methodologyId, page, pageSize);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) return <ErrorPanel error={error} />;
  if (!data || data.total_count === 0) {
    return <EmptyPanel title="No methodology event has been recorded for this version yet." />;
  }

  return (
    <div className="space-y-3">
      <ol className="relative space-y-3 border-l pl-4">
        {data.rows.map((e) => (
          <li key={e.id} className="relative">
            <span className="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{formatDateTime(e.created_at)}</span>
              <Badge variant="outline">{humanize(e.event_type)}</Badge>
              {e.from_status || e.to_status ? (
                <span className="font-mono text-xs text-foreground">
                  {e.from_status ?? '—'} → {e.to_status ?? '—'}
                </span>
              ) : null}
              <span className="text-xs text-muted-foreground">{e.actor_name ?? 'System'}</span>
            </div>
            {e.rationale ? <p className="mt-0.5 text-sm text-foreground">{e.rationale}</p> : null}
          </li>
        ))}
      </ol>
      <PaginationBar
        totalCount={data.total_count}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        alwaysShowCount
      />
    </div>
  );
}

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, History } from 'lucide-react';
import { getAuditDescriptor, CATEGORY_CLASSES } from '@/lib/auditLabels';
import {
  useEntityAuditLog,
  type UseEntityAuditLogOptions,
  type EntityAuditRow,
} from '@/hooks/useEntityAuditLog';

/**
 * Reusable entity-scoped activity timeline. Renders any entity's audit
 * trail (application, return, license, licensee, fit-and-proper, etc.)
 * using the unified `useEntityAuditLog` hook. Replaces the per-entity
 * `ActivityTab` / `StatusTimeline` variants.
 *
 * Every new entity type should mount this instead of building a bespoke
 * timeline.
 */

export interface EntityTimelineProps extends UseEntityAuditLogOptions {
  title?: string;
  emptyMessage?: string;
  className?: string;
  /** Optional custom row renderer (falls back to the default row). */
  renderRow?: (row: EntityAuditRow) => React.ReactNode;
}

export function EntityTimeline({
  title = 'Activity Trail',
  emptyMessage = 'No activity recorded yet.',
  className,
  renderRow,
  ...queryOpts
}: EntityTimelineProps) {
  const { data: rows = [], isLoading } = useEntityAuditLog(queryOpts);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="py-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 mb-4">
          <History className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="text-xs text-muted-foreground">({rows.length})</span>
        </div>
        <ol className="relative border-l border-border pl-5 space-y-4">
          {rows.map((r) => (
            <li key={r.id} className="relative">
              {renderRow ? renderRow(r) : <DefaultRow row={r} />}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function DefaultRow({ row }: { row: EntityAuditRow }) {
  const d = getAuditDescriptor(row.action);
  const nv = (row.new_value ?? {}) as Record<string, unknown>;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const comments =
    (nv.comments as string) ||
    (nv.reason as string) ||
    (meta.comments as string) ||
    (meta.reason as string) ||
    (meta.justification as string);
  const fromStatus = meta.from_status as string | undefined;
  const toStatus = (meta.to_status as string | undefined) ||
    (nv.status as string | undefined);

  return (
    <>
      <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
      <div className="flex items-center flex-wrap gap-2">
        <Badge variant="outline" className={CATEGORY_CLASSES[d.category]}>
          {d.label}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {new Date(row.created_at).toLocaleString()}
        </span>
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        by <span className="text-foreground">{row.actor_name}</span>
        {fromStatus && toStatus && (
          <>
            {' '}
            · <span className="font-mono">{fromStatus}</span> →{' '}
            <span className="font-mono">{toStatus}</span>
          </>
        )}
      </div>
      {comments && (
        <p className="text-sm mt-1 bg-muted/40 border border-border rounded px-2 py-1">
          {String(comments)}
        </p>
      )}
    </>
  );
}

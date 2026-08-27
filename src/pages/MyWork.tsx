import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, ArrowRight, Inbox } from 'lucide-react';
import { formatDateTime } from '@/lib/datetime';
import { useMyWorkQueue, type MyWorkItem } from '@/hooks/usePeopleAccess';

/**
 * My Work (Checkpoint F).
 *
 * A read-only aggregation of live module records the signed-in person owns —
 * applications, complaints, investigation tasks, supervisory attention items,
 * interventions and provider submissions awaiting internal acceptance. Nothing
 * is copied into a generic work table; every row links straight back to the
 * owning module, which stays the source of truth.
 */
const SOURCE_LABELS: Record<string, string> = {
  application: 'Licensing application',
  complaint: 'Complaint',
  complaint_task: 'Investigation task',
  conduct_attention: 'Supervisory attention',
  conduct_intervention: 'Intervention',
  provider_work_package: 'Provider work package',
};

const overdue = (item: MyWorkItem) => !!item.due_at && new Date(item.due_at).getTime() < Date.now();

export default function MyWork() {
  const { data, isLoading, error } = useMyWorkQueue(50);
  const [filter, setFilter] = useState<string>('all');

  const items = data?.items || [];
  const sources = useMemo(
    () => Array.from(new Set(items.map((i) => i.source))),
    [items],
  );
  const visible = useMemo(
    () =>
      (filter === 'all' ? items : items.filter((i) => i.source === filter))
        .slice()
        .sort((a, b) => {
          if (!a.due_at) return 1;
          if (!b.due_at) return -1;
          return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
        }),
    [items, filter],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">My Work</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Everything currently waiting on you, pulled live from the modules that own it. Open an item to
          act on it in its own workspace.
        </p>
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}

      {error && (
        <Card>
          <CardContent className="flex items-center gap-2 py-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {String((error as Error).message)}
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={filter === 'all' ? 'default' : 'outline'}
              onClick={() => setFilter('all')}
            >
              All <Badge variant="secondary" className="ml-1.5">{items.length}</Badge>
            </Button>
            {sources.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={filter === s ? 'default' : 'outline'}
                onClick={() => setFilter(s)}
              >
                {SOURCE_LABELS[s] || s}
                <Badge variant="secondary" className="ml-1.5">{data.counts?.[s] ?? 0}</Badge>
              </Button>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                {visible.length} item{visible.length === 1 ? '' : 's'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {visible.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Inbox className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Nothing is assigned to you right now.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Work</TableHead>
                        <TableHead className="whitespace-nowrap">Type</TableHead>
                        <TableHead className="whitespace-nowrap">Status</TableHead>
                        <TableHead className="whitespace-nowrap">Priority</TableHead>
                        <TableHead className="whitespace-nowrap">Due</TableHead>
                        <TableHead className="w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((item) => (
                        <TableRow key={`${item.source}-${item.id}`}>
                          <TableCell className="min-w-[220px]">
                            <span className="block font-medium">{item.title || 'Untitled'}</span>
                            {item.reference && (
                              <span className="block font-mono text-xs text-muted-foreground">
                                {item.reference}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {SOURCE_LABELS[item.source] || item.source}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{item.status || '—'}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{item.priority || '—'}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {item.due_at ? (
                              <span className={overdue(item) ? 'text-destructive font-medium' : undefined}>
                                {formatDateTime(item.due_at)}
                              </span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>
                            <Button asChild size="sm" variant="ghost">
                              <Link to={item.route} aria-label="Open item">
                                <ArrowRight className="h-4 w-4" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

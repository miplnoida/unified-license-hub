/**
 * P04 — Licence lifecycle work queue.
 *
 * Rows, counts, priority and SLA state are all server-filtered and
 * server-counted via `license_lifecycle_work_queue(_counts)`.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDateTime } from '@/lib/datetime';
import { useLicenseLifecycleQueue, useLicenseLifecycleQueueCounts } from '@/hooks/useLicenseLifecycle';

const KIND_TABS: Array<{ value: string; label: string; kinds: string[] | null }> = [
  { value: 'all', label: 'All work', kinds: null },
  { value: 'renewal', label: 'Renewals', kinds: ['renewal'] },
  { value: 'expiry', label: 'Expiry', kinds: ['expiry'] },
  { value: 'condition', label: 'Conditions', kinds: ['condition'] },
  { value: 'matters', label: 'Adverse matters', kinds: ['suspension', 'revocation', 'surrender', 'variation'] },
];

/** Counts are keyed by the server's work_kind; a tab shows the sum of its kinds. */
function tabCount(counts: Record<string, number> | undefined, kinds: string[] | null): number | undefined {
  if (!counts) return undefined;
  const entries = Object.entries(counts);
  if (!kinds) return entries.reduce((sum, [, v]) => sum + Number(v), 0);
  return kinds.reduce((sum, k) => sum + Number(counts[k] ?? 0), 0);
}

const SLA_CLASS: Record<string, string> = {
  breached: 'bg-destructive/10 text-destructive border-destructive/30',
  due_soon: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  on_track: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
};

export default function LicenseLifecycleQueue() {
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const kinds = KIND_TABS.find((t) => t.value === tab)?.kinds ?? null;

  const { data, isLoading, isError, error } = useLicenseLifecycleQueue({ kinds, search, page, pageSize });
  const { data: counts } = useLicenseLifecycleQueueCounts();

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Licence lifecycle queue</h1>
        <p className="text-sm text-muted-foreground">
          Renewals, expiries, conditions and adverse matters awaiting regulator action.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(0); }}>
        <TabsList className="flex-wrap h-auto">
          {KIND_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="gap-2">
              {t.label}
              {tabCount(counts, t.kinds) !== undefined && (
                <Badge variant="secondary" className="text-xs">{tabCount(counts, t.kinds)}</Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">{total} item{total === 1 ? '' : 's'}</CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search licence or entity"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading queue…
            </div>
          ) : isError ? (
            <div className="flex items-center gap-2 p-6 text-destructive">
              <AlertTriangle className="h-4 w-4" /> {(error as { message?: string })?.message ?? 'Failed to load queue'}
            </div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No lifecycle work in this view.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Licence</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Work</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Waiting on</TableHead>
                    <TableHead>Next action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={`${r.work_kind}-${r.object_id}`}>
                      <TableCell className="font-mono text-xs">
                        <Link to={r.canonical_href} className="text-primary hover:underline">{r.reference}</Link>
                      </TableCell>
                      <TableCell className="text-sm">{r.entity_name ?? '—'}</TableCell>
                      <TableCell className="text-sm capitalize">{r.work_kind.replace('_', ' ')}</TableCell>
                      <TableCell className="text-xs">{r.stage}</TableCell>
                      <TableCell className="text-sm capitalize">{r.priority}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-col gap-1">
                          <span>{r.sla_due_at ? formatDateTime(r.sla_due_at) : '—'}</span>
                          <Badge variant="outline" className={`w-fit text-[10px] ${SLA_CLASS[r.sla_state] ?? ''}`}>
                            {r.sla_state.replace('_', ' ')}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{r.waiting_on}</TableCell>
                      <TableCell className="text-sm">{r.next_action ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {total > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page + 1} of {lastPage + 1}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

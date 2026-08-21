/**
 * P12 — entity-facing correspondence list.
 *
 * Reads the same canonical `correspondence_work_queue` read model as the
 * regulator queue (RLS scopes rows to the signed-in entity's threads), so
 * service levels, waiting-on and next action are identical on both sides.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCorrespondenceWorkQueue } from '@/hooks/useCorrespondenceQueue';
import { THREAD_STATE_LABELS } from '@/hooks/useCorrespondence';
import { formatDateTime } from '@/lib/datetime';
import { AlertTriangle, MessageSquare, Search } from 'lucide-react';

const PAGE_SIZE = 25;

export default function MyCorrespondence() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const { data, isLoading } = useCorrespondenceWorkQueue({ bucket: 'all', query }, page, PAGE_SIZE);
  const rows = data?.rows ?? [];
  const hasMore = (page + 1) * PAGE_SIZE < (data?.total ?? 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="My Correspondence"
          description="Letters, notices and messages exchanged with the regulator. Open a thread to read the full conversation and reply."
        />

        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="relative max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search subject or reference…"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(0); }}
              />
            </div>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Last activity</TableHead>
                    <TableHead>Response due</TableHead>
                    <TableHead>Waiting on</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && <TableRow><TableCell colSpan={8}><Skeleton className="h-20 w-full" /></TableCell></TableRow>}
                  {!isLoading && rows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.reference}</TableCell>
                      <TableCell className="max-w-[280px] truncate font-medium">
                        {c.subject}
                        {c.unread_count > 0 && <Badge className="ml-2 h-4 px-1 text-[10px]">{c.unread_count} new</Badge>}
                      </TableCell>
                      <TableCell><Badge variant="outline">{c.category}</Badge></TableCell>
                      <TableCell className="text-sm">{c.last_activity_at ? formatDateTime(c.last_activity_at) : '—'}</TableCell>
                      <TableCell className="text-sm">
                        <span className={c.sla_state === 'breached' ? 'inline-flex items-center gap-1 font-medium text-destructive' : ''}>
                          {c.sla_state === 'breached' && <AlertTriangle className="h-3.5 w-3.5" />}
                          {c.sla_due_at ? formatDateTime(c.sla_due_at) : '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{c.waiting_on ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {THREAD_STATE_LABELS[c.thread_state as keyof typeof THREAD_STATE_LABELS] ?? c.thread_state}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link to={`/entity/correspondence/${c.id}`}><MessageSquare className="mr-1 h-3.5 w-3.5" />Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!isLoading && rows.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">You have no correspondence yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {(page > 0 || hasMore) && (
              <div className="flex items-center justify-between">
                <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
                <span className="text-xs text-muted-foreground">Page {page + 1}</span>
                <Button size="sm" variant="ghost" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

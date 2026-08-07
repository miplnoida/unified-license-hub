/**
 * Admin notification delivery history (R-01 audit view).
 *
 * Reads `notification_history`, which enforces
 * `notification_management.dispatch` server-side. Failed dispatches can be
 * retried through the existing `notification-retry` edge function.
 */
import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, RotateCcw, Search, ShieldAlert, Send } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { DeadLetterQueue } from '@/components/notifications/DeadLetterQueue';


interface HistoryRow {
  id: string;
  notification_id: string | null;
  recipient_user_id: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  event_key: string | null;
  notification_type: string | null;
  template_name: string | null;
  channel: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  failed_at: string | null;
  retry_count: number;
  error: string | null;
  source_reference: string | null;
}

const PAGE_SIZE = 50;
const CHANNELS = ['in_app', 'email', 'sms'];
const STATUSES = ['queued', 'processing', 'sent', 'delivered', 'failed', 'bounced', 'skipped'];

export default function NotificationHistory() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [channel, setChannel] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(0); }, [debounced, channel, status]);

  const load = useMemo(() => async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('notification_history' as never, {
      _search: debounced.length >= 3 ? debounced : null,
      _channel: channel === 'all' ? null : channel,
      _status: status === 'all' ? null : status,
      _event_key: null,
      _from: null,
      _to: null,
      _limit: PAGE_SIZE,
      _offset: page * PAGE_SIZE,
    } as never);
    if (rpcError) {
      if (rpcError.code === '42501') setDenied(true);
      else setError(rpcError.message);
      setRows([]);
    } else {
      setRows((data || []) as unknown as HistoryRow[]);
    }
    setLoading(false);
  }, [debounced, channel, status, page]);

  useEffect(() => { load(); }, [load]);

  const retry = async (row: HistoryRow) => {
    setRetrying(row.id);
    const { error: fnError } = await supabase.functions.invoke('notification-retry', {
      body: { dispatch_id: row.id },
    });
    setRetrying(null);
    if (fnError) { toast.error(fnError.message || 'Retry failed'); return; }
    toast.success('Retry queued');
    load();
  };

  if (denied) {
    return (
      <DashboardLayout>
        <Card className="max-w-lg mx-auto mt-12">
          <CardContent className="py-10 text-center space-y-3">
            <ShieldAlert className="h-10 w-10 text-destructive mx-auto" />
            <p className="font-medium">You do not have access to notification history</p>
            <p className="text-sm text-muted-foreground">
              Ask an administrator for the notification management dispatch permission.
            </p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Notification History"
          description="Delivery record for every notification dispatched by the system"
          actions={
            <Button variant="outline" size="sm" onClick={load}>
              <RotateCcw className="h-4 w-4 mr-2" />Refresh
            </Button>
          }
        />

        <div className="grid gap-3 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search recipient, event or reference…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger aria-label="Channel"><SelectValue placeholder="Channel" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              {CHANNELS.map(c => (
                <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Delivery status"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map(s => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <p className="py-12 text-center text-sm text-muted-foreground">{error}</p>
            ) : rows.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No dispatch records match these filters.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Retries</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs font-mono">
                        {format(new Date(r.created_at), 'd MMM yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{r.recipient_name || '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.recipient_email || ''}</div>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{r.event_key || r.notification_type || '—'}</TableCell>
                      <TableCell className="text-xs">{r.template_name || '—'}</TableCell>
                      <TableCell className="text-xs capitalize">{r.channel.replace(/_/g, ' ')}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] capitalize ${
                            ['sent', 'delivered'].includes(r.status)
                              ? 'border-success/40 text-success'
                              : ['failed', 'bounced'].includes(r.status)
                                ? 'border-destructive/40 text-destructive'
                                : ''
                          }`}
                          title={r.error || undefined}
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{r.retry_count}</TableCell>
                      <TableCell className="text-xs font-mono">{r.source_reference || '—'}</TableCell>
                      <TableCell className="text-right">
                        {['failed', 'bounced'].includes(r.status) && (
                          <Button
                            size="sm" variant="outline"
                            disabled={retrying === r.id}
                            onClick={() => retry(r)}
                          >
                            {retrying === r.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Send className="h-3.5 w-3.5 mr-1.5" />}
                            Resend
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {(page > 0 || rows.length === PAGE_SIZE) && (
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">Page {page + 1}</span>
            <Button
              variant="outline" size="sm"
              disabled={rows.length < PAGE_SIZE}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        )}

        <DeadLetterQueue />
      </div>
    </DashboardLayout>
  );
}


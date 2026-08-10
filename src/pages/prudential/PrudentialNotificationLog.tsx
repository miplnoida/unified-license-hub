import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePrudentialDispatchLog } from '@/hooks/usePrudentialNotifications';
import { NotificationDispatchDetailDrawer } from '@/components/returns/NotificationDispatchDetailDrawer';
import { humanizeChannel, humanizeEventKey, humanizeStatus } from '@/lib/notificationLabels';
import { formatDateTime } from '@/lib/datetime';
import { Loader2, Eye } from 'lucide-react';

export default function PrudentialNotificationLog() {
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: logs = [], isLoading } = usePrudentialDispatchLog({
    status: statusFilter || undefined,
    channel: channelFilter || undefined,
    eventKey: eventFilter || undefined,
  });

  const eventOptions = useMemo(() => {
    const keys = Array.from(new Set(logs.map((l: any) => l.event_key).filter(Boolean)));
    return keys.sort((a, b) => humanizeEventKey(a).localeCompare(humanizeEventKey(b)));
  }, [logs]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return logs;
    return logs.filter((l: any) =>
      [l.subject, l.recipient_email, l.recipient_phone, humanizeEventKey(l.event_key)]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(term))
    );
  }, [logs, search]);

  const statusVariant = (s: string) =>
    s === 'failed' ? 'destructive' : s === 'sent' || s === 'delivered' ? 'default' : 'secondary';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Prudential Notification Log"
          description="Alerts and reminders sent by the prudential supervision module"
          actions={
            <div className="flex gap-2 flex-wrap">
              <Input
                placeholder="Search subject or recipient"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-[220px]"
              />
              <Select value={eventFilter || 'all'} onValueChange={(v) => setEventFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[220px]"><SelectValue placeholder="All notifications" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All notifications</SelectItem>
                  {eventOptions.map((k: string) => (
                    <SelectItem key={k} value={k}>{humanizeEventKey(k)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={channelFilter || 'all'} onValueChange={(v) => setChannelFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="All channels" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All channels</SelectItem>
                  <SelectItem value="in_app">In-app</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        />
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sent At</TableHead>
                      <TableHead>Notification</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Problem</TableHead>
                      <TableHead className="w-[60px] text-right">Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No prudential notifications logged
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((l: any) => (
                        <TableRow key={l.id} className="cursor-pointer" onClick={() => setSelectedId(l.id)}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDateTime(l.sent_at || l.created_at)}
                          </TableCell>
                          <TableCell className="text-sm">{humanizeEventKey(l.event_key)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">{humanizeChannel(l.channel)}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{l.recipient_email || '—'}</TableCell>
                          <TableCell className="max-w-[260px] truncate text-xs">{l.subject || '—'}</TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(l.status) as any}>{humanizeStatus(l.status)}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate text-xs text-destructive">
                            {l.error || '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="View detail"
                              onClick={(e) => { e.stopPropagation(); setSelectedId(l.id); }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        <NotificationDispatchDetailDrawer
          open={!!selectedId}
          onOpenChange={(v) => !v && setSelectedId(null)}
          row={rows.find((l: any) => l.id === selectedId) ?? null}
        />
      </div>
    </DashboardLayout>
  );
}

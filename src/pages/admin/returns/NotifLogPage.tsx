import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useReturnDispatchLog, useReturnEventConfigs } from '@/hooks/useReturnsManagement';
import { NotificationDispatchDetailDrawer } from '@/components/returns/NotificationDispatchDetailDrawer';
import { Loader2, Eye } from 'lucide-react';
import { format } from 'date-fns';

export default function NotifLogPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);


  const { data: configs = [] } = useReturnEventConfigs();
  const { data: logs = [], isLoading } = useReturnDispatchLog({
    status: statusFilter || undefined,
    channel: channelFilter || undefined,
    eventKey: eventFilter || undefined,
  });

  const eventOptions = useMemo(() => configs.map((c: any) => c.event_key), [configs]);

  const statusColor = (s: string) =>
    s === 'sent' ? 'default' : s === 'failed' ? 'destructive' : 'secondary';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Return Notification Log"
          description="Dispatched return notifications from the live engine"
          actions={
            <div className="flex gap-2 flex-wrap">
              <Select value={eventFilter || 'all'} onValueChange={(v) => setEventFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[220px]"><SelectValue placeholder="All events" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All events</SelectItem>
                  {eventOptions.map((k: string) => (
                    <SelectItem key={k} value={k}>{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={channelFilter || 'all'} onValueChange={(v) => setChannelFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[130px]"><SelectValue placeholder="All channels" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All channels</SelectItem>
                  <SelectItem value="in_app">in_app</SelectItem>
                  <SelectItem value="email">email</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[130px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sent At</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead className="w-[60px] text-right">Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No notifications logged
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((l: any) => (
                      <TableRow key={l.id} className="cursor-pointer" onClick={() => setSelectedId(l.id)}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(l.sent_at || l.created_at), 'MMM dd, yyyy HH:mm')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">{l.event_key}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">{l.channel}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {l.recipient_email || l.recipient_user_id?.slice(0, 8) || '—'}
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate text-xs">
                          {l.subject || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusColor(l.status) as any}>{l.status}</Badge>
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
            )}
          </CardContent>
        </Card>
        <NotificationDispatchDetailDrawer
          open={!!selectedId}
          onOpenChange={(v) => !v && setSelectedId(null)}
          row={logs.find((l: any) => l.id === selectedId) ?? null}
        />
      </div>

    </DashboardLayout>
  );
}

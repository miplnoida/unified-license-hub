import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useReturnNotificationsLog } from '@/hooks/useReturnsManagement';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export default function NotifLogPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const { data: logs = [], isLoading } = useReturnNotificationsLog({ status: statusFilter || undefined });

  const statusColor = (s: string) => s === 'sent' ? 'default' : s === 'failed' ? 'destructive' : 'secondary';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Notification Log" description="Track sent return notifications"
          actions={
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent><SelectItem value="">All</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="sent">Sent</SelectItem><SelectItem value="failed">Failed</SelectItem></SelectContent>
            </Select>
          }
        />
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Recipient</TableHead><TableHead>Subject</TableHead><TableHead>Status</TableHead><TableHead>Sent At</TableHead></TableRow></TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No notifications logged</TableCell></TableRow>
                  ) : logs.map(l => (
                    <TableRow key={l.id}>
                      <TableCell><Badge variant="outline">{l.template_code}</Badge></TableCell>
                      <TableCell>{l.recipient_email || '—'}</TableCell>
                      <TableCell className="max-w-[250px] truncate">{l.subject || '—'}</TableCell>
                      <TableCell><Badge variant={statusColor(l.status) as any}>{l.status}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{l.sent_at ? format(new Date(l.sent_at), 'MMM dd, yyyy HH:mm') : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

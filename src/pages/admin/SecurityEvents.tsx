import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Download, RefreshCw, ShieldAlert } from 'lucide-react';
import { logExport } from '@/lib/exportAudit';

type EventRow = {
  id: string;
  event_time: string;
  user_id: string | null;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  target_resource: string | null;
  detail: Record<string, unknown> | null;
  severity: string | null;
  module: string | null;
  action: string | null;
  correlation_id: string | null;
};


const EVENT_TYPES = [
  'all',
  'ACCESS_DENIED',
  'AUTH_FAILED',
  'PERMISSION_ESCALATION',
  'INTEGRATION_FAILURE',
];

const SEVERITY_TONE: Record<string, string> = {
  ACCESS_DENIED: 'destructive',
  PERMISSION_ESCALATION: 'destructive',
  AUTH_FAILED: 'warning',
  INTEGRATION_FAILURE: 'warning',
};

export default function SecurityEvents() {
  const [eventType, setEventType] = useState<string>('all');
  const [severity, setSeverity] = useState<string>('all');
  const [moduleFilter, setModuleFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [routeFilter, setRouteFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const { data = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['security_event_logs', eventType, severity, moduleFilter, userFilter, routeFilter, fromDate, toDate],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = (supabase.from('security_event_logs') as any)
        .select('*').order('event_time', { ascending: false }).limit(500);
      if (eventType !== 'all') q = q.eq('event_type', eventType);
      if (severity !== 'all') q = q.eq('severity', severity);
      if (moduleFilter.trim()) q = q.ilike('module', `%${moduleFilter.trim()}%`);
      if (userFilter.trim()) q = q.eq('user_id', userFilter.trim());
      if (routeFilter.trim()) q = q.ilike('target_resource', `%${routeFilter.trim()}%`);
      if (fromDate) q = q.gte('event_time', new Date(fromDate).toISOString());
      if (toDate) q = q.lte('event_time', new Date(toDate + 'T23:59:59').toISOString());

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
    refetchInterval: 30_000,
  });

  const counts = useMemo(() => {
    const byType: Record<string, number> = {};
    data.forEach((r) => { byType[r.event_type] = (byType[r.event_type] ?? 0) + 1; });
    return byType;
  }, [data]);

  const exportCsv = async () => {
    if (data.length === 0) return;
    const header = ['event_time', 'event_type', 'user_id', 'ip_address', 'target_resource', 'detail'];
    const rows = data.map((r) => [
      r.event_time, r.event_type, r.user_id ?? '', r.ip_address ?? '',
      r.target_resource ?? '', JSON.stringify(r.detail ?? {}),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `security-events-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    await logExport({
      dataset: 'security_event_logs',
      format: 'csv',
      rowCount: data.length,
      moduleKey: 'settings',
      filters: { eventType, userFilter, routeFilter, fromDate, toDate },
      payload: csv,
    });
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Security Events"
        description="Denied access, permission failures, suspicious exports and authentication anomalies. Entries are immutable and retained per compliance policy."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-destructive" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <Label>Event type</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t === 'all' ? 'All events' : t.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>User ID</Label>
            <Input value={userFilter} onChange={(e) => setUserFilter(e.target.value)} placeholder="uuid" />
          </div>
          <div>
            <Label>Target / route</Label>
            <Input value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)} placeholder="/admin/…" />
          </div>
          <div>
            <Label>From</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="md:col-span-6 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Refresh
            </Button>
            <Button data-rbac="audit_management.export" size="sm" onClick={exportCsv} disabled={data.length === 0}>
              <Download className="h-3 w-3 mr-1" />Export CSV
            </Button>
            <div className="ml-auto flex flex-wrap gap-1 text-xs">
              {Object.entries(counts).map(([t, n]) => (
                <Badge
                  key={t}
                  variant={(SEVERITY_TONE[t] as 'destructive' | 'warning' | undefined) === 'destructive' ? 'destructive' : 'secondary'}
                >
                  {t.replace(/_/g, ' ')}: {n}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle className="text-base">Events</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading events…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(r.event_time).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={SEVERITY_TONE[r.event_type] === 'destructive' ? 'destructive' : 'secondary'}>
                          {r.event_type.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.user_id ? r.user_id.slice(0, 8) : 'anon'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.ip_address ?? '—'}</TableCell>
                      <TableCell className="text-xs max-w-[280px] truncate" title={r.target_resource ?? undefined}>
                        {r.target_resource ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs max-w-[320px] truncate">
                        <code className="text-[10px]">{r.detail ? JSON.stringify(r.detail) : '—'}</code>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                        No security events match the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}

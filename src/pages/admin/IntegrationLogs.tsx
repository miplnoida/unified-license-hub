import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Plug } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

/**
 * Integration Logs viewer (SCRIPT 5 / DEMO-DPA-009).
 * Admin-only surface for inbound/outbound integration observability.
 * Read policy is enforced at the database layer via `has_role()`.
 */

type Row = {
  id: string;
  direction: 'inbound' | 'outbound';
  integration_key: string;
  endpoint: string | null;
  method: string | null;
  status: 'success' | 'failure' | 'pending';
  http_status: number | null;
  actor_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
};

const statusVariant: Record<Row['status'], string> = {
  success: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  failure: 'bg-rose-100 text-rose-800 border-rose-200',
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
};

export default function IntegrationLogs() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['integration-logs', statusFilter, directionFilter],
    queryFn: async () => {
      let q = supabase
        .from('integration_logs')
        .select('id, direction, integration_key, endpoint, method, status, http_status, actor_id, entity_type, entity_id, duration_ms, error, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      if (directionFilter !== 'all') q = q.eq('direction', directionFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter((r) =>
      [r.integration_key, r.endpoint, r.entity_type, r.entity_id, r.error]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [rows, search]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Plug className="h-6 w-6 text-primary" />
            Integration Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every inbound and outbound integration call recorded by the platform.
            Use to trace failed webhooks, external system calls, and dispatch retries.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="w-64">
              <Input
                placeholder="Search key, endpoint, entity, error…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="w-40">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failure">Failure</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Select value={directionFilter} onValueChange={setDirectionFilter}>
                <SelectTrigger><SelectValue placeholder="Direction" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Both directions</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                  <SelectItem value="outbound">Outbound</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isLoading ? 'Loading…' : `${filtered.length} record(s)`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No integration events match the current filters.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Direction</TableHead>
                      <TableHead>Integration</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>HTTP</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(r.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{r.direction}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.integration_key}
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate text-xs">
                          {r.method ? `${r.method} ` : ''}{r.endpoint ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusVariant[r.status]}>
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{r.http_status ?? '—'}</TableCell>
                        <TableCell className="text-xs">
                          {r.entity_type ? (
                            <span>
                              <span className="font-mono">{r.entity_type}</span>
                              {r.entity_id && (
                                <span className="text-muted-foreground">
                                  {' '}
                                  · {r.entity_id.slice(0, 8)}…
                                </span>
                              )}
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.duration_ms != null ? `${r.duration_ms} ms` : '—'}
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate text-xs text-rose-700">
                          {r.error ?? ''}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

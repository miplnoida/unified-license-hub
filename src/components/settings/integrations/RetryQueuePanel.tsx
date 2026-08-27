/**
 * ADM-INT-001 — Retry Queue / Dead Letter operational console.
 *
 * Read-only views come from the RLS-protected tables; every mutating action
 * goes through a SECURITY DEFINER RPC that re-checks `settings.edit`
 * server-side, demands a justification and writes a compliance audit row.
 * Manual retries deliberately keep the original idempotency fingerprint, so a
 * retry can never create a second external record.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { useToast } from '@/hooks/use-toast';
import { Download, Loader2, RefreshCw, Play, Ban, CheckCircle2 } from 'lucide-react';

type QueueRow = {
  id: string;
  integration_key: string;
  operation: string;
  source_module: string;
  business_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error_category: string | null;
  last_error: string | null;
  last_provider_status: number | null;
  last_integration_log_id: string | null;
  correlation_id: string | null;
  idempotency_fingerprint: string | null;
  payload: unknown;
  redacted_fields: string[] | null;
  attempt_history: unknown;
  created_at: string;
  updated_at: string;
};

type DlqRow = {
  id: string;
  retry_queue_id: string | null;
  integration_key: string;
  operation: string;
  source_module: string;
  source_entity_type: string | null;
  source_entity_id: string | null;
  error_category: string | null;
  error_message: string | null;
  provider_status: number | null;
  attempts: number;
  attempt_history: unknown;
  payload: unknown;
  provider_response: unknown;
  redacted_fields: string[] | null;
  correlation_id: string | null;
  idempotency_fingerprint: string | null;
  integration_log_id: string | null;
  resolution_status: string;
  resolution_note: string | null;
  resolved_at: string | null;
  last_retried_at: string | null;
  created_at: string;
};

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString() : '—');

const statusTone: Record<string, string> = {
  queued: 'bg-muted text-muted-foreground',
  retry_scheduled: 'bg-primary/10 text-primary',
  processing: 'bg-primary/10 text-primary',
  succeeded: 'bg-secondary/15 text-secondary',
  failed: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-muted text-muted-foreground',
  dead_letter: 'bg-destructive/10 text-destructive',
  open: 'bg-destructive/10 text-destructive',
  retrying: 'bg-primary/10 text-primary',
  resolved: 'bg-secondary/15 text-secondary',
};

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) =>
    `"${String(v ?? '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

function download(name: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function RetryQueuePanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [keyFilter, setKeyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [detail, setDetail] = useState<QueueRow | DlqRow | null>(null);
  const [action, setAction] = useState<
    { kind: 'retry' | 'cancel' | 'resolve' | 'dlq_retry'; id: string; label: string } | null
  >(null);
  const [justification, setJustification] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const metrics = useQuery({
    queryKey: ['integration-retry-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('integration_retry_metrics');
      if (error) throw error;
      return (data ?? {}) as Record<string, number | string | null>;
    },
    refetchInterval: 30_000,
  });

  const queue = useQuery({
    queryKey: ['integration-retry-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_retry_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as QueueRow[];
    },
    refetchInterval: 30_000,
  });

  const dlq = useQuery({
    queryKey: ['integration-dead-letter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_dead_letter')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as DlqRow[];
    },
    refetchInterval: 30_000,
  });

  const runWorker = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('integration-retry-worker', {
        body: {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Worker run requested', description: 'Queue drain triggered.' });
      refreshAll();
    },
    onError: (e: unknown) =>
      toast({
        title: 'Worker invocation failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      }),
  });

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ['integration-retry-queue'] });
    qc.invalidateQueries({ queryKey: ['integration-dead-letter'] });
    qc.invalidateQueries({ queryKey: ['integration-retry-metrics'] });
  }

  const runAction = useMutation({
    mutationFn: async (vars: { kind: string; id: string; note: string }) => {
      const map: Record<string, string> = {
        retry: 'integration_retry_now',
        cancel: 'integration_retry_cancel',
        resolve: 'integration_dlq_resolve',
        dlq_retry: 'integration_dlq_retry',
      };
      const argName = vars.kind === 'resolve' ? '_note' : '_justification';
      const { error } = await supabase.rpc(
        map[vars.kind] as 'integration_retry_now',
        { _id: vars.id, [argName]: vars.note } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Action recorded', description: 'Audit entry written.' });
      setAction(null);
      setJustification('');
      setSelected([]);
      refreshAll();
    },
    onError: (e: unknown) =>
      toast({
        title: 'Action failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      }),
  });

  const batchRetry = useMutation({
    mutationFn: async (vars: { ids: string[]; note: string }) => {
      for (const id of vars.ids) {
        const { error } = await supabase.rpc('integration_retry_now', {
          _id: id,
          _justification: vars.note,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      toast({ title: 'Batch retry scheduled', description: `${vars.ids.length} item(s).` });
      setAction(null);
      setJustification('');
      setSelected([]);
      refreshAll();
    },
    onError: (e: unknown) =>
      toast({
        title: 'Batch retry failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      }),
  });

  const modules = useMemo(
    () => Array.from(new Set((queue.data ?? []).map((r) => r.source_module))).sort(),
    [queue.data],
  );
  const keys = useMemo(
    () => Array.from(new Set((queue.data ?? []).map((r) => r.integration_key))).sort(),
    [queue.data],
  );
  const categories = useMemo(
    () =>
      Array.from(
        new Set((queue.data ?? []).map((r) => r.last_error_category).filter(Boolean) as string[]),
      ).sort(),
    [queue.data],
  );

  const matchesCommon = (r: {
    integration_key: string;
    operation: string;
    source_module: string;
    source_entity_id: string | null;
    correlation_id: string | null;
    created_at: string;
  }) => {
    const q = search.trim().toLowerCase();
    if (q) {
      const hay = [
        r.integration_key, r.operation, r.source_module,
        r.source_entity_id ?? '', r.correlation_id ?? '',
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (moduleFilter !== 'all' && r.source_module !== moduleFilter) return false;
    if (keyFilter !== 'all' && r.integration_key !== keyFilter) return false;
    if (from && new Date(r.created_at) < new Date(from)) return false;
    if (to && new Date(r.created_at) > new Date(`${to}T23:59:59`)) return false;
    return true;
  };

  const filteredQueue = (queue.data ?? []).filter((r) => {
    if (!matchesCommon(r)) return false;
    if (statusFilter === 'active' && !['queued', 'retry_scheduled', 'processing'].includes(r.status)) {
      return false;
    }
    if (!['all', 'active'].includes(statusFilter) && r.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && r.last_error_category !== categoryFilter) return false;
    return true;
  });

  const filteredDlq = (dlq.data ?? []).filter((r) => {
    if (!matchesCommon(r)) return false;
    if (categoryFilter !== 'all' && r.error_category !== categoryFilter) return false;
    return true;
  });

  const m = metrics.data ?? {};

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Due now', m.due_now],
          ['Scheduled', m.retry_scheduled],
          ['Processing', m.processing],
          ['Dead letter (open)', m.dlq_open],
          ['Succeeded', m.succeeded],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground">{String(label)}</p>
              <p className="text-2xl font-bold font-mono">{Number(value ?? 0)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Filters</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refreshAll}>
              <RefreshCw className="h-4 w-4 mr-2" />Refresh
            </Button>
            <PermissionGate module="settings" action="edit">
              <Button size="sm" onClick={() => runWorker.mutate()} disabled={runWorker.isPending}>
                {runWorker.isPending
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <Play className="h-4 w-4 mr-2" />}
                Run worker now
              </Button>
            </PermissionGate>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="space-y-1 lg:col-span-2">
            <Label className="text-xs">Search</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="integration, operation, record, correlation ID"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Module</Label>
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modules</SelectItem>
                {modules.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Integration</Label>
            <Select value={keyFilter} onValueChange={setKeyFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All integrations</SelectItem>
                {keys.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Error category</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active (pending)</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="retry_scheduled">Retry scheduled</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="succeeded">Succeeded</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="dead_letter">Dead letter</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">Retry queue ({filteredQueue.length})</TabsTrigger>
          <TabsTrigger value="dlq">Dead letter ({filteredDlq.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Durable retry queue</CardTitle>
              <div className="flex gap-2">
                <Button data-rbac="settings.view"
                  variant="outline" size="sm"
                  onClick={() => download(
                    'integration-retry-queue.csv',
                    toCsv(filteredQueue as unknown as Record<string, unknown>[]),
                  )}
                >
                  <Download className="h-4 w-4 mr-2" />Export
                </Button>
                {selected.length > 0 && (
                  <PermissionGate module="settings" action="edit">
                    <Button
                      size="sm"
                      onClick={() => setAction({
                        kind: 'retry', id: '__batch__',
                        label: `Batch retry ${selected.length} item(s)`,
                      })}
                    >
                      Retry selected ({selected.length})
                    </Button>
                  </PermissionGate>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {queue.isLoading ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredQueue.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No queue items match these filters.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8" />
                        <TableHead>Integration / operation</TableHead>
                        <TableHead>Module / record</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Attempts</TableHead>
                        <TableHead>Next attempt</TableHead>
                        <TableHead>Last error</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredQueue.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              aria-label={`Select ${r.integration_key}`}
                              checked={selected.includes(r.id)}
                              onChange={(e) => setSelected((s) =>
                                e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id))}
                            />
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{r.integration_key}</p>
                            <p className="text-xs text-muted-foreground font-mono">{r.operation}</p>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm">{r.source_module}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {r.source_entity_type ?? '—'} {r.source_entity_id?.slice(0, 8) ?? ''}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusTone[r.status] ?? ''} variant="secondary">
                              {r.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {r.attempts}/{r.max_attempts}
                          </TableCell>
                          <TableCell className="text-xs">{fmt(r.next_attempt_at)}</TableCell>
                          <TableCell className="max-w-[240px]">
                            <p className="text-xs text-muted-foreground truncate">
                              {r.last_error_category ? `[${r.last_error_category}] ` : ''}
                              {r.last_error ?? '—'}
                            </p>
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button variant="ghost" size="sm" onClick={() => setDetail(r)}>
                              View
                            </Button>
                            <PermissionGate module="settings" action="edit">
                              <>
                                <Button
                                  variant="ghost" size="sm"
                                  onClick={() => setAction({
                                    kind: 'retry', id: r.id, label: 'Retry now',
                                  })}
                                >
                                  Retry
                                </Button>
                                <Button
                                  variant="ghost" size="sm"
                                  onClick={() => setAction({
                                    kind: 'cancel', id: r.id, label: 'Cancel queue item',
                                  })}
                                >
                                  <Ban className="h-4 w-4" />
                                </Button>
                              </>
                            </PermissionGate>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dlq" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Dead letter queue</CardTitle>
              <Button data-rbac="settings.view"
                variant="outline" size="sm"
                onClick={() => download(
                  'integration-dead-letter.csv',
                  toCsv(filteredDlq as unknown as Record<string, unknown>[]),
                )}
              >
                <Download className="h-4 w-4 mr-2" />Export
              </Button>
            </CardHeader>
            <CardContent>
              {dlq.isLoading ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredDlq.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No dead-letter entries match these filters.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Integration / operation</TableHead>
                        <TableHead>Module / record</TableHead>
                        <TableHead>Failure</TableHead>
                        <TableHead>Attempts</TableHead>
                        <TableHead>Resolution</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDlq.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <p className="font-medium">{r.integration_key}</p>
                            <p className="text-xs text-muted-foreground font-mono">{r.operation}</p>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm">{r.source_module}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {r.source_entity_type ?? '—'} {r.source_entity_id?.slice(0, 8) ?? ''}
                            </p>
                          </TableCell>
                          <TableCell className="max-w-[240px]">
                            <p className="text-xs text-muted-foreground truncate">
                              {r.error_category ? `[${r.error_category}] ` : ''}
                              {r.error_message ?? '—'}
                            </p>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{r.attempts}</TableCell>
                          <TableCell>
                            <Badge className={statusTone[r.resolution_status] ?? ''} variant="secondary">
                              {r.resolution_status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{fmt(r.created_at)}</TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button variant="ghost" size="sm" onClick={() => setDetail(r)}>
                              View
                            </Button>
                            <PermissionGate module="settings" action="edit">
                              <>
                                <Button
                                  variant="ghost" size="sm"
                                  onClick={() => setAction({
                                    kind: 'dlq_retry', id: r.id, label: 'Retry dead-letter entry',
                                  })}
                                >
                                  Retry
                                </Button>
                                <Button
                                  variant="ghost" size="sm"
                                  onClick={() => setAction({
                                    kind: 'resolve', id: r.id, label: 'Mark resolved',
                                  })}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                              </>
                            </PermissionGate>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail drawer */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Integration attempt detail</DialogTitle>
            <DialogDescription>
              Request data is stored redacted — credentials and personal identifiers are
              never persisted in the queue.
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Integration" value={detail.integration_key} />
                <Field label="Operation" value={detail.operation} />
                <Field label="Source module" value={detail.source_module} />
                <Field
                  label="Source record"
                  value={`${detail.source_entity_type ?? '—'} ${detail.source_entity_id ?? ''}`}
                />
                <Field label="Correlation ID" value={detail.correlation_id ?? '—'} />
                <Field
                  label="Idempotency fingerprint"
                  value={detail.idempotency_fingerprint ?? '—'}
                />
                <Field
                  label="Integration log"
                  value={
                    ('last_integration_log_id' in detail
                      ? detail.last_integration_log_id
                      : detail.integration_log_id) ?? '—'
                  }
                />
                <Field
                  label="Redacted fields"
                  value={(detail.redacted_fields ?? []).join(', ') || 'none'}
                />
              </div>
              <div>
                <p className="font-medium mb-1">Redacted request</p>
                <pre className="bg-muted rounded p-3 text-xs overflow-x-auto">
                  {JSON.stringify(detail.payload ?? {}, null, 2)}
                </pre>
              </div>
              {'provider_response' in detail && (
                <div>
                  <p className="font-medium mb-1">Provider response summary</p>
                  <pre className="bg-muted rounded p-3 text-xs overflow-x-auto">
                    {JSON.stringify(detail.provider_response ?? {}, null, 2)}
                  </pre>
                </div>
              )}
              <div>
                <p className="font-medium mb-1">Attempt history</p>
                <pre className="bg-muted rounded p-3 text-xs overflow-x-auto">
                  {JSON.stringify(detail.attempt_history ?? [], null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Justification dialog */}
      <Dialog open={!!action} onOpenChange={(o) => { if (!o) { setAction(null); setJustification(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action?.label}</DialogTitle>
            <DialogDescription>
              A justification is required and is written to the immutable audit trail.
              Retries re-use the original idempotency key, so no duplicate external
              record can be created.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Justification</Label>
            <Textarea
              rows={3}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Why is this action being taken?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAction(null); setJustification(''); }}>
              Cancel
            </Button>
            <Button
              disabled={
                justification.trim().length < 5 || runAction.isPending || batchRetry.isPending
              }
              onClick={() => {
                if (!action) return;
                if (action.id === '__batch__') {
                  batchRetry.mutate({ ids: selected, note: justification.trim() });
                } else {
                  runAction.mutate({ kind: action.kind, id: action.id, note: justification.trim() });
                }
              }}
            >
              {(runAction.isPending || batchRetry.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-xs break-all">{value || '—'}</p>
    </div>
  );
}
